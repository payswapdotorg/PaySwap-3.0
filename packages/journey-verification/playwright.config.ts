/**
 * @payswap/journey-verification — the Playwright configuration.
 *
 * The suite serves a PRODUCTION BUILD of the tested commit (JOURNEY-MAP.md
 * §3: "against a served production build of the tested commit"):
 *
 * - webServer: scripts/webserver.mjs — reuses packages/web/dist when the
 *   lane battery already built it, otherwise runs the ONE-SHOT
 *   `vite build --minify false --sourcemap false` (OOM law: 4GB box,
 *   never dev/watch). Serving = the REAL substrate HTTP server
 *   (packages/server entry-http) over the built dist — ZCODE_WEB_STATIC_ROOT
 *   + SPA fallback + the /ws + /api endpoints the P15-stripped app
 *   REQUIRES to boot (a static-only serve renders the app's own
 *   "Web bootstrap failed" report — no shipped workflow to drive; see
 *   scripts/webserver.mjs for the recorded decision).
 * - projects: desktop 1280×800 (all specs) + mobile 390×844 (the
 *   responsive specs — acceptance flow 9's two core viewports; the third,
 *   1440×900, is driven inside a desktop test via viewport resize. The
 *   mobile project also runs the J24 task-tier journey spec, whose
 *   dedicated responsive law drives the composer controls at 390×844 —
 *   the responsive.spec.ts mechanism, extended).
 * - retries: 0 — journey evidence is deterministic or it is not evidence.
 * - reporters: list (console) + HTML + JSON (the structured receipt the
 *   acceptance record cites).
 * - screenshots on failure only (the receipts run captures its own
 *   explicit evidence screenshots).
 *
 * TIER DISCIPLINE (the work order's sequencing law): at the P9-C base
 * the OLD routes still exist (`/` = ZCode client, `/payswap/*` =
 * product). Tier-1 = `--grep-invert @contract` (green at base, against
 * today's /payswap/* surfaces). Tier-2 = `--grep @contract` (authored
 * against the NEW route contract Lane P9-A implements; gates at TL
 * integration on the merged tree — EXPECTED RED at the base, never
 * faked green).
 */

import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.JOURNEY_PORT ?? 4173);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./specs",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 2,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "test-results/report.json" }],
  ],
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "off",
  },
  projects: [
    {
      name: "desktop",
      use: { viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile",
      testMatch: /responsive\.spec\.ts|agent-task-tier-journey\.spec\.ts/,
      use: { viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: "node scripts/webserver.mjs",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 600_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
