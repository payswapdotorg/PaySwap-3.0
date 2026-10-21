#!/usr/bin/env node
/**
 * @payswap/journey-verification — the LAUNCH-VERIFICATION probe (the
 * --launch half of install-verify.mjs; extracted to keep the runner under
 * the repository max-lines lint gate).
 *
 * Launches the installed desktop binary DETACHED (directly under a
 * display, or wrapped in xvfb-run when no display exists — a blocking
 * spawn would kill the app before the window poll could observe it, the
 * second v1.0.1 CI lesson) and asserts, while the app runs:
 *   - the productName-derived app-data path ~/.config/PaySwap appears;
 *   - a REAL window with a PaySwap WM_CLASS + a PaySwap title exists
 *     (xdotool, polled; matched on BOTH the WM_CLASS class ('PaySwap')
 *     and instance ('payswap') strings — case matters). This window
 *     assertion is the v1.0.0 lesson: the broken release created its
 *     app-data dir but never a main window (the force-update block), so
 *     a data-dir check alone proved nothing.
 *
 * Honest boundary: without xdotool the window identity is returned as
 * NOT ASSERTED — never fabricated. A failed first launch retries once
 * with --no-sandbox and the retry is REPORTED.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

const WINDOW_POLL_TIMEOUT_MS = 30_000;
const WINDOW_POLL_INTERVAL_MS = 1_000;

function probeRun(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return {
    status: result.status,
    stdout: (result.stdout ?? "").trim(),
  };
}

export function resolveLaunchWrapper() {
  if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) {
    return { supported: true, wrapper: null };
  }
  const xvfb = probeRun("which", ["xvfb-run"]);
  if (xvfb.status === 0) {
    return { supported: true, wrapper: xvfb.stdout };
  }
  return { supported: false, wrapper: null };
}

function xdotoolAvailable() {
  return probeRun("which", ["xdotool"]).status === 0;
}

/** All window ids whose WM_CLASS matches payswap in either field. */
function searchPaySwapWindowIds() {
  const ids = new Set();
  // WM_CLASS is (instance, class): electron sets instance to the
  // executable name ('payswap') and class to the product name
  // ('PaySwap') — match both, case-sensitively explicit.
  for (const args of [
    ["search", "--class", "PaySwap"],
    ["search", "--classname", "payswap"],
    ["search", "--class", "payswap"],
    ["search", "--class", "Payswap"],
  ]) {
    const search = probeRun("xdotool", args);
    if (search.status === 0 && search.stdout) {
      for (const id of search.stdout.split(/\s+/).filter(Boolean)) {
        ids.add(id);
      }
    }
  }
  return [...ids];
}

function snapshotPaySwapWindows() {
  const windows = [];
  for (const id of searchPaySwapWindowIds()) {
    const name = probeRun("xdotool", ["getwindowname", id]);
    windows.push({ id, name: name.status === 0 ? name.stdout : "(name unavailable)" });
  }
  return windows;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function launchDetached(execBinary, extraArgs, wrapper) {
  const command = wrapper ?? execBinary;
  const args = wrapper ? ["-a", execBinary, ...extraArgs] : [...extraArgs];
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    env: { ...process.env },
  });
  child.unref();
  return child;
}

/**
 * The launch verification battery (runs while the package is installed).
 * Async: polls while the detached app runs. Returns findings — the
 * runner owns the exit protocol.
 */
export async function collectLaunchFindings({ execBinary, receipt }) {
  const launchSupport = resolveLaunchWrapper();
  if (!launchSupport.supported) {
    return {
      unsupported: true,
      findings: [
        "--launch requested but no display and no xvfb-run are available. Launch verification requires a display environment — run on a desktop host or under xvfb-run.",
      ],
    };
  }
  const wrapper = launchSupport.wrapper;
  const home = os.homedir();
  const dataDir = join(home, ".config", "PaySwap");
  const before = existsSync(dataDir);
  const hasXdotool = xdotoolAvailable();

  const findings = [];
  let launchNote = null;
  let child = launchDetached(execBinary, [], wrapper);
  console.error(`[install-verify] launching ${execBinary} (wrapper: ${wrapper ?? "direct display"}, pid ${child.pid})…`);

  const deadline = Date.now() + WINDOW_POLL_TIMEOUT_MS;
  let sawEarlyExit = false;
  let retried = false;
  let windows = [];
  let dataDirAppeared = existsSync(dataDir);

  while (Date.now() < deadline) {
    await sleep(WINDOW_POLL_INTERVAL_MS);
    dataDirAppeared = dataDirAppeared || existsSync(dataDir);
    if (hasXdotool) {
      windows = snapshotPaySwapWindows();
      if (windows.length > 0) {
        break;
      }
    }
    const exited = child.exitCode !== null || child.signalCode !== null;
    if (exited) {
      sawEarlyExit = true;
      // One recorded retry: chrome-sandbox needs its setuid bit, which
      // non-install extractions can lose. The retry is REPORTED, never
      // silent.
      if (!retried) {
        retried = true;
        launchNote = `first launch exited early (code ${child.exitCode ?? child.signalCode}); retried with --no-sandbox`;
        console.error(`[install-verify] ${launchNote}`);
        child = launchDetached(execBinary, ["--no-sandbox"], wrapper);
      }
    }
  }

  receipt.launchWindows = windows;

  if (!dataDirAppeared) {
    findings.push(
      `launch verification failed: ${dataDir} did not appear (app-data path pattern ~/.config/PaySwap, productName-derived)${before ? " (it existed before launch — pre-existing state, inconclusive)" : ""}`,
    );
  } else {
    console.error("[install-verify] app-data path ~/.config/PaySwap present after launch ✓");
    receipt.assertions.push("launch: app-data path ~/.config/PaySwap ok");
  }

  if (!hasXdotool) {
    const reason = "xdotool unavailable — window identity NOT ASSERTED (recorded, never fabricated)";
    console.error(`[install-verify] ${reason}`);
    receipt.assertions.push(`launch: window identity not asserted (${reason})`);
  } else if (windows.length === 0) {
    findings.push(
      `no window with a PaySwap WM_CLASS appeared within ${WINDOW_POLL_TIMEOUT_MS / 1000}s${sawEarlyExit ? " (the app exited early)" : ""}`,
    );
  } else {
    const titled = windows.filter((window) => /payswap/i.test(window.name));
    if (titled.length === 0) {
      findings.push(
        `windows exist but none carries a PaySwap title (observed: ${JSON.stringify(windows)})`,
      );
    } else {
      console.error(`[install-verify] PaySwap window present: ${titled.map((w) => JSON.stringify(w.name)).join(", ")} ✓`);
      receipt.assertions.push(`launch: PaySwap-branded window ok (${titled.map((w) => w.name).join(" | ")})`);
    }
  }

  if (launchNote) {
    receipt.assertions.push(`launch: ${launchNote}`);
  }

  // Cleanup: kill the detached process group (xvfb-run + app).
  try {
    if (child.exitCode === null && child.signalCode === null) {
      process.kill(-child.pid, "SIGTERM");
    }
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      // already gone
    }
  }

  return { unsupported: false, findings };
}
