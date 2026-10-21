/**
 * @payswap/journey-verification — acceptance flow 1: FIRST LAUNCH
 * (JOURNEY-MAP.md §3.1).
 *
 * Tier 1 (base-green): the first-launch experience on TODAY's product
 * home at `/payswap` — PaySwap identity, hero, the J1 CTA, the honest
 * gate expectation set BEFORE the click, zero console errors.
 *
 * Tier 2 (@contract — gates at TL integration on the merged tree): the
 * route contract's first launch — `/` IS the PaySwap-branded home with
 * the PaySwap title/favicon/boot mark and the J1 CTA → `/app`
 * (PRODUCT-IDENTITY.md §1/§3; implemented by Lane P9-A).
 */

import { test, expect } from "@playwright/test";
import { BASE_ROUTES, CONTRACT_ROUTES } from "../journeys.manifest.js";
import {
  expectZeroConsoleDefects,
  trackConsole,
  visibleText,
} from "../support/helpers.js";

test("[J1] base first launch: PaySwap identity, hero, J1 CTA and the honest gate note at /payswap", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(BASE_ROUTES.home);

  // The browser document title is PaySwap (PRODUCT-IDENTITY §1).
  await expect.poll(() => page.title()).toBe("PaySwap");

  // The PaySwap wordmark is the site brand, linking home.
  const brand = page.locator("a.ps-site-brand");
  await expect(brand).toHaveText("PaySwap");
  await expect(brand).toHaveAttribute("href", BASE_ROUTES.home);

  // The hero: eyebrow + headline + subheadline.
  await expect(page.locator(".ps-home-eyebrow")).toHaveText("PaySwap");
  await expect(page.locator("#hero-heading")).toContainText(
    "A non-custodial economic operating system",
  );

  // The J1 primary control: "Open the product" → the app entry.
  const cta = page.locator("a.ps-home-cta--primary");
  await expect(cta).toHaveText("Open the product");
  await expect(cta).toHaveAttribute("href", BASE_ROUTES.appEntry);

  // The honest gate expectation is set BEFORE the click (J1 law).
  const text = await visibleText(page);
  expect(text).toContain("requires authentication");
  expect(text).toContain("honest gate");

  await expectZeroConsoleDefects(record);
});

test("[J1] base first launch: zero console errors, zero failed requests, zero uncaught errors", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(BASE_ROUTES.home);
  await expect(page.locator("#hero-heading")).toBeVisible();
  await expectZeroConsoleDefects(record);
});

test("[J1] base first launch: the footer states the non-custody law, not marketing", async ({
  page,
}) => {
  await page.goto(BASE_ROUTES.home);
  const text = await visibleText(page);
  expect(text).toContain("Balances you see are external observations");
  expect(text).toContain("Every consequential financial action carries authorization and evidence");
});

test("[J1][@contract] / is the PaySwap-branded home with the J1 CTA → /app", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.home);

  await expect.poll(() => page.title()).toBe("PaySwap");
  await expect(page.locator(".ps-home-eyebrow, [class*='hero'] h1, h1").first()).toBeVisible();

  const text = await visibleText(page);
  expect(text).toContain("PaySwap");
  // The J1 control on the contract home goes to /app — not /payswap/app.
  const cta = page.locator("a:has-text('Open the product')").first();
  await expect(cta).toHaveAttribute("href", CONTRACT_ROUTES.app);
  await expectZeroConsoleDefects(record);
});

test("[J1][@contract] first-launch boot identity: the document title and favicon carry PaySwap, not ZCode", async ({
  page,
}) => {
  await page.goto(CONTRACT_ROUTES.home);
  await expect.poll(() => page.title()).toBe("PaySwap");
  const favicon = await page.evaluate(() => {
    const icon = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    return icon?.href ?? null;
  });
  // The boot mark is PaySwap's (PRODUCT-IDENTITY §1/§2): present, and never
  // a ZCode-marked asset.
  expect(favicon).not.toBeNull();
  expect(favicon ?? "").not.toMatch(/zcode/i);
});
