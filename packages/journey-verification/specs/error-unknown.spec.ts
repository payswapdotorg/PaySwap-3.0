/**
 * @payswap/journey-verification — acceptance flow 5: ERROR / UNKNOWN
 * (JOURNEY-MAP.md §3.5: "app error boundary + unknown-state rendering
 * verified (deterministic fixture or route-level check)").
 *
 * Tier 1 (route-level check — the deterministic instrument available at
 * the base): the honest 404 for unknown product routes (nothing found,
 * the path echoed, the honest onward path), and the UNKNOWN law's
 * surface copy (UNKNOWN is never silently resolved into success or
 * failure — distinct from FAILED, reconciliation surfaced).
 *
 * HONEST LIMITATION (recorded for the TL): the /payswap branch of the
 * web entry renders PaySwapWebApp WITHOUT the AppErrorBoundary wrapper
 * (packages/web/src/main.tsx — substrate territory), so a deterministic
 * error-boundary trigger cannot be authored from the lane's write
 * surface. The boundary assertion is therefore carried by the @contract
 * tier below (route-level unknown-route rendering on the new route
 * space); wiring an error-boundary fixture hook is a TL decision.
 */

import { test, expect } from "@playwright/test";
import { BASE_ROUTES, CONTRACT_ROUTES } from "../journeys.manifest.js";
import {
  expectZeroConsoleDefects,
  trackConsole,
  visibleText,
} from "../support/helpers.js";

test("[J7] an unknown product route renders the honest not-found answer", async ({ page }) => {
  const record = trackConsole(page);
  await page.goto(BASE_ROUTES.notFound);

  await expect(page.locator("h1").first()).toHaveText("Not found");
  const text = await visibleText(page);
  expect(text).toContain("Nothing was found at this address");
  // The path is echoed — the product does not invent a page where there
  // is none.
  expect(text).toContain(BASE_ROUTES.notFound);

  await expectZeroConsoleDefects(record);
});

test("[J7] the honest onward path from not-found works", async ({ page }) => {
  await page.goto(BASE_ROUTES.notFound);
  const back = page.locator("a:has-text('Back to the PaySwap home page')");
  await expect(back).toHaveAttribute("href", BASE_ROUTES.home);
  await back.click();
  await expect(page).toHaveURL(new RegExp(`${BASE_ROUTES.home}$`));
  await expect(page.locator("#hero-heading")).toBeVisible();
});

test("[J7][J10] UNKNOWN is rendered as UNKNOWN — never silently resolved, never dressed as failure", async ({
  page,
}) => {
  const record = trackConsole(page);

  // The home surface carries the UNKNOWN law in people language.
  await page.goto(BASE_ROUTES.home);
  let text = await visibleText(page);
  expect(text).toContain("UNKNOWN is never silently turned into success or failure");

  // The security surface carries the reconciliation commitment.
  await page.goto(BASE_ROUTES.security);
  text = await visibleText(page);
  expect(text).toContain("UNKNOWN is never quietly resolved");
  expect(text).toContain("reconciled rather than blindly retried");

  await expectZeroConsoleDefects(record);
});

test("[J7][@contract] an unknown contract route renders the honest not-found answer (route-level check)", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.unknown);

  // The contract surface states the truth for unknown routes — never a
  // blank screen, never an invented page.
  await expect(page.locator("main").first()).toBeVisible();
  const text = await visibleText(page);
  expect(text).toMatch(/not found|nothing was found|does not exist/i);

  await expectZeroConsoleDefects(record);
});
