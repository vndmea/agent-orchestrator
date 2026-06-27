import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  cwListAuditEventsTool,
  cwToolDefinitions
} from "@mcp-code-worker/mcp-server";

const withTempCwd = async (
  callback: (rootDir: string) => Promise<void>
): Promise<void> => {
  const originalCwd = process.cwd();
  const rootDir = await mkdtemp(join(tmpdir(), "cw-mcp-audit-"));

  try {
    process.chdir(rootDir);
    await callback(rootDir);
  } finally {
    process.chdir(originalCwd);
  }
};

describe("mcp audit tools", () => {
  it("registers cw_list_audit_events", () => {
    expect(cwToolDefinitions.map((tool) => tool.name)).toContain(
      "cw_list_audit_events"
    );
  });

  it("returns an empty array when no audit logs exist", async () => {
    await withTempCwd(async () => {
      const events = await cwListAuditEventsTool.execute({});

      expect(events).toEqual([]);
    });
  });
});
