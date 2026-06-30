import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname } from "node:path";

import { getCwWorkspaceDatabasePathFromStorageDir } from "./cw-paths.js";
import {
  CW_SQLITE_PRAGMAS,
  CW_SQLITE_SCHEMA_STATEMENTS,
  CW_SQLITE_SCHEMA_VERSION
} from "./sqlite-schema.js";

export interface BootstrapSqliteWorkspaceStoreResult {
  path: string;
  schemaVersion: number;
}

interface SqliteStatement {
  all: (...args: unknown[]) => unknown[];
  get: (...args: unknown[]) => unknown;
  run: (...args: unknown[]) => unknown;
}

export interface SqliteDatabase {
  close: () => void;
  exec: (sql: string) => void;
  prepare: (sql: string) => SqliteStatement;
}

type DatabaseSyncConstructor = new (path: string) => SqliteDatabase;

const require = createRequire(import.meta.url);

const loadDatabaseSync = (): DatabaseSyncConstructor => {
  return (require("node:sqlite") as { DatabaseSync: DatabaseSyncConstructor })
    .DatabaseSync;
};

export const openSqliteWorkspaceStore = async (
  cwStorageDir: string
): Promise<SqliteDatabase> => {
  const DatabaseSync = await Promise.resolve(loadDatabaseSync());
  return new DatabaseSync(getCwWorkspaceDatabasePathFromStorageDir(cwStorageDir));
};

export const bootstrapSqliteWorkspaceStore = async (
  cwStorageDir: string
): Promise<BootstrapSqliteWorkspaceStoreResult> => {
  const path = getCwWorkspaceDatabasePathFromStorageDir(cwStorageDir);
  await mkdir(dirname(path), { recursive: true });
  const DatabaseSync = loadDatabaseSync();
  const db = new DatabaseSync(path);

  try {
    for (const pragma of CW_SQLITE_PRAGMAS) {
      db.exec(pragma);
    }
    for (const statement of CW_SQLITE_SCHEMA_STATEMENTS) {
      db.exec(statement);
    }

    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO schema_meta(key, value_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value_json = excluded.value_json,
         updated_at = excluded.updated_at`
    ).run(
      "schema_version",
      JSON.stringify({ version: CW_SQLITE_SCHEMA_VERSION }),
      now
    );
  } finally {
    db.close();
  }

  return {
    path,
    schemaVersion: CW_SQLITE_SCHEMA_VERSION
  };
};
