/**
 * @payswap/journey-verification — acceptance flow 4: SETUP-REQUIRED
 * (JOURNEY-MAP.md §3.4: "J3–J6 areas render typed prerequisites; no dead
 * buttons; no fabricated live states").
 *
 * Tier 1: the five outcome actions' typed missing prerequisites render
 * VERBATIM on today's surfaces (the strings are the mirrored surface
 * registry's — pinned data, not UI mood). At the lane base the honest
 * deployment context is: economic intake NOT configured, no capability
 * observations, no merchant plane — so every action is honestly
 * non-dispatchable with its typed reason.
 *
 * Tier 2 (@contract): the same laws on the contract route `/app`.
 */

import { test, expect, type Page } from "@playwright/test";
import { BASE_ROUTES, CONTRACT_ROUTES } from "../journeys.manifest.js";
import {
  expectZeroConsoleDefects,
  trackConsole,
  visibleText,
} from "../support/helpers.js";

/** The typed prerequisites — VERBATIM from the mirrored surface registry
 * (packages/web/src/payswap/lib/outcome-registry.ts; itself a mirror of
 * @payswap/surface). Drift here = a real finding, never a fixture. */
const UNCONFIGURED_INTAKE =
  "The economic intake plane is not configured in this deployment — there is nothing to dispatch against yet. Configure the goal/intent intake (accepted P1-W1 economic contracts) to make this journey live.";
const NO_CAPABILITY_OBSERVATIONS =
  "Quote projection requires fresh capability observations (connected instances and current provider terms). None are configured in this deployment — the honest state is an unavailable preview, never an invented quote.";
const NO_MERCHANT_PLANE =
  "No merchant checkout plane exists in this deployment — the merchant package landed with Work Order P5-W3; wiring its checkout plane into this surface is still pending, and this surface refuses to fabricate a checkout session before it exists.";

const OUTCOME_ACTIONS: ReadonlyArray<{ readonly label: string; readonly prerequisite: string }> = [
  { label: "Pay", prerequisite: UNCONFIGURED_INTAKE },
  { label: "Receive", prerequisite: UNCONFIGURED_INTAKE },
  { label: "Move", prerequisite: UNCONFIGURED_INTAKE },
  { label: "Convert", prerequisite: NO_CAPABILITY_OBSERVATIONS },
  { label: "Checkout", prerequisite: NO_MERCHANT_PLANE },
];

/** The home-page outcome card for one action (exact h3 match — "Pay"
 * must not be confused with "payout"/"payer" substrings on other cards). */
function outcomeCard(page: Page, label: string) {
  return page
    .getByRole("heading", { name: label, exact: true, level: 3 })
    .locator("xpath=ancestor::li[contains(@class,'ps-home-card')][1]");
}

test("[J3][J4][J5] pay/receive/move/convert render their typed prerequisites verbatim — never dead buttons", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(BASE_ROUTES.home);

  // The board leads with the honest nothing-dispatchable fact.
  const text = await visibleText(page);
  expect(text).toContain("No outcome action is dispatchable in this deployment yet");

  for (const action of OUTCOME_ACTIONS) {
    const card = outcomeCard(page, action.label);
    await expect(card).toBeVisible();
    // The honest pill: Not yet dispatchable (action required is the
    // tone's assistive label — the J3 law's exact vocabulary).
    await expect(card.locator(".ps-pill").first()).toContainText(/Not yet dispatchable/i);
    // The typed missing prerequisite renders VERBATIM.
    await expect(card).toContainText(action.prerequisite);
    // No fabricated dispatchability anywhere on the card.
    await expect(card.locator(".ps-pill--ok")).toHaveCount(0);
  }

  await expectZeroConsoleDefects(record);
});

test("[J6] checkout renders the setup-required state — never a demo store", async ({ page }) => {
  await page.goto(BASE_ROUTES.home);

  const checkoutCard = outcomeCard(page, "Checkout");
  await expect(checkoutCard).toBeVisible();
  await expect(checkoutCard.locator(".ps-pill").first()).toContainText(/Not yet dispatchable/i);
  // The typed merchant prerequisite renders verbatim — the surface
  // refuses to fabricate a checkout session (never a demo store).
  await expect(checkoutCard).toContainText(NO_MERCHANT_PLANE);

  // And no fabricated live state exists anywhere on the board.
  const text = await visibleText(page);
  expect(text).not.toMatch(/demo store/i);
});

test("[J2][J3][J4][J5][J6] the app-entry outcome board repeats the honest dispatchability; zero dead controls", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(BASE_ROUTES.appEntry);

  for (const action of OUTCOME_ACTIONS) {
    const row = page.locator(".ps-cap-row").filter({ hasText: action.label }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText(/Not dispatchable in this deployment/i);
    // No fabricated dispatchability (zero ok-tone pills on the board).
    await expect(row.locator(".ps-pill--ok")).toHaveCount(0);
  }
  const text = await visibleText(page);
  expect(text).toContain("No outcome action is dispatchable yet — that is the honest fact");
  expect(text).toContain("Never a dead button, never a fabricated success");

  // Zero dead buttons: every button on the surface is either enabled or
  // carries its typed prerequisite context; every anchor resolves to a
  // real route (no "#" placeholders, no javascript: URLs).
  const controlAudit = await page.evaluate(() => {
    const deadButtons = Array.from(document.querySelectorAll("button")).filter((button) => {
      if (!button.disabled) {
        return false;
      }
      const context = button.closest("section, article, div")?.textContent ?? "";
      return !/not (yet )?(dispatchable|available)|action required|setup|unconfigured|pending/i.test(
        context,
      );
    });
    const deadAnchors = Array.from(document.querySelectorAll("a")).filter((anchor) => {
      const href = anchor.getAttribute("href");
      return href === null || href === "" || href === "#" || href.startsWith("javascript:");
    });
    return { deadButtons: deadButtons.length, deadAnchors: deadAnchors.length };
  });
  expect(controlAudit.deadButtons, "disabled buttons without a typed prerequisite context").toBe(0);
  expect(controlAudit.deadAnchors, "anchors without a real route").toBe(0);

  await expectZeroConsoleDefects(record);
});

test("[J3][J4][J5][J6][@contract] setup-required on the /app areas: typed prerequisites, no fabricated live states", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.app);

  // The law (not the markup): the J3–J6 setup-required vocabulary is
  // present on the contract app surface, and nothing claims live
  // dispatchability without configuration (zero ok-tone status pills).
  const text = await visibleText(page);
  expect(text).toMatch(/not (yet )?dispatchable|action required|setup|required/i);
  await expect(page.locator(".ps-pill--ok, [data-tone='ok']")).toHaveCount(0);

  await expectZeroConsoleDefects(record);
});
