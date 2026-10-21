/**
 * @payswap/journey-verification — acceptance flow 9: RESPONSIVE
 * (JOURNEY-MAP.md §3.9: "core flows at 1280×800, 1440×900, 390×844 — no
 * clipped essential content, no broken nav").
 *
 * Runs in BOTH projects: the desktop project (1280×800, plus the
 * 1440×900 check via viewport resize) and the mobile project (390×844,
 * testMatch-scoped in playwright.config.ts). All tiers are tier 1: the
 * responsive law is about TODAY's product surfaces.
 */

import { test, expect } from "@playwright/test";
import { BASE_ROUTES } from "../journeys.manifest.js";
import {
  expectNoHorizontalOverflow,
  expectZeroConsoleDefects,
  trackConsole,
} from "../support/helpers.js";

test("[J1] core home flow: hero, CTA and nav visible, no clipped essential content", async ({
  page,
}) => {
  const record = trackConsole(page);
  const { width } = page.viewportSize() ?? { width: 0 };

  await page.goto(BASE_ROUTES.home);

  // Essential content is visible (not clipped off-viewport).
  await expect(page.locator("#hero-heading")).toBeVisible();
  await expect(page.locator("a.ps-home-cta--primary")).toBeVisible();
  const nav = page.locator("nav[aria-label='Site']");
  await expect(nav).toBeVisible();

  // Every nav link is reachable in the layout (no broken nav at this
  // viewport — links may wrap, never disappear).
  const navLinks = nav.locator("a");
  const count = await navLinks.count();
  expect(count).toBeGreaterThanOrEqual(4);
  for (let index = 0; index < count; index += 1) {
    await expect(navLinks.nth(index)).toBeVisible();
  }

  // No horizontal document overflow (the clipped-content instrument).
  await expectNoHorizontalOverflow(page);

  await expectZeroConsoleDefects(record);
  test.info().annotations.push({ type: "viewport", description: `${width}px wide` });
});

test("[J2] app-entry flow: honest gate + area map readable, no overflow", async ({ page }) => {
  const record = trackConsole(page);
  await page.goto(BASE_ROUTES.appEntry);

  await expect(page.locator("h1").first()).toHaveText("The PaySwap product");
  await expect(page.locator(".ps-area-card").first()).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await expectZeroConsoleDefects(record);
});

test("[J8] capabilities flow renders readably with no overflow", async ({ page }) => {
  const record = trackConsole(page);
  await page.goto(BASE_ROUTES.capabilities);

  await expect(page.locator("h1").first()).toHaveText("Capabilities & coverage");
  await expectNoHorizontalOverflow(page);

  await expectZeroConsoleDefects(record);
});

// The 1440×900 checkpoint (desktop project only — the resize happens
// inside the test; the mobile project run keeps its 390×844 context).
test("[J1] large desktop 1440×900: the home flow stays intact", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "1440×900 is driven from the desktop project");
  const record = trackConsole(page);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE_ROUTES.home);

  await expect(page.locator("#hero-heading")).toBeVisible();
  await expect(page.locator("a.ps-home-cta--primary")).toBeVisible();
  await expect(page.locator("nav[aria-label='Site']")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await expectZeroConsoleDefects(record);
});
