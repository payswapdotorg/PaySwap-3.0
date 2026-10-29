/**
 * @payswap/journey-verification — P21-D journey J24: THE TASK-TIER AGENT
 * JOURNEY over the BUILT web app (ADR-0014 D10 — the E2E law's web half,
 * and D2's web analogue: the web build renders the task tier + the honest
 * unbound notes, never a faked mission tier — the desktop tier carries
 * the full bound journey).
 *
 * The journey (the operator's §4 order, web tier): open the composer →
 * create a new task with a payment-shaped request ("Pay merchant X") →
 * the task lands on the composer's task board → the model/difficulty
 * controls render the HONEST UNBOUND-CATALOG note VERBATIM with ZERO
 * model options → the mission tier's HONEST UNBOUND note renders
 * VERBATIM in the conversation → the routine-stage checklist and the
 * route-planning section render their honest unbound notes → NO
 * fabricated mission progress, NO model list, NO routes, NO choice
 * controls. The task record survives a full page reload.
 *
 * TIER 1 (base-green — no @contract tag): the composer surfaces are
 * LANDED in the merged tree (the P13/P15/P21-B waves); the honest
 * unbound notes are the web tier's TRUTH (the mission plane, the model
 * catalogue, the route-planning engines and the mission timeline are
 * platform-host bindings that do not exist in the web deployment —
 * ADR-0014 D2's "Web keeps the honest localStorage task tier and the
 * unbound mission note").
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
 * The honest unbound-catalog note — VERBATIM from
 * packages/payswap-app/src/agent/taskModelPins.ts (MODEL_CATALOG_UNBOUND_NOTE).
 */
const MODEL_CATALOG_UNBOUND_NOTE =
  "The model catalogue is not wired in this deployment — no model or difficulty can be selected honestly here, and none is substituted silently. The platform host binds the substrate model catalogue at its composition root; until then this composer states the gap instead of listing models.";

/**
 * The mission tier's honest unbound note — VERBATIM from
 * packages/payswap-app/src/agent/missionIntakePins.ts (MISSION_INTAKE_UNBOUND_NOTE).
 */
const MISSION_INTAKE_UNBOUND_NOTE =
  "The mission plane is not wired in this deployment — your request is recorded as a task in this browser profile only, and no payment mission can be started honestly here. The platform host binds the mission-plane channel at its composition root; until then this composer states the gap instead of simulating a mission.";

/**
 * The routine-stage checklist's honest unbound note — VERBATIM from
 * packages/payswap-app/src/agent/routineStagePins.ts (ROUTINE_STAGE_PANEL_UNBOUND_NOTE).
 */
const ROUTINE_STAGE_PANEL_UNBOUND_NOTE =
  "The stage checklist is not wired in this deployment — it is derived from the payment mission's typed timeline, and no mission plane is bound here. The platform host binds the mission-plane channel at its composition root; until then this panel states the gap instead of simulating progress.";

/**
 * The route-planning section's honest unbound-engine note — VERBATIM from
 * packages/payswap-app/src/agent/routePlanningPins.ts (ROUTE_PLANNING_ENGINE_UNBOUND_NOTE).
 * (P23-D, 2026-10-29: the P23-B wave GREW this note — "and repair-discovery
 * engines (the conditional opportunities, the platform work items and the
 * multi-hop hypotheses are likewise not composed here)" — but this spec's
 * verbatim pin was not updated, so the tier-1 suite had been RED since the
 * P23-B acceptance (the drift the closure re-run caught; the pin now matches
 * the grown source byte-for-byte).
 */
const ROUTE_PLANNING_ENGINE_UNBOUND_NOTE =
  "The route-planning engines are not wired in this deployment — no routes are shown because none can be honestly computed here. The composition root binds the real corridor, compiler, opportunities and repair-discovery engines (the conditional opportunities, the platform work items and the multi-hop hypotheses are likewise not composed here); until then this section states the gap instead of inventing routes.";

/** The composer dock label (the shared entrypoint on every surface). */
const DOCK_LABEL = "PaySwap agent";

/** The app boot wait: the substrate Root connects its WebSocket and
 * mounts before the composer chrome appears (deterministic sequence,
 * variable duration — a generous first wait, never a blind sleep). */
const APP_BOOT_TIMEOUT = 20_000;

// The boot can legitimately take most of a minute on a cold server +
// parallel workers (the substrate Root's WS connect + the provider
// registry), and the journey itself adds locator waits on top — the
// 30s default is too tight for an honest boot-paced journey (the
// worker's first run timed out mid-journey, not on any assertion).
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

test("[J24] the full task-tier journey: Pay merchant X lands ONE task on the board; the model and mission tiers render their honest unbound notes VERBATIM; nothing is fabricated", async ({ page }) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.console);

  // 1. New Task through the composer (the text path).
  const panel = await openComposer(page);
  await sendText(page, "Pay merchant X");

  // 2. The task lands on the board — ONE task, the honest draft status,
  //    the payment-mission intent line, the honest outcome line.
  const tasks = panel.locator(".ps-agent-task");
  await expect(tasks).toHaveCount(1);
  const taskCard = tasks.first();
  await expect(taskCard.locator(".ps-agent-task-title")).toHaveText("Pay request");
  await expect(taskCard).toContainText("Payment mission · Pay");
  await expect(taskCard).toContainText("Draft — a request, nothing more");
  await expect(panel).toContainText("Task created: Pay request.");
  await expect(panel).toContainText(
    "This is a request record, not a payment or a connection.",
  );

  // 3. The task's append-only event history is openable (the record —
  //    the task tier's own truth).
  await taskCard.getByRole("button", { name: "Show history" }).click();
  const events = taskCard.locator(".ps-agent-task-event");
  await expect(events.first()).toBeVisible();
  await expect(events.filter({ hasText: "CREATED" })).toHaveCount(1);

  // 4. The model/difficulty controls render the honest unbound-catalog
  //    note VERBATIM — and ZERO selects, ZERO options, ZERO record
  //    button (never a fabricated model list).
  const modelControls = page.locator("#ps-agent-model-controls");
  await expect(modelControls).toBeVisible();
  await expect(modelControls).toContainText(MODEL_CATALOG_UNBOUND_NOTE);
  await expect(modelControls.locator("[data-ps-model-select]")).toHaveCount(0);
  await expect(modelControls.locator("[data-ps-difficulty-select]")).toHaveCount(0);
  await expect(modelControls.locator("option")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Record model & difficulty" }),
  ).toHaveCount(0);

  // 5. The mission tier's honest unbound note renders VERBATIM in the
  //    conversation (the payment-mission seed reached for the mission
  //    plane and the composer states the gap instead of simulating).
  await expect(panel).toContainText(MISSION_INTAKE_UNBOUND_NOTE);

  // 6. The routine-stage checklist renders its honest unbound note with
  //    ZERO stage rows (no fabricated progress — the checklist is a
  //    projection of the mission timeline, which does not exist here).
  const stages = page.locator(".ps-agent-stages");
  await expect(stages).toBeVisible();
  await expect(stages).toContainText(ROUTINE_STAGE_PANEL_UNBOUND_NOTE);
  await expect(page.locator(".ps-agent-stage-item")).toHaveCount(0);

  // 7. The route-planning section renders its honest unbound-engine note
  //    with ZERO routes and ZERO choice controls (never a fabricated
  //    plan, never a proceed/wait choice that cannot be recorded).
  const route = page.locator(".ps-agent-route");
  await expect(route).toBeVisible();
  await expect(route).toContainText(ROUTE_PLANNING_ENGINE_UNBOUND_NOTE);
  await expect(page.locator(".ps-agent-route-item")).toHaveCount(0);
  await expect(page.locator("[data-ps-route-choice]")).toHaveCount(0);

  // 8. The zero-console-defect law (the honest app boots clean).
  await expectZeroConsoleDefects(record);
  await evidenceShot(page, "p21-j24-task-tier-journey.png");
});

test("[J24] the task-tier record survives a full page reload — the browser-profile persistence, the same honest unbound truth", async ({ page }) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.console);

  const panel = await openComposer(page);
  await sendText(page, "Pay merchant X");
  await expect(panel.locator(".ps-agent-task")).toHaveCount(1);

  // The restart: a full reload. The PERSISTED mode decides which chrome
  // renders once the app re-boots: OPEN → the panel itself (the dock
  // button is ABSENT from the tree while the panel is open — the panel
  // replaces it); minimized → the dock with the task-count badge.
  // NOTE: the boot wait must accept EITHER chrome — isVisible() does not
  // wait, and a dock-only wait fails whenever the panel restores open
  // (both failure modes were observed in the lane's runs).
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
  await expect(tasks.first()).toContainText("Pay request");
  await expect(tasks.first()).toContainText("Payment mission · Pay");

  // The honest unbound notes still stand after the resume — the reload
  // fabricated nothing (the model catalogue stays unlisted, the mission
  // tier stays unbound, no progress was invented in between).
  await expect(page.locator("#ps-agent-model-controls")).toContainText(
    MODEL_CATALOG_UNBOUND_NOTE,
  );
  await expect(page.locator("#ps-agent-model-controls").locator("option")).toHaveCount(0);
  await expect(panelAfterReload).toContainText(MISSION_INTAKE_UNBOUND_NOTE);
  await expect(page.locator(".ps-agent-stages")).toContainText(
    ROUTINE_STAGE_PANEL_UNBOUND_NOTE,
  );
  await expect(page.locator(".ps-agent-stage-item")).toHaveCount(0);
  await expect(page.locator(".ps-agent-route")).toContainText(
    ROUTE_PLANNING_ENGINE_UNBOUND_NOTE,
  );

  await expectZeroConsoleDefects(record);
  await evidenceShot(page, "p21-j24-reload-resume.png");
});

test("[J24] the opportunity-emergence surface stays honest on web (P23-D, ADR-0015 D10's web tier): the unbound-engine truth renders and ZERO opportunity cards, ZERO advisory sections, ZERO preconditions text — nothing is fabricated", async ({ page }) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.console);

  const panel = await openComposer(page);
  await sendText(page, "Pay merchant X");
  await expect(panel.locator(".ps-agent-task")).toHaveCount(1);

  // The route-planning section: the honest unbound-engine note VERBATIM —
  // the web deployment composes NO emergence (the repair-discovery
  // composition requires the platform host's engines: the corridor chains,
  // the repair catalogue, the conditional construction and the hypothesis
  // stage — all platform-host bindings absent from the web deployment BY
  // DESIGN; the desktop CDP journey carries the bound card-content tier).
  const route = page.locator(".ps-agent-route");
  await expect(route).toBeVisible();
  await expect(route).toContainText(ROUTE_PLANNING_ENGINE_UNBOUND_NOTE);

  // ZERO opportunity-card elements (the three advisory sections' testid
  // surfaces — the SAME selectors the desktop CDP journey asserts content
  // through): a card on web would be a FABRICATION.
  await expect(page.locator("[data-testid^='ps-agent-conditional-']")).toHaveCount(0);
  await expect(page.locator("[data-testid^='ps-agent-platform-work-']")).toHaveCount(0);
  await expect(page.locator("[data-testid^='ps-agent-hypothesis-']")).toHaveCount(0);

  // ZERO advisory-section chrome and ZERO people-language card vocabulary
  // (the D8 contract's surfaces render ONLY over a composed engine view —
  // the not-composed notes belong to the DESKTOP's composed-but-unbound
  // tier, never to web's never-composed tier).
  await expect(page.locator("#ps-agent-route-section-conditional-opportunities")).toHaveCount(0);
  await expect(page.locator("#ps-agent-route-section-platform-work")).toHaveCount(0);
  await expect(page.locator("#ps-agent-route-section-hypotheses")).toHaveCount(0);
  await expect(page.getByText("What would need to change")).toHaveCount(0);
  await expect(page.getByText("What PaySwap itself would need to build")).toHaveCount(0);
  await expect(page.getByText("Waiting for:")).toHaveCount(0);
  await expect(page.getByText("Model-assisted repair proposals")).toHaveCount(0);
  await expect(page.getByText("A hypothesis is never a route")).toHaveCount(0);

  await expectZeroConsoleDefects(record);
  await evidenceShot(page, "p23-j24-opportunity-honesty.png");
});

test("[J24] responsive 390×844: the core composer controls are usable — the dock, the input, the task board and the honest unbound-catalog note", async ({ page }) => {
  const record = trackConsole(page);
  const { width } = page.viewportSize() ?? { width: 0 };

  // The mobile viewport (native on the mobile project; an explicit
  // resize on the desktop project — the responsive.spec.ts pattern).
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(CONTRACT_ROUTES.console);

  // The dock is reachable and opens the panel at this viewport.
  const panel = await openComposer(page);

  // The input is usable: a payment-shaped request goes through and the
  // task lands on the board with the honest draft status.
  await sendText(page, "Pay merchant X");
  const tasks = panel.locator(".ps-agent-task");
  await expect(tasks).toHaveCount(1);
  await expect(tasks.first()).toContainText("Pay request");
  await expect(tasks.first()).toContainText("Draft — a request, nothing more");

  // The core honest control — the model/difficulty note — renders
  // verbatim with zero fabricated options at this viewport.
  const modelControls = page.locator("#ps-agent-model-controls");
  await expect(modelControls).toBeVisible();
  await expect(modelControls).toContainText(MODEL_CATALOG_UNBOUND_NOTE);
  await expect(modelControls.locator("option")).toHaveCount(0);

  // The mission tier's honest unbound note renders (the web truth holds
  // at the mobile viewport too).
  await expect(panel).toContainText(MISSION_INTAKE_UNBOUND_NOTE);

  // No horizontal document overflow (the responsive law's instrument).
  const overflow = await page.evaluate(() => {
    const scrolling = document.scrollingElement ?? document.documentElement;
    return Math.max(0, scrolling.scrollWidth - scrolling.clientWidth);
  });
  expect(overflow, "document horizontal overflow in px (responsive law)").toBe(0);

  await expectZeroConsoleDefects(record);
  await evidenceShot(page, "p21-j24-mobile-390.png");
  test.info().annotations.push({ type: "viewport", description: `${width}px wide` });
});
