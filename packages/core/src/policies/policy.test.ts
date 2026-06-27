import { describe, expect, it } from "vitest";

import { SafetyPolicy, WritePolicy } from "@mcp-code-worker/core";

describe("safety policy", () => {
  it("blocks commands outside the allowlist", () => {
    const policy = new SafetyPolicy({
      allowedCommands: ["git"],
      dryRun: false
    });

    const result = policy.evaluateCommand("pnpm test");
    expect(result.allowed).toBe(false);
    expect(result.mode).toBe("blocked");
  });

  it("returns dry-run for allowlisted commands when dry-run is enabled", () => {
    const policy = new SafetyPolicy({
      allowedCommands: ["pnpm"],
      dryRun: true
    });

    const result = policy.evaluateCommand("pnpm test");
    expect(result.allowed).toBe(true);
    expect(result.mode).toBe("dry-run");
  });

  it("allows read-only git commands during dry-run", () => {
    const policy = new SafetyPolicy({
      allowedCommands: ["git"],
      dryRun: true
    });

    const result = policy.evaluateCommand("git diff --no-ext-diff", "read-only");
    expect(result.allowed).toBe(true);
    expect(result.mode).toBe("execute");
    expect(result.readOnly).toBe(true);
    expect(result.dryRunContext).toBe(true);
  });

  it("blocks unsupported git subcommands in read-only mode", () => {
    const policy = new SafetyPolicy({
      allowedCommands: ["git"],
      dryRun: true
    });

    const result = policy.evaluateCommand("git checkout main", "read-only");
    expect(result.allowed).toBe(false);
    expect(result.mode).toBe("blocked");
  });
});

describe("write policy", () => {
  it("defaults to dry-run without explicit permission", () => {
    const policy = new WritePolicy({
      allowWrite: false,
      dryRun: true
    });

    const result = policy.evaluate("README.md");
    expect(result.mode).toBe("dry-run");
  });

  it("allows writes when explicitly enabled", () => {
    const policy = new WritePolicy({
      allowWrite: true,
      dryRun: false
    });

    const result = policy.evaluate("README.md");
    expect(result.mode).toBe("execute");
  });
});
