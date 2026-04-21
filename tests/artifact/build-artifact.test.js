import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const distSrcDir = path.join(projectRoot, "dist", "src");
const manifest = JSON.parse(
  readFileSync(path.join(projectRoot, "scripts", "runtime-manifest.json"), "utf8")
);
const allowedPrefixes = manifest.allowedPrefixes;
const forbiddenFiles = manifest.forbiddenFiles;
const blockedDirectories = manifest.blockedDirectories;

function listFiles(directory, root = directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath, root));
      continue;
    }

    files.push(path.relative(root, fullPath).split(path.sep).join("/"));
  }

  return files.sort();
}

test("build publica apenas entradas runtime allowlisted", () => {
  execFileSync(process.execPath, ["./scripts/build.mjs"], {
    cwd: projectRoot,
    stdio: "pipe"
  });

  assert.equal(existsSync(distSrcDir), true);

  const files = listFiles(distSrcDir);
  assert.equal(files.includes("main.js"), true);
  assert.equal(files.includes("App.js"), true);
  assert.equal(files.some((file) => file.startsWith("app/")), true);
  assert.equal(files.includes("services/notifications.js"), true);

  for (const file of files) {
    assert.equal(
      allowedPrefixes.some((prefix) => file === prefix || file.startsWith(prefix)),
      true,
      `${file} deveria estar coberto pela allowlist runtime`
    );
  }

  for (const file of forbiddenFiles) {
    assert.equal(files.includes(file), false, `${file} nao deveria estar no dist`);
  }

  const hasTests = files.some((file) => blockedDirectories.some((segment) => file.includes(`${segment}/`)));
  assert.equal(hasTests, false);
});
