/**
 * @payswap/journey-verification — P22-D journey J25: THE CORRIDOR JOURNEY's
 * honest web tier (ADR-0016 D10's web analogue + D12's browser row — the
 * no-orphans law's J-row for the cross-provider corridor).
 *
 * The journey (web tier): open the composer → send a corridor-shaped
 * payment ask ("Move one thousand cedis to a Kenyan bank account over the
 * corridor" — the MOVE stem, exactly one direction class) → the task lands
 * on the composer's task board with its honest draft status → the mission
 * tier's HONEST UNBOUND note renders VERBATIM in the conversation (the
 * nine-field corridor intake is NEVER simulated on web) → the
 * route-planning section renders its honest unbound-engine note VERBATIM
 * with ZERO corridor vocabulary — no corridor plan card, no leg rows, no
 * custody chain, no issuer-scoped relay-asset sentence, no proceed
 * control. The task record survives a full page reload.
 *
 * TIER 1 (base-green — no @contract tag): the corridor composition (the
 * chains derivation, the corridor compiler, the four-leg plan
 * presentation, the composite act) is a platform-host binding absent from
 * the web deployment BY DESIGN (the P23 opportunity-cards precedent: web
 * keeps the honest never-composed tier — zero corridor cards, zero
 * corridor vocabulary, the unbound notes verbatim; the desktop tier
 * carries the full bound corridor journey, machine-verified by the
 * scripts/p22 CDP corridor receipt + the in-repo bridge battery).
 *
 * Every pinned note below is copied VERBATIM from its source; drift is
 * a real finding, never a test to relax.
 */

import { test, expect, type Page } from "@playwright/test";
import { CONTRACT_ROUTES } from "../journeys.manifest.js";
import {
  expectZeroConsoleDefects,
  trackConsole,
} from "../support/helpers.js";
import { evidenceShot } from "../support/evidence.js";

/**
 * The mission tier's honest unbound note — VERBATIM from
 * packages/payswap-app/src/agent/missionIntakePins.ts (MISSION_INTAKE_UNBOUND_NOTE).
 */
const MISSION_INTAKE_UNBOUND_NOTE =
  "The mission plane is not wired in this deployment — your request is recorded as a task in this browser profile only, and no payment mission can be started honestly here. The platform host binds the mission-plane channel at its composition root; until then this composer states the gap instead of simulating a mission.";

/**
 * The route-planning section's honest unbound-engine note — VERBATIM from
 * packages/payswap-app/src/agent/routePlanningPins.ts (ROUTE_PLANNING_ENGINE_UNBOUND_NOTE;
 * the P23-D-grown source, byte-for-byte — the J24 spec's re-pinned law).
 */
const ROUTE_PLANNING_ENGINE_UNBOUND_NOTE =
  "The route-planning engines are not wired in this deployment — no routes are shown because none can be honestly computed here. The composition root binds the real corridor, compiler, opportunities and repair-discovery engines (the conditional opportunities, the platform work items and the multi-hop hypotheses are likewise not composed here); until then this section states the gap instead of inventing routes.";

/** The corridor-shaped ask (the MOVE stem — exactly one direction class). */
const CORRIDOR_ASK =
  "Move one thousand cedis to a Kenyan bank account over the corridor";

/** The composer dock label (the shared entrypoint on every surface). */
const DOCK_LABEL = "PaySwap agent";

/** The app boot wait (the substrate Root's WS connect — the J24 law). */
const APP_BOOT_TIMEOUT = 20_000;

test.setTimeout(90_000);

/** Open the composer on the current page and return the panel locator. */
async function openComposer(page: Page): Promise<import("@playwright/test").Locator> {
  const dock = page.getByRole("button", { name: new RegExp(DOCK_LABEL, "i") });
  await expect(dock, "the composer dock (the shared entrypoint)").toBeVisible({
    timeout: APP_BOOT_TIMEOUT,
  });
  const panel = page.locator(".ps-agent-panel");
  if (!(await panel.isVisible())) {
    await dock.click();
  }
  await expect(panel).toBeVisible();
  return panel;
}

/** Send text through the composer input. */
async function sendText(page: Page, text: string): Promise<void> {
  const input = page.locator(".ps-agent-input-field");
  await expect(input).toBeVisible();
  await input.fill(text);
  await input.press("Enter");
}

test("[J25] the corridor journey's honest web tier: a corridor-shaped ask lands ONE task on the board; the mission tier and the route-planning section render their honest unbound notes VERBATIM; ZERO corridor vocabulary — nothing is fabricated", async ({ page }) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.console);

  // 1. The corridor-shaped ask through the composer (the MOVE stem).
  const panel = await openComposer(page);
  await sendText(page, CORRIDOR_ASK);

  // 2. ONE task lands on the board — the honest draft status, the
  //    payment-mission intent line, the honest outcome line.
  const tasks = panel.locator(".ps-agent-task");
  await expect(tasks).toHaveCount(1);
  const taskCard = tasks.first();
  await expect(taskCard).toContainText("Payment mission · Move");
  await expect(taskCard).toContainText("Draft — a request, nothing more");
  await expect(panel).toContainText(
    "This is a request record, not a payment or a connection.",
  );

  // 3. The mission tier's honest unbound note renders VERBATIM in the
  //    conversation — the nine-field corridor intake is NEVER simulated
  //    on web (the corridor ask reached for the mission plane and the
  //    composer states the gap instead of simulating a corridor mission).
  await expect(panel).toContainText(MISSION_INTAKE_UNBOUND_NOTE);
  await expect(page.getByText("How much should move")).toHaveCount(0);
  await expect(page.getByText("Which corridor")).toHaveCount(0);

  // 4. The route-planning section renders its honest unbound-engine note
  //    VERBATIM — the corridor composition is a platform-host binding
  //    absent from the web deployment BY DESIGN.
  const route = page.locator(".ps-agent-route");
  await expect(route).toBeVisible();
  await expect(route).toContainText(ROUTE_PLANNING_ENGINE_UNBOUND_NOTE);

  // 5. ZERO corridor vocabulary (the SAME selectors the desktop CDP
  //    corridor journey asserts content through): a corridor card, a leg
  //    row or a proceed control on web would be a FABRICATION.
  await expect(page.locator("[data-testid^='ps-agent-corridor-plan-']")).toHaveCount(0);
  await expect(page.locator("[data-testid^='ps-agent-corridor-leg-']")).toHaveCount(0);
  await expect(page.locator("[data-testid^='ps-agent-route-proceed-']")).toHaveCount(0);
  await expect(page.locator(".ps-agent-route-item")).toHaveCount(0);
  await expect(page.locator("[data-ps-route-choice]")).toHaveCount(0);
  await expect(page.getByText("Custody chain:")).toHaveCount(0);
  await expect(
    page.getByText("The onchain leg carries the issuer-scoped stablecoin"),
  ).toHaveCount(0);
  await expect(
    page.getByText("This is the presented plan, not an authorization"),
  ).toHaveCount(0);
  await expect(page.getByText("flutterwave_ghs_mobile_money")).toHaveCount(0);
  await expect(page.getByText("paystack_kes_bank_transfer")).toHaveCount(0);

  await expectZeroConsoleDefects(record);
  await evidenceShot(page, "p22d-j25-corridor-honest-web.png");
});

test("[J25] the corridor ask's task record survives a full page reload — the browser-profile persistence, the same honest never-composed corridor truth", async ({ page }) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.console);

  const panel = await openComposer(page);
  await sendText(page, CORRIDOR_ASK);
  await expect(panel.locator(".ps-agent-task")).toHaveCount(1);

  // The restart: a full reload. The boot wait must accept EITHER chrome
  // (the J24 law: the persisted panel or the dock with the task badge).
  await page.reload();
  const dock = page.getByRole("button", { name: new RegExp(DOCK_LABEL, "i") });
  const panelAfterReload = page.locator(".ps-agent-panel");
  await expect(
    panelAfterReload.or(dock),
    "the app re-boots to the composer chrome (the persisted panel or the dock)",
  ).toBeVisible({ timeout: APP_BOOT_TIMEOUT });
  if (!(await panelAfterReload.isVisible())) {
    await expect(dock).toContainText("1");
    await dock.click();
  }
  await expect(panelAfterReload).toBeVisible();

  // ONE task still on the board — the same honest record, not a duplicate.
  const tasks = panelAfterReload.locator(".ps-agent-task");
  await expect(tasks).toHaveCount(1);
  await expect(tasks.first()).toContainText("Payment mission · Move");

  // The honest never-composed corridor truth still stands after the
  // resume — the reload fabricated nothing (the mission tier stays
  // unbound, zero corridor vocabulary, no plan was invented in between).
  await expect(panelAfterReload).toContainText(MISSION_INTAKE_UNBOUND_NOTE);
  await expect(page.locator(".ps-agent-route")).toContainText(
    ROUTE_PLANNING_ENGINE_UNBOUND_NOTE,
  );
  await expect(page.locator("[data-testid^='ps-agent-corridor-plan-']")).toHaveCount(0);
  await expect(page.locator("[data-testid^='ps-agent-corridor-leg-']")).toHaveCount(0);
  await expect(page.locator("[data-testid^='ps-agent-route-proceed-']")).toHaveCount(0);

  await expectZeroConsoleDefects(record);
  await evidenceShot(page, "p22d-j25-reload-resume.png");
});
