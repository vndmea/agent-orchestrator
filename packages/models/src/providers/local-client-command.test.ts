import { beforeEach, describe, expect, it, vi } from "vitest";

const accessMock = vi.hoisted(() => vi.fn());

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>(
    "node:fs/promises"
  );

  return {
    ...actual,
    access: accessMock
  };
});

describe("resolveCommandOnPath", () => {
  beforeEach(() => {
    accessMock.mockReset();
  });

  it("prefers Windows executable extensions for bare commands before extensionless shims", async () => {
    vi.resetModules();
    vi.stubGlobal("process", {
      ...process,
      platform: "win32"
    });

    accessMock.mockImplementation(async (candidate: string) => {
      if (candidate === "C:\\nvm4w\\nodejs\\opencode.CMD") {
        return;
      }

      throw new Error(`missing: ${candidate}`);
    });

    const { resolveCommandOnPath } = await import("./local-client-command.js");
    const resolved = await resolveCommandOnPath("opencode", {
      PATH: "C:\\nvm4w\\nodejs",
      PATHEXT: ".COM;.EXE;.BAT;.CMD"
    });

    expect(resolved).toBe("C:\\nvm4w\\nodejs\\opencode.CMD");
    expect(accessMock.mock.calls.map(([candidate]) => candidate)).toEqual([
      "C:\\nvm4w\\nodejs\\opencode.COM",
      "C:\\nvm4w\\nodejs\\opencode.EXE",
      "C:\\nvm4w\\nodejs\\opencode.BAT",
      "C:\\nvm4w\\nodejs\\opencode.CMD"
    ]);
  });

  it("still checks the exact path first for configured path-like commands", async () => {
    vi.resetModules();
    vi.stubGlobal("process", {
      ...process,
      platform: "win32"
    });

    accessMock.mockImplementation(async (candidate: string) => {
      if (candidate === "C:\\tools\\claude") {
        return;
      }

      throw new Error(`missing: ${candidate}`);
    });

    const { resolveCommandOnPath } = await import("./local-client-command.js");
    const resolved = await resolveCommandOnPath("C:\\tools\\claude", {
      PATH: "C:\\nvm4w\\nodejs",
      PATHEXT: ".COM;.EXE;.BAT;.CMD"
    });

    expect(resolved).toBe("C:\\tools\\claude");
    expect(accessMock.mock.calls.map(([candidate]) => candidate)).toEqual([
      "C:\\tools\\claude"
    ]);
  });
});
