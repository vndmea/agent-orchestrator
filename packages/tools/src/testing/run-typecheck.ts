import type { ExecutionContext } from "@mcp-code-worker/core";
import { createExecutionContextFromEnv } from "@mcp-code-worker/core";

import { runSafeCommand } from "../shell/safe-command.js";

export const runTypecheck = async (
  context: ExecutionContext = createExecutionContextFromEnv()
) => runSafeCommand("pnpm typecheck", context);
