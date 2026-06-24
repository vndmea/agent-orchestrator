import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type {
  ExecutionContext,
  ModelConfig,
  WorkerCapabilityProfile
} from "@agent-orchestrator/core";

const inMemoryProfiles = new Map<string, WorkerCapabilityProfile>();
const PROFILE_STORE_PATH = [".ao", "worker-profiles.json"];

const getStorePath = (rootDir: string) => join(rootDir, ...PROFILE_STORE_PATH);

const safeParseProfiles = (value: string): WorkerCapabilityProfile[] => {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as WorkerCapabilityProfile[]) : [];
  } catch {
    return [];
  }
};

export const deriveWorkerProfileId = (config: ModelConfig): string =>
  `${config.provider}:${config.model}`;

export const listPersistedWorkerProfiles = async (
  rootDir: string
): Promise<WorkerCapabilityProfile[]> => {
  try {
    const contents = await readFile(getStorePath(rootDir), "utf8");
    return safeParseProfiles(contents);
  } catch {
    return [];
  }
};

export const listWorkerProfiles = async (
  rootDir: string
): Promise<WorkerCapabilityProfile[]> => {
  const persisted = await listPersistedWorkerProfiles(rootDir);
  const merged = new Map<string, WorkerCapabilityProfile>();

  persisted.forEach((profile) => {
    merged.set(profile.workerId, profile);
  });
  inMemoryProfiles.forEach((profile, workerId) => {
    merged.set(workerId, profile);
  });

  return Array.from(merged.values());
};

export const getWorkerProfile = async (
  rootDir: string,
  workerId: string
): Promise<WorkerCapabilityProfile | null> => {
  const inMemory = inMemoryProfiles.get(workerId);
  if (inMemory) {
    return inMemory;
  }

  const persisted = await listPersistedWorkerProfiles(rootDir);
  return persisted.find((profile) => profile.workerId === workerId) ?? null;
};

export const saveWorkerProfile = async (
  context: ExecutionContext,
  profile: WorkerCapabilityProfile,
  explicitAllowWrite = false
): Promise<{ mode: "execute" | "dry-run"; path: string }> => {
  inMemoryProfiles.set(profile.workerId, profile);

  const storePath = getStorePath(context.rootDir);
  const evaluation = context.writePolicy.evaluate(storePath, explicitAllowWrite);

  if (evaluation.mode === "dry-run") {
    return {
      mode: "dry-run",
      path: storePath
    };
  }

  const existing = await listPersistedWorkerProfiles(context.rootDir);
  const merged = new Map(existing.map((item) => [item.workerId, item]));
  merged.set(profile.workerId, profile);

  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(
    storePath,
    JSON.stringify(Array.from(merged.values()), null, 2),
    "utf8"
  );

  return {
    mode: "execute",
    path: storePath
  };
};

export const clearInMemoryWorkerProfiles = (): void => {
  inMemoryProfiles.clear();
};
