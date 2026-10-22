/**
 * @payswap/journey-verification — acceptance flow 18: CONSOLE ADVANCED
 * (JOURNEY-MAP.md §3.18; CONSOLE-WORKSPACE.md §1 + §6 settings).
 *
 * `/console/advanced` opens the DEVELOPER WORKSPACE surface — the
 * ZCode-derived substrate client (the Root mount with its services
 * wiring), clearly distinguished from the PaySwap Agent Workspace.
 *
 * HONEST BOUNDARY (recorded, never faked): the developer workspace is
 * a live-backend surface — its bootstrap connects a WebSocket console
 * backend (packages/web/src/main.tsx). The journey environment serves
 * the static production build of the tested commit (scripts/serve.mjs,
 * no backend), so the mount's TRUTHFUL no-backend state renders: the
 * "Web bootstrap failed" report with the failing ws URL and a Retry
 * control, and the browser logs the real WebSocket failure. THAT is
 * the required honest behavior here (JOURNEY-MAP.md preamble: "Where a
 * journey is not executable end-to-end in this configuration, the
 * REQUIRED behavior is the honest unavailable/setup-required state —
 * never a fake success") — so this spec asserts:
 *
 *   1. the surface gate DISTINGUISHES the developer workspace from the
 *      Agent Workspace (/console renders .ps-console-root;
 *      /console/advanced does NOT — it is a separate mount);
 *   2. the honest bootstrap-failure state renders (the failure report
 *      + Retry, never a fabricated workspace);
 *   3. the zero-console-error law is scoped to the WORKSPACE surfaces —
 *      the WebSocket failure on /console/advanced is the truthful
 *      no-backend report, not a defect (the same scoping
 *      navigation.spec.ts applies);
 *   4. the settings section carries PaySwap identity, the upstream
 *      attribution (ZCode as ATTRIBUTION only — PRODUCT-IDENTITY §4),
 *      the BROWSER_PROFILE store durability fact, and the advanced
 *      entry that hands over to the developer workspace.
 *
 * All of flow 18 is J14.
 */

import { test, expect } from "@playwright/test";
import { CONTRACT_ROUTES } from "../journeys.manifest.js";
import {
  expectZeroConsoleDefects,
  trackConsole,
  visibleText,
} from "../support/helpers.js";
import { evidenceShot } from "../support/evidence.js";

test("[J14] /console/advanced is the developer-workspace mount, distinct from the Agent Workspace: its honest no-backend state renders", async ({
  page,
}) => {
  const record = trackConsole(page);

  // The workspace surface for contrast: /console IS the Agent Workspace.
  await page.goto(CONTRACT_ROUTES.console);
  await expect(page.locator(".ps-console-root")).toBeVisible();
  // The workspace surfaces carry the zero-console-error law.
  await expectZeroConsoleDefects(record);

  // The developer workspace is a SEPARATE mount: /console/advanced does
  // not render the workspace chrome (the gate split, CONSOLE-WORKSPACE
  // §2) — it boots the substrate client, whose honest no-backend state
  // is the bootstrap-failure report.
  await page.goto(CONTRACT_ROUTES.consoleAdvanced);
  await expect
    .poll(async () => /Web bootstrap failed/.test(await visibleText(page)), {
      timeout: 15_000,
    })
    .toBe(true);
  await expect(page.locator(".ps-console-root")).toHaveCount(0);

  // The honest failure report: the failure + the failing endpoint + a
  // working retry control — never a fabricated workspace, never a blank
  // screen. (The document title in the failure path is the honest
  // generic "PaySwap" — the developer-workspace title applies only
  // after a successful bootstrap.)
  const text = await visibleText(page);
  expect(text).toContain("Web bootstrap failed");
  expect(text).toMatch(/WebSocket connection failed: ws:\/\//);
  await expect(page.locator("button", { hasText: "Retry" })).toBeVisible();

  // HONEST BOUNDARY (documented above): the WebSocket console error is
  // the truthful no-backend report — the zero-console-error law is NOT
  // applied to this surface. Nothing else may be wrong with it.
  const nonBootstrapErrors = record.consoleErrors.filter(
    (message) => !message.includes("WebSocket connection"),
  );
  expect(
    nonBootstrapErrors,
    "no console errors on the developer-workspace surface beyond the truthful no-backend WebSocket report",
  ).toEqual([]);
  expect(record.pageErrors).toEqual([]);

  await evidenceShot(page, "10-advanced-no-backend-honest-state.png");
});

test("[J14] the settings section: PaySwap identity, upstream attribution (ZCode as attribution only), the browser-profile store fact, the advanced entry", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.consoleSettings);
  await expect(page.locator("main#ps-console-main h1").first()).toHaveText("Settings");

  // PaySwap identity (§6 settings).
  await expect(page.locator(".ps-console-identity-name")).toHaveText("PaySwap");
  const text = await visibleText(page);
  expect(text).toContain("A non-custodial economic operating system.");

  // The upstream attribution — the legal line (PRODUCT-IDENTITY §4).
  expect(text).toContain(
    "PaySwap is built on the ZCode open-source platform (zai-org/ZCode, Apache-2.0).",
  );

  // "ZCode" appears ONLY as attribution: every visible occurrence lives
  // inside the Upstream platform block or the Advanced developer entry
  // (the two attribution-bearing blocks) — the structural exemption.
  const zcodeOutsideAttribution = await page.evaluate(() => {
    const attributed = Array.from(
      document.querySelectorAll(
        "section[aria-labelledby='ps-console-settings-attribution'], section[aria-labelledby='ps-console-settings-advanced']",
      ),
    );
    const offenders: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const content = node.textContent ?? "";
      if (/zcode/i.test(content)) {
        const inside = attributed.some((scope) => scope.contains(node));
        if (!inside) {
          offenders.push(content.trim().slice(0, 120));
        }
      }
    }
    return offenders;
  });
  expect(
    zcodeOutsideAttribution,
    "ZCode appears only as attribution (the upstream-platform and advanced-entry blocks)",
  ).toEqual([]);

  // The store durability fact for THIS mount — the BROWSER_PROFILE law
  // (§5: honest labeling, "stored in this browser profile only").
  expect(text).toContain("Browser profile store");
  expect(text).toContain(
    "Missions are stored in this browser profile only — clearing site data removes them, and they do not follow you to other devices.",
  );

  // The advanced developer-workspace entry: clearly labeled, secondary,
  // carrying the honest description of what it opens.
  const advancedEntry = page.locator("a[href='/console/advanced']");
  await expect(advancedEntry).toHaveText("Advanced developer workspace");
  // P12 Lane C reconciliation: the advanced entry copy moved into the
  // shared ADVANCED_DEVELOPER_ENTRY vocabulary (section-vocabulary.ts) —
  // the honest C5 labeling (the advanced developer workspace OF the
  // PaySwap Agent Console, built on the upstream ZCode platform; the
  // Agent Workspace stays primary).
  expect(text).toContain(
    "The advanced developer workspace of the PaySwap Agent Console — built on the upstream ZCode platform. An advanced technical interface for development work (model/provider selection, projects, sessions, terminal, artifacts, tools/MCP, extensions): distinct from the Agent Workspace, which stays the primary PaySwap work surface.",
  );

  await evidenceShot(page, "11-settings-identity-attribution.png");
  await expectZeroConsoleDefects(record);
});

test("[J14] the settings advanced entry hands over to the developer workspace (a real navigation to the separate mount)", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.consoleSettings);
  await expect(page.locator("main#ps-console-main h1").first()).toHaveText("Settings");

  await page.evaluate(() => {
    (window as { __p10dNoReloadMarker?: boolean }).__p10dNoReloadMarker = true;
  });

  // The handover: the entry routes to /console/advanced, which the
  // bootstrap owns — a REAL navigation (a separate mount; the §2
  // no-reload law covers product ↔ workspace sections only, documented
  // in packages/web/src/payswap/webSurfaces.tsx). The honest marker
  // assertion is therefore the NEGATIVE one: the marker does NOT
  // survive (by design, unlike the product/workspace transitions).
  await page.locator("a[href='/console/advanced']").click();
  await expect
    .poll(async () => /Web bootstrap failed/.test(await visibleText(page)), {
      timeout: 15_000,
    })
    .toBe(true);
  expect(page.url()).toMatch(/\/console\/advanced$/);
  const marker = await page.evaluate(
    () => (window as { __p10dNoReloadMarker?: boolean }).__p10dNoReloadMarker === true,
  );
  expect(
    marker,
    "the advanced handover is a real navigation to the separate developer-workspace mount (documented design)",
  ).toBe(false);

  // The handover itself logged only the truthful no-backend report.
  const nonBootstrapErrors = record.consoleErrors.filter(
    (message) => !message.includes("WebSocket connection"),
  );
  expect(nonBootstrapErrors).toEqual([]);
  expect(record.pageErrors).toEqual([]);
});
