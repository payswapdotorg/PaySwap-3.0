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
 *   2. serves the dist with scripts/serve.mjs (static + SPA fallback).
 *
 * The lane battery pre-builds dist once and the webServer REUSES it (the
 * work order's documented flow); CI (journeys.yml) lets this script build
 * when the dist is absent. Set JOURNEY_PORT to override the fixed default
 * 4173.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer } from "./serve.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const WEB_DIST = resolve(HERE, "../../web/dist");
const WEB_PACKAGE = resolve(HERE, "../../web");
const PORT = Number(process.env.JOURNEY_PORT ?? 4173);

async function main() {
  const distPresent = existsSync(resolve(WEB_DIST, "index.html"));
  if (!distPresent || process.env.JOURNEY_FORCE_WEB_BUILD === "1") {
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
          // OOM law (4GB box): cap the node heap so the one-shot build's
          // peak RSS stays inside the box's headroom (station-measured:
          // uncapped builds get SIGKILLed by the OOM killer; a 1600MB
          // heap cap → ~2GB RSS → the build completes).
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
  } else {
    console.error(`[journey-webserver] reusing existing dist at ${WEB_DIST}`);
  }

  await startStaticServer({ root: WEB_DIST, port: PORT });
  console.error(`[journey-webserver] ready at http://127.0.0.1:${PORT}`);
}

main().catch((error) => {
  console.error("[journey-webserver] fatal:", error);
  process.exit(1);
});
