import { defineConfig } from "vite";
import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/thug-archive/" : "/",
  esbuild: { jsx: "automatic", jsxImportSource: "preact" },
  build: { sourcemap: false },
  plugins: [
    {
      name: "local-archive-preview",
      // This middleware exists only on Vite's local development server.
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = (req.url || "").split("?")[0];
          if (url === "/__local/catalog") {
            try {
              res.setHeader("Content-Type", "application/json");
              res.end(await readFile(".local/catalog.json"));
            } catch {
              res.statusCode = 404;
              res.end("Run npm run catalog first.");
            }
            return;
          }
          if (url.match(/^\/__local\/audio\/t\d{3}\.mp3$/)) {
            const file = path.resolve(".local/audio", path.basename(url));
            try {
              const { size } = await stat(file);
              const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
              res.setHeader("Content-Type", "audio/mpeg");
              res.setHeader("Accept-Ranges", "bytes");
              if (range) {
                const start = Number(range[1]),
                  end = Math.min(Number(range[2] || size - 1), size - 1);
                if (start >= size || end < start) {
                  res.writeHead(416, { "Content-Range": `bytes */${size}` });
                  res.end();
                  return;
                }
                res.writeHead(206, {
                  "Content-Range": `bytes ${start}-${end}/${size}`,
                  "Content-Length": end - start + 1,
                });
                createReadStream(file, { start, end }).pipe(res);
              } else {
                res.setHeader("Content-Length", size);
                createReadStream(file).pipe(res);
              }
            } catch {
              res.statusCode = 404;
              res.end("This track has not been imported yet.");
            }
            return;
          }
          next();
        });
      },
    },
  ],
});
