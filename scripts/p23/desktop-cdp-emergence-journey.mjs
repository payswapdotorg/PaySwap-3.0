/**
 * PaySwap Desktop (P23-D, ADR-0015 D10 — the E2E law's desktop half) —
 * THE ELECTRON CDP EMERGENCE JOURNEY HARNESS.
 *
 * The reviewer's core finding closed at the REAL app tier: the conditional
 * opportunities, the platform work items and the multi-hop hypotheses are
 * DISPLAYED as actionable cards in the REAL renderer (the P21-0 D7
 * conflation — the scenarios-digest list standing in for opportunity
 * presentation — corrected: every assertion below is CARD-SHAPED and
 * content-level, over [data-testid^='ps-agent-conditional-'] /
 * ps-agent-platform-work- / ps-agent-hypothesis-).
 *
 * THE JOURNEY (the REAL app over the scripted test world's connected state):
 * - the connection plane PRE-SEEDED through the REAL member path by
 *   ./p23-cdp-seeder.test.ts (seed → seal → the read-only probe over the
 *   SCRIPTED transport → CONFIRMED → ACTIVE) — the station holds ZERO live
 *   credentials and the probe transports hardcode the real endpoints, so
 *   the scripted-test-world tier (the bridge battery's own six answers) is
 *   the honest way the no-route corridor composes; the receipt DISCLOSES it
 *   and never claims a live probe;
 * - the ask loop completes over the seeded funding source → the structured
 *   preview presents the honest typed BLOCK (NO_ROUTE_FOR_CORRIDOR) while
 *   the intent COMPILES;
 * - the composer REMOUNT (minimize → reopen — the panel unmounts/remounts,
 *   the mount effect re-runs against the warm mission cache) presents the
 *   route-planning view: ≥3 MEANINGFULLY DIFFERENT repair kinds displayed —
 *   the party changes (the service chains' OWN facts: the sender
 *   permissions + the intermediary, the chains-binding law), the platform
 *   work items (evidenced), the multi-hop hypotheses (never executable) —
 *   with the people-language preconditions, the DISTINCT platform
 *   prerequisites, the UNVERIFIED badges with the honest reasons, the
 *   wait-criteria naming the CONCRETE preconditions and the honest
 *   zero-model note;
 * - the WAIT lands; the re-check surfaces the honest consent-gated typed
 *   refusal (the named carry-forward, never masked);
 * - the RELAUNCH (quit + same userData): the task, the conversation and the
 *   mission survive, the cards RE-DERIVE over the persisted state with the
 *   SAME view digest (the deterministic persistence proof), and the
 *   re-check refusal recomputes.
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
const RECEIPT_PATH = resolve(EVIDENCE_DIR, "p23-d-cdp-emergence-journey-RECEIPT-2026-10-29.json");
const RAN_AT = new Date().toISOString();

/** The nine conversational answers (question-prefix → reply). */
const ASK_LOOP = [
  ["How much should move", "50000000 NGN"],
  ["Which funding source", "Flutterwave NGN wallet (test)"],
  ["Who is the recipient", "Merchant X (Stripe-only test)"],
  ["Which corridor", "NG US USD"],
  ["By when must it arrive", "2026-10-30T12:00:00Z"],
  ["What is your fee cap", "capped 100 USD"],
  ["What is the purpose", "supplier invoice 42"],
  ["Any privacy or compliance", "none"],
  ["Can this payment be settled partially", "full"],
];
const ASK_PREFIXES = ASK_LOOP.map(([prefix]) => prefix);

/** The service-chain-derived card expectations (the chains-binding law, pinned). */
const CONDITIONAL_TITLES = [
  "the sender completes the provider permissions",
  "a verified intermediary is introduced",
];
const WAIT_PRECONDITIONS_LINE =
  `Waiting for: ${CONDITIONAL_TITLES.join("; ")} — the concrete preconditions the derived conditional opportunities name, not just trigger categories.`;
/** The card-CONTENT fragments (content-level, never the scenarios digest). */
const CARD_FRAGMENTS = [
  "What would need to change: the sender completes the provider permissions",
  "What would need to change: a third party is introduced as a verified intermediary bridging both sides",
  "What PaySwap itself would need to build",
  "platform:cross-provider-route-shape",
  "UNVERIFIED — no hypothetical re-run exists for this party change",
  "UNVERIFIED — the re-run verified no rank-eligible segment",
  "Evidence (the exclusions that prove the gap)",
  "A hypothesis is never a route — the only path onward is fresh planning, preview and new explicit authorization.",
  "— assumed (the one hypothetical element; never an observed rail)",
  "repair:intermediary-introduced",
  WAIT_PRECONDITIONS_LINE,
  "Model-assisted repair proposals are not composed in this deployment — no session model is selected",
];
const PREVIEW_NO_ROUTE_FRAGMENT = "No route composes this corridor in this deployment";

/** Collect the card DOM (the three advisory sections, testid-scoped). */
async function collectCardDom(page) {
  return page.evaluate(() => ({
    conditional: [...document.querySelectorAll("[data-testid^='ps-agent-conditional-']")].map((el) => el.textContent ?? ""),
    platform: [...document.querySelectorAll("[data-testid^='ps-agent-platform-work-']")].map((el) => el.textContent ?? ""),
    hypotheses: [...document.querySelectorAll("[data-testid^='ps-agent-hypothesis-']")].map((el) => el.textContent ?? ""),
    panel: document.querySelector(".ps-agent-panel")?.textContent ?? "",
  }));
}

/** The card checks → the missing list (empty = every fragment rendered). */
function checkCards(dom) {
  const missing = [];
  if (dom.conditional.length !== CONDITIONAL_TITLES.length) {
    missing.push(`conditional card count ${dom.conditional.length} != ${CONDITIONAL_TITLES.length}`);
  }
  for (const title of CONDITIONAL_TITLES) {
    if (!dom.conditional.some((text) => text.includes(title))) missing.push(`conditional title missing: ${title}`);
  }
  if (dom.platform.length < 1) missing.push("no platform work card rendered");
  if (dom.hypotheses.length < 1) missing.push("no hypothesis card rendered");
  const all = [...dom.conditional, ...dom.platform, ...dom.hypotheses, dom.panel].join("\n");
  for (const fragment of CARD_FRAGMENTS) {
    if (!all.includes(fragment)) missing.push(`fragment missing: ${fragment.slice(0, 90)}`);
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

/** Drive the ask loop to completion (the seeded funding source is the FLW NGN wallet). */
async function driveAskLoop(page, shot, phase) {
  await openComposer(page);
  const capabilityOk = await until(async () => (await panelText(page)).includes("This composer holds no financial authority"));
  recordStep(`${phase}-1`, "the composer opens with the honest zero-financial-authority note", capabilityOk ? "PASS" : "FAIL",
    capabilityOk ? "the capability note renders verbatim" : "the capability note did not render");
  await sendText(page, "Pay merchant X");
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
  recordStep(`${phase}-2`, "the nine-field guided intake completes over the seeded FLW wallet funding source", complete ? "PASS" : "FAIL",
    `distinctAnswered=${new Set(answered).size}/9 pendingRemaining=${!noPending} seeded=${seeded}`);
  await shot(`p23-d-cdp-${phase}-2-intake-complete.png`);
  return { complete };
}

/** The missions board → the structured preview → the honest typed BLOCK (the intent compiles). */
async function presentPreviewNoRoute(page, shot, phase) {
  const minimize = page.getByRole("button", { name: /^Minimize$/i }).first();
  if (await minimize.isVisible().catch(() => false)) {
    await minimize.click();
    await sleep(1_000);
  }
  const chip = page.locator("[data-testid='ps-agent-entry-missions']").first();
  await chip.waitFor({ state: "visible", timeout: 15_000 });
  await chip.click();
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
  }, 15_000);
  const boardText = await page.evaluate(() => document.querySelector("[class*='missions']")?.textContent ?? "");
  const noRoute = boardText.includes(PREVIEW_NO_ROUTE_FRAGMENT);
  recordStep(`${phase}-3`, "the structured preview presents the honest typed BLOCK with the no-route reason verbatim (the intent compiles; the cards change nothing at the authority tier)",
    blocked && noRoute ? "PASS" : "FAIL",
    blocked && noRoute ? "BLOCKED + NO_ROUTE_FOR_CORRIDOR rendered verbatim" : `blocked=${blocked} noRouteFragment=${noRoute}`);
  await shot(`p23-d-cdp-${phase}-3-blocked-preview.png`);
  // Close the board, reopen the composer (the REMOUNT presents the view).
  await chip.click();
  await sleep(1_000);
  await remountComposer(page);
  return { blocked, noRoute };
}

/** THE CARD ASSERTIONS (the remounted view, content-level — with the remount RETRY loop: the mount effect races the mission cache warm-up after the preview). */
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
    return dom.conditional.length >= CONDITIONAL_TITLES.length && dom.hypotheses.length >= 1;
  }, 20_000);
  const dom = await collectCardDom(page);
  const { missing, digest } = checkCards(dom);
  recordStep(`${phase}-4`, `${label}: the route-planning view displays the repair CARDS — ≥3 meaningfully different kinds (the party changes over the service chains' own facts, the evidenced platform work, the never-executable multi-hop hypotheses) with the people-language preconditions, the DISTINCT platform prerequisites, the UNVERIFIED badges with the honest reasons, the wait naming the CONCRETE preconditions and the honest zero-model note`,
    appeared && missing.length === 0 ? "PASS" : "FAIL",
    missing.length === 0
      ? `conditional=${dom.conditional.length} platform=${dom.platform.length} hypotheses=${dom.hypotheses.length} view=${digest}`
      : `missing: ${missing.slice(0, 4).join(" | ")}`);
  await shot(`p23-d-cdp-${phase}-4-cards.png`);
  await shot(`p23-d-cdp-${phase}-4b-cards-hypotheses.png`);
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
  await shot(`p23-d-cdp-${phase}-5-waiting.png`);
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
  await shot(`p23-d-cdp-${phase}-6-recheck-refusal.png`);
  return { waiting, refusal };
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

  // The scripted test world's connected state (the REAL member path).
  const seedDir = `/tmp/p23-cdp-seed-${Date.now()}`;
  mkdirSync(seedDir, { recursive: true });
  const seeded = spawnSync("npx", ["vitest", "run", "test/payswap/p23-cdp-seeder.test.ts"], {
    cwd: DESKTOP,
    env: { ...process.env, P23_CDP_SEED_DIR: seedDir },
    stdio: "inherit",
  });
  recordStep("seed-1", "the connection-state seeder drives the REAL member path over the scripted transport (seed → seal → probe → CONFIRMED → ACTIVE)",
    seeded.status === 0 ? "PASS" : "FAIL",
    seeded.status === 0 ? `${seedDir}/connections (the scripted test world, disclosed — never a live-probe claim)` : `seeder exit ${seeded.status}`);

  const userDataDir = `/tmp/payswap-cdp-p23-${Date.now()}`;
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
  const cards1 = await presentCards(first.page, shot1, "run1", "the cards display (launch 1)");
  firstDigest = cards1.digest;
  await chooseWaitAndRecheck(first.page, shot1, "run1");

  // The persisted records (the emergence-bearing view + the wait).
  const missionStoreOk = existsSync(resolve(userDataDir, "payments/payment-missions.json"))
    && readUserDataFile("payments/payment-missions.json").includes("Pay merchant X")
    && readUserDataFile("payments/payment-missions.json").includes("PREVIEW_PRESENTED");
  const taskStore = await first.page.evaluate(() => localStorage.getItem("payswap.agent.tasks.v1") ?? "");
  const taskStoreOk = taskStore.includes("WAIT_CRITERIA_RECORDED") && taskStore.includes("conditional opportunit");
  recordStep("run1-7", "the persisted records carry the journey + the emergence-bearing presentation (the mission store + the task store)",
    missionStoreOk && taskStoreOk ? "PASS" : "FAIL",
    `missionStore=${missionStoreOk} taskStore=${taskStoreOk}`);
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
  persistence.taskSurvived = persistedText.includes("Pay request") && persistedText.includes("Payment mission · Pay");
  persistence.historySurvived = persistedText.includes("Pay merchant X");
  recordStep("run2-1", "PERSISTENCE: the task + the conversation survive the app quit/relaunch on the same profile",
    persistence.taskSurvived && persistence.historySurvived ? "PASS" : "FAIL",
    `task=${persistence.taskSurvived}, conversation=${persistence.historySurvived}`);
  await shot2("p23-d-cdp-run2-1-persisted-composer.png");

  // The cards RE-DERIVE over the persisted state (the remount + the deterministic digest).
  await remountComposer(second.page);
  const cards2 = await presentCards(second.page, shot2, "run2", "PERSISTENCE: the conditionals survive relaunch (the same cards re-derive)");
  persistence.cardsReDerived = cards2.missing.length === 0;
  persistence.digestMatched = firstDigest !== null && cards2.digest === firstDigest;
  recordStep("run2-3", "the re-derived view digest EQUALS launch 1's (the byte-identical deterministic re-derivation over the persisted mission + connections)",
    persistence.digestMatched ? "PASS" : "FAIL",
    `launch1=${firstDigest} launch2=${cards2.digest}`);

  // The waiting state + the re-check refusal recompute after relaunch.
  const recheckVisible = await until(async () =>
    (await second.page.locator("[data-testid='ps-agent-route-recheck']").first().isVisible().catch(() => false)), 20_000);
  if (recheckVisible) {
    await second.page.locator("[data-testid='ps-agent-route-recheck']").first().click();
  }
  persistence.refusalRecomputed = await until(async () => {
    const text = await panelText(second.page);
    return text.includes("The re-check was refused");
  }, 15_000);
  recordStep("run2-5", "the waiting state survives and the re-check refusal recomputes over fresh observations after relaunch",
    persistence.refusalRecomputed ? "PASS" : "FAIL",
    persistence.refusalRecomputed ? "the consent-gate refusal re-rendered" : "the refusal did not re-render");
  await shot2("p23-d-cdp-run2-4-rederived-cards.png");
  await second.cdp.close();

  // The receipt (secret-free, machine-scanned).
  const failed = journeySteps().filter((step) => step.status === "FAIL");
  const receipt = {
    harness: "scripts/p23/desktop-cdp-emergence-journey.mjs + scripts/p21/cdp-harness-lib.mjs (the P23-D Electron CDP emergence journey — the E2E law's desktop half, ADR-0015 D10)",
    ranAt: RAN_AT,
    durationMs: Date.now() - startedAt,
    appRuntime: {
      tier: "the desktop dev-tier runtime (tsup-built main/host/preload + the vite-built renderer over file://)",
      launchRecipe: "electron . --no-sandbox --disable-dev-shm-usage --open-workspace <workspace> (CDP 9229, Xvfb :99, isolated ZCODE_DESKTOP_USER_DATA_DIR)",
      isolatedUserDataDir: userDataDir.replace(/^\/tmp\/payswap-cdp-p23-\d+$/, "<journey-scoped>"),
      workspace: WORKSPACE,
    },
    honestScope: "ZERO live provider credentials: the connection plane PRE-SEEDED through the REAL member path over the SCRIPTED provider transport (the p21-journey-bridge fixtures' six answers — the same tier as the bridge battery); the probes that confirmed the connections ran over the scripted answers, and NO live provider was contacted or is claimed. The REAL app derives its bridge, chains, rails, exclusions and CARDS from that state. The re-check surfaces the honest consent-gated refusal (the named carry-forward). The live-dispatch tier stays the a51a30c rail-evidence receipt's.",
    steps: journeySteps(),
    screenshots: journeyShots(),
    journeySummary: {
      cardKinds: "party changes (2, the service chains' own facts) + platform work items (>=1, evidenced) + multi-hop hypotheses (>=1, never executable)",
      previewOutcome: "BLOCKED (NO_ROUTE_FOR_CORRIDOR — the honest no-route with the intent compiled)",
      waitOutcome: "WAITING; the re-check honestly consent-refused (the named carry-forward)",
      persistence: persistence.cardsReDerived && persistence.digestMatched ? `SURVIVED (the same cards + the same view digest ${firstDigest})` : "BROKEN",
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
