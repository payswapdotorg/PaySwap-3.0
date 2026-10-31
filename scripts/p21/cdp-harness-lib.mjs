/**
 * PaySwap Desktop (P21-D reviewer-gate ③/④, ADR-0014 D10) — the SHARED
 * PLUMBING for the Electron CDP journey harnesses
 * (scripts/p21/desktop-cdp-journey.mjs).
 *
 * Everything journey-agnostic lives here so each journey entry point stays
 * under the 400-line file law:
 * - the dev-tier Electron launch recipe (Xvfb :99, --no-sandbox,
 *   --disable-dev-shm-usage, --open-workspace, the isolated
 *   ZCODE_DESKTOP_USER_DATA_DIR, CDP on the dev-mode fixed 9229 port);
 * - the CDP connection (playwright-core connectOverCDP → the main window);
 * - the composer driving helpers (open / read text / send / the
 *   pending-question detector for the deterministic ask loop);
 * - the step recorder, the screenshot taker, the secret-shape scanner.
 *
 * SECURITY LAW: no credential material ever flows through these helpers —
 * they drive the REAL UI only; the receipt scanner FAILS the run on any
 * secret-shaped finding before the receipt is written.
 */

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { request } from "node:http";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright-core";

export const REPO_ROOT = resolve(import.meta.dirname, "../..");
export const DESKTOP = resolve(REPO_ROOT, "packages/desktop");
export const ELECTRON = resolve(REPO_ROOT, "node_modules/electron/dist/electron");
export const EVIDENCE_DIR = resolve(REPO_ROOT, "docs/productization-evidence");
export const ASSETS_DIR = resolve(EVIDENCE_DIR, "assets");

const steps = [];
const shots = [];
let electronProcess = undefined;
let userDataDir = undefined;

export function setJourneyUserDataDir(dir) {
  userDataDir = dir;
}

export function journeySteps() {
  return steps;
}

export function journeyShots() {
  return shots;
}

export function ensureAssetsDir() {
  mkdirSync(ASSETS_DIR, { recursive: true });
}

export function recordStep(id, name, status, detail) {
  steps.push({ id, name, status, detail });
  console.log(`[${status}] ${id} — ${name}${detail ? `: ${detail.slice(0, 180)}` : ""}`);
}

export async function waitCdp(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolveProbe) => {
      const req = request("http://127.0.0.1:9229/json/version", { method: "GET", timeout: 1_500 }, (res) => {
        res.resume();
        resolveProbe(true);
      });
      req.on("timeout", () => req.destroy(new Error("timeout")));
      req.on("error", () => resolveProbe(false));
      req.end();
    });
    if (ok) return true;
    await sleep(500);
  }
  return false;
}

export function launchElectron(workspace) {
  const log = [];
  const child = spawn(ELECTRON, [".", "--no-sandbox", "--disable-dev-shm-usage", "--open-workspace", workspace], {
    cwd: DESKTOP,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      DISPLAY: ":99",
      ZCODE_DESKTOP_USER_DATA_DIR: userDataDir,
      ELECTRON_ENABLE_LOGGING: "1",
    },
  });
  child.stdout.on("data", (chunk) => log.push(chunk.toString()));
  child.stderr.on("data", (chunk) => log.push(chunk.toString()));
  electronProcess = child;
  return { child, dumpLog: () => log.join("") };
}

export async function stopElectron() {
  if (electronProcess === undefined) return;
  const child = electronProcess;
  electronProcess = undefined;
  child.kill("SIGTERM");
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      process.kill(child.pid, 0);
      await sleep(400);
    } catch {
      return;
    }
  }
  try {
    child.kill("SIGKILL");
  } catch {
    /* already gone */
  }
}

export async function connectPage() {
  const cdp = await chromium.connectOverCDP("http://127.0.0.1:9229");
  const page = cdp.contexts()[0].pages().find((p) => p.url().includes("index.html"));
  if (page === undefined) throw new Error("the main window page not found over CDP");
  return { cdp, page };
}

export async function openComposer(page) {
  // The app boot is variable (10-30s on this machine): wait for the
  // composer chrome (the dock OR an already-open persisted panel).
  await page.waitForSelector(".ps-agent-panel, [class*='ps-agent-dock'], button", { timeout: 60_000 });
  await until(async () => {
    const dockVisible = await page.getByRole("button", { name: /PaySwap agent/i }).first().isVisible().catch(() => false);
    const panelVisible = await page.locator(".ps-agent-panel").isVisible().catch(() => false);
    return dockVisible || panelVisible;
  }, 45_000);
  const panel = page.locator(".ps-agent-panel");
  if (!(await panel.isVisible().catch(() => false))) {
    const dock = page.getByRole("button", { name: /PaySwap agent/i }).first();
    await dock.waitFor({ state: "visible", timeout: 30_000 });
    await dock.click();
  }
  await panel.waitFor({ state: "visible", timeout: 20_000 });
  await page.locator(".ps-agent-input-field").waitFor({ state: "visible", timeout: 20_000 });
  return panel;
}

export async function panelText(page) {
  return page.evaluate(() => document.querySelector(".ps-agent-panel")?.textContent ?? "");
}

export async function sendText(page, text) {
  const input = page.locator(".ps-agent-input-field");
  await input.fill(text);
  await input.press("Enter");
}

export async function lastPendingQuestion(page, prefixes) {
  return page.evaluate((prefixList) => {
    // Pending only when a question line is the NEWEST turn — after the
    // user's reply (the speaker class distinguishes the turns). A
    // question in HISTORY (already answered) is not pending.
    const lines = [...document.querySelectorAll(".ps-agent-line")];
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      const text = line?.textContent ?? "";
      const isUserTurn = line?.classList.contains("ps-agent-line--you") ?? false;
      if (isUserTurn) return null;
      for (const prefix of prefixList) {
        if (text.includes(prefix)) return prefix;
      }
    }
    return null;
  }, prefixes);
}

export async function until(predicate, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await sleep(150);
  }
  return await predicate();
}

export function makeShot(page) {
  return async (name) => {
    const path = resolve(ASSETS_DIR, name);
    await page.screenshot({ path, fullPage: false });
    shots.push(name);
  };
}

/** The secret-shape scan (machine-enforced; a finding FAILS the receipt). */
export function scanForSecretShapes(text) {
  const patterns = [
    /sk_live_[A-Za-z0-9]{10,}/,
    /sk_test_[A-Za-z0-9]{10,}/,
    /pk_live_[A-Za-z0-9]{10,}/,
    /pk_test_[A-Za-z0-9]{10,}/,
    /whsec_[A-Za-z0-9]{10,}/,
    /Bearer\s+[A-Za-z0-9._-]{20,}/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    // (P22-D, ADR-0016 D10 — the G4 fix) the Stellar StrKey SECRET shape
    // (S + 55 base32 chars, the seal's own fail-closed pattern) and the
    // Flutterwave secret-key prefix — a finding FAILS the receipt.
    /\bS[A-Z2-7]{55}\b/,
    /FLWSECK(_TEST)?-[A-Za-z0-9]{10,}/,
  ];
  const findings = patterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
  return findings;
}

/** Read a persisted file under the isolated userData (evidence reads). */
export function readUserDataFile(relativePath) {
  return readFileSync(resolve(userDataDir, relativePath), "utf8");
}
