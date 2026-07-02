import {
  bootstrapSqliteWorkspaceStore,
  getCwWorkspaceDir,
  openSqliteWorkspaceStore,
  type ExecutionContext
} from "@mcp-code-worker/core";

const readSecretRow = (
  db: Awaited<ReturnType<typeof openSqliteWorkspaceStore>>,
  workerId: string
): { api_key: string } | undefined =>
  db
    .prepare("SELECT api_key FROM worker_secrets WHERE worker_id = ?")
    .get(workerId) as { api_key: string } | undefined;

const resolveStorageDir = (
  rootDir: string,
  cwStorageDir?: string
): string => cwStorageDir ?? getCwWorkspaceDir(rootDir);

export interface WorkerSecretMetadata {
  createdAt: string;
  updatedAt: string;
  workerId: string;
}

export const getWorkerSecret = async (
  rootDir: string,
  workerId: string,
  cwStorageDir?: string
): Promise<string | undefined> => {
  const storageDir = resolveStorageDir(rootDir, cwStorageDir);
  await bootstrapSqliteWorkspaceStore(storageDir);
  const db = await openSqliteWorkspaceStore(storageDir);

  try {
    return readSecretRow(db, workerId)?.api_key;
  } finally {
    db.close();
  }
};

export const listWorkerSecrets = async (
  rootDir: string,
  cwStorageDir?: string
): Promise<WorkerSecretMetadata[]> => {
  const storageDir = resolveStorageDir(rootDir, cwStorageDir);
  await bootstrapSqliteWorkspaceStore(storageDir);
  const db = await openSqliteWorkspaceStore(storageDir);

  try {
    const rows = db
      .prepare(
        `SELECT worker_id, created_at, updated_at
         FROM worker_secrets
         ORDER BY updated_at DESC, worker_id ASC`
      )
      .all() as Array<{
        created_at: string;
        updated_at: string;
        worker_id: string;
      }>;

    return rows.map((row) => ({
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      workerId: row.worker_id
    }));
  } finally {
    db.close();
  }
};

export const saveWorkerSecret = async (
  context: ExecutionContext,
  workerId: string,
  apiKey: string,
  explicitAllowWrite = false
): Promise<{ mode: "execute" | "dry-run"; path: string }> => {
  const evaluation = context.storageWritePolicy.evaluate(
    "secret-write",
    explicitAllowWrite
  );
  const storageDir = resolveStorageDir(context.rootDir, context.cwStorageDir);
  const { path } = await bootstrapSqliteWorkspaceStore(storageDir);

  if (evaluation.mode !== "execute") {
    return {
      mode: "dry-run",
      path
    };
  }

  const db = await openSqliteWorkspaceStore(storageDir);
  try {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO worker_secrets(worker_id, api_key, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(worker_id) DO UPDATE SET
         api_key = excluded.api_key,
         updated_at = excluded.updated_at`
    ).run(workerId, apiKey, now, now);
  } finally {
    db.close();
  }

  return {
    mode: "execute",
    path
  };
};

export const removeWorkerSecret = async (
  context: ExecutionContext,
  workerId: string,
  explicitAllowWrite = false
): Promise<{ mode: "execute" | "dry-run"; path: string; removed: boolean }> => {
  const evaluation = context.storageWritePolicy.evaluate(
    "secret-write",
    explicitAllowWrite
  );
  const storageDir = resolveStorageDir(context.rootDir, context.cwStorageDir);
  const { path } = await bootstrapSqliteWorkspaceStore(storageDir);

  if (evaluation.mode !== "execute") {
    return {
      mode: "dry-run",
      path,
      removed: false
    };
  }

  const db = await openSqliteWorkspaceStore(storageDir);
  try {
    const result = db
      .prepare("DELETE FROM worker_secrets WHERE worker_id = ?")
      .run(workerId) as { changes: number };

    return {
      mode: "execute",
      path,
      removed: result.changes > 0
    };
  } finally {
    db.close();
  }
};
