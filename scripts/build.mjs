import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import "./generate-assets.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const srcDir = path.join(rootDir, "src");
const RUNTIME_COPY_ENTRIES = [
  ["src/main.js", "src/main.js"],
  ["src/App.js", "src/App.js"],
  ["src/app", "src/app"],
  ["src/components", "src/components"],
  ["src/services", "src/services"],
  ["src/styles", "src/styles"]
];
const BLOCKED_RUNTIME_FILES = new Set([
  "src/services/storage.js"
]);

function shouldCopyRuntimeEntry(sourcePath) {
  const relativePath = path.relative(rootDir, sourcePath).split(path.sep).join("/");
  if (!relativePath) {
    return true;
  }

  if (relativePath.split("/").includes("__tests__")) {
    return false;
  }

  return !BLOCKED_RUNTIME_FILES.has(relativePath);
}

async function copyRuntimeEntry(sourceRelativePath, targetRelativePath) {
  const sourcePath = path.join(rootDir, sourceRelativePath);
  const targetPath = path.join(distDir, targetRelativePath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await cp(sourcePath, targetPath, {
    recursive: true,
    filter: shouldCopyRuntimeEntry
  });
}

async function listFiles(directory, root = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath, root)));
      continue;
    }

    const relativePath = path.relative(root, fullPath).split(path.sep).join("/");
    files.push(`./${relativePath}`);
  }

  return files.sort();
}

async function buildVersionHash(root, files) {
  const hash = crypto.createHash("sha1");

  for (const file of files) {
    if (file === "./" || file === "./sw.js") {
      continue;
    }

    hash.update(file);
    const contents = await readFile(path.join(root, file.slice(2)));
    hash.update(contents);
  }

  return hash.digest("hex").slice(0, 12);
}

async function main() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  for (const [sourceRelativePath, targetRelativePath] of RUNTIME_COPY_ENTRIES) {
    await copyRuntimeEntry(sourceRelativePath, targetRelativePath);
  }
  await cp(path.join(rootDir, "index.html"), path.join(distDir, "index.html"));

  const publicEntries = await readdir(path.join(rootDir, "public"), { withFileTypes: true });
  for (const entry of publicEntries) {
    const sourcePath = path.join(rootDir, "public", entry.name);
    const targetPath = path.join(distDir, entry.name);
    await cp(sourcePath, targetPath, { recursive: entry.isDirectory() });
  }

  const cacheFiles = ["./", ...(await listFiles(distDir))].filter(
    (file, index, array) => array.indexOf(file) === index
  );
  const version = await buildVersionHash(distDir, cacheFiles);

  const swPath = path.join(distDir, "sw.js");
  const swContents = await readFile(swPath, "utf8");
  const updatedSw = swContents
    .replace("__CACHE_FILES__", JSON.stringify(cacheFiles, null, 2))
    .replace("__SW_VERSION__", version);
  await writeFile(swPath, updatedSw);

  const manifestPath = path.join(distDir, "manifest.json");
  const manifestRaw = await readFile(manifestPath, "utf8");
  await writeFile(
    manifestPath,
    manifestRaw.replace("__APP_VERSION__", version)
  );

  const summary = {
    dist: path.relative(rootDir, distDir),
    files: cacheFiles.length,
    version
  };

  console.log(JSON.stringify(summary, null, 2));
}

await main();
