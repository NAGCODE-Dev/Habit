import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");
const distSrcDir = path.join(projectRoot, "dist", "src");

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

test("build nao publica arquivos de desenvolvimento nem servicos removidos", () => {
  execFileSync(process.execPath, ["./scripts/build.mjs"], {
    cwd: projectRoot,
    stdio: "pipe"
  });

  assert.equal(existsSync(distSrcDir), true);

  const files = listFiles(distSrcDir);
  assert.equal(files.includes("main.js"), true);
  assert.equal(files.includes("App.js"), true);
  assert.equal(files.includes("services/notifications.js"), true);

  const forbiddenFiles = [
    "services/state.js",
    "services/googleFitService.js",
    "services/telemetryService.js",
    "services/healthModelService.js"
  ];

  for (const file of forbiddenFiles) {
    assert.equal(files.includes(file), false, `${file} nao deveria estar no dist`);
  }

  const hasTests = files.some((file) => file.includes("__tests__/"));
  assert.equal(hasTests, false);
});
