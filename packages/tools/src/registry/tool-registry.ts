import { readGitDiff } from "../repository/git-diff.js";
import { readRepositoryFile } from "../filesystem/read-file.js";
import { searchRepository } from "../filesystem/search-repo.js";
import { writeRepositoryFile } from "../filesystem/write-file.js";
import { runSafeCommand } from "../shell/safe-command.js";
import { runLint } from "../testing/run-lint.js";
import { runTests } from "../testing/run-tests.js";
import { runTypecheck } from "../testing/run-typecheck.js";
import { validateJson } from "../validation/validate-json.js";
import { validateWithZod } from "../validation/validate-zod.js";

export interface RegisteredTool {
  description: string;
  name: string;
  risky: boolean;
}

export const registeredTools: RegisteredTool[] = [
  {
    name: "read-file",
    description: "Read a UTF-8 file from disk.",
    risky: false
  },
  {
    name: "write-file",
    description: "Write a UTF-8 file with write-policy enforcement.",
    risky: true
  },
  {
    name: "search-repo",
    description: "Search text files in the repository.",
    risky: false
  },
  {
    name: "read-diff",
    description: "Read git diff output.",
    risky: false
  },
  {
    name: "safe-command",
    description: "Run an allowlisted shell command.",
    risky: true
  },
  {
    name: "run-typecheck",
    description: "Run workspace typechecking via the safe command layer.",
    risky: true
  },
  {
    name: "run-tests",
    description: "Run workspace tests via the safe command layer.",
    risky: true
  },
  {
    name: "run-lint",
    description: "Run workspace lint via the safe command layer.",
    risky: true
  },
  {
    name: "validate-json",
    description: "Parse JSON into structured data.",
    risky: false
  },
  {
    name: "validate-zod",
    description: "Validate data with a Zod schema.",
    risky: false
  }
];

export const toolRegistry = {
  readGitDiff,
  readRepositoryFile,
  runLint,
  runSafeCommand,
  runTests,
  runTypecheck,
  searchRepository,
  validateJson,
  validateWithZod,
  writeRepositoryFile
};
