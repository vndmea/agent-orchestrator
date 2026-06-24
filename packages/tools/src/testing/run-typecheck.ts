import type { ExecutionContext } from "@agent-orchestrator/core";
import { createExecutionContextFromEnv } from "@agent-orchestrator/core";

import { runSafeCommand } from "../shell/safe-command.js";

export const runTypecheck = async (
  context: ExecutionContext = createExecutionContextFromEnv()
) => runSafeCommand("pnpm typecheck", context);
