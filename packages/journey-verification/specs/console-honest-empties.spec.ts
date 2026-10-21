/**
 * @payswap/journey-verification — acceptance flow 17: CONSOLE HONEST
 * EMPTIES (JOURNEY-MAP.md §3.17; CONSOLE-WORKSPACE.md §6 + §5 honesty
 * laws).
 *
 * The agents/approvals/activity/lab sections render designed-empty
 * states with their typed reasons; NO fabricated agents, approvals,
 * activity or experiments exist in the DOM (structural absence
 * assertions, not just copy checks); the connections section shows the
 * honest no-provider state (zero connected capabilities — the recorded
 * NO_EVIDENCE_COVERAGE truth) with the real next action routed to the
 * product; and every vocabulary/reference block is clearly labeled as
 * REFERENCE — never live data.
 *
 * All of flow 17 is J14.
 */

import { test, expect } from "@playwright/test";
import { CONTRACT_ROUTES } from "../journeys.manifest.js";
import {
  expectZeroConsoleDefects,
  trackConsole,
  visibleText,
} from "../support/helpers.js";
import { evidenceShot } from "../support/evidence.js";

/** One honest-empty section probe: typed reason + structural absence. */
async function assertHonestEmpty(
  page: import("@playwright/test").Page,
  route: string,
  heading: string,
  reason: string,
): Promise<void> {
  await page.goto(route);
  await expect(page.locator("main#ps-console-main h1").first()).toHaveText(heading);

  // The typed reason renders VERBATIM (the honest state IS the content).
  const text = await visibleText(page);
  expect(text, `${heading}: the typed empty-state reason renders verbatim`).toContain(reason);

  // STRUCTURAL no-fabrication: no record rows, no live-data tables, no
  // invented model-provider rows anywhere in the section.
  await expect(page.locator(".ps-table tbody tr")).toHaveCount(0);
  await expect(page.locator(".ps-console-provider-row")).toHaveCount(0);

  // §6: the reference block is clearly labeled as REFERENCE.
  const reference = page.locator(".ps-console-reference");
  await expect(reference).toHaveCount(1);
  await expect(reference.locator(".ps-console-reference-title")).toBeVisible();
  expect(text).toContain("Reference");
  expect(text).toContain("Reference only");
}

test("[J14] agents/approvals/activity/lab render designed-empty states with typed reasons and no fabricated records", async ({
  page,
}) => {
  const record = trackConsole(page);

  // agents — no agent registry exists (§6).
  await assertHonestEmpty(
    page,
    CONTRACT_ROUTES.consoleAgents,
    "Agents",
    "No agent registry exists in this deployment — no agent identities, runtime statuses or assignments are recorded, and none are invented here.",
  );
  // The model-binding row is the honest none (never invented connected).
  const agentsText = await visibleText(page);
  expect(agentsText).toContain(
    "No model provider is configured — honestly reported as none, never invented as connected.",
  );

  // approvals — nothing to approve, nothing approved (§6).
  await assertHonestEmpty(
    page,
    CONTRACT_ROUTES.consoleApprovals,
    "Approvals",
    "No approval plane is configured — there is nothing to approve and nothing approved. No approval can be minted from this workspace.",
  );
  // No approval-minting control exists (a structural absence).
  const approvalsButtons = await page
    .locator("main#ps-console-main button")
    .allInnerTexts();
  expect(
    approvalsButtons.filter((label) => /approve/i.test(label)),
    "no approval-minting control exists in the workspace",
  ).toEqual([]);

  // activity — the real mission record is empty, never fabricated (§6).
  await assertHonestEmpty(
    page,
    CONTRACT_ROUTES.consoleActivity,
    "Activity & receipts",
    "No mission events are recorded yet — activity here is the real mission record, never fabricated history.",
  );

  // lab — no experiments, none simulated (§6) + the Lab law verbatim.
  await assertHonestEmpty(
    page,
    CONTRACT_ROUTES.consoleLab,
    "Lab",
    "No experiments exist — the Lab holds no experiment records in this deployment, and none are simulated here.",
  );
  const labText = await visibleText(page);
  expect(labText).toContain(
    "Simulated routes/events are advisory/test evidence only; no production financial authority.",
  );

  await expectZeroConsoleDefects(record);
});

test("[J14] connections shows the honest no-provider state (zero connected) with the product next action", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.consoleConnections);
  await expect(page.locator("main#ps-console-main h1").first()).toHaveText("Connections");

  // The honest no-provider truth, counted in the open (§6: zero
  // connected — the recorded coverage fact, never a live probe).
  await expect(
    page.locator(".ps-console-empty", { hasText: "Zero connected capabilities" }),
  ).toContainText("Zero connected capabilities — the honest state (0 connected)");
  const text = await visibleText(page);
  expect(text).toContain(
    "No capability is connected in this deployment — zero connected instances. A catalogue capability is never a connection; execution is scoped to actual account authorization.",
  );
  expect(text).toContain(
    "No model provider is configured — honestly reported as none, never invented as connected.",
  );
  // Structural: no fabricated connected-provider rows.
  await expect(page.locator(".ps-console-provider-row")).toHaveCount(0);

  // The real next action routes to the PRODUCT surface (capability
  // connection happens there) via the mount's back affordance.
  const nextAction = page.locator("button", { hasText: "Connect capabilities in the PaySwap product" });
  await expect(nextAction).toBeVisible();

  await evidenceShot(page, "08-connections-no-provider.png");

  await nextAction.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("#hero-heading")).toBeVisible();

  await expectZeroConsoleDefects(record);
});

test("[J14] the activity section renders the UNKNOWN/reconciliation reference with status semantics (never alert)", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.consoleActivity);
  await expect(page.locator("main#ps-console-main h1").first()).toHaveText("Activity & receipts");

  // The outcome-state reference block (§6): UNKNOWN ≠ FAILED,
  // reconciliation-first, late-returns-possible — as REFERENCE.
  const unknownRow = page.locator(".ps-console-outcome-row--unknown");
  await expect(unknownRow).toHaveCount(1);
  // SV-3: UNKNOWN announces politely — role=status, NEVER alert.
  await expect(unknownRow).toHaveAttribute("role", "status");
  expect(await unknownRow.getAttribute("role")).not.toBe("alert");
  await expect(unknownRow).toContainText("Unknown");
  await expect(unknownRow).toContainText(
    "The outcome is not yet known. UNKNOWN is not FAILED: a submitted command is not finality, and a timeout after dispatch is reconciled against provider records before any conclusion.",
  );
  await expect(unknownRow).toContainText("Outcome not yet known");

  // The reconciliation vocabulary rows render as reference states.
  const text = await visibleText(page);
  expect(text).toContain("Late returns");
  expect(text).toContain(
    "Late returns are possible — funds can return after finality is recorded; a return reopens the record for reconciliation instead of being absorbed.",
  );
  expect(text).toContain("Confirmed");
  expect(text).toContain("Failed");

  // Reference states are never live activity: the honest no-execution
  // line states it (§6 activity fold).
  expect(text).toContain(
    "No executed effects exist in this deployment — there is no execution plane, so no live outcome states can be shown here.",
  );

  await evidenceShot(page, "09-activity-unknown-reference.png");
  await expectZeroConsoleDefects(record);
});
