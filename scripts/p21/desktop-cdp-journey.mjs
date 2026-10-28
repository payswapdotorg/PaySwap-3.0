/**
 * PaySwap Desktop (P21-D reviewer-gate ③/④, ADR-0014 D10 — the E2E law's
 * DESKTOP half) — THE ELECTRON CDP JOURNEY HARNESS.
 *
 * The operator's ordered journey ("New Task → model/difficulty →
 * 'Pay merchant X' → typed intent → pinned routine → stage-by-stage
 * progress → provider-evidenced rails → routes/counterfactuals/
 * opportunities → authorization → real execution or honest no-route")
 * driven END-TO-END through the REAL DESKTOP APPLICATION:
 *
 * - the REAL Electron app (the dev-tier runtime: the tsup-built
 *   main/host/preload bundles + the built renderer, served over file://
 *   — the launch recipe: --no-sandbox --disable-dev-shm-usage
 *   --open-workspace, CDP on the dev-mode fixed port 9229, under Xvfb);
 * - the REAL renderer (React composition roots — the boot-order-fixed
 *   business root binds the mission-intake plane + the model catalog +
 *   the route-planning engine BEFORE the first shared-controller
 *   construction);
 * - the REAL host runtime (the payment-mission store under the
 *   isolated userData, the connection plane with the lane-aware REAL
 *   stripe kernel (SANDBOX only), the sessionModelCatalog member);
 * - ZERO provider credentials (the operator's keys are absent — the
 *   journey's execution leg is operator-gated; the honest outcome is
 *   the typed BLOCKED preview with every gate reason VERBATIM, never a
 *   fabricated route);
 * - PERSISTENCE: the app is QUIT and RELAUNCHED on the same userData —
 *   the task, the conversation and the mission must survive.
 *
 * Output: structured secret-free receipt (JSON) + screenshots (PNG).
 * The receipt is machine-scanned for secret-shaped material before it
 * is written; a finding FAILS the run.
 *
 * The process/CDP plumbing lives in scripts/p21/cdp-harness-lib.mjs.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  EVIDENCE_DIR,
  connectPage,
  ensureAssetsDir,
  journeyShots,
  journeySteps,
  lastPendingQuestion,
  launchElectron,
  makeShot,
  openComposer,
  panelText,
  recordStep,
  readUserDataFile,
  scanForSecretShapes,
  sendText,
  setJourneyUserDataDir,
  stopElectron,
  until,
  waitCdp,
} from "./cdp-harness-lib.mjs";

const WORKSPACE = "/home/z/payswap-e2e-workspace";
const RECEIPT_PATH = resolve(EVIDENCE_DIR, "p21-d-cdp-desktop-journey-RECEIPT-2026-10-28.json");
const RAN_AT = new Date().toISOString();

/** The nine conversational answers (question-prefix → reply). */
const ASK_LOOP = [
  ["How much should move", "50000000 NGN"],
  ["Which funding source", "Flutterwave NGN wallet (test)"],
  ["Who is the recipient", "Merchant X (Stripe-only test)"],
  ["Which corridor", "NG US USD"],
  ["By when must it arrive", "2026-10-29T12:00:00Z"],
  ["What is your fee cap", "capped 100 USD"],
  ["What is the purpose", "supplier invoice 42"],
  ["Any privacy or compliance", "none"],
  ["Can this payment be settled partially", "full"],
];

/** The six-gate BLOCK reasons the preview must show VERBATIM (fragments). */
const GATE_FRAGMENTS = [
  "No observed funding source exists in this deployment",
  "NO_CONNECTED_INSTANCE: No connected capability instance exists in this deployment",
  "No fresh quote exists for this mission",
  "No declared limits exist for this corridor",
  "No connected provider scope exists in this deployment",
  "No policy plane is configured",
];

const ASK_PREFIXES = ASK_LOOP.map(([prefix]) => prefix);

async function driveJourney(page, shot, phase) {
  // (1) The composer opens with the honest capability note.
  await openComposer(page);
  const capabilityOk = await until(async () => (await panelText(page)).includes("This composer holds no financial authority"));
  recordStep(`${phase}-1`, "the composer opens with the honest zero-financial-authority note", capabilityOk ? "PASS" : "FAIL",
    capabilityOk ? "the capability note renders verbatim" : "the capability note did not render");

  // (2) Model & difficulty: the REAL member, the honest catalog (whatever
  //     the substrate truthfully reports — zero options when no agent
  //     session is live; real options when the substrate has models).
  const modelState = await page.evaluate(() => {
    const el = document.querySelector("#ps-agent-model-controls");
    const modelSelect = el?.querySelector("#ps-agent-model-select");
    const realOptions = [...(modelSelect?.querySelectorAll("option") ?? [])]
      .filter((option) => (option.getAttribute("value") ?? "") !== "")
      .map((option) => option.textContent ?? "");
    return {
      hasSelect: !!modelSelect,
      realOptionCount: realOptions.length,
      realOptions,
      text: el?.textContent ?? "",
    };
  });
  const modelOk = modelState.hasSelect && !modelState.text.includes("not wired");
  recordStep(`${phase}-2`, `model & difficulty: the REAL session-model-catalog member answers the honest catalog (${modelState.realOptionCount} model option(s) from the substrate — never fabricated)`, modelOk ? "PASS" : "FAIL",
    `select=${modelState.hasSelect} realOptions=${JSON.stringify(modelState.realOptions)}`);

  // (3) New Task: "Pay merchant X" seeds ONE mission + the ask loop starts.
  await sendText(page, "Pay merchant X");
  const seeded = await until(async () => (await panelText(page)).includes("How much should move"));
  recordStep(`${phase}-3`, "New Task 'Pay merchant X': the task lands and the mission's deterministic ask loop starts", seeded ? "PASS" : "FAIL",
    seeded ? "the first intake question rendered in the conversation" : "the ask loop did not start");
  await shot(`p21-d-cdp-${phase}-3-seeded.png`);

  // (4) The nine-field ask loop → the intake completes (observable: every
  //     distinct question answered + no pending question remains — the
  //     completion note itself is not a rendered surface).
  const answered = [];
  for (let round = 0; round < 20; round += 1) {
    const pending = await lastPendingQuestion(page, ASK_PREFIXES);
    if (pending === null) break;
    if (answered.includes(pending)) {
      // The question re-asked after a refused answer — one retry with the
      // same reply is the honest loop's own contract; a second repeat is a
      // real failure the loop surfaces by exhausting its rounds.
      if (answered.filter((p) => p === pending).length >= 2) break;
    }
    const reply = ASK_LOOP.find(([prefix]) => prefix === pending)?.[1];
    if (reply === undefined) break;
    answered.push(pending);
    await sendText(page, reply);
    await sleep(1_600);
  }
  const noPending = (await lastPendingQuestion(page, ASK_PREFIXES)) === null;
  const distinctAnswered = [...new Set(answered)];
  const complete = noPending && distinctAnswered.length === 9;
  recordStep(`${phase}-4`, "the nine-field guided intake completes through the conversation (all nine distinct answers captured, no question pending)", complete ? "PASS" : "FAIL",
    `distinctAnswered=${distinctAnswered.length}/9 pendingRemaining=${!noPending}`);
  await shot(`p21-d-cdp-${phase}-4-intake-complete.png`);

  return { capabilityOk, modelOk, seeded, complete, answeredCount: answered.length };
}

async function presentPreviewAndReadGates(page, shot, phase) {
  // (5) The missions board → the detail → "Present the structured preview".
  const minimize = page.getByRole("button", { name: /^Minimize$/i }).first();
  if (await minimize.isVisible().catch(() => false)) {
    await minimize.click();
    await sleep(1_000);
  }
  const missionsChip = page.locator("[data-testid='ps-agent-entry-missions']").first();
  await missionsChip.waitFor({ state: "visible", timeout: 15_000 });
  await missionsChip.click();
  await sleep(2_000);
  const missionCard = page.getByText("Pay merchant X").first();
  await missionCard.waitFor({ state: "visible", timeout: 15_000 });
  await missionCard.click();
  await sleep(2_500);
  const present = page.getByRole("button", { name: /present the structured preview/i }).first();
  await present.waitFor({ state: "visible", timeout: 15_000 });
  await present.click();
  const blocked = await until(async () => {
    const board = await page.evaluate(() => document.querySelector("[class*='missions']")?.textContent ?? "");
    return board.includes("Structured preview presented") && board.includes("BLOCKED");
  }, 12_000);
  const boardText = await page.evaluate(() => document.querySelector("[class*='missions']")?.textContent ?? "");
  const missingGates = GATE_FRAGMENTS.filter((fragment) => !boardText.includes(fragment));
  recordStep(`${phase}-5`, "the structured preview presents the honest typed BLOCK (all six gate reasons verbatim, zero connections)",
    blocked && missingGates.length === 0 ? "PASS" : "FAIL",
    missingGates.length === 0 ? "all six gate reasons rendered verbatim" : `missing: ${missingGates.join(" | ")}`);
  await shot(`p21-d-cdp-${phase}-5-blocked-preview.png`);
  return { blocked, missingGates };
}

async function checkStageChecklistAndRoutes(page, shot, phase) {
  // (6) The composer's stage checklist: the REAL derived rows (never the
  //     "not wired" lie over a bound plane) + the route section's honest state.
  await openComposer(page);
  await sleep(1_500);
  const text = await panelText(page);
  const stagesAt = text.indexOf("Routine stages");
  const stagesSection = text.slice(stagesAt, stagesAt + 1_400);
  const notWired = stagesSection.includes("not wired in this deployment");
  const routeAt = text.indexOf("Route planning");
  const routeSection = text.slice(routeAt, routeAt + 600);
  const routeHonest = routeSection.includes("No validated payment intent yet");
  recordStep(`${phase}-6`, "the stage checklist derives from the mission's typed timeline (not the unbound note) and route planning states the honest no-intent truth",
    !notWired && routeHonest ? "PASS" : "FAIL",
    `stageChecklist=${notWired ? "UNBOUND-LIE" : "derived"}, routePlanning=${routeHonest ? "no-validated-intent" : "unexpected"}`);
  await shot(`p21-d-cdp-${phase}-6-stage-checklist.png`);
  return { notWired, routeHonest };
}

/* --------------------------------- main --------------------------------- */

ensureAssetsDir();
const startedAt = Date.now();
try {
  const userDataDir = `/tmp/payswap-cdp-journey-${Date.now()}`;
  mkdirSync(userDataDir, { recursive: true });
  setJourneyUserDataDir(userDataDir);

  // Launch 1 — the journey.
  launchElectron(WORKSPACE);
  if (!(await waitCdp())) throw new Error("CDP did not come up on 9229");
  const first = await connectPage();
  const shot1 = makeShot(first.page);
  await first.page.waitForTimeout(3_000);

  const journey = await driveJourney(first.page, shot1, "run1");
  const preview = await presentPreviewAndReadGates(first.page, shot1, "run1");
  await checkStageChecklistAndRoutes(first.page, shot1, "run1");

  const missionStorePath = resolve(userDataDir, "payments/payment-missions.json");
  const missionStoreBefore = existsSync(missionStorePath) ? readUserDataFile("payments/payment-missions.json") : "";
  const storeOk = missionStoreBefore.includes("Pay merchant X") && missionStoreBefore.includes("PREVIEW_PRESENTED");
  recordStep("run1-7", "the mission store persists the journey under the isolated userData (DRAFT mission + PREVIEW_PRESENTED)",
    storeOk ? "PASS" : "FAIL", `${userDataDir}/payments/payment-missions.json`);

  // Launch 2 — the persistence law (quit + relaunch on the SAME userData).
  await stopElectron();
  await sleep(2_000);
  launchElectron(WORKSPACE);
  if (!(await waitCdp())) throw new Error("CDP did not come up on 9229 after relaunch");
  const second = await connectPage();
  const shot2 = makeShot(second.page);
  // The relaunch boot is slower (profile restore): wait for the app's own
  // welcome surface before driving the composer.
  await until(async () => {
    const body = await second.page.evaluate(() => document.body?.innerText?.slice(0, 400) ?? "").catch(() => "");
    return body.length > 0;
  }, 30_000);
  await second.page.waitForTimeout(6_000);

  await openComposer(second.page);
  const persistedText = await panelText(second.page);
  const taskSurvived = persistedText.includes("Pay request") && persistedText.includes("Payment mission · Pay");
  const historySurvived = persistedText.includes("Pay merchant X");
  recordStep("run2-1", "PERSISTENCE: the task + the conversation survive the app quit/relaunch on the same profile",
    taskSurvived && historySurvived ? "PASS" : "FAIL",
    `task=${taskSurvived}, conversation=${historySurvived}`);
  await shot2("p21-d-cdp-run2-1-persisted-composer.png");

  // The missions board still lists the mission after relaunch.
  const minimize2 = second.page.getByRole("button", { name: /^Minimize$/i }).first();
  if (await minimize2.isVisible().catch(() => false)) {
    await minimize2.click();
    await sleep(1_000);
  }
  const chip2 = second.page.locator("[data-testid='ps-agent-entry-missions']").first();
  await chip2.waitFor({ state: "visible", timeout: 15_000 });
  await chip2.click();
  await sleep(2_500);
  const board2 = await second.page.evaluate(() => document.querySelector("[class*='missions']")?.textContent ?? "");
  const missionSurvived = board2.includes("Pay merchant X") && board2.includes("DRAFT");
  recordStep("run2-2", "PERSISTENCE: the mission board lists the DRAFT mission with its timeline after relaunch",
    missionSurvived ? "PASS" : "FAIL", missionSurvived ? "the mission + timeline survived" : board2.slice(0, 160));
  await shot2("p21-d-cdp-run2-2-persisted-board.png");

  await second.cdp.close();

  // The receipt (secret-free, machine-scanned).
  const failed = journeySteps().filter((step) => step.status === "FAIL");
  const receipt = {
    harness: "scripts/p21/desktop-cdp-journey.mjs + scripts/p21/cdp-harness-lib.mjs (the P21-D Electron CDP desktop journey — the E2E law's desktop half)",
    ranAt: RAN_AT,
    durationMs: Date.now() - startedAt,
    appRuntime: {
      tier: "the desktop dev-tier runtime (tsup-built main/host/preload + the vite-built renderer — unminified, the sandbox memory cap — over file://)",
      launchRecipe: "electron . --no-sandbox --disable-dev-shm-usage --open-workspace <workspace> (CDP 9229, Xvfb :99, isolated ZCODE_DESKTOP_USER_DATA_DIR)",
      isolatedUserDataDir: userDataDir.replace(/^\/tmp\/payswap-cdp-journey-\d+$/, "<journey-scoped>"),
      workspace: WORKSPACE,
    },
    honestScope: "zero provider credentials in this run — the execution leg is operator-gated (the accepted a51a30c rail-evidence receipt covers the real-dispatch tier); this journey proves the REAL renderer + REAL host runtime render the ordered journey with the honest typed outcomes",
    steps: journeySteps(),
    screenshots: journeyShots(),
    journeySummary: {
      askLoopFieldsCaptured: journey.answeredCount,
      previewOutcome: "BLOCKED (the typed six-gate truth for a zero-connection deployment)",
      persistence: taskSurvived && historySurvived && missionSurvived ? "SURVIVED" : "BROKEN",
    },
  };
  const receiptText = JSON.stringify(receipt, null, 2);
  const scanFindings = scanForSecretShapes(receiptText);
  receipt.secretScan = {
    patterns: ["sk_live_*", "sk_test_*", "pk_live_*", "pk_test_*", "whsec_*", "Bearer *", "PRIVATE KEY blocks"],
    findings: scanFindings,
    result: scanFindings.length === 0 ? "CLEAN (no secret-shaped material in this receipt)" : "FAILED",
  };
  if (scanFindings.length > 0) {
    recordStep("scan", "the receipt secret-shape scan", "FAIL", `findings: ${scanFindings.join(", ")}`);
  }
  writeFileSync(RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  console.log(`\nreceipt: ${RECEIPT_PATH}`);
  console.log(`steps: ${journeySteps().filter((s) => s.status === "PASS").length} PASS / ${failed.length} FAIL`);
  process.exitCode = failed.length === 0 && scanFindings.length === 0 ? 0 : 1;
} finally {
  await stopElectron();
}
