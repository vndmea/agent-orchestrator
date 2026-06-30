import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface OpencodeLocalConfigSummary {
  exists: boolean;
  model: string | null;
  path: string;
}

const getOpencodeConfigPathCandidates = (): string[] => {
  const home = homedir();
  const xdgConfigHome =
    process.env.XDG_CONFIG_HOME?.trim() || join(home, ".config");
  const appData = process.env.APPDATA?.trim();

  const candidates = [join(xdgConfigHome, "opencode", "opencode.json")];

  if (appData) {
    candidates.push(join(appData, "opencode", "opencode.json"));
  }

  return Array.from(new Set(candidates));
};

export const readLocalOpencodeConfigSummary =
  async (): Promise<OpencodeLocalConfigSummary> => {
    for (const path of getOpencodeConfigPathCandidates()) {
      try {
        const parsed = JSON.parse(await readFile(path, "utf8")) as {
          model?: unknown;
        };

        return {
          exists: true,
          model: typeof parsed.model === "string" ? parsed.model : null,
          path
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          continue;
        }

        return {
          exists: true,
          model: null,
          path
        };
      }
    }

    return {
      exists: false,
      model: null,
      path: getOpencodeConfigPathCandidates()[0]!
    };
  };
