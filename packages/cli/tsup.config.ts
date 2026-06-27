import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts", "src/main.ts"],
  external: [
    "zod",
    "ai",
    "@ai-sdk/openai",
    "@langchain/langgraph",
    "@modelcontextprotocol/sdk",
    "commander",
    "@commander-js/extra-typings"
  ],
  format: ["esm"],
  noExternal: [
    /^@agent-orchestrator\/core$/,
    /^@agent-orchestrator\/models$/,
    /^@agent-orchestrator\/tools$/,
    /^@agent-orchestrator\/graph$/,
    /^@agent-orchestrator\/mcp-server$/
  ],
  platform: "node",
  splitting: false,
  target: "node22"
});
