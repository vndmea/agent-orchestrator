import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import {
  createExecutionContextFromEnv,
  PatchProposalSchema
} from "@mcp-code-worker/core";
import {
  applyPatchProposal,
  inspectPatch,
  parseUnifiedDiff
} from "@mcp-code-worker/tools";

const execFile = promisify(execFileCallback);

const createGitRoot = async (): Promise<string> => {
  const rootDir = await mkdtemp(join(tmpdir(), "cw-patch-lifecycle-"));
  await writeFile(
    join(rootDir, "package.json"),
    JSON.stringify(
      {
        scripts: {
          typecheck: "node -e \"process.exit(0)\"",
          lint: "node -e \"console.error('lint failed'); process.exit(1)\""
        }
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(join(rootDir, ".gitignore"), "tmp\n", "utf8");
  await writeFile(join(rootDir, "demo.ts"), "export const value = 1;\n", "utf8");
  await execFile("git", ["init"], { cwd: rootDir });
  await execFile("git", ["config", "user.email", "cw@example.com"], { cwd: rootDir });
  await execFile("git", ["config", "user.name", "MCP Code Worker"], { cwd: rootDir });
  await execFile("git", ["add", "."], { cwd: rootDir });
  await execFile("git", ["commit", "-m", "initial"], { cwd: rootDir });
  return rootDir;
};

const createProposal = (diffText: string, path = "demo.ts") =>
  PatchProposalSchema.parse({
    id: "patch-1",
    title: "Add a candidate comment",
    summary: "Add a review comment above the export.",
    rationale: ["Used for patch lifecycle tests."],
    unifiedDiff: diffText,
    files: [
      {
        path,
        changeType: "modify",
        summary: "Insert a candidate comment.",
        riskLevel: "low"
      }
    ],
    risks: [],
    validationPlan: ["pnpm typecheck"],
    generatedAt: new Date().toISOString(),
    source: {
      workflow: "patch-proposal-workflow"
    }
  });

const createValidProposal = async (
  rootDir: string,
  path = "demo.ts"
): Promise<ReturnType<typeof createProposal>> => {
  const fullPath = join(rootDir, path);
  const originalContents = "export const value = 1;\n";
  await writeFile(fullPath, `// comment\n${originalContents}`, "utf8");
  const diff = await execFile("git", ["diff", "--", path], {
    cwd: rootDir
  });
  await writeFile(fullPath, originalContents, "utf8");

  return createProposal(diff.stdout, path);
};

const createContext = (rootDir: string, allowWrite = false) =>
  createExecutionContextFromEnv(undefined, {
    rootDir,
    dryRun: false,
    allowWrite
  });

describe("patch lifecycle tools", () => {
  it("parses add, modify, and delete unified diffs", () => {
    const diffText = [
      "diff --git a/demo.ts b/demo.ts",
      "--- a/demo.ts",
      "+++ b/demo.ts",
      "@@ -1,1 +1,2 @@",
      "+// comment",
      " export const value = 1;",
      "diff --git a/new.ts b/new.ts",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/new.ts",
      "@@ -0,0 +1 @@",
      "+export const created = true;",
      "diff --git a/old.ts b/old.ts",
      "deleted file mode 100644",
      "--- a/old.ts",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-export const old = true;"
    ].join("\n");

    expect(parseUnifiedDiff(diffText)).toEqual([
      {
        path: "demo.ts",
        changeType: "modify",
        additions: 1,
        deletions: 0
      },
      {
        path: "new.ts",
        changeType: "add",
        additions: 1,
        deletions: 0
      },
      {
        path: "old.ts",
        changeType: "delete",
        additions: 0,
        deletions: 1
      }
    ]);
  });

  it("inspects safe patches and blocks unsafe targets", async () => {
    const rootDir = await createGitRoot();
    const context = createContext(rootDir);
    const safeProposal = await createValidProposal(rootDir);

    const safeInspection = await inspectPatch(context, safeProposal);
    const traversalInspection = await inspectPatch(
      context,
      createProposal(
        [
          "diff --git a/../outside.ts b/../outside.ts",
          "--- a/../outside.ts",
          "+++ b/../outside.ts",
          "@@ -0,0 +1 @@",
          "+export const blocked = true;"
        ].join("\n"),
        "../outside.ts"
      )
    );
    const secretInspection = await inspectPatch(
      context,
      createProposal(
        [
          "diff --git a/.env b/.env",
          "--- a/.env",
          "+++ b/.env",
          "@@ -1 +1 @@",
          "-SECRET=1",
          "+SECRET=2"
        ].join("\n"),
        ".env"
      )
    );

    expect(safeInspection.ok).toBe(true);
    expect(traversalInspection.ok).toBe(false);
    expect(secretInspection.ok).toBe(false);
  });

  it("blocks files outside the requested scope and warns on beforeHash mismatches", async () => {
    const rootDir = await createGitRoot();
    const context = createContext(rootDir);
    await writeFile(join(rootDir, "nested.ts"), "export const nested = true;\n", "utf8");
    await execFile("git", ["add", "nested.ts"], { cwd: rootDir });
    await execFile("git", ["commit", "-m", "add nested"], { cwd: rootDir });
    const scopedProposal = createProposal(
      [
        "diff --git a/nested.ts b/nested.ts",
        "--- a/nested.ts",
        "+++ b/nested.ts",
        "@@ -1,1 +1,2 @@",
        "+// scoped comment",
        " export const nested = true;"
      ].join("\n"),
      "nested.ts"
    );
    const mismatchedHashProposal = PatchProposalSchema.parse({
      ...scopedProposal,
      files: [
        {
          path: scopedProposal.files[0]?.path ?? "nested.ts",
          changeType: scopedProposal.files[0]?.changeType ?? "modify",
          summary: scopedProposal.files[0]?.summary ?? "Insert a candidate comment.",
          riskLevel: scopedProposal.files[0]?.riskLevel ?? "low",
          beforeHash: "sha256-does-not-match"
        }
      ]
    });

    const blocked = await inspectPatch(context, scopedProposal, {
      scope: "packages/core"
    });
    const warned = await inspectPatch(context, mismatchedHashProposal);

    expect(blocked.ok).toBe(false);
    expect(blocked.blockedReasons[0]).toContain("outside the requested scope");
    expect(warned.warnings).toContain(
      "nested.ts: beforeHash did not match the current file contents."
    );
  });

  it("blocks .git paths and empty diffs", async () => {
    const rootDir = await createGitRoot();
    const context = createContext(rootDir);
    const gitInspection = await inspectPatch(
      context,
      createProposal(
        [
          "diff --git a/.git/config b/.git/config",
          "--- a/.git/config",
          "+++ b/.git/config",
          "@@ -1 +1 @@",
          "-old",
          "+new"
        ].join("\n"),
        ".git/config"
      )
    );
    const emptyInspection = await inspectPatch(
      context,
      {
        ...createProposal("diff --git a/demo.ts b/demo.ts", "demo.ts"),
        unifiedDiff: ""
      }
    );

    expect(gitInspection.ok).toBe(false);
    expect(emptyInspection.ok).toBe(false);
  });

  it("blocks syntactically corrupt diffs during inspection", async () => {
    const rootDir = await createGitRoot();
    const context = createContext(rootDir);
    const corruptInspection = await inspectPatch(
      context,
      createProposal(
        [
          "diff --git a/demo.ts b/demo.ts",
          "--- a/demo.ts",
          "+++ b/demo.ts",
          "@@ -1,1 +1,2 @@",
          "+// comment"
        ].join("\n")
      )
    );

    expect(corruptInspection.ok).toBe(false);
    expect(corruptInspection.blockedReasons.join("\n")).toContain(
      "corrupt patch"
    );
  });

  it("supports dry-run patch application and blocks missing confirmation", async () => {
    const rootDir = await createGitRoot();
    const proposal = await createValidProposal(rootDir);

    const dryRunResult = await applyPatchProposal(
      createContext(rootDir),
      proposal,
      {
        dryRun: true
      }
    );
    const blockedResult = await applyPatchProposal(
      createContext(rootDir, true),
      proposal,
      {
        allowWrite: true,
        confirmApply: false,
        dryRun: false
      }
    );

    expect(dryRunResult.mode).toBe("dry-run");
    expect(dryRunResult.applied).toBe(false);
    expect(blockedResult.mode).toBe("denied");
    expect(blockedResult.errors[0]).toContain("confirm");
  });

  it("blocks patch application when the worktree is dirty by default", async () => {
    const rootDir = await createGitRoot();
    const proposal = await createValidProposal(rootDir);
    await writeFile(join(rootDir, "notes.txt"), "local change\n", "utf8");

    const result = await applyPatchProposal(createContext(rootDir), proposal, {
      dryRun: true
    });

    expect(result.mode).toBe("denied");
    expect(result.errors[0]).toContain("Dirty worktree detected");
    expect(result.dirtyWorktree?.untrackedFiles).toContain("notes.txt");
  });

  it("ignores tmp artifacts but can explicitly allow other dirty changes", async () => {
    const rootDir = await createGitRoot();
    const proposal = await createValidProposal(rootDir);
    await mkdir(join(rootDir, "tmp", "task-1"), { recursive: true });
    await writeFile(join(rootDir, "tmp", "task-1", "session.json"), "{}", "utf8");
    await writeFile(join(rootDir, "notes.txt"), "local change\n", "utf8");

    const blocked = await applyPatchProposal(createContext(rootDir), proposal, {
      dryRun: true
    });
    const allowed = await applyPatchProposal(createContext(rootDir), proposal, {
      dryRun: true,
      allowDirtyWorktree: true
    });

    expect(blocked.dirtyWorktree?.ignoredFiles).toContain("tmp/task-1/session.json");
    expect(blocked.dirtyWorktree?.untrackedFiles).toContain("notes.txt");
    expect(allowed.mode).toBe("dry-run");
    expect(allowed.warnings).toContain(
      "Dirty worktree allowed explicitly; manual review required."
    );
  });

  it("applies valid patches only with explicit gates and can run validation", async () => {
    const rootDir = await createGitRoot();
    const proposal = await createValidProposal(rootDir);

    const result = await applyPatchProposal(
      createContext(rootDir, true),
      proposal,
      {
        allowWrite: true,
        confirmApply: true,
        dryRun: false,
        runValidation: {
          typecheck: true,
          lint: true
        }
      }
    );

    const contents = await execFile("git", ["diff", "--", "demo.ts"], {
      cwd: rootDir
    });

    expect(result.mode).toBe("execute");
    expect(result.applied).toBe(true);
    expect(result.validationReport?.ok).toBe(false);
    expect(result.warnings).toContain(
      "Patch applied but validation failed; manual review required."
    );
    expect(result.recovery?.failedChecks).toContain("lint");
    expect(result.recovery?.safeToRunRollbackCommands).toBe(true);
    expect(result.recovery?.rollbackCommands).toContain(
      "git restore --worktree -- demo.ts"
    );
    expect(contents.stdout).toContain("// comment");
  }, 15_000);

  it("omits direct rollback commands when validation fails after allowing a dirty worktree", async () => {
    const rootDir = await createGitRoot();
    const proposal = await createValidProposal(rootDir);
    await writeFile(join(rootDir, "notes.txt"), "local change\n", "utf8");

    const result = await applyPatchProposal(
      createContext(rootDir, true),
      proposal,
      {
        allowWrite: true,
        allowDirtyWorktree: true,
        confirmApply: true,
        dryRun: false,
        runValidation: {
          lint: true
        }
      }
    );

    expect(result.mode).toBe("execute");
    expect(result.recovery?.preApplyDirty).toBe(true);
    expect(result.recovery?.safeToRunRollbackCommands).toBe(false);
    expect(result.recovery?.rollbackCommands).toHaveLength(0);
    expect(result.recovery?.dirtyFilesBeforeApply).toContain("notes.txt");
  }, 15_000);
});
