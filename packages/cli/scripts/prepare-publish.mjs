import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const INTERNAL_DEPENDENCY_PREFIX = "@mcp-code-worker/";
const PUBLISHED_PACKAGE_NAME = "mcp-code-worker";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = join(scriptDir, "..");
const publishDir = join(packageDir, ".publish");

const sourcePackageJsonPath = join(packageDir, "package.json");
const sourceReadmePath = join(packageDir, "..", "..", "README.md");
const sourceReadmeZhPath = join(packageDir, "..", "..", "README.zh-CN.md");
const sourceDistDir = join(packageDir, "dist");

const filterPublishedDependencies = (dependencies = {}) =>
  Object.fromEntries(
    Object.entries(dependencies).filter(
      ([name]) => !name.startsWith(INTERNAL_DEPENDENCY_PREFIX)
    )
  );

const buildPublishedManifest = (sourceManifest) => ({
  name: PUBLISHED_PACKAGE_NAME,
  version: sourceManifest.version,
  description: sourceManifest.description,
  type: sourceManifest.type,
  main: sourceManifest.main,
  types: sourceManifest.types,
  bin: {
    cw: "./dist/main.js",
    "mcp-code-worker": "./dist/main.js"
  },
  exports: sourceManifest.exports,
  files: ["dist", "README.md", "README.zh-CN.md", "package.json"],
  engines: sourceManifest.engines,
  dependencies: filterPublishedDependencies(sourceManifest.dependencies),
  publishConfig: {
    access: "public"
  }
});

const main = async () => {
  const sourceManifest = JSON.parse(
    await readFile(sourcePackageJsonPath, "utf8")
  );
  const publishedManifest = buildPublishedManifest(sourceManifest);

  await rm(publishDir, { force: true, recursive: true });
  await mkdir(publishDir, { recursive: true });

  await cp(sourceDistDir, join(publishDir, "dist"), { recursive: true });
  await cp(sourceReadmePath, join(publishDir, "README.md"));
  await cp(sourceReadmeZhPath, join(publishDir, "README.zh-CN.md"));
  await writeFile(
    join(publishDir, "package.json"),
    `${JSON.stringify(publishedManifest, null, 2)}\n`,
    "utf8"
  );
};

await main();
