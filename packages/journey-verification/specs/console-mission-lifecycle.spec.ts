/**
 * @payswap/journey-verification — acceptance flow 16: CONSOLE MISSION
 * LIFECYCLE (JOURNEY-MAP.md §3.16; CONSOLE-WORKSPACE.md §3–§6).
 *
 * The FULL honest lifecycle in the browser over the real BROWSER_PROFILE
 * localStorage store ("payswap.console.workspace.v1"): the creation
 * intake renders → an invalid submit renders the structural validation
 * findings VERBATIM with nothing recorded → a valid intake records the
 * draft (DRAFT) → the intent-review step (record intent →
 * INTENT_RECORDED) → the mission detail with the §4 lifecycle ladder
 * (INTENT reached; the downstream rungs carry their VERBATIM typed
 * prerequisites — ELIGIBILITY and EXECUTION asserted character-exact) →
 * the real event timeline (CREATED + INTENT_VALIDATED) → revise (the
 * goal changes; a REVISED event appears) → archive (ARCHIVED; the
 * overview no longer lists the mission as in-progress) — and the store
 * persists across a full page reload (the localStorage law, §5).
 *
 * All of flow 16 is J14. Browser flows verify the WEB mount; the
 * DESKTOP_PROFILE store path is verified by the desktop suites + the
 * station desktop GUI inspection (CONSOLE-WORKSPACE.md §9).
 *
 * P11 (§6/§8): the OVERVIEW INTAKE-ENTRY golden path — a goal typed on
 * the outcome-first home reaches the missions creation intake PREFILLED
 * (in-tree navigation, never a reload), and each outcome shortcut
 * prefills its direction. Covered here because this spec owns the
 * intake helpers.
 */

import { test, expect } from "@playwright/test";
import { CONTRACT_ROUTES } from "../journeys.manifest.js";
import { expectZeroConsoleDefects, trackConsole } from "../support/helpers.js";
import { evidenceShot, readWorkspaceStore } from "../support/evidence.js";

/* The §4 typed prerequisites asserted VERBATIM (character-exact). */
const ELIGIBILITY_PREREQUISITE =
  "Capability discovery is not configured in this deployment. Missions cannot be evaluated for eligibility until a capability discovery plane exists — nothing here may guess eligibility.";
const EXECUTION_PREREQUISITE =
  "No execution plane is configured. PaySwap never executes money movement from the console; execution requires the financial protocol with a connected capability, and no capability is connected in this deployment.";

/** Open the missions section and wait for the intake form. */
async function openMissions(page: import("@playwright/test").Page): Promise<void> {
  await page.goto(CONTRACT_ROUTES.consoleMissions);
  await expect(page.locator("form.ps-console-intake")).toBeVisible();
}

/** Submit the create intake with a goal, direction and an amount. */
async function submitValidIntake(
  page: import("@playwright/test").Page,
  goal: string,
): Promise<void> {
  await page.locator(".ps-console-textarea").first().fill(goal);
  await page.locator("select").selectOption("PAY");
  const amountInputs = page.locator("input[autocomplete='off']");
  await amountInputs.nth(0).fill("USD");
  await amountInputs.nth(1).fill("1234");
  await page.locator("button[type='submit']").click();
}

test("[J14] the overview intake entry prefills the missions creation intake (P11: type a goal → New mission → prefilled intake, in-tree)", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.console);
  await expect(page.locator("#ps-console-overview-goal")).toBeVisible();

  // A renderer-reload marker: the entry must be an in-tree navigation.
  await page.evaluate(() => {
    (window as { __p11NoReloadMarker?: boolean }).__p11NoReloadMarker = true;
  });

  // Type a goal on the home, press "New mission".
  await page.locator("#ps-console-overview-goal").fill("Move the reserve to the payout account");
  await page.getByRole("button", { name: "New mission" }).click();
  await expect(page).toHaveURL(/\/console\/missions$/);
  await expect(page.locator("form.ps-console-intake")).toBeVisible();

  // The intake opens PREFILLED with the typed goal (no direction yet).
  const goalBox = page.locator(".ps-console-textarea").first();
  await expect(goalBox).toHaveValue("Move the reserve to the payout account");
  await expect(page.locator("select")).toHaveValue("");

  // The navigation never reloaded the renderer (§2).
  const marker = await page.evaluate(
    () => (window as { __p11NoReloadMarker?: boolean }).__p11NoReloadMarker === true,
  );
  expect(marker, "the overview intake entry never reloaded the renderer (§2)").toBe(true);

  // Back to the home: an outcome shortcut prefills its DIRECTION.
  await page.locator(".ps-console-sidebar a[href='/console/overview']").click();
  await page.locator(".ps-console-outcome-card", { hasText: "Convert" }).click();
  await expect(page).toHaveURL(/\/console\/missions$/);
  await expect(page.locator("select")).toHaveValue("CONVERT");
  await expect(page.locator(".ps-console-textarea").first()).toHaveValue("");

  // Nothing was recorded by either entry (the prefill is intent-ENTRY,
  // not an intent record — the store stays empty until a valid submit).
  const store = await readWorkspaceStore(page);
  expect(store, "the intake entry itself records nothing").toBeNull();

  await evidenceShot(page, "08-overview-intake-prefill.png");
  await expectZeroConsoleDefects(record);
});

test("[J14] the creation intake validates structurally before recording: an invalid submit renders the findings verbatim and nothing is recorded", async ({
  page,
}) => {
  const record = trackConsole(page);
  await openMissions(page);

  // The intake renders its honest frame (§6: the demand-side-intent law).
  await expect(page.locator("#missions-intake-heading")).toHaveText("Create a mission");

  // An EMPTY goal + no direction: submit and expect the findings.
  await page.locator("button[type='submit']").click();
  const findings = page.locator(".ps-console-finding");
  await expect(findings).toHaveCount(2);
  await expect(findings.nth(0)).toHaveText(
    "The goal statement is required — it must not be empty after trimming.",
  );
  await expect(findings.nth(1)).toHaveText(
    "The direction must be one of PAY, RECEIVE, MOVE or CONVERT.",
  );

  // Nothing was recorded: the store key is absent, the list stays empty,
  // and the intake form (not a review step) is still on the page.
  const store = await readWorkspaceStore(page);
  expect(store, "an invalid intake records nothing (fail-closed)").toBeNull();
  await expect(page.locator("#missions-review")).toHaveCount(0);
  await expect(page.locator("form.ps-console-intake")).toBeVisible();

  await evidenceShot(page, "03-mission-intake-findings.png");
  await expectZeroConsoleDefects(record);
});

test("[J14] draft → intent-review → INTENT_RECORDED → the detail ladder with verbatim typed prerequisites and the real event timeline", async ({
  page,
}) => {
  const record = trackConsole(page);
  await openMissions(page);

  // A valid intake records the DRAFT.
  await submitValidIntake(page, "Pay a supplier invoice");
  const review = page.locator("#missions-review");
  await expect(review).toBeVisible();
  await expect(review.locator("h2")).toHaveText("Review the recorded draft");
  const reviewText = await review.innerText();
  expect(reviewText).toContain("mission-1");
  expect(reviewText).toContain("Pay a supplier invoice");
  expect(reviewText).toContain("1234 USD (minor units)");
  const draftStore = await readWorkspaceStore(page);
  expect(draftStore?.records[0]?.status).toBe("DRAFT");

  await evidenceShot(page, "04-mission-review-step.png");

  // The intent-review step: record intent → INTENT_RECORDED.
  await review.locator("button.ps-console-action--primary").click();
  const detail = page.locator(".ps-console-mission-detail");
  await expect(detail).toBeVisible();
  await expect(detail.locator(".ps-console-mission-goal")).toHaveText("Pay a supplier invoice");
  // The status pill carries the visible "Intent recorded" label (the
  // pill appends its tone word — matched by contained text).
  await expect(detail.locator(".ps-console-mission-header").getByText("Intent recorded")).toBeVisible();
  const meta = await detail.locator(".ps-console-mission-meta").innerText();
  expect(meta).toContain("PAY · 1234 USD");
  const intentStore = await readWorkspaceStore(page);
  expect(intentStore?.records[0]?.status).toBe("INTENT_RECORDED");

  // The §4 ladder: INTENT reached; the downstream rungs carry their
  // VERBATIM typed prerequisites (ELIGIBILITY + EXECUTION pinned
  // character-exact; the other rungs present with the same law).
  const ladder = detail.locator(".ps-console-ladder");
  await expect(ladder.locator(".ps-console-ladder-item").nth(0)).toContainText("INTENT");
  await expect(ladder.locator(".ps-console-ladder-item").nth(0)).toContainText("Reached");
  const ladderText = await ladder.innerText();
  expect(ladderText).toContain(ELIGIBILITY_PREREQUISITE);
  expect(ladderText).toContain(EXECUTION_PREREQUISITE);
  expect(ladderText).toContain("PLANNING");
  expect(ladderText).toContain("APPROVAL");
  expect(ladderText).toContain("OBSERVATION");
  expect(ladderText).toContain("EVIDENCE");

  // The real event timeline: the two events this lifecycle produced.
  const timelineText = await detail.innerText();
  expect(timelineText).toContain("Mission draft recorded.");
  expect(timelineText).toContain("Intent recorded — structural validation passed.");

  await evidenceShot(page, "05-mission-detail-ladder.png");
  await expectZeroConsoleDefects(record);
});

test("[J14] the BROWSER_PROFILE store persists across a full page reload and the overview lists the in-progress mission", async ({
  page,
}) => {
  const record = trackConsole(page);
  await openMissions(page);
  await submitValidIntake(page, "Pay a supplier invoice");
  await page.locator("#missions-review button.ps-console-action--primary").click();
  await expect(page.locator(".ps-console-mission-detail")).toBeVisible();

  // The overview shows the in-progress mission (§6 fold).
  await page.locator(".ps-console-sidebar a[href='/console/overview']").click();
  await expect(page.locator("main#ps-console-main h1").first()).toHaveText("Overview");
  const overview = page.locator("main#ps-console-main");
  await expect(overview.getByText("Pay a supplier invoice")).toBeVisible();
  await expect(overview.locator(".ps-console-mission-row").getByText("Intent recorded")).toBeVisible();

  await evidenceShot(page, "06-console-overview-in-progress.png");

  // A FULL page reload: the store persists (the §5 localStorage law —
  // the key "payswap.console.workspace.v1" survives the reload).
  await page.reload();
  await expect(page.locator("main#ps-console-main h1").first()).toHaveText("Overview");
  await expect(page.locator("main#ps-console-main").getByText("Pay a supplier invoice")).toBeVisible();
  const reloadedStore = await readWorkspaceStore(page);
  expect(reloadedStore?.records[0]?.status).toBe("INTENT_RECORDED");
  expect(reloadedStore?.records[0]?.intake?.goalStatement).toBe("Pay a supplier invoice");

  await expectZeroConsoleDefects(record);
});

test("[J14] revise changes the recorded intake (REVISED event) and archive retires the mission (ARCHIVED; the overview stops listing it as in-progress)", async ({
  page,
}) => {
  const record = trackConsole(page);
  await openMissions(page);
  await submitValidIntake(page, "Pay a supplier invoice");
  await page.locator("#missions-review button.ps-console-action--primary").click();
  const detail = page.locator(".ps-console-mission-detail");
  await expect(detail).toBeVisible();

  // REVISE: the action opens the pre-filled revise form (zero dead
  // actions, §8); the new goal records and the detail re-opens.
  await detail.locator("button", { hasText: "Revise intake" }).click();
  const reviseForm = page.locator("form.ps-console-intake");
  await expect(reviseForm).toBeVisible();
  await expect(page.locator("#missions-intake-heading")).toHaveText("Revise the mission intake");
  await expect(reviseForm.locator(".ps-console-textarea").first()).toHaveValue(
    "Pay a supplier invoice",
  );
  await reviseForm.locator(".ps-console-textarea").first().fill("Pay the supplier invoice before the due date");
  await reviseForm.locator("button[type='submit']").click();
  await expect(detail).toBeVisible();
  await expect(detail.locator(".ps-console-mission-goal")).toHaveText(
    "Pay the supplier invoice before the due date",
  );
  const revisedText = await detail.innerText();
  expect(revisedText).toContain("Mission draft revised.");

  // ARCHIVE: the two-step confirmation retires the record.
  await detail.locator("button", { hasText: "Archive…" }).click();
  await detail.locator("button", { hasText: "Confirm archive" }).click();
  await expect(detail.locator(".ps-console-archived-note")).toContainText("This mission is archived.");
  await expect(detail.locator(".ps-console-mission-header").getByText("Archived")).toBeVisible();
  const archivedText = await detail.innerText();
  expect(archivedText).toContain("Mission archived.");
  // The archived record's controls are retired (read-only, §6).
  await expect(detail.locator("button", { hasText: "Revise intake" })).toHaveCount(0);

  await evidenceShot(page, "07-mission-archived.png");

  // The overview no longer lists the mission as in-progress — the
  // honest all-archived reason renders instead (§6 two-reason law).
  await page.locator(".ps-console-sidebar a[href='/console/overview']").click();
  const overview = page.locator("main#ps-console-main");
  await expect(overview.getByText("Pay the supplier invoice before the due date")).toHaveCount(0);
  await expect(overview.getByText("No missions are in progress — every recorded mission is archived. Archived records stay readable in the Missions section; nothing here is invented in their place.")).toBeVisible();

  await expectZeroConsoleDefects(record);
});
