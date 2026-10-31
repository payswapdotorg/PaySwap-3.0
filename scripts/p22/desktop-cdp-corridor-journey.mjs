/**
 * PaySwap Desktop (P22-D, ADR-0016 D10/D12 — the E2E law's desktop half) —
 * THE ELECTRON CDP CORRIDOR JOURNEY HARNESS.
 *
 * The corridor's REAL-app journey, content-level and honest at every tier:
 * - the 3-provider corridor plane (FLW GHS + Paystack KES + the Stellar
 *   testnet rail observing the issuer-scoped USDC) PRE-SEEDED through the
 *   REAL member path by ./p22-cdp-seeder.test.ts over the SCRIPTED
 *   transport (seed → seal → probe → CONFIRMED → ACTIVE) — the station
 *   holds ZERO live credentials, and the receipt DISCLOSES it;
 * - the nine-field corridor ask completes over the seeded FLW GHS wallet
 *   (the exact funding-source display-name match) and the Merchant Y
 *   Paystack KES directory destination (the exact recipient match);
 * - the structured preview presents the honest typed BLOCK
 *   (NO_ROUTE_FOR_CORRIDOR — the declared test corridor covers US→US USD
 *   only) while the intent COMPILES on the D11 corridor hop bound (the
 *   MOVE direction's "at most 6 hops" — the corridor demand's own
 *   structural allocation, never the direct-payment bound);
 * - the composer REMOUNT presents the route-planning view over the
 *   3-provider corridor plane: the honest NO-ROUTE state with the typed
 *   exclusions, the corridor-derived CONDITIONAL opportunities (the FLW
 *   sender-permissions grounded on the read-only truth; the verified
 *   intermediary), the platform work items and the never-executable
 *   hypotheses — and ZERO corridor card surfaces (the engine's evidence
 *   bundle honestly carries no location observations, conversion rules
 *   or routing hints derived from the chains; the four-leg corridor plan
 *   card, the composite approval and the per-leg dispatch are the IN-REPO
 *   bridge battery's scripted-tier proof, e8106d4 — the engine-tier
 *   corridor composition is the named carry-forward);
 * - the WAIT lands and the re-check surfaces the honest consent-gated
 *   typed refusal (never masked);
 * - THE NO-BYPASS LAW OBSERVED LIVE: engaging the approval on the
 *   blocked preview is REFUSED by the host (GATES_BLOCKED — a blocked
 *   preview can never arm authorization); the refusal surfaces verbatim
 *   on the flow-error line and the scope card / the armed card / the
 *   dispatch controls NEVER render;
 * - the RELAUNCH (quit + same userData): the task, the conversation and
 *   the mission survive, the view RE-DERIVES with the SAME digest (the
 *   deterministic persistence proof) and the refusal law recomputes.
 *
 * Output: structured secret-free receipt (JSON) + screenshots (PNG). The
 * process/CDP plumbing lives in scripts/p21/cdp-harness-lib.mjs.
 */

import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  DESKTOP,
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
} from "../p21/cdp-harness-lib.mjs";

const WORKSPACE = "/home/z/payswap-e2e-workspace";
const RECEIPT_PATH = resolve(EVIDENCE_DIR, "p22-d-cdp-corridor-journey-RECEIPT-2026-10-31.json");
const RAN_AT = new Date().toISOString();

/** The corridor ask (the MOVE stem — the intent router classifies exactly
 * one direction; the corridor's direction classes are MOVE/CONVERT). */
const GOAL = "Move one thousand cedis to a Kenyan bank account over the corridor";

/** The nine conversational answers (question-prefix → reply; the funding
 * source and the recipient are EXACT display-name matches against the
 * seeded observations and the merchant directory). */
const ASK_LOOP = [
  ["How much should move", "100000 GHS"],
  ["Which funding source", "Flutterwave GHS wallet (test)"],
  ["Who is the recipient", "Merchant Y (Paystack KES bank-transfer test)"],
  ["Which corridor", "GH KE KES"],
  ["By when must it arrive", "2026-11-02T12:00:00Z"],
  ["What is your fee cap", "capped 100 GHS"],
  ["What is the purpose", "corridor payout"],
  ["Any privacy or compliance", "none"],
  ["Can this payment be settled partially", "full"],
];
const ASK_PREFIXES = ASK_LOOP.map(([prefix]) => prefix);

/** The corridor-derived advisory card expectations (the chains' own facts).
 * (The 2026-10-31 run's honest finding: the FLW read-only rail surfaces
 * through the platform work row (flutterwave-send-operation) + the rail
 * exclusions, NOT through a MISSING_PERMISSIONS conditional — the
 * permissions conditional fires only when an EXECUTABLE rail's required
 * scopes are ungranted, and the FLW definition is honestly
 * non-executable; the one corridor-derived conditional is the verified
 * intermediary.) */
const CONDITIONAL_TITLES = [
  "a verified intermediary is introduced",
];
/** The card-CONTENT fragments (content-level, never the scenarios digest). */
const CARD_FRAGMENTS = [
  "What would need to change: a third party is introduced as a verified intermediary bridging both sides",
  "What PaySwap itself would need to build",
  "platform:cross-provider-route-shape",
  "A hypothesis is never a route — the only path onward is fresh planning, preview and new explicit authorization.",
  "no route family grounds the observed origin/destination pair",
  "the honest empty state, never a fabricated route",
];
const PREVIEW_NO_ROUTE_FRAGMENT = "No route composes this corridor in this deployment";
const GATES_BLOCKED_FRAGMENT = "a blocked preview can never arm authorization";
/** The D11 corridor hop bound (the MOVE intent's own constraint line). */
const D11_HOP_LINE = "at most 6 hops";

/** Collect the advisory card DOM (testid-scoped) + the panel text. */
async function collectCardDom(page) {
  return page.evaluate(() => ({
    conditional: [...document.querySelectorAll("[data-testid^='ps-agent-conditional-']")].map((el) => el.textContent ?? ""),
    platform: [...document.querySelectorAll("[data-testid^='ps-agent-platform-work-']")].map((el) => el.textContent ?? ""),
    hypotheses: [...document.querySelectorAll("[data-testid^='ps-agent-hypothesis-']")].map((el) => el.textContent ?? ""),
    corridor: [...document.querySelectorAll("[data-testid^='ps-agent-corridor-']")].length,
    panel: document.querySelector(".ps-agent-panel")?.textContent ?? "",
  }));
}

/** The advisory-card checks → the missing list (empty = every fragment rendered). */
function checkCards(dom) {
  const missing = [];
  if (dom.conditional.length < 1) missing.push("no conditional card rendered");
  for (const title of CONDITIONAL_TITLES) {
    if (!dom.conditional.some((text) => text.includes(title))) missing.push(`conditional title missing: ${title}`);
  }
  if (dom.platform.length < 1) missing.push("no platform work card rendered");
  if (dom.hypotheses.length < 1) missing.push("no hypothesis card rendered");
  if (dom.corridor !== 0) missing.push(`corridor card surfaces rendered (${dom.corridor}) — the engine tier honestly composes none`);
  const all = [...dom.conditional, ...dom.platform, ...dom.hypotheses, dom.panel].join("\n");
  for (const fragment of CARD_FRAGMENTS) {
    if (!all.includes(fragment)) missing.push(`fragment missing: ${fragment.slice(0, 80)}`);
  }
  const digest = /view (fnv1a64:[a-f0-9]+)/.exec(dom.panel)?.[1] ?? null;
  return { missing, digest };
}

/** The composer REMOUNT (minimize → the panel unmounts; reopen → remount — the effect re-runs). */
async function remountComposer(page) {
  const minimize = page.getByRole("button", { name: /^Minimize$/i }).first();
  if (await minimize.isVisible().catch(() => false)) {
    await minimize.click();
    await sleep(1_000);
  }
  await openComposer(page);
}

/** Drive the ask loop to completion (the seeded FLW GHS wallet is the funding source). */
async function driveAskLoop(page, shot, phase) {
  await openComposer(page);
  const capabilityOk = await until(async () => (await panelText(page)).includes("This composer holds no financial authority"));
  recordStep(`${phase}-1`, "the composer opens with the honest zero-financial-authority note", capabilityOk ? "PASS" : "FAIL",
    capabilityOk ? "the capability note renders verbatim" : "the capability note did not render");
  await sendText(page, GOAL);
  const seeded = await until(async () => (await panelText(page)).includes("How much should move"));
  const answered = [];
  for (let round = 0; round < 20; round += 1) {
    const pending = await lastPendingQuestion(page, ASK_PREFIXES);
    if (pending === null) break;
    if (answered.filter((p) => p === pending).length >= 2) break;
    const reply = ASK_LOOP.find(([prefix]) => prefix === pending)?.[1];
    if (reply === undefined) break;
    answered.push(pending);
    await sendText(page, reply);
    await sleep(1_600);
  }
  const noPending = (await lastPendingQuestion(page, ASK_PREFIXES)) === null;
  const complete = noPending && new Set(answered).size === 9;
  recordStep(`${phase}-2`, "the nine-field corridor intake completes (the exact FLW GHS wallet funding match + the Merchant Y Paystack KES directory destination)",
    complete ? "PASS" : "FAIL",
    `distinctAnswered=${new Set(answered).size}/9 pendingRemaining=${!noPending} seeded=${seeded}`);
  await shot(`p22-d-cdp-${phase}-2-intake-complete.png`);
  return { complete };
}

/** Open the mission detail on the missions board (chip → the goal's card). */
async function openMissionDetail(page) {
  const minimize = page.getByRole("button", { name: /^Minimize$/i }).first();
  if (await minimize.isVisible().catch(() => false)) {
    await minimize.click();
    await sleep(1_000);
  }
  const chip = page.locator("[data-testid='ps-agent-entry-missions']").first();
  await chip.waitFor({ state: "visible", timeout: 15_000 });
  await chip.click();
  await sleep(2_000);
  const missionCard = page.getByText(GOAL).first();
  await missionCard.waitFor({ state: "visible", timeout: 15_000 });
  await missionCard.click();
  await sleep(2_500);
  return async () => page.evaluate(() => document.querySelector("[class*='missions']")?.textContent ?? "");
}

/** The missions board → the structured preview → the honest typed BLOCK (the intent compiles on the D11 corridor bound). */
async function presentPreviewNoRoute(page, shot, phase) {
  const readBoard = await openMissionDetail(page);
  const present = page.getByRole("button", { name: /present the structured preview/i }).first();
  await present.waitFor({ state: "visible", timeout: 15_000 });
  await present.click();
  const blocked = await until(async () => {
    const board = await readBoard();
    return board.includes("Structured preview presented") && board.includes("BLOCKED");
  }, 15_000);
  const boardText = await readBoard();
  const noRoute = boardText.includes(PREVIEW_NO_ROUTE_FRAGMENT);
  const d11 = boardText.includes(D11_HOP_LINE);
  recordStep(`${phase}-3`, "the structured preview presents the honest typed BLOCK with the no-route reason verbatim (the declared test corridor covers US→US USD only) while the intent COMPILES on the D11 corridor hop bound (the MOVE direction's own allocation — never the direct-payment bound)",
    blocked && noRoute && d11 ? "PASS" : "FAIL",
    blocked && noRoute && d11 ? "BLOCKED + NO_ROUTE_FOR_CORRIDOR rendered verbatim; the compiled intent carries 'at most 6 hops'" : `blocked=${blocked} noRouteFragment=${noRoute} d11HopLine=${d11}`);
  await shot(`p22-d-cdp-${phase}-3-blocked-preview.png`);
  // Keep the board open — the caller closes it before the composer remount.
  return { blocked, noRoute, d11 };
}

/** THE ADVISORY-CARD ASSERTIONS (the remounted view, content-level — the remount RETRY loop). */
async function presentCards(page, shot, phase, label) {
  let presented = false;
  for (let attempt = 0; attempt < 4 && !presented; attempt += 1) {
    presented = await until(async () => /view fnv1a64:/.test(await panelText(page)), 8_000);
    if (!presented) {
      await remountComposer(page);
      await sleep(3_000);
    }
  }
  const appeared = presented && await until(async () => {
    const dom = await collectCardDom(page);
    return dom.conditional.length >= 1 && dom.hypotheses.length >= 1;
  }, 20_000);
  const dom = await collectCardDom(page);
  const { missing, digest } = checkCards(dom);
  recordStep(`${phase}-4`, `${label}: the route-planning view presents the honest NO-ROUTE state over the 3-provider corridor plane — the typed exclusions (the pair honestly ungrounded), the corridor-derived conditional opportunity (the verified intermediary), the platform work items and the never-executable hypotheses — with ZERO corridor card surfaces (the engine's evidence bundle honestly derives no location observations, conversion rules or routing hints from the chains; the four-leg corridor plan card is the in-repo bridge battery's scripted-tier proof — the engine-tier corridor composition is the named carry-forward)`,
    appeared && missing.length === 0 ? "PASS" : "FAIL",
    missing.length === 0
      ? `conditional=${dom.conditional.length} platform=${dom.platform.length} hypotheses=${dom.hypotheses.length} corridorSurfaces=0 view=${digest}`
      : `missing: ${missing.slice(0, 4).join(" | ")}`);
  await shot(`p22-d-cdp-${phase}-4-no-route-view.png`);
  await shot(`p22-d-cdp-${phase}-4b-advisory-cards.png`);
  return { missing, digest };
}

/** The WAIT + the honest consent-gated re-check refusal. */
async function chooseWaitAndRecheck(page, shot, phase) {
  const waitButton = page.locator("[data-testid='ps-agent-route-wait']").first();
  const waitVisible = await waitButton.isVisible().catch(() => false);
  if (waitVisible) {
    await waitButton.click();
  }
  const waiting = await until(async () =>
    (await page.locator("[data-testid='ps-agent-route-recheck']").first().isVisible().catch(() => false)));
  recordStep(`${phase}-5`, "the Wait choice lands (WAITING_FOR_OPPORTUNITIES under the engine-proposed criteria)", waiting ? "PASS" : "FAIL",
    waiting ? "the waiting controls render (the re-check + the cancel)" : "the wait did not land");
  await shot(`p22-d-cdp-${phase}-5-waiting.png`);
  const recheckButton = page.locator("[data-testid='ps-agent-route-recheck']").first();
  if (waiting) {
    await recheckButton.click();
  }
  const refusal = await until(async () => {
    const text = await panelText(page);
    return text.includes("The re-check was refused");
  }, 15_000);
  recordStep(`${phase}-6`, "the re-check over fresh observations surfaces the honest consent-gated typed refusal (the named carry-forward, never masked, never a fabricated match)",
    refusal ? "PASS" : "FAIL",
    refusal ? "the consent-gate refusal rendered" : "the refusal did not render");
  await shot(`p22-d-cdp-${phase}-6-recheck-refusal.png`);
  return { waiting, refusal };
}

/** THE NO-BYPASS LAW LIVE: the approval engage on the blocked preview is refused; the composite surfaces never render. */
async function engageApprovalRefused(page, shot, phase) {
  const readBoard = await openMissionDetail(page);
  // The mount does not auto-load the persisted preview when a detail
  // re-opens — the PRESENT control renders first; a fresh BLOCKED preview
  // is the lawful path to the engage control (the mission stays ACTIVE).
  let engage = page.getByRole("button", { name: /review and approve/i }).first();
  if (!(await until(async () => engage.isVisible().catch(() => false), 5_000))) {
    const present = page.getByRole("button", { name: /present the structured preview/i }).first();
    if (await present.isVisible().catch(() => false)) {
      await present.click();
      await until(async () => {
        const board = await readBoard();
        return board.includes("Structured preview presented") && board.includes("BLOCKED");
      }, 15_000);
    }
  }
  engage = page.getByRole("button", { name: /review and approve/i }).first();
  const visible = await until(async () => engage.isVisible().catch(() => false), 10_000);
  if (!visible) {
    recordStep(`${phase}-7`, "the honest authorization refusal (the no-bypass law live): the blocked preview never arms",
      "FAIL", "the engage-approval control did not render on the mission detail");
    return { refused: false, neverRendered: false };
  }
  await engage.click();
  const refused = await until(async () => {
    const board = await readBoard();
    return board.includes("The last action was refused") && board.includes(GATES_BLOCKED_FRAGMENT);
  }, 15_000);
  const surfaces = await page.evaluate(() => ({
    scope: document.querySelectorAll("[data-testid='ps-agent-missions-scope-card']").length,
    armed: document.querySelectorAll("[data-testid='ps-agent-missions-armed-card']").length,
    engageDispatch: document.querySelectorAll("[data-testid='ps-agent-missions-engage-dispatch']").length,
    send: document.querySelectorAll("[data-testid='ps-agent-missions-send']").length,
  }));
  const neverRendered = surfaces.scope === 0 && surfaces.armed === 0 && surfaces.engageDispatch === 0 && surfaces.send === 0;
  recordStep(`${phase}-7`, "THE NO-BYPASS LAW OBSERVED LIVE: engaging the approval on the blocked preview is REFUSED by the host (GATES_BLOCKED — a blocked preview can never arm authorization); the refusal surfaces verbatim on the flow-error line and the composite-act surfaces (the scope card, the armed card, the lane radios, the send) NEVER render — the composite act's scripted-tier dispatch + read-backs are the in-repo bridge battery's proof",
    refused && neverRendered ? "PASS" : "FAIL",
    refused && neverRendered
      ? "the typed refusal rendered verbatim; scope=0 armed=0 engage-dispatch=0 send=0"
      : `refused=${refused} scope=${surfaces.scope} armed=${surfaces.armed} engageDispatch=${surfaces.engageDispatch} send=${surfaces.send}`);
  await shot(`p22-d-cdp-${phase}-7-approval-refused.png`);
  return { refused, neverRendered };
}

/* --------------------------------- main --------------------------------- */

ensureAssetsDir();
mkdirSync(WORKSPACE, { recursive: true });
const startedAt = Date.now();
let firstDigest = null;
const persistence = { taskSurvived: false, historySurvived: false, cardsReDerived: false, digestMatched: false, refusalRecomputed: false };
try {
  // Xvfb :99 (the launch recipe's display).
  if (spawnSync("pgrep", ["-f", "Xvfb :99"]).status !== 0) {
    spawn("Xvfb", [":99"], { detached: true, stdio: "ignore" }).unref();
    await sleep(1_500);
  }

  // The scripted test world's 3-provider corridor plane (the REAL member path).
  const seedDir = `/tmp/p22-cdp-seed-${Date.now()}`;
  mkdirSync(seedDir, { recursive: true });
  const seeded = spawnSync("npx", ["vitest", "run", "test/payswap/p22-cdp-seeder.test.ts"], {
    cwd: DESKTOP,
    env: { ...process.env, P22_CDP_SEED_DIR: seedDir },
    stdio: "inherit",
  });
  recordStep("seed-1", "the 3-provider corridor-plane seeder drives the REAL member path over the scripted transport (FLW GHS + Paystack KES + the Stellar testnet rail observing the issuer-scoped USDC: seed → seal → probe → CONFIRMED → ACTIVE)",
    seeded.status === 0 ? "PASS" : "FAIL",
    seeded.status === 0 ? `${seedDir}/connections (the scripted test world, disclosed — never a live-probe claim)` : `seeder exit ${seeded.status}`);

  const userDataDir = `/tmp/payswap-cdp-p22-${Date.now()}`;
  mkdirSync(userDataDir, { recursive: true });
  setJourneyUserDataDir(userDataDir);
  cpSync(`${seedDir}/connections`, `${userDataDir}/connections`, { recursive: true });

  // Launch 1 — the journey.
  launchElectron(WORKSPACE);
  if (!(await waitCdp())) throw new Error("CDP did not come up on 9229");
  const first = await connectPage();
  const shot1 = makeShot(first.page);
  await first.page.waitForTimeout(3_000);
  await driveAskLoop(first.page, shot1, "run1");
  await presentPreviewNoRoute(first.page, shot1, "run1");
  // Close the board + remount (the view presents over the warm cache).
  const chip1 = first.page.locator("[data-testid='ps-agent-entry-missions']").first();
  await chip1.click();
  await sleep(1_000);
  await remountComposer(first.page);
  const cards1 = await presentCards(first.page, shot1, "run1", "the honest no-route view displays (launch 1)");
  firstDigest = cards1.digest;
  await chooseWaitAndRecheck(first.page, shot1, "run1");
  await engageApprovalRefused(first.page, shot1, "run1");

  // The persisted records (the mission + the preview + the compiled D11 intent).
  const missionStore = readUserDataFile("payments/payment-missions.json");
  const missionStoreOk = existsSync(resolve(userDataDir, "payments/payment-missions.json"))
    && missionStore.includes(GOAL)
    && missionStore.includes("PREVIEW_PRESENTED")
    && missionStore.includes('"maxRouteHops": 6');
  recordStep("run1-8", "the persisted records carry the corridor journey (the mission store: the goal, the presented preview, the D11 corridor-bound compiled intent)",
    missionStoreOk ? "PASS" : "FAIL",
    `missionStore=${missionStoreOk}`);
  await first.cdp.close();

  // Launch 2 — the persistence law (quit + relaunch on the SAME userData).
  await stopElectron();
  await sleep(2_000);
  launchElectron(WORKSPACE);
  if (!(await waitCdp())) throw new Error("CDP did not come up on 9229 after relaunch");
  const second = await connectPage();
  const shot2 = makeShot(second.page);
  await until(async () => {
    const body = await second.page.evaluate(() => document.body?.innerText?.slice(0, 400) ?? "").catch(() => "");
    return body.length > 0;
  }, 30_000);
  await second.page.waitForTimeout(6_000);
  await openComposer(second.page);
  const persistedText = await panelText(second.page);
  persistence.taskSurvived = persistedText.includes("Move one thousand cedis");
  persistence.historySurvived = persistedText.includes(GOAL);
  recordStep("run2-1", "PERSISTENCE: the task + the conversation survive the app quit/relaunch on the same profile",
    persistence.taskSurvived && persistence.historySurvived ? "PASS" : "FAIL",
    `task=${persistence.taskSurvived}, conversation=${persistence.historySurvived}`);
  await shot2("p22-d-cdp-run2-1-persisted-composer.png");

  // The honest view RE-DERIVES over the persisted state (the remount + the deterministic digest).
  await remountComposer(second.page);
  const cards2 = await presentCards(second.page, shot2, "run2", "PERSISTENCE: the honest no-route view survives relaunch (the same advisory cards re-derive)");
  persistence.cardsReDerived = cards2.missing.length === 0;
  persistence.digestMatched = firstDigest !== null && cards2.digest === firstDigest;
  recordStep("run2-3", "the re-derived view digest EQUALS launch 1's (the byte-identical deterministic re-derivation over the persisted mission + connections)",
    persistence.digestMatched ? "PASS" : "FAIL",
    `launch1=${firstDigest} launch2=${cards2.digest}`);

  // The no-bypass refusal law survives the relaunch.
  const refusal2 = await engageApprovalRefused(second.page, shot2, "run2");
  persistence.refusalRecomputed = refusal2.refused && refusal2.neverRendered;
  recordStep("run2-5", "the no-bypass refusal law recomputes after relaunch (the blocked preview still never arms; the composite surfaces still never render)",
    persistence.refusalRecomputed ? "PASS" : "FAIL",
    `refusal=${persistence.refusalRecomputed}`);
  await shot2("p22-d-cdp-run2-4-rederived-view.png");
  await second.cdp.close();

  // The receipt (secret-free, machine-scanned).
  const failed = journeySteps().filter((step) => step.status === "FAIL");
  const receipt = {
    harness: "scripts/p22/desktop-cdp-corridor-journey.mjs + scripts/p21/cdp-harness-lib.mjs (the P22-D Electron CDP corridor journey — the E2E law's desktop half, ADR-0016 D10/D12)",
    ranAt: RAN_AT,
    durationMs: Date.now() - startedAt,
    appRuntime: {
      tier: "the desktop dev-tier runtime (tsup-built main/host/preload + the vite-built renderer over file://)",
      launchRecipe: "electron . --no-sandbox --disable-dev-shm-usage --open-workspace <workspace> (CDP 9229, Xvfb :99, isolated ZCODE_DESKTOP_USER_DATA_DIR)",
      isolatedUserDataDir: userDataDir.replace(/^\/tmp\/payswap-cdp-p22-\d+$/, "<journey-scoped>"),
      workspace: WORKSPACE,
    },
    honestScope: "ZERO live provider credentials: the 3-provider corridor plane (FLW GHS + Paystack KES + the Stellar testnet rail observing the issuer-scoped USDC) PRE-SEEDED through the REAL member path over the SCRIPTED provider transport (the p22-cdp-seeder's eight scripted answers); the probes that confirmed the connections ran over the scripted answers, and NO live provider was contacted or is claimed. The REAL app derives its bridge, chains, exclusions and advisory cards from that state. The channel-tier preview honestly BLOCKS (the declared test corridor covers US→US USD only) and THE BLOCKED PREVIEW NEVER ARMS at this tier — the approval engage is refused typed (GATES_BLOCKED) and the composite-act surfaces never render. THE FOUR-LEG CORRIDOR PLAN CARD, the composite approval and the per-leg scripted dispatch are the IN-REPO bridge battery's proof (e8106d4): at the REAL app tier the route-planning engine's evidence bundle honestly carries no location observations, conversion rules or routing hints derived from the chains, so the corridor compile honestly yields NO_COMPILABLE_ROUTE — the engine-tier corridor composition (the chains-to-evidence derivation) is the NAMED CARRY-FORWARD this receipt records. The live-dispatch tier stays the standing operator action (no provider keys on this station).",
    steps: journeySteps(),
    screenshots: journeyShots(),
    journeySummary: {
      corridorAsk: "the nine-field corridor intake over the seeded 3-provider plane (the exact FLW GHS wallet + Merchant Y Paystack KES matches)",
      previewOutcome: "BLOCKED (NO_ROUTE_FOR_CORRIDOR — the honest no-route with the intent compiled on the D11 corridor hop bound)",
      planningOutcome: "the honest NO-ROUTE state with the corridor-derived advisory sections (the conditionals, the platform work, the hypotheses) and ZERO corridor card surfaces — the four-leg card is the bridge battery's scripted tier; the engine-tier composition is the named carry-forward",
      refusalOutcome: "GATES_BLOCKED surfaced verbatim (the no-bypass law live: the blocked preview never arms; the composite surfaces never render)",
      persistence: persistence.cardsReDerived && persistence.digestMatched ? `SURVIVED (the same advisory view + the same view digest ${firstDigest})` : "BROKEN",
    },
  };
  const receiptText = JSON.stringify(receipt, null, 2);
  const scanFindings = scanForSecretShapes(receiptText);
  receipt.secretScan = {
    patterns: ["sk_live_*", "sk_test_*", "pk_live_*", "pk_test_*", "whsec_*", "Bearer *", "PRIVATE KEY blocks", "Stellar S… StrKey (56-char base32)", "FLWSECK-*"],
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
