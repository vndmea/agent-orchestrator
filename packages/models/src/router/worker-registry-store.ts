import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  AgentError,
  CwConfigSchema,
  getCwConfigPath,
  WorkerRegistrationSchema,
  writeAuditEvent,
  type ExecutionContext,
  type WorkerRegistration
} from "@mcp-code-worker/core";

export interface WorkerRegistryReadResult {
  error?: string;
  exists: boolean;
  path: string;
  workers: WorkerRegistration[];
}

export const getWorkerRegistryPath = (
  rootDir: string,
  cwStorageDir?: string
): string =>
  (void cwStorageDir, getCwConfigPath(rootDir));

export const readWorkerRegistry = async (
  rootDir: string,
  cwStorageDir?: string
): Promise<WorkerRegistryReadResult> => {
  const path = getWorkerRegistryPath(rootDir, cwStorageDir);

  try {
    const contents = await readFile(path, "utf8");
    const parsed = JSON.parse(contents) as unknown;
    const config = CwConfigSchema.safeParse(parsed);

    if (!config.success) {
      return {
        exists: true,
        path,
        workers: [],
        error: config.error.issues.map((issue) => issue.message).join("; ")
      };
    }

    return {
      exists: true,
      path,
      workers: config.data.workers.map((worker) =>
        WorkerRegistrationSchema.parse(worker)
      )
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isMissing = /ENOENT/u.test(message);

    return {
      exists: !isMissing,
      path,
      workers: [],
      ...(isMissing ? {} : { error: message })
    };
  }
};

export const listWorkerRegistrations = async (
  rootDir: string,
  cwStorageDir?: string
): Promise<WorkerRegistration[]> => {
  const result = await readWorkerRegistry(rootDir, cwStorageDir);
  return result.workers;
};

export const getWorkerRegistration = async (
  rootDir: string,
  workerId: string,
  cwStorageDir?: string
): Promise<WorkerRegistration | null> => {
  const workers = await listWorkerRegistrations(rootDir, cwStorageDir);
  return workers.find((worker) => worker.workerId === workerId) ?? null;
};

const parseRegistration = (
  registration: WorkerRegistration
): WorkerRegistration => WorkerRegistrationSchema.parse(registration);

const assertReadableRegistry = (result: WorkerRegistryReadResult): void => {
  if (result.error) {
    throw new AgentError(
      "WORKER_REGISTRY_INVALID",
      `Worker registry could not be parsed: ${result.error}`,
      { path: result.path }
    );
  }
};

const registrationTargetMatches = (
  left: WorkerRegistration,
  right: WorkerRegistration
): boolean =>
  left.provider === right.provider &&
  left.model === right.model &&
  (left.baseURL ?? null) === (right.baseURL ?? null);

const assertWorkerIdAvailable = (
  existing: WorkerRegistryReadResult,
  parsed: WorkerRegistration
): void => {
  const current = existing.workers.find((worker) => worker.workerId === parsed.workerId);

  if (!current || registrationTargetMatches(current, parsed)) {
    return;
  }

  throw new AgentError(
    "WORKER_ID_CONFLICT",
    `Worker id '${parsed.workerId}' is already bound to ${current.provider}/${current.model}. Choose a different worker id instead of reusing it for ${parsed.provider}/${parsed.model}.`,
    {
      current,
      requested: parsed,
      workerId: parsed.workerId
    }
  );
};

export const saveWorkerRegistration = async (
  context: ExecutionContext,
  registration: WorkerRegistration,
  explicitAllowWrite = false
): Promise<{ mode: "execute" | "dry-run"; path: string }> => {
  const parsed = parseRegistration(registration);
  const path = getWorkerRegistryPath(context.rootDir, context.cwStorageDir);
  const evaluation = context.storageWritePolicy.evaluate(
    "config-write",
    explicitAllowWrite
  );

  if (!evaluation.allowed || evaluation.mode === "blocked") {
    await writeAuditEvent(context, {
      actor: "tool",
      action: "save-worker-registration",
      mode: "blocked",
      tool: "worker-registry",
      inputSummary: parsed.workerId,
      outputSummary: evaluation.reason,
      warnings: [],
      errors: [evaluation.reason],
      metadata: {
        workerId: parsed.workerId
      }
    });
    throw new AgentError("WRITE_BLOCKED", evaluation.reason, {
      path
    });
  }

  const existing = await readWorkerRegistry(
    context.rootDir,
    context.cwStorageDir
  );
  assertReadableRegistry(existing);
  assertWorkerIdAvailable(existing, parsed);

  if (evaluation.mode === "dry-run") {
    await writeAuditEvent(context, {
      actor: "tool",
      action: "save-worker-registration",
      mode: "dry-run",
      tool: "worker-registry",
      inputSummary: parsed.workerId,
      outputSummary: "Worker registration would be saved.",
      warnings: [],
      errors: [],
      metadata: {
        workerId: parsed.workerId
      }
    });

    return {
      mode: "dry-run",
      path
    };
  }

  const merged = new Map(existing.workers.map((worker) => [worker.workerId, worker]));
  merged.set(parsed.workerId, parsed);

  const configContents = await readFile(path, "utf8").catch(() => "{\"version\":1}");
  const parsedConfig = CwConfigSchema.parse(JSON.parse(configContents) as unknown);
  const nextConfig = CwConfigSchema.parse({
    ...parsedConfig,
    workers: Array.from(merged.values()).map((worker) => ({
      ...worker,
      ...(parsedConfig.workers.find((entry) => entry.workerId === worker.workerId)?.clientCommand
        ? {
            clientCommand: parsedConfig.workers.find(
              (entry) => entry.workerId === worker.workerId
            )?.clientCommand
          }
        : {}),
      ...(parsedConfig.workers.find((entry) => entry.workerId === worker.workerId)?.temperature !==
      undefined
        ? {
            temperature: parsedConfig.workers.find(
              (entry) => entry.workerId === worker.workerId
            )?.temperature
          }
        : {}),
      ...(parsedConfig.workers.find((entry) => entry.workerId === worker.workerId)?.maxTokens !==
      undefined
        ? {
            maxTokens: parsedConfig.workers.find(
              (entry) => entry.workerId === worker.workerId
            )?.maxTokens
          }
        : {})
    }))
  });

  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    JSON.stringify(nextConfig, null, 2),
    "utf8"
  );
  await writeAuditEvent(context, {
    actor: "tool",
    action: "save-worker-registration",
    mode: "execute",
    tool: "worker-registry",
    inputSummary: parsed.workerId,
    outputSummary: "Worker registration saved.",
    warnings: [],
    errors: [],
    metadata: {
      workerId: parsed.workerId
    }
  }, explicitAllowWrite);

  return {
    mode: "execute",
    path
  };
};

export const removeWorkerRegistration = async (
  context: ExecutionContext,
  workerId: string,
  explicitAllowWrite = false
): Promise<{ mode: "execute" | "dry-run"; path: string; removed: boolean }> => {
  const path = getWorkerRegistryPath(context.rootDir, context.cwStorageDir);
  const evaluation = context.storageWritePolicy.evaluate(
    "config-write",
    explicitAllowWrite
  );

  if (!evaluation.allowed || evaluation.mode === "blocked") {
    await writeAuditEvent(context, {
      actor: "tool",
      action: "remove-worker-registration",
      mode: "blocked",
      tool: "worker-registry",
      inputSummary: workerId,
      outputSummary: evaluation.reason,
      warnings: [],
      errors: [evaluation.reason],
      metadata: {
        workerId
      }
    });
    throw new AgentError("WRITE_BLOCKED", evaluation.reason, {
      path
    });
  }

  if (evaluation.mode === "dry-run") {
    await writeAuditEvent(context, {
      actor: "tool",
      action: "remove-worker-registration",
      mode: "dry-run",
      tool: "worker-registry",
      inputSummary: workerId,
      outputSummary: "Worker registration would be removed.",
      warnings: [],
      errors: [],
      metadata: {
        workerId
      }
    });

    return {
      mode: "dry-run",
      path,
      removed: false
    };
  }

  const existing = await readWorkerRegistry(
    context.rootDir,
    context.cwStorageDir
  );
  assertReadableRegistry(existing);

  const nextWorkers = existing.workers.filter(
    (worker) => worker.workerId !== workerId
  );
  const removed = nextWorkers.length !== existing.workers.length;

  const configContents = await readFile(path, "utf8").catch(() => "{\"version\":2}");
  const parsedConfig = CwConfigSchema.parse(JSON.parse(configContents) as unknown);
  const nextConfig = CwConfigSchema.parse({
    ...parsedConfig,
    workers: parsedConfig.workers.filter((worker) => worker.workerId !== workerId)
  });

  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    JSON.stringify(nextConfig, null, 2),
    "utf8"
  );
  await writeAuditEvent(context, {
    actor: "tool",
    action: "remove-worker-registration",
    mode: "execute",
    tool: "worker-registry",
    inputSummary: workerId,
    outputSummary: removed
      ? "Worker registration removed."
      : "Worker registration was not present.",
    warnings: [],
    errors: [],
    metadata: {
      workerId,
      removed
    }
  }, explicitAllowWrite);

  return {
    mode: "execute",
    path,
    removed
  };
};
