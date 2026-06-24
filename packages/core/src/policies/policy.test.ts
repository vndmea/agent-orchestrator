import { describe, expect, it } from "vitest";

import { SafetyPolicy, WritePolicy } from "@agent-orchestrator/core";

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
