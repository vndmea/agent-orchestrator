import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { loadCwConfig } from "../config/cw-config.js";
import type { ExecutionContext } from "../runtime/execution-context.js";
import { getCwWorkspaceDir } from "../storage/cw-paths.js";
import {
  bootstrapSqliteWorkspaceStore,
  openSqliteWorkspaceStore
} from "../storage/sqlite.js";

export type AuditActor =
  | "worker"
  | "tool"
  | "cli"
  | "mcp"
  | "workflow";

export type AuditMode = "execute" | "dry-run" | "blocked";

export interface AuditEvent {
  id: string;
  timestamp: string;
  workflow?: string;
  tool?: string;
  actor: AuditActor;
  action: string;
  mode: AuditMode;
  inputSummary: string;
  outputSummary?: string;
  warnings: string[];
  errors: string[];
  metadata?: Record<string, unknown>;
}

export interface WriteAuditEventResult {
  mode: "execute" | "dry-run";
  path: string;
  written: boolean;
}

const REDACTED_VALUE = "[REDACTED]";
const SECRET_KEY_PATTERN =
  /(key|token|secret|password|authorization|cookie)/iu;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sanitizeValue = (value: unknown, seen: WeakSet<object>): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, seen));
  }

  if (!isRecord(value)) {
    return value;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);
  return Object.fromEntries(
    Object.entries(value).map(([key, childValue]) => {
      if (SECRET_KEY_PATTERN.test(key)) {
        return [key, REDACTED_VALUE];
      }

      return [key, sanitizeValue(childValue, seen)];
    })
  );
};

const resolveStorageDir = (
  rootDir: string,
  cwStorageDir?: string
): string => cwStorageDir ?? getCwWorkspaceDir(rootDir);

const getAuditStorePath = (
  rootDir: string,
  cwStorageDir?: string
): string =>
  resolve(resolveStorageDir(rootDir, cwStorageDir), "data.db#audit_events");

const pruneAuditEvents = async (
  context: ExecutionContext,
  eventType: string
): Promise<void> => {
  const config = await loadCwConfig(context.rootDir);
  const maxPerType = config.config.storage.audit.maxPerType;
  const storageDir = resolveStorageDir(context.rootDir, context.cwStorageDir);
  const db = await openSqliteWorkspaceStore(storageDir);

  try {
    db.prepare(
      `DELETE FROM audit_events
       WHERE event_type = ?
         AND id NOT IN (
           SELECT id
           FROM audit_events
           WHERE event_type = ?
           ORDER BY created_at DESC, id DESC
           LIMIT ?
         )`
    ).run(eventType, eventType, maxPerType);
  } finally {
    db.close();
  }
};

export const sanitizeAuditMetadata = (
  metadata: Record<string, unknown>
): Record<string, unknown> => {
  try {
    return sanitizeValue(metadata, new WeakSet<object>()) as Record<
      string,
      unknown
    >;
  } catch {
    return {
      metadata: "[Unserializable metadata]"
    };
  }
};

export async function writeAuditEvent(
  context: ExecutionContext,
  event: Omit<AuditEvent, "id" | "timestamp">,
  explicitAllowWrite = false
): Promise<WriteAuditEventResult> {
  const path = getAuditStorePath(context.rootDir, context.cwStorageDir);
  const evaluation = context.storageWritePolicy.evaluate(
    "audit-write",
    explicitAllowWrite
  );

  if (evaluation.mode !== "execute") {
    return {
      mode: "dry-run",
      path,
      written: false
    };
  }

  const storageDir = resolveStorageDir(context.rootDir, context.cwStorageDir);
  await bootstrapSqliteWorkspaceStore(storageDir);
  const payload: AuditEvent = {
    ...event,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    metadata: event.metadata
      ? sanitizeAuditMetadata(event.metadata)
      : undefined
  };
  const eventType = `${payload.actor}:${payload.action}`;
  const db = await openSqliteWorkspaceStore(storageDir);

  try {
    db.prepare(
      `INSERT INTO audit_events(
         id,
         event_type,
         actor,
         action,
         mode,
         workflow,
         tool,
         input_summary,
         output_summary,
         warnings_json,
         errors_json,
         metadata_json,
         created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      payload.id,
      eventType,
      payload.actor,
      payload.action,
      payload.mode,
      payload.workflow ?? null,
      payload.tool ?? null,
      payload.inputSummary,
      payload.outputSummary ?? null,
      JSON.stringify(payload.warnings),
      JSON.stringify(payload.errors),
      payload.metadata ? JSON.stringify(payload.metadata) : null,
      payload.timestamp
    );
  } catch {
    db.close();
    return {
      mode: "execute",
      path,
      written: false
    };
  }

  db.close();
  await pruneAuditEvents(context, eventType);

  return {
    mode: "execute",
    path,
    written: true
  };
}

export const listAuditEvents = async (
  rootDir: string,
  limit = 50,
  cwStorageDir?: string
): Promise<AuditEvent[]> => {
  const storageDir = resolveStorageDir(rootDir, cwStorageDir);
  await bootstrapSqliteWorkspaceStore(storageDir);
  const db = await openSqliteWorkspaceStore(storageDir);
  try {
    const rows = db.prepare(
      `SELECT id, actor, action, mode, workflow, tool, input_summary, output_summary,
              warnings_json, errors_json, metadata_json, created_at
       FROM audit_events
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    ).all(limit) as Array<{
      action: string;
      actor: AuditActor;
      created_at: string;
      errors_json: string;
      id: string;
      input_summary: string;
      metadata_json: string | null;
      mode: AuditMode;
      output_summary: string | null;
      tool: string | null;
      warnings_json: string;
      workflow: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      timestamp: row.created_at,
      actor: row.actor,
      action: row.action,
      mode: row.mode,
      workflow: row.workflow ?? undefined,
      tool: row.tool ?? undefined,
      inputSummary: row.input_summary,
      outputSummary: row.output_summary ?? undefined,
      warnings: JSON.parse(row.warnings_json) as string[],
      errors: JSON.parse(row.errors_json) as string[],
      metadata: row.metadata_json
        ? JSON.parse(row.metadata_json) as Record<string, unknown>
        : undefined
    }));
  } catch {
    return [];
  } finally {
    db.close();
  }
};
