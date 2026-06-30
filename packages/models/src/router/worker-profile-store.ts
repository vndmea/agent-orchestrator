import { resolve } from "node:path";

import {
  bootstrapSqliteWorkspaceStore,
  openSqliteWorkspaceStore,
  WorkerCapabilityProfileSchema
} from "@mcp-code-worker/core";
import type {
  ExecutionContext,
  WorkerCapabilityProfile
} from "@mcp-code-worker/core";

const inMemoryProfiles = new Map<string, Map<string, WorkerCapabilityProfile>>();
export interface PersistedWorkerProfilesReadResult {
  error?: string;
  exists: boolean;
  path: string;
  profiles: WorkerCapabilityProfile[];
}

export const getWorkerProfileStorePath = (
  rootDir: string,
  cwStorageDir?: string
): string =>
  resolve(cwStorageDir ?? rootDir, "data.db#worker_profiles");

const getInMemoryWorkspaceProfiles = (
  rootDir: string,
  cwStorageDir?: string
): Map<string, WorkerCapabilityProfile> => {
  const storeKey = resolve(getWorkerProfileStorePath(rootDir, cwStorageDir));
  const existing = inMemoryProfiles.get(storeKey);

  if (existing) {
    return existing;
  }

  const created = new Map<string, WorkerCapabilityProfile>();
  inMemoryProfiles.set(storeKey, created);
  return created;
};

const safeParseProfiles = (value: string): WorkerCapabilityProfile[] => {
  try {
    const parsed = JSON.parse(value) as unknown;
    const schemaResult = WorkerCapabilityProfileSchema.array().safeParse(parsed);
    return schemaResult.success ? schemaResult.data : [];
  } catch {
    return [];
  }
};

export const listPersistedWorkerProfiles = async (
  rootDir: string,
  cwStorageDir?: string
): Promise<WorkerCapabilityProfile[]> => {
  const result = await readPersistedWorkerProfiles(rootDir, cwStorageDir);
  return result.profiles;
};

export const readPersistedWorkerProfiles = async (
  rootDir: string,
  cwStorageDir?: string
): Promise<PersistedWorkerProfilesReadResult> => {
  const path = getWorkerProfileStorePath(rootDir, cwStorageDir);
  if (!cwStorageDir) {
    return {
      exists: false,
      path,
      profiles: []
    };
  }

  await bootstrapSqliteWorkspaceStore(cwStorageDir);
  const db = await openSqliteWorkspaceStore(cwStorageDir);
  try {
    const rows = db.prepare("SELECT profile_json FROM worker_profiles").all() as Array<{
      profile_json: string;
    }>;
    const profiles = rows
      .map((row) => WorkerCapabilityProfileSchema.safeParse(JSON.parse(row.profile_json)))
      .filter((result) => result.success)
      .map((result) => result.data);

    return {
      exists: true,
      path,
      profiles
    };
  } catch (error) {
    return {
      exists: true,
      path,
      profiles: [],
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    db.close();
  }
};

export const listWorkerProfiles = async (
  rootDir: string,
  cwStorageDir?: string
): Promise<WorkerCapabilityProfile[]> => {
  const persisted = await listPersistedWorkerProfiles(rootDir, cwStorageDir);
  const merged = new Map<string, WorkerCapabilityProfile>();
  const workspaceProfiles = getInMemoryWorkspaceProfiles(rootDir, cwStorageDir);

  persisted.forEach((profile) => {
    merged.set(profile.workerId, profile);
  });
  workspaceProfiles.forEach((profile, workerId) => {
    merged.set(workerId, profile);
  });

  return Array.from(merged.values());
};

export const getWorkerProfile = async (
  rootDir: string,
  workerId: string,
  cwStorageDir?: string
): Promise<WorkerCapabilityProfile | null> => {
  const inMemory = getInMemoryWorkspaceProfiles(rootDir, cwStorageDir).get(workerId);
  if (inMemory) {
    return inMemory;
  }

  const persisted = await listPersistedWorkerProfiles(rootDir, cwStorageDir);
  return persisted.find((profile) => profile.workerId === workerId) ?? null;
};

export const saveWorkerProfile = async (
  context: ExecutionContext,
  profile: WorkerCapabilityProfile,
  explicitAllowWrite = false
): Promise<{ mode: "execute" | "dry-run"; path: string }> => {
  getInMemoryWorkspaceProfiles(context.rootDir, context.cwStorageDir).set(
    profile.workerId,
    profile
  );

  const storePath = getWorkerProfileStorePath(
    context.rootDir,
    context.cwStorageDir
  );
  const evaluation = context.storageWritePolicy.evaluate(
    "profile-write",
    explicitAllowWrite
  );

  if (evaluation.mode !== "execute") {
    return {
      mode: "dry-run",
      path: storePath
    };
  }

  await bootstrapSqliteWorkspaceStore(context.cwStorageDir);
  const db = await openSqliteWorkspaceStore(context.cwStorageDir);
  try {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO worker_profiles(worker_id, profile_json, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(worker_id) DO UPDATE SET
         profile_json = excluded.profile_json,
         updated_at = excluded.updated_at`
    ).run(profile.workerId, JSON.stringify(profile), now, now);
  } finally {
    db.close();
  }

  return {
    mode: "execute",
    path: storePath
  };
};

export const clearInMemoryWorkerProfiles = (): void => {
  inMemoryProfiles.clear();
};
