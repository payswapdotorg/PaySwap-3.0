#!/usr/bin/env node
/**
 * @payswap/journey-verification — the static file server for the built web
 * app (the journey suite's serving substrate).
 *
 * CHOICE (documented per the work order): a minimal dependency-free node
 * static server over `packages/web/dist`, NOT the @zcode/server
 * static-root mode. Rationale: the server substrate requires a tsup build
 * + provider-registry boot before it can serve; the journey suite needs
 * exactly "serve the production build of the tested commit with SPA
 * fallback" and nothing else. A zero-dependency server keeps the suite
 * hermetic, OOM-safe (4GB box law: no second build), and honest — every
 * asset request either resolves from dist or 404s (which the
 * zero-console-error law then FAILS visibly; nothing is masked).
 *
 * Behavior mirrors the substrate's production serving shape
 * (ZCODE_WEB_STATIC_ROOT: static root + SPA fallback):
 *   - real files under the root are served with correct MIME + no-store;
 *   - extensionless paths (client routes: /payswap, /app, ...) fall back
 *     to index.html (HTTP 200) — the SPA router resolves them client-side;
 *   - paths WITH a file extension that do not resolve are a hard 404;
 *   - path traversal outside the root is refused.
 */

import { createReadStream, existsSync, statSync } from "node:fs";
import http from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_ROOT = resolve(HERE, "../../web/dist");
const DEFAULT_PORT = 4173;

const MIME_BY_EXTENSION = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
};

/** Start the static server. Resolves once the server is listening. */
export function startStaticServer(options = {}) {
  const root = resolve(options.root ?? DEFAULT_ROOT);
  const port = options.port ?? DEFAULT_PORT;
  const host = options.host ?? "127.0.0.1";

  const server = http.createServer((request, response) => {
    const requestUrl = request.url ?? "/";
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(requestUrl, "http://localhost").pathname);
    } catch {
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      response.end("bad request");
      return;
    }

    const candidate = normalize(join(root, pathname));
    if (candidate !== root && !candidate.startsWith(root + sep)) {
      response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      response.end("forbidden");
      return;
    }

    const serveFile = (filePath, status = 200) => {
      const type = MIME_BY_EXTENSION[extname(filePath).toLowerCase()] ?? "application/octet-stream";
      response.writeHead(status, {
        "content-type": type,
        "cache-control": "no-store",
        "x-journey-server": "static-spa",
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      createReadStream(filePath)
        .on("error", () => {
          response.destroy();
        })
        .pipe(response);
    };

    if (existsSync(candidate) && statSync(candidate).isFile()) {
      serveFile(candidate);
      return;
    }

    const hasExtension = /\.[A-Za-z0-9]+$/.test(pathname);
    const indexCandidate = join(root, "index.html");
    if (!hasExtension && existsSync(indexCandidate)) {
      serveFile(indexCandidate);
      return;
    }

    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end(`not found: ${pathname}`);
  });

  return new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(port, host, () => {
      resolvePromise(server);
    });
  });
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const root = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_ROOT;
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  if (!existsSync(join(root, "index.html"))) {
    console.error(
      `[journey-serve] no index.html under ${root} — build the web app first ` +
        "(one-shot: `corepack pnpm --filter @zcode/web exec vite build --minify false --sourcemap false`)",
    );
    process.exit(1);
  }
  startStaticServer({ root, port }).then((server) => {
    const address = server.address();
    const shown = typeof address === "object" && address ? address.port : port;
    console.error(`[journey-serve] serving ${root} at http://127.0.0.1:${shown}`);
  });
}
