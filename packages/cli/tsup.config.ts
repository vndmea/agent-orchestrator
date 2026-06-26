import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts", "src/main.ts"],
  format: ["esm"],
  platform: "node",
  splitting: false,
  target: "node22"
});
