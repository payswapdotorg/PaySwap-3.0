/**
 * @payswap/journey-verification — acceptance flow 3: JOURNEY ENTRY
 * (JOURNEY-MAP.md §3.3: "J1 CTA → /app honest gate visible when
 * unauthenticated; gate copy truthful").
 *
 * Tier 1: entry through today's CTA to `/payswap/app` — the honest
 * authenticated entry boundary (the P7-W1 surface): the gate states
 * exactly what is unavailable and why, zero credential capture, zero
 * fabricated data, the eleven-area map and the five outcome actions
 * render behind it with their honest empty-state contracts.
 *
 * Tier 2 (@contract): the same laws on the contract route `/app`.
 */

import { test, expect } from "@playwright/test";
import { BASE_ROUTES, CONTRACT_ROUTES } from "../journeys.manifest.js";
import {
  expectZeroConsoleDefects,
  trackConsole,
  visibleText,
} from "../support/helpers.js";

const ELEVEN_AREA_LABELS = [
  "Overview",
  "Payments",
  "Accounts",
  "Activity",
  "Opportunities",
  "Connections",
  "Capabilities",
  "Security",
  "Reports",
  "Developers",
  "Settings",
] as const;

test("[J2] journey entry from the base CTA lands on the honest authenticated gate", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(BASE_ROUTES.home);

  await page.locator("a.ps-home-cta--primary").click();
  await expect(page).toHaveURL(new RegExp(`${BASE_ROUTES.appEntry}$`));

  // The honest gate: Authentication required — truthfully stated.
  await expect(page.locator("h1").first()).toHaveText("The PaySwap product");
  const text = await visibleText(page);
  expect(text).toContain("Authentication required — honestly gated");
  // The gate copy is truthful: no demo mode, no pretend login, no
  // fabricated session (the pinned copy).
  expect(text).toContain("no demo mode with fake balances");
  expect(text).toContain("no pretend login");
  expect(text).toContain("nothing is simulated");

  await expectZeroConsoleDefects(record);
});

test("[J2] the eleven-area map renders behind the gate with designed-empty states and reasons", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(BASE_ROUTES.appEntry);

  const areaCards = page.locator(".ps-area-card");
  await expect(areaCards).toHaveCount(ELEVEN_AREA_LABELS.length);

  for (const label of ELEVEN_AREA_LABELS) {
    const card = areaCards.filter({ has: page.locator(`h3:has-text('${label}')`) });
    await expect(card.first()).toBeVisible();
    // Every area renders its designed empty state — with the reason.
    await expect(card.first().locator(".ps-pill").first()).toContainText(
      /empty by design/i,
    );
  }

  // The honest reasons render verbatim for representative areas (J7/J9/
  // J11/J13 journeys assert their own; here the MAP itself is the law).
  const text = await visibleText(page);
  expect(text).toContain("the eleven operational areas of the PaySwap product");

  await expectZeroConsoleDefects(record);
});

test("[J7][J9][J11] the activity, opportunities and reports areas render their designed-empty reasons", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(BASE_ROUTES.appEntry);

  // The designed-empty contracts render VERBATIM (the mirrored
  // eleven-area IA — packages/web/src/payswap/lib/areas.ts).
  const text = await visibleText(page);
  expect(text).toContain(
    "No recorded activity yet — activity rows come from authoritative records, never from the UI.",
  );
  expect(text).toContain(
    "No opportunity observations yet — discovery runs on real capability observations only.",
  );
  expect(text).toContain(
    "No reportable records yet — reports generate from the same evidence the activity ledger records.",
  );

  await expectZeroConsoleDefects(record);
});

test("[J2] the five outcome actions render their honest dispatchability behind the gate", async ({
  page,
}) => {
  await page.goto(BASE_ROUTES.appEntry);

  for (const label of ["Pay", "Receive", "Move", "Convert", "Checkout"]) {
    const row = page.locator(".ps-cap-row").filter({ hasText: label }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText(/Not dispatchable in this deployment/i);
  }

  const text = await visibleText(page);
  expect(text).toContain("No outcome action is dispatchable yet — that is the honest fact");
});

test("[J1][J2][@contract] the J1 CTA on / navigates to /app and the honest gate is visible", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.home);

  await page.locator("a:has-text('Open the product')").first().click();
  await expect(page).toHaveURL(new RegExp(`${CONTRACT_ROUTES.app}$`));

  const text = await visibleText(page);
  expect(text).toContain("Authentication required — honestly gated");
  await expectZeroConsoleDefects(record);
});

test("[J2][@contract] the eleven-area map renders on /app with designed-empty states", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.app);

  const text = await visibleText(page);
  // The eleven-area IA is discoverable from the /app shell (IA law,
  // JOURNEY-MAP §2) — at minimum the map is present with its honest
  // empty-state vocabulary.
  expect(text).toContain("Overview");
  expect(text).toContain("Payments");
  expect(text).toContain("Settings");
  expect(text).toMatch(/empty|nothing here|not yet/i);

  await expectZeroConsoleDefects(record);
});
