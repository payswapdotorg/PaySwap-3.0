/**
 * @payswap/journey-verification — P12 journey J16: PRIMARY PAYMENT
 * DISCOVERY (JOURNEY-MAP.md §1, P12 Lane C).
 *
 * The payments area landing is the typed ACTION SET: Pay, Receive, Move
 * and Checkout (the actions anchored on payments by the pinned alias
 * table), each stating its honest dispatchability with the typed
 * prerequisite VERBATIM plus the two real routes forward (configure the
 * missing piece in Connections, learn the contract on the developers
 * surface). The payments-adjacent surfaces (recipients, approvals,
 * activity/receipts/reconciliation, the Convert cross-anchor) are each
 * either real-and-linked or honestly UNAVAILABLE with a typed reason.
 *
 * ENTIRELY TIER 2 (@contract — gates at TL integration): the typed
 * payments landing (PaymentsAreaSurface) is Lane P12-C work; at the
 * P12 lane base (181d670) the payments area rendered the generic
 * designed-empty area surface, not the action set.
 */

import { test, expect } from "@playwright/test";
import { CONTRACT_ROUTES } from "../journeys.manifest.js";
import {
  expectZeroConsoleDefects,
  trackConsole,
  visibleText,
} from "../support/helpers.js";
import { evidenceShot } from "../support/evidence.js";

/** The typed prerequisites — VERBATIM from the mirrored surface registry
 * (the same pinned strings setup-required.spec.ts asserts on the home
 * board; drift here = a real finding, never a fixture). */
const UNCONFIGURED_INTAKE =
  "The economic intake plane is not configured in this deployment — there is nothing to dispatch against yet. Configure the goal/intent intake (accepted P1-W1 economic contracts) to make this journey live.";
const NO_MERCHANT_PLANE =
  "No merchant checkout plane exists in this deployment — the merchant package landed with Work Order P5-W3; wiring its checkout plane into this surface is still pending, and this surface refuses to fabricate a checkout session before it exists.";

const ANCHORED_ACTIONS: ReadonlyArray<{ readonly label: string; readonly prerequisite: string }> = [
  { label: "Pay", prerequisite: UNCONFIGURED_INTAKE },
  { label: "Receive", prerequisite: UNCONFIGURED_INTAKE },
  { label: "Move", prerequisite: UNCONFIGURED_INTAKE },
  { label: "Checkout", prerequisite: NO_MERCHANT_PLANE },
];

test("[J16][@contract] the payments area renders the typed action set — every action with its verbatim prerequisite and the two real routes forward", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(`${CONTRACT_ROUTES.app}/payments`);
  await expect(page.getByRole("heading", { name: "The payments action set", level: 2 })).toBeVisible();

  for (const action of ANCHORED_ACTIONS) {
    const card = page
      .getByRole("heading", { name: action.label, exact: true, level: 3 })
      .locator("xpath=ancestor::li[contains(@class,'ps-page-grid-item')][1]");
    await expect(card).toBeVisible();
    // The honest dispatchability pill — never a fabricated success.
    await expect(card.getByText("Not yet dispatchable — action required")).toBeVisible();
    // The typed prerequisite, VERBATIM.
    await expect(card.getByText(action.prerequisite)).toBeVisible();
    // The two real routes forward: configure + learn.
    const configure = card.getByRole("link", { name: "Configure connections" });
    await expect(configure).toHaveAttribute("href", CONTRACT_ROUTES.appConnections);
    const learn = card.getByRole("link", { name: "Learn the contract" });
    await expect(learn).toHaveAttribute("href", CONTRACT_ROUTES.developers);
  }

  await expectZeroConsoleDefects(record);
  await evidenceShot(page, "p12-j16-payments-action-set.png");
});

test("[J16][@contract] the payments-adjacent surfaces are real-and-linked or honestly unavailable — no dead rows, no invented lists", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(`${CONTRACT_ROUTES.app}/payments`);
  await expect(page.getByRole("heading", { name: "The payments surfaces around the actions", level: 2 })).toBeVisible();

  const text = await visibleText(page);

  // Recipients: UNAVAILABLE with a typed reason — never an invented list.
  expect(text).toContain("Recipients");
  expect(text).toContain("No recipients surface exists in this deployment");

  // Approvals: the honest pointer into the Agent Workspace section.
  const approvals = page.getByRole("link", { name: "Open the Approvals section" });
  await expect(approvals).toHaveAttribute("href", CONTRACT_ROUTES.consoleApprovals);

  // Activity/receipts/reconciliation: the ledger with its UNKNOWN ≠ FAILED law.
  const ledger = page.getByRole("link", { name: "Open the Activity ledger" });
  await expect(ledger).toHaveAttribute("href", CONTRACT_ROUTES.appActivity);
  expect(text).toContain("UNKNOWN is never FAILED");

  // Convert: the cross-anchor to Accounts (its real home by the alias table).
  const accounts = page.getByRole("link", { name: "Open the Accounts area" });
  await expect(accounts).toHaveAttribute("href", CONTRACT_ROUTES.appAccounts);

  await expectZeroConsoleDefects(record);
});
