/**
 * @payswap/journey-verification — acceptance flow 6: SETTINGS / ABOUT
 * (JOURNEY-MAP.md §3.6: "J13 shows PaySwap identity + upstream
 * attribution").
 *
 * Tier 1: the settings AREA's honest empty state on today's app-entry
 * map (nothing is configurable without a session's own authority — the
 * P7-W1 pinned empty-state contract).
 *
 * Tier 2 (@contract): the full settings + about surface on the contract
 * routes — PaySwap identity everywhere, upstream attribution preserved
 * AS ATTRIBUTION in the legal/about surface (PRODUCT-IDENTITY.md §4:
 * attribution is legally preserved, never the product brand).
 */

import { test, expect } from "@playwright/test";
import { BASE_ROUTES, CONTRACT_ROUTES } from "../journeys.manifest.js";
import {
  expectZeroConsoleDefects,
  expectPaySwapIdentityPresent,
  trackConsole,
  visibleText,
} from "../support/helpers.js";

test("[J13] the settings area renders its honest empty state at base", async ({ page }) => {
  const record = trackConsole(page);
  await page.goto(BASE_ROUTES.appEntry);

  const settingsCard = page.locator(".ps-area-card").filter({ hasText: "Settings" }).first();
  await expect(settingsCard).toBeVisible();
  await expect(settingsCard).toContainText(
    "Settings render from the session's own authority — nothing is configurable without one.",
  );
  // The designed-empty state is labeled as such (never an error).
  await expect(settingsCard.locator(".ps-pill").first()).toContainText(/empty by design/i);

  await expectZeroConsoleDefects(record);
});

test("[J13][@contract] settings + about on the contract routes show PaySwap identity with upstream attribution", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.app);

  // J13's identity law: the product surface is PaySwap-branded.
  await expectPaySwapIdentityPresent(page, { viaTitle: true });

  // Reach the settings/about affordance from the /app shell (the IA law:
  // every navigation item works). If the shell links a dedicated about
  // surface, drive it; the attribution assertions then run THERE (the
  // legal/about exemption is exactly that surface — PRODUCT-IDENTITY §4).
  const aboutLink = page
    .locator("a[href*='about' i], a[href*='settings' i], a:has-text('About'), a:has-text('Settings')")
    .first();
  if (await aboutLink.isVisible()) {
    await aboutLink.click();
    await expect(page.locator("main").first()).toBeVisible();
  }

  // The about surface preserves upstream lineage AS ATTRIBUTION — never
  // as the product brand (the brand assertions live in branding.spec.ts
  // and scan only the NORMAL surfaces; this test scans the exempt one).
  const text = await visibleText(page);
  expect(text).toMatch(/ZCode|zai-org|upstream|lineage/i);

  await expectZeroConsoleDefects(record);
});
