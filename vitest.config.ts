import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const resolvePath = (relativePath: string) =>
  fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@mcp-code-worker/cli": resolvePath("./packages/cli/src/index.ts"),
      "@mcp-code-worker/core": resolvePath("./packages/core/src/index.ts"),
      "@mcp-code-worker/graph": resolvePath("./packages/graph/src/index.ts"),
      "@mcp-code-worker/mcp-server": resolvePath(
        "./packages/mcp-server/src/index.ts"
      ),
      "@mcp-code-worker/models": resolvePath("./packages/models/src/index.ts"),
      "@mcp-code-worker/tools": resolvePath("./packages/tools/src/index.ts")
    }
  },
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["packages/**/*.test.ts"],
    maxWorkers: 1,
    minWorkers: 1,
    setupFiles: ["./vitest.setup.ts"]
  }
});
