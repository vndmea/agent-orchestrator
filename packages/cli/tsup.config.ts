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
    /^@mcp-code-worker\/core$/,
    /^@mcp-code-worker\/models$/,
    /^@mcp-code-worker\/tools$/,
    /^@mcp-code-worker\/graph$/,
    /^@mcp-code-worker\/mcp-server$/
  ],
  platform: "node",
  splitting: false,
  target: "node22"
});
