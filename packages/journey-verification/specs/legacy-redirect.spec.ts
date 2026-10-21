/**
 * @payswap/journey-verification — acceptance flow 8: LEGACY REDIRECT
 * (JOURNEY-MAP.md §3.8: "/payswap, /payswap/capabilities redirect").
 *
 * ENTIRELY TIER 2 (@contract — gates at TL integration): J15's redirect
 * contract only exists AFTER Lane P9-A implements the new route space.
 * At the P9-C base `/payswap/*` ARE the real product routes (this very
 * suite's tier-1 tests drive them) — no redirect exists to test, and
 * none is faked. These tests are authored against PRODUCT-IDENTITY.md
 * §3: "permanent client-side redirects to the new top-level routes
 * (recorded URLs keep working)".
 */

import { test, expect } from "@playwright/test";
import { CONTRACT_ROUTES } from "../journeys.manifest.js";
import {
  expectZeroConsoleDefects,
  trackConsole,
} from "../support/helpers.js";

test("[J15][@contract] /payswap redirects to the PaySwap home at /", async ({ page }) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.legacyHome);

  // The permanent client-side redirect lands on the new top-level route…
  await expect(page).toHaveURL(/\/$/);
  // …and the TARGET surface renders (not a blank redirect stub).
  await expect(page.locator("h1").first()).toBeVisible();
  const text = await page.locator("body").innerText();
  expect(text).toContain("PaySwap");

  await expectZeroConsoleDefects(record);
});

test("[J15][@contract] recorded public URLs redirect to their new top-level routes", async ({ page }) => {
  const record = trackConsole(page);

  const redirects: ReadonlyArray<{ readonly legacy: string; readonly target: string; readonly heading: RegExp }> = [
    {
      legacy: CONTRACT_ROUTES.legacyCapabilities,
      target: CONTRACT_ROUTES.capabilities,
      heading: /Capabilities & coverage/i,
    },
    {
      legacy: CONTRACT_ROUTES.legacySecurity,
      target: CONTRACT_ROUTES.security,
      heading: /Security & non-custody/i,
    },
    {
      legacy: CONTRACT_ROUTES.legacyDevelopers,
      target: CONTRACT_ROUTES.developers,
      heading: /^Developers$/,
    },
  ];

  for (const { legacy, target, heading } of redirects) {
    await page.goto(legacy);
    await expect(page).toHaveURL(new RegExp(`${target}$`));
    await expect(page.locator("h1").first()).toHaveText(heading);
  }

  await expectZeroConsoleDefects(record);
});

test("[J15][@contract] /payswap/app redirects to /app and the honest gate is visible there", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.legacyApp);

  await expect(page).toHaveURL(new RegExp(`${CONTRACT_ROUTES.app}$`));
  const text = await page.locator("body").innerText();
  expect(text).toContain("Authentication required");

  await expectZeroConsoleDefects(record);
});
