/**
 * @payswap/journey-verification — P12 journey J19: ADVANCED DEVELOPER
 * WORKSPACE ACCESS (JOURNEY-MAP.md §1, P12 Lane C).
 *
 * The ZCode-derived developer workspace (#/console/advanced, the
 * substrate client with ALL its services wired) is integrated into the
 * PaySwap IA — not a competing shell: the developers surface carries
 * the advanced entry, honestly labeled as the advanced developer
 * workspace of the PaySwap Agent Console, and the Agent Workspace
 * stays primary (/console keeps the PaySwap Agent Workspace chrome).
 *
 * The SPA law: the entry routes through the product navigation adapter
 * (no renderer reload, no durable-state loss) — verified behaviorally
 * by planting a window marker, clicking, and asserting the marker
 * survives the navigation.
 *
 * ENTIRELY TIER 2 (@contract — gates at TL integration): the in-IA
 * advanced entry (DevelopersPage + section-vocabulary) is Lane P12-C
 * work.
 */

import { test, expect } from "@playwright/test";
import { CONTRACT_ROUTES } from "../journeys.manifest.js";
import {
  expectZeroConsoleDefects,
  trackConsole,
  visibleText,
} from "../support/helpers.js";
import { evidenceShot } from "../support/evidence.js";

test("[J19][@contract] the developers surface carries the advanced entry, honestly labeled as the PaySwap Agent Console's developer workspace", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.developers);

  const advanced = page.getByRole("link", { name: "Advanced developer workspace" });
  await expect(advanced).toBeVisible();
  await expect(advanced).toHaveAttribute("href", CONTRACT_ROUTES.consoleAdvanced);

  // The honest labeling: the advanced surface is presented as the
  // developer workspace OF the PaySwap Agent Console — ZCode as the
  // substrate it is built on, never a competing brand.
  const text = await visibleText(page);
  expect(text).toContain("advanced developer workspace");

  await expectZeroConsoleDefects(record);
  await evidenceShot(page, "p12-j19-advanced-entry");
});

test("[J19][@contract] the advanced entry routes through the SPA adapter — no renderer reload, no durable-state loss", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.developers);

  // Plant the durable-state marker: a renderer reload drops window
  // properties; an SPA navigation preserves them.
  await page.evaluate(() => {
    (window as unknown as { __p12SpaMarker: boolean }).__p12SpaMarker = true;
  });

  await page.getByRole("link", { name: "Advanced developer workspace" }).click();

  // The URL moves to the advanced mount (hash-routed inside the
  // console mount) and the marker SURVIVES — SPA routing, no reload.
  await expect
    .poll(() => page.url(), { timeout: 15_000 })
    .toContain(CONTRACT_ROUTES.consoleAdvanced);
  const marker = await page.evaluate(
    () => (window as unknown as { __p12SpaMarker?: boolean }).__p12SpaMarker ?? false,
  );
  expect(marker).toBe(true);

  await expectZeroConsoleDefects(record);
});

test("[J19][@contract] the Agent Workspace stays primary — /console keeps the PaySwap workspace chrome, the advanced mount does not take it over", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.console);
  await expect(page.locator(".ps-console-root")).toBeVisible();

  // The workspace surfaces carry the zero-console-error law.
  await expectZeroConsoleDefects(record);

  // The advanced mount is a SEPARATE surface (the gate split already
  // pinned by console-advanced.spec.ts for J14) — here the P12 concern
  // is only that the WORKSPACE remains the primary console surface:
  // its honest no-approval/mission state renders, and the workspace
  // root is what /console shows.
  const text = await visibleText(page);
  expect(text).toContain("PaySwap");
});
