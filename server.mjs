// MemoDash 生产静态服务器：托管 vite build 产物 dist/。
// 监听 0.0.0.0:$PORT（WorkBuddy Sites 单端口反代要求）。
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extname, join, normalize, sep } from "node:path";

const root = fileURLToPath(new URL("./dist", import.meta.url));
const port = Number(process.env.PORT || 3000);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".gz": "application/gzip",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

createServer((req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    let pathname = decodeURIComponent(url.pathname);
    let file = normalize(join(root, pathname));
    if (!file.startsWith(root + sep) && file !== root) { res.writeHead(403); res.end(); return; }
    if (!existsSync(file) || statSync(file).isDirectory()) {
      // SPA 兜底：无扩展名的路径回退到 index.html（OAuth 回调落在根路径）
      if (!extname(pathname)) file = join(root, "index.html");
      if (!existsSync(file)) { res.writeHead(404); res.end("Not Found"); return; }
    }
    const headers = { "Content-Type": mime[extname(file).toLowerCase()] || "application/octet-stream" };
    if (file.includes(`${sep}assets${sep}`)) headers["Cache-Control"] = "public, max-age=31536000, immutable";
    res.writeHead(200, headers);
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(500); res.end("Internal Server Error");
  }
}).listen(port, "0.0.0.0", () => console.log(`MemoDash listening on 0.0.0.0:${port}`));
