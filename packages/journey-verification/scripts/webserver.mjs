#!/usr/bin/env node
/**
 * @payswap/journey-verification — the Playwright webServer entry.
 *
 * OOM LAW (4GB box): one-shot builds only, never dev/watch. This script:
 *   1. ensures `packages/web/dist/index.html` exists — if missing (or
 *      JOURNEY_FORCE_WEB_BUILD=1) it runs the ONE-SHOT build exactly as
 *      the work order prescribes:
 *        vite build --minify false --sourcemap false
 *      (no minify, no sourcemap — the memory-safe production build);
 *   2. ensures `packages/server/dist/entry-http.js` exists — if missing
 *      (or JOURNEY_FORCE_SERVER_BUILD=1) the ONE-SHOT substrate-server
 *      build (tsup — ~1s, heap-capped the same way);
 *   3. serves the dist through the REAL substrate HTTP server
 *      (ZCODE_WEB_STATIC_ROOT + SPA fallback + the /ws + /api endpoints
 *      the built app REQUIRES).
 *
 * THE SERVING DECISION (P21-D, recorded honestly): since the P15 strip
 * the built web app boots the ORIGINAL ZCode substrate Root for every
 * non-substrate pathname, and that Root REQUIRES the substrate /ws
 * backend (packages/client connectViaWebSocket is fail-fast) — served
 * static-only, every route renders the app's own "Web bootstrap failed"
 * report and NO shipped workflow exists to drive (ADR-0014 D10: "No
 * mock-rendered page substitutes for the shipped workflow"). The app's
 * PRODUCTION serving shape is the substrate server with the static root
 * (packages/server entry-http: ZCODE_WEB_STATIC_ROOT + spaFallback), so
 * the suite serves THAT — the real app over its real backend, never a
 * mocked or stripped-down substitute. scripts/serve.mjs (the former
 * dependency-free static server) stays exported for standalone use, but
 * the suite no longer serves through it: a page that cannot boot is not
 * journey evidence.
 *
 * The lane battery pre-builds both dists once and the webServer REUSES
 * them (the work order's documented flow); CI (journeys.yml) lets this
 * script build when a dist is absent. Set JOURNEY_PORT to override the
 * fixed default 4173.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const WEB_DIST = resolve(HERE, "../../web/dist");
const WEB_PACKAGE = resolve(HERE, "../../web");
const SERVER_PACKAGE = resolve(HERE, "../../server");
const SERVER_ENTRY = resolve(SERVER_PACKAGE, "dist/entry-http.js");
const PORT = Number(process.env.JOURNEY_PORT ?? 4173);
const HOST = "127.0.0.1";
const BASE_URL = `http://${HOST}:${PORT}`;

/** One-shot build helper (the OOM law: heap-capped, never watch). */
function oneShotBuild(cwd, label, forceEnv, marker) {
  const present = existsSync(marker);
  if (present && process.env[forceEnv] !== "1") {
    console.error(`[journey-webserver] reusing existing ${label} at ${marker}`);
    return;
  }
  console.error(`[journey-webserver] no ${label} found — running the one-shot build (OOM-safe)`);
  const build = spawnSync("corepack", ["pnpm", "exec", "tsup"], {
    cwd,
    stdio: "inherit",
    env: {
      ...process.env,
      COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
      // OOM law (4GB box): cap the node heap so the one-shot build's
      // peak RSS stays inside the box's headroom.
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --max-old-space-size=1600`.trim(),
    },
  });
  if (build.status !== 0) {
    console.error(`[journey-webserver] ${label} build failed (exit ${build.status}) — aborting`);
    process.exit(1);
  }
  if (!existsSync(marker)) {
    console.error(`[journey-webserver] ${label} build completed but ${marker} is missing — aborting`);
    process.exit(1);
  }
}

/** Build the web dist if absent (vite; the tsup call below is for the server only). */
function ensureWebDist() {
  const distPresent = existsSync(resolve(WEB_DIST, "index.html"));
  if (distPresent && process.env.JOURNEY_FORCE_WEB_BUILD !== "1") {
    console.error(`[journey-webserver] reusing existing dist at ${WEB_DIST}`);
    return;
  }
  if (distPresent) {
    console.error("[journey-webserver] JOURNEY_FORCE_WEB_BUILD=1 — rebuilding web dist");
  } else {
    console.error("[journey-webserver] no web dist found — running the one-shot build (OOM-safe)");
  }
  const build = spawnSync(
    "corepack",
    ["pnpm", "exec", "vite", "build", "--minify", "false", "--sourcemap", "false"],
    {
      cwd: WEB_PACKAGE,
      stdio: "inherit",
      env: {
        ...process.env,
        COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --max-old-space-size=1600`.trim(),
      },
    },
  );
  if (build.status !== 0) {
    console.error(`[journey-webserver] web build failed (exit ${build.status}) — aborting`);
    process.exit(1);
  }
  if (!existsSync(resolve(WEB_DIST, "index.html"))) {
    console.error("[journey-webserver] build completed but dist/index.html is missing — aborting");
    process.exit(1);
  }
}

/** Poll the app root until the server responds (fail loudly, never hang silently). */
async function waitForReady(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(BASE_URL, { redirect: "manual" });
      if (response.status < 500) {
        return;
      }
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) {
      console.error(`[journey-webserver] server not ready at ${BASE_URL} within ${timeoutMs}ms — aborting`);
      process.exit(1);
    }
    await new Promise((resolveDelay) => {
      setTimeout(resolveDelay, 250);
    });
  }
}

async function main() {
  ensureWebDist();
  oneShotBuild(SERVER_PACKAGE, "substrate server dist", "JOURNEY_FORCE_SERVER_BUILD", SERVER_ENTRY);

  // THE REAL SUBSTRATE SERVER (the app's production serving shape):
  // static root + SPA fallback + the /ws + /api endpoints the built app
  // requires. env per packages/server/src/entry-http.ts.
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: String(PORT),
      ZCODE_SERVER_HOST: HOST,
      ZCODE_WEB_STATIC_ROOT: WEB_DIST,
    },
  });
  const shutdown = () => {
    child.kill("SIGTERM");
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  child.on("exit", (code, signal) => {
    console.error(`[journey-webserver] substrate server exited (code=${code} signal=${signal})`);
    process.exit(code === null ? 1 : code);
  });
  child.on("error", (error) => {
    console.error("[journey-webserver] failed to spawn the substrate server:", error);
    process.exit(1);
  });

  await waitForReady(120_000);
  console.error(`[journey-webserver] ready at ${BASE_URL} (the real substrate server over the built web dist)`);
}

main().catch((error) => {
  console.error("[journey-webserver] fatal:", error);
  process.exit(1);
});
