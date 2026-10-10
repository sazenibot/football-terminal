import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, "public");
const worker = { host: "127.0.0.1", port: 8787 };

function gatedPath(url: string): boolean {
  const u = url.split("?")[0];
  return (
    u.startsWith("/data/matches/") ||
    u.startsWith("/data/sim/") ||
    u.startsWith("/data/leagues/") ||
    u === "/data/upcoming.json"
  );
}

/** Surová JSON jen pro Worker (`/__raw/data/...`). Prohlížeč je bere přes Worker. */
function rawDataPlugin(): Plugin {
  return {
    name: "ft-raw-data",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/__raw/data/")) return next();
        const rel = decodeURIComponent(req.url.slice("/__raw/".length).split("?")[0]);
        if (rel.includes("..") || !rel.endsWith(".json")) {
          res.statusCode = 400;
          res.end();
          return;
        }
        const file = path.resolve(publicDir, rel);
        if (!file.startsWith(publicDir + path.sep) || !fs.existsSync(file)) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.setHeader("cache-control", "no-store");
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

/** Gated cesty jdou na Worker dřív, než Vite servíruje `public/`. */
function gateProxyPlugin(): Plugin {
  return {
    name: "ft-gate-proxy",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !gatedPath(req.url)) return next();
        const up = http.request(
          {
            host: worker.host,
            port: worker.port,
            path: req.url,
            method: req.method,
            headers: { ...req.headers, host: `${worker.host}:${worker.port}` },
          },
          (incoming) => {
            res.writeHead(incoming.statusCode || 502, incoming.headers);
            incoming.pipe(res);
          },
        );
        up.on("error", () => {
          res.statusCode = 502;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "data_api_down" }));
        });
        req.pipe(up);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), rawDataPlugin(), gateProxyPlugin()],
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": { target: "http://127.0.0.1:8787", changeOrigin: true },
    },
  },
});
