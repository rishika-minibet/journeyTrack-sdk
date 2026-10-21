// Tiny local server for the demo. No dependencies.
// Files under /dist/ are served as-is. Every other path returns the demo page,
// like a real SPA server, so refreshing on /games still works.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const distDir = join(root, "dist");
const demoPage = join(root, "demo", "index.html");
const port = 3000;

createServer(async (req, res) => {
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  const requested = join(root, pathname);
  const isDistFile = requested.startsWith(distDir);

  const file = isDistFile ? requested : demoPage;
  const type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".map") ? "application/json" : "text/html";

  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`JourneyTrack demo running at http://localhost:${port}`);
});
