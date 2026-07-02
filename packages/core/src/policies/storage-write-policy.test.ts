import { describe, expect, it } from "vitest";

import { StorageWritePolicy } from "./storage-write-policy.js";

describe("StorageWritePolicy", () => {
  it("keeps session writes dry-run until explicitly enabled", () => {
    const policy = new StorageWritePolicy({
      allowWrite: false,
      dryRun: false
    });

    const result = policy.evaluate("session-write");

    expect(result.allowed).toBe(true);
    expect(result.mode).toBe("dry-run");
  });

  it("blocks secret writes without general managed-state write permission", () => {
    const policy = new StorageWritePolicy({
      allowWrite: false,
      dryRun: false
    });

    const result = policy.evaluate("secret-write");

    expect(result.allowed).toBe(false);
    expect(result.mode).toBe("blocked");
  });

  it("executes when explicitly enabled outside dry-run mode", () => {
    const policy = new StorageWritePolicy({
      allowWrite: false,
      dryRun: false
    });

    const result = policy.evaluate("session-write", true);

    expect(result.allowed).toBe(true);
    expect(result.mode).toBe("execute");
  });

  it("executes explicit managed-state writes even when repository writes stay dry-run", () => {
    const policy = new StorageWritePolicy({
      allowWrite: false,
      dryRun: true
    });

    const profile = policy.evaluate("profile-write", true);
    const config = policy.evaluate("config-write", true);
    const benchmark = policy.evaluate("benchmark-write", true);

    expect(profile.mode).toBe("execute");
    expect(config.mode).toBe("execute");
    expect(benchmark.mode).toBe("execute");
  });

  it("treats execution records like audit writes in dry-run mode", () => {
    const policy = new StorageWritePolicy({
      allowWrite: true,
      dryRun: true
    });

    const preview = policy.evaluate("execution-record-write");
    const explicit = policy.evaluate("execution-record-write", true);

    expect(preview.allowed).toBe(true);
    expect(preview.mode).toBe("dry-run");
    expect(explicit.allowed).toBe(true);
    expect(explicit.mode).toBe("execute");
  });
});
