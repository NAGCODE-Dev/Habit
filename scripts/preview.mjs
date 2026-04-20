import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const targetDir = path.resolve(rootDir, process.argv[2] ?? "dist");
const port = Number(process.argv[3] ?? 4173);

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json"
};

function contentType(filePath) {
  return MIME_TYPES[path.extname(filePath)] ?? "application/octet-stream";
}

async function resolvePath(urlPath) {
  const safePath = decodeURIComponent(urlPath.split("?")[0]);
  const normalized = safePath === "/" ? "/index.html" : safePath;
  let filePath = path.join(targetDir, normalized);

  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
    return filePath;
  } catch {
    return path.join(targetDir, "index.html");
  }
}

const server = http.createServer(async (request, response) => {
  const filePath = await resolvePath(request.url ?? "/");

  try {
    await access(filePath);
    response.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Cache-Control": "no-cache"
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, () => {
  console.log(`Preview server running at http://localhost:${port}`);
  console.log(`Serving ${targetDir}`);
});
