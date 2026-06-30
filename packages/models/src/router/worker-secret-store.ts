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
