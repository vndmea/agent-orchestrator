import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { bootstrapSqliteWorkspaceStore } from "./sqlite.js";

describe("bootstrapSqliteWorkspaceStore", () => {
  it.skip("creates the sqlite workspace store and schema metadata", async () => {
    const cwStorageDir = await mkdtemp(join(tmpdir(), "cw-sqlite-"));
    const result = await bootstrapSqliteWorkspaceStore(cwStorageDir);
    const { DatabaseSync } = await import("node:sqlite");

    expect(result.path).toContain("data.db");

    const db = new DatabaseSync(result.path);
    try {
      const row = db
        .prepare("SELECT value_json FROM schema_meta WHERE key = ?")
        .get("schema_version") as { value_json: string } | undefined;
      expect(row).toBeTruthy();
      expect(JSON.parse(row?.value_json ?? "{}")).toEqual({
        version: result.schemaVersion
      });
    } finally {
      db.close();
    }
  });
});
