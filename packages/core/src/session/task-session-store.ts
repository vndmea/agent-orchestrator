import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { loadCwConfig } from "../config/cw-config.js";
import { AgentError } from "../errors/agent-error.js";
import type { ExecutionContext } from "../runtime/execution-context.js";
import {
  TaskSessionSchema,
  type TaskSession,
  type TaskSessionStep
} from "../schemas/task-session.schema.js";
import {
  getCwWorkspaceDir
} from "../storage/cw-paths.js";
import {
  bootstrapSqliteWorkspaceStore,
  openSqliteWorkspaceStore
} from "../storage/sqlite.js";
import { writeAuditEvent } from "../audit/audit-log.js";

export interface CreateTaskSessionInput {
  goal: string;
  metadata?: Record<string, unknown>;
  requireProfile?: boolean;
  scope?: string;
  workerId?: string;
}

export interface TaskSessionWriteResult {
  mode: "execute" | "dry-run";
  path: string;
}

export interface ScanTaskSessionsResult {
  invalidSessions: Array<{ error: string; path: string }>;
  sessions: TaskSession[];
}

export interface TaskArtifactReadResult<T = unknown> {
  exists: boolean;
  path: string;
  value: T | string | null;
}

const TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const SAFE_ARTIFACT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

const ensureTaskId = (taskId: string): string => {
  if (!TASK_ID_PATTERN.test(taskId)) {
    throw new AgentError("TASK_ID_BLOCKED", `Unsafe task id: ${taskId}`, {
      taskId
    });
  }

  return taskId;
};

const ensureArtifactName = (artifactName: string): string => {
  if (!SAFE_ARTIFACT_NAME.test(artifactName)) {
    throw new AgentError(
      "TASK_ARTIFACT_NAME_BLOCKED",
      `Unsafe artifact name: ${artifactName}`,
      { artifactName }
    );
  }

  return artifactName;
};

const resolveStorageDir = (
  rootDir: string,
  cwStorageDir?: string
): string => cwStorageDir ?? getCwWorkspaceDir(rootDir);

export const getTaskRunsDirectory = (
  rootDir: string,
  cwStorageDir?: string
): string =>
  resolve(resolveStorageDir(rootDir, cwStorageDir), "data.db#task_sessions");

export const getTaskSessionDirectory = (
  rootDir: string,
  taskId: string,
  cwStorageDir?: string
): string =>
  `${getTaskRunsDirectory(rootDir, cwStorageDir)}/${ensureTaskId(taskId)}`;

export const getTaskSessionPath = (
  rootDir: string,
  taskId: string,
  cwStorageDir?: string
): string =>
  `${getTaskSessionDirectory(rootDir, taskId, cwStorageDir)}/session`;

export const getTaskArtifactPath = (
  rootDir: string,
  taskId: string,
  artifactName: string,
  cwStorageDir?: string
): string =>
  `${getTaskSessionDirectory(rootDir, taskId, cwStorageDir)}/artifacts/${ensureArtifactName(artifactName)}`;

const createTaskId = (): string =>
  `task-${new Date().toISOString().replace(/[:.]/gu, "-")}-${randomUUID().slice(0, 8)}`;

const sortSessions = (sessions: TaskSession[]): TaskSession[] =>
  [...sessions].sort(
    (left, right) =>
      Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  );

const createTaskSessionValue = (input: CreateTaskSessionInput): TaskSession => {
  const now = new Date().toISOString();

  return TaskSessionSchema.parse({
    taskId: createTaskId(),
    goal: input.goal,
    scope: input.scope,
    workerId: input.workerId,
    requireProfile: input.requireProfile ?? false,
    status: "created",
    createdAt: now,
    updatedAt: now,
    steps: [],
    artifacts: {},
    warnings: [],
    errors: [],
    metadata: input.metadata ?? {}
  });
};

const writeSessionAuditEvent = async (
  context: ExecutionContext,
  action: string,
  mode: "execute" | "dry-run",
  taskId: string,
  metadata: Record<string, unknown>
): Promise<void> => {
  await writeAuditEvent(
    context,
    {
      actor: "workflow",
      action,
      mode,
      inputSummary: taskId,
      outputSummary: `${action} completed for ${taskId}.`,
      warnings: [],
      errors: [],
      metadata
    },
    true
  );
};

const buildSessionRetentionGroupKey = (session: TaskSession): string => {
  const metadata = session.metadata as {
    inspectPatch?: boolean;
    proposePatch?: boolean;
    requestedWorkerId?: string;
    runFix?: boolean;
    validate?: {
      lint?: boolean;
      test?: boolean;
      typecheck?: boolean;
    };
  };
  const validate = metadata.validate ?? {};

  return JSON.stringify({
    goal: session.goal.trim(),
    scope: session.scope ?? "",
    workerId: metadata.requestedWorkerId ?? session.workerId ?? "",
    requireProfile: session.requireProfile,
    runFix: Boolean(metadata.runFix),
    proposePatch: Boolean(metadata.proposePatch),
    inspectPatch: Boolean(metadata.inspectPatch),
    validate: {
      typecheck: Boolean(validate.typecheck),
      lint: Boolean(validate.lint),
      test: Boolean(validate.test)
    }
  });
};

const hydrateTaskSession = (row: {
  created_at: string;
  errors_json: string;
  goal: string;
  metadata_json: string;
  require_profile: number;
  scope: string | null;
  status: TaskSession["status"];
  task_id: string;
  updated_at: string;
  warnings_json: string;
  worker_id: string | null;
}): TaskSession => TaskSessionSchema.parse({
  taskId: row.task_id,
  goal: row.goal,
  scope: row.scope ?? undefined,
  workerId: row.worker_id ?? undefined,
  requireProfile: row.require_profile === 1,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  steps: [],
  artifacts: {},
  warnings: JSON.parse(row.warnings_json) as string[],
  errors: JSON.parse(row.errors_json) as string[],
  metadata: JSON.parse(row.metadata_json) as Record<string, unknown>
});

const loadSteps = (
  db: Awaited<ReturnType<typeof openSqliteWorkspaceStore>>,
  taskId: string,
  rootDir: string,
  cwStorageDir?: string
): TaskSessionStep[] =>
  (db.prepare(
    `SELECT step_id, name, status, started_at, completed_at, warnings_json, errors_json, artifact_name
     FROM task_session_steps
     WHERE task_id = ?
     ORDER BY id ASC`
  ).all(taskId) as Array<{
    artifact_name: string | null;
    completed_at: string | null;
    errors_json: string;
    name: string;
    started_at: string | null;
    status: TaskSessionStep["status"];
    step_id: string;
    warnings_json: string;
  }>).map((row) => ({
    id: row.step_id,
    name: row.name,
    status: row.status,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    warnings: JSON.parse(row.warnings_json) as string[],
    errors: JSON.parse(row.errors_json) as string[],
    artifactPath: row.artifact_name
      ? getTaskArtifactPath(rootDir, taskId, row.artifact_name, cwStorageDir)
      : undefined
  }));

const loadArtifacts = (
  db: Awaited<ReturnType<typeof openSqliteWorkspaceStore>>,
  taskId: string,
  rootDir: string,
  cwStorageDir?: string
): Record<string, string> =>
  Object.fromEntries(
    (db.prepare(
      `SELECT artifact_name
       FROM task_artifacts
       WHERE task_id = ?`
    ).all(taskId) as Array<{ artifact_name: string }>).map((row) => [
      row.artifact_name,
      getTaskArtifactPath(rootDir, taskId, row.artifact_name, cwStorageDir)
    ])
  );

const readTaskSessionFromDb = async (input: {
  cwStorageDir?: string;
  rootDir: string;
  taskId: string;
}): Promise<TaskSession | null> => {
  const storageDir = resolveStorageDir(input.rootDir, input.cwStorageDir);
  await bootstrapSqliteWorkspaceStore(storageDir);
  const db = await openSqliteWorkspaceStore(storageDir);
  try {
    const row = db.prepare(
      `SELECT task_id, goal, scope, worker_id, require_profile, status,
              metadata_json, warnings_json, errors_json, created_at, updated_at
       FROM task_sessions
       WHERE task_id = ?`
    ).get(input.taskId) as
      | {
          created_at: string;
          errors_json: string;
          goal: string;
          metadata_json: string;
          require_profile: number;
          scope: string | null;
          status: TaskSession["status"];
          task_id: string;
          updated_at: string;
          warnings_json: string;
          worker_id: string | null;
        }
      | undefined;

    if (!row) {
      return null;
    }

    const session = hydrateTaskSession(row);
    session.steps = loadSteps(db, row.task_id, input.rootDir, storageDir);
    session.artifacts = loadArtifacts(
      db,
      row.task_id,
      input.rootDir,
      storageDir
    );
    return session;
  } finally {
    db.close();
  }
};

const persistTaskSession = async (
  context: ExecutionContext,
  session: TaskSession
): Promise<void> => {
  const storageDir = resolveStorageDir(context.rootDir, context.cwStorageDir);
  await bootstrapSqliteWorkspaceStore(storageDir);
  const db = await openSqliteWorkspaceStore(storageDir);
  try {
    db.exec("BEGIN");
    db.prepare(
      `INSERT INTO task_sessions(
         task_id,
         retention_group_key,
         goal,
         scope,
         worker_id,
         requested_worker_id,
         require_profile,
         status,
         metadata_json,
         warnings_json,
         errors_json,
         created_at,
         updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(task_id) DO UPDATE SET
         retention_group_key = excluded.retention_group_key,
         goal = excluded.goal,
         scope = excluded.scope,
         worker_id = excluded.worker_id,
         requested_worker_id = excluded.requested_worker_id,
         require_profile = excluded.require_profile,
         status = excluded.status,
         metadata_json = excluded.metadata_json,
         warnings_json = excluded.warnings_json,
         errors_json = excluded.errors_json,
         updated_at = excluded.updated_at`
    ).run(
      session.taskId,
      buildSessionRetentionGroupKey(session),
      session.goal,
      session.scope ?? null,
      session.workerId ?? null,
      typeof session.metadata.requestedWorkerId === "string"
        ? session.metadata.requestedWorkerId
        : null,
      session.requireProfile ? 1 : 0,
      session.status,
      JSON.stringify(session.metadata),
      JSON.stringify(session.warnings),
      JSON.stringify(session.errors),
      session.createdAt,
      session.updatedAt
    );
    db.prepare("DELETE FROM task_session_steps WHERE task_id = ?").run(session.taskId);

    for (const step of session.steps) {
      const artifactName = Object.entries(session.artifacts).find(
        ([, path]) => path === step.artifactPath
      )?.[0] ?? null;

      db.prepare(
        `INSERT INTO task_session_steps(
           task_id,
           step_id,
           name,
           status,
           started_at,
           completed_at,
           warnings_json,
           errors_json,
           artifact_name
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        session.taskId,
        step.id,
        step.name,
        step.status,
        step.startedAt ?? null,
        step.completedAt ?? null,
        JSON.stringify(step.warnings),
        JSON.stringify(step.errors),
        artifactName
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
};

const pruneStoredTaskSessions = async (
  context: ExecutionContext,
  session: TaskSession
): Promise<void> => {
  const config = await loadCwConfig(context.rootDir);
  const maxStoredSessions = config.config.storage.runs.maxPerKind;
  const storageDir = resolveStorageDir(context.rootDir, context.cwStorageDir);
  const db = await openSqliteWorkspaceStore(storageDir);

  try {
    db.prepare(
      `DELETE FROM task_sessions
       WHERE retention_group_key = ?
         AND task_id NOT IN (
           SELECT task_id
           FROM task_sessions
           WHERE retention_group_key = ?
           ORDER BY updated_at DESC, task_id DESC
           LIMIT ?
         )`
    ).run(
      buildSessionRetentionGroupKey(session),
      buildSessionRetentionGroupKey(session),
      maxStoredSessions
    );
  } finally {
    db.close();
  }
};

const writeManagedSession = async (
  context: ExecutionContext,
  session: TaskSession,
  explicitAllowWrite: boolean
): Promise<{ mode: "execute" | "dry-run"; path: string }> => {
  const path = getTaskSessionPath(
    context.rootDir,
    session.taskId,
    context.cwStorageDir
  );
  const evaluation = context.storageWritePolicy.evaluate(
    "session-write",
    explicitAllowWrite
  );

  if (!evaluation.allowed || evaluation.mode === "blocked") {
    throw new AgentError("WRITE_BLOCKED", evaluation.reason, { path });
  }

  if (evaluation.mode === "dry-run") {
    return {
      mode: "dry-run",
      path
    };
  }

  await persistTaskSession(context, session);
  await pruneStoredTaskSessions(context, session);

  return {
    mode: "execute",
    path
  };
};

export async function createTaskSession(
  context: ExecutionContext,
  input: CreateTaskSessionInput,
  explicitAllowWrite = false
): Promise<{ mode: "execute" | "dry-run"; path: string; session: TaskSession }> {
  const session = createTaskSessionValue(input);
  const result = await writeManagedSession(context, session, explicitAllowWrite);

  await writeSessionAuditEvent(
    context,
    "create-task-session",
    result.mode,
    session.taskId,
    { path: result.path }
  );

  return {
    mode: result.mode,
    path: result.path,
    session
  };
}

export async function readTaskSession(
  rootDir: string,
  taskId: string,
  cwStorageDir?: string
): Promise<TaskSession | null> {
  return readTaskSessionFromDb({
    rootDir,
    taskId,
    cwStorageDir
  });
}

export async function updateTaskSession(
  context: ExecutionContext,
  session: TaskSession,
  explicitAllowWrite = false
): Promise<TaskSessionWriteResult> {
  const nextSession = TaskSessionSchema.parse({
    ...session,
    taskId: ensureTaskId(session.taskId),
    updatedAt: new Date().toISOString()
  });
  const result = await writeManagedSession(
    context,
    nextSession,
    explicitAllowWrite
  );

  await writeSessionAuditEvent(
    context,
    "update-task-session",
    result.mode,
    nextSession.taskId,
    { path: result.path, status: nextSession.status }
  );

  Object.assign(session, nextSession);

  return result;
}

export async function writeTaskArtifact(
  context: ExecutionContext,
  taskId: string,
  artifactName: string,
  artifact: unknown,
  explicitAllowWrite = false
): Promise<TaskSessionWriteResult> {
  const safeTaskId = ensureTaskId(taskId);
  const safeArtifactName = ensureArtifactName(artifactName);
  const path = getTaskArtifactPath(
    context.rootDir,
    safeTaskId,
    safeArtifactName,
    context.cwStorageDir
  );
  const evaluation = context.storageWritePolicy.evaluate(
    "session-write",
    explicitAllowWrite
  );

  if (!evaluation.allowed || evaluation.mode === "blocked") {
    throw new AgentError("WRITE_BLOCKED", evaluation.reason, { path });
  }

  if (evaluation.mode === "dry-run") {
    await writeSessionAuditEvent(
      context,
      "write-task-artifact",
      "dry-run",
      safeTaskId,
      { artifactName: safeArtifactName, path }
    );

    return {
      mode: "dry-run",
      path
    };
  }

  const storageDir = resolveStorageDir(context.rootDir, context.cwStorageDir);
  await bootstrapSqliteWorkspaceStore(storageDir);
  const db = await openSqliteWorkspaceStore(storageDir);
  try {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO task_artifacts(
         task_id,
         artifact_name,
         content_type,
         content_text,
         created_at,
         updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(task_id, artifact_name) DO UPDATE SET
         content_type = excluded.content_type,
         content_text = excluded.content_text,
         updated_at = excluded.updated_at`
    ).run(
      safeTaskId,
      safeArtifactName,
      typeof artifact === "string" && safeArtifactName.endsWith(".md")
        ? "text/markdown"
        : "application/json",
      typeof artifact === "string"
        ? artifact
        : JSON.stringify(artifact, null, 2),
      now,
      now
    );
  } finally {
    db.close();
  }

  const session = await readTaskSessionFromDb({
    rootDir: context.rootDir,
    taskId: safeTaskId,
    cwStorageDir: context.cwStorageDir
  });
  if (session) {
    session.artifacts[safeArtifactName] = path;
    await persistTaskSession(context, session);
  }

  await writeSessionAuditEvent(
    context,
    "write-task-artifact",
    "execute",
    safeTaskId,
    { artifactName: safeArtifactName, path }
  );

  return {
    mode: "execute",
    path
  };
}

export async function scanTaskSessions(
  rootDir: string,
  cwStorageDir?: string
): Promise<ScanTaskSessionsResult> {
  const storageDir = resolveStorageDir(rootDir, cwStorageDir);
  await bootstrapSqliteWorkspaceStore(storageDir);
  const db = await openSqliteWorkspaceStore(storageDir);
  try {
    const rows = db.prepare(
      `SELECT task_id, goal, scope, worker_id, require_profile, status,
              metadata_json, warnings_json, errors_json, created_at, updated_at
       FROM task_sessions
       ORDER BY updated_at DESC, task_id DESC`
    ).all() as Array<{
      created_at: string;
      errors_json: string;
      goal: string;
      metadata_json: string;
      require_profile: number;
      scope: string | null;
      status: TaskSession["status"];
      task_id: string;
      updated_at: string;
      warnings_json: string;
      worker_id: string | null;
    }>;
    const sessions = rows.map((row) => {
      const session = hydrateTaskSession(row);
      session.steps = loadSteps(db, row.task_id, rootDir, storageDir);
      session.artifacts = loadArtifacts(db, row.task_id, rootDir, storageDir);
      return session;
    });

    return {
      sessions: sortSessions(sessions),
      invalidSessions: []
    };
  } catch {
    return {
      sessions: [],
      invalidSessions: []
    };
  } finally {
    db.close();
  }
}

export async function listTaskSessions(
  rootDir: string,
  limit = 50,
  cwStorageDir?: string
): Promise<TaskSession[]> {
  const result = await scanTaskSessions(rootDir, cwStorageDir);
  return result.sessions.slice(0, limit);
}

export async function readTaskArtifact<T = unknown>(
  rootDir: string,
  taskId: string,
  artifactName: string,
  cwStorageDir?: string
): Promise<TaskArtifactReadResult<T>> {
  const path = getTaskArtifactPath(rootDir, taskId, artifactName, cwStorageDir);

  const storageDir = resolveStorageDir(rootDir, cwStorageDir);
  await bootstrapSqliteWorkspaceStore(storageDir);
  const db = await openSqliteWorkspaceStore(storageDir);
  try {
    const row = db.prepare(
      `SELECT content_text
       FROM task_artifacts
       WHERE task_id = ? AND artifact_name = ?`
    ).get(taskId, ensureArtifactName(artifactName)) as
      | { content_text: string }
      | undefined;

    if (!row) {
      return {
        exists: false,
        path,
        value: null
      };
    }

    try {
      return {
        exists: true,
        path,
        value: JSON.parse(row.content_text) as T
      };
    } catch {
      return {
        exists: true,
        path,
        value: row.content_text
      };
    }
  } finally {
    db.close();
  }
}
