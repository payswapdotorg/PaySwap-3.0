/**
 * @payswap/journey-verification — acceptance flow 7: NO-ZCODE-BRANDING
 * (JOURNEY-MAP.md §3.7: "normal user surfaces (J1–J13) contain no 'ZCode'
 * product branding (attribution in legal/about exempt)").
 *
 * Tier 1: today's /payswap/* product surfaces are PaySwap-branded with
 * zero ZCode product branding in title/visible text/alt/aria-labels —
 * AND the connected-provider lists are EMPTY-TRUTHFUL at providerCount 0
 * (the truth assertion the work order demands: no fabricated connected
 * providers).
 *
 * Tier 2 (@contract): the same law across the contract routes
 * (implemented by Lane P9-A).
 */

import { test, expect } from "@playwright/test";
import { BASE_ROUTES, CONTRACT_ROUTES } from "../journeys.manifest.js";
import {
  expectNoZCodeBranding,
  expectPaySwapIdentityPresent,
  expectZeroConsoleDefects,
  trackConsole,
  visibleText,
} from "../support/helpers.js";

const BASE_SURFACES: readonly string[] = [
  BASE_ROUTES.home,
  BASE_ROUTES.capabilities,
  BASE_ROUTES.security,
  BASE_ROUTES.developers,
  BASE_ROUTES.appEntry,
];

test("[J1][J2][J8][J13] every base product surface presents PaySwap identity and zero ZCode branding", async ({
  page,
}) => {
  const record = trackConsole(page);

  for (const route of BASE_SURFACES) {
    await page.goto(route);
    await expectPaySwapIdentityPresent(page, { viaTitle: true });
    // Normal user surfaces carry no ZCode product branding. (The
    // data-zcode-* bootstrap attributes and the zcode-theme storage key
    // are substrate internals — never visible text; the scan reads only
    // title + innerText + alt/aria-label.)
    await expectNoZCodeBranding(page, { includeTitle: true });
  }

  await expectZeroConsoleDefects(record);
});

test("[J8] provider lists are empty-truthful at providerCount 0 — nothing is listed as connected", async ({
  page,
}) => {
  const record = trackConsole(page);

  // The home coverage summary: the honest no-evidence state renders as
  // itself (never a marketing list, never upgraded statuses).
  await page.goto(BASE_ROUTES.home);
  let text = await visibleText(page);
  expect(text).toContain("No provider evidence is recorded in this deployment");
  expect(text).toContain("Providers appear here only from recorded probe evidence");
  // No connected-provider stat is fabricated (the stats block renders
  // only when evidence exists).
  await expect(page.locator(".ps-home-stat")).toHaveCount(0);

  // The capabilities explorer: same honest empty, no provider rows.
  await page.goto(BASE_ROUTES.capabilities);
  text = await visibleText(page);
  expect(text).toContain("No provider evidence is recorded in this deployment");
  await expect(page.locator(".ps-cap-row")).toHaveCount(0);
  await expect(page.locator("h2:has-text('Verified connections')")).toHaveCount(0);
  await expect(page.locator("h2:has-text('Blocked at the provider gate')")).toHaveCount(0);

  // The explorer's own honesty rules are visible (the laws this
  // explorer follows).
  expect(text).toContain("The honesty rules this explorer follows");
  expect(text).toContain("never listed as connected");

  await expectZeroConsoleDefects(record);
});

test("[J1][J2][J8][J13][@contract] no ZCode branding across the normal contract surfaces (J1–J13)", async ({
  page,
}) => {
  const record = trackConsole(page);

  // The normal user surfaces of the contract route space. The legal/about
  // surface is EXEMPT and asserted separately in settings-about.spec.ts.
  for (const route of [
    CONTRACT_ROUTES.home,
    CONTRACT_ROUTES.app,
    CONTRACT_ROUTES.capabilities,
    CONTRACT_ROUTES.security,
    CONTRACT_ROUTES.developers,
  ]) {
    await page.goto(route);
    await expectPaySwapIdentityPresent(page, { viaTitle: true });
    await expectNoZCodeBranding(page, { includeTitle: true });
  }

  await expectZeroConsoleDefects(record);
});
