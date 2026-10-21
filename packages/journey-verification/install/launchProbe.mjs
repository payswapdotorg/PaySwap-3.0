#!/usr/bin/env node
/**
 * @payswap/journey-verification — the LAUNCH-VERIFICATION probe (the
 * --launch half of install-verify.mjs; extracted to keep the runner under
 * the repository max-lines lint gate).
 *
 * Starts (or reuses) a display the PROBE owns: when no DISPLAY exists
 * the probe starts its own Xvfb on a chosen display number and shares it
 * with BOTH the app and xdotool (the third v1.0.1 CI lesson: xvfb-run -a
 * allocates a private display the probe's xdotool cannot see — every
 * poll ran display-less and found nothing). The app is spawned DETACHED
 * (a blocking spawn would kill it before the window poll could observe
 * it, the second lesson) and asserts, while the app runs:
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

function probeRun(command, args, env) {
  const result = spawnSync(command, args, { encoding: "utf8", ...(env ? { env } : {}) });
  return {
    status: result.status,
    stdout: (result.stdout ?? "").trim(),
  };
}

function xdotoolAvailable() {
  return probeRun("which", ["xdotool"]).status === 0;
}

function xvfbBinaryAvailable() {
  return probeRun("which", ["Xvfb"]).status === 0;
}

function sleepSync(seconds) {
  probeRun("sleep", [`${seconds}`]);
}

/**
 * Own the display: reuse the ambient one when present, otherwise start
 * our own Xvfb on a PID-derived display number and wait for its socket.
 * Returns { supported, display, xvfbChild } — the app AND xdotool both
 * run against `display`.
 */
function ensureProbeDisplay() {
  if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) {
    return { supported: true, display: process.env.DISPLAY, xvfbChild: null };
  }
  if (!xvfbBinaryAvailable()) {
    return { supported: false, display: null, xvfbChild: null };
  }
  const displayNumber = 90 + (process.pid % 9);
  const display = `:${displayNumber}`;
  const xvfbChild = spawn(
    "Xvfb",
    [display, "-screen", "0", "1280x1024x24"],
    { detached: true, stdio: "ignore" },
  );
  xvfbChild.unref();
  const socketPath = `/tmp/.X11-unix/X${displayNumber}`;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    if (existsSync(socketPath)) {
      return { supported: true, display, xvfbChild };
    }
    sleepSync(0.2);
  }
  return { supported: false, display: null, xvfbChild };
}

/** All window ids whose WM_CLASS matches payswap in either field. */
function searchPaySwapWindowIds(displayEnv) {
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
    const search = probeRun("xdotool", args, displayEnv);
    if (search.status === 0 && search.stdout) {
      for (const id of search.stdout.split(/\s+/).filter(Boolean)) {
        ids.add(id);
      }
    }
  }
  return [...ids];
}

function snapshotPaySwapWindows(displayEnv) {
  const windows = [];
  for (const id of searchPaySwapWindowIds(displayEnv)) {
    const name = probeRun("xdotool", ["getwindowname", id], displayEnv);
    windows.push({ id, name: name.status === 0 ? name.stdout : "(name unavailable)" });
  }
  return windows;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function launchDetached(execBinary, extraArgs, display) {
  const child = spawn(execBinary, extraArgs, {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, DISPLAY: display },
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
  const probeDisplay = ensureProbeDisplay();
  if (!probeDisplay.supported) {
    return {
      unsupported: true,
      findings: [
        "--launch requested but no display and no Xvfb are available. Launch verification requires a display environment — run on a desktop host or with Xvfb installed.",
      ],
    };
  }
  const displayEnv = { ...process.env, DISPLAY: probeDisplay.display };
  const home = os.homedir();
  const dataDir = join(home, ".config", "PaySwap");
  const before = existsSync(dataDir);
  const hasXdotool = xdotoolAvailable();

  const findings = [];
  let launchNote = null;
  let child = launchDetached(execBinary, [], probeDisplay.display);
  console.error(
    `[install-verify] launching ${execBinary} (display ${probeDisplay.display}, pid ${child.pid})…`,
  );

  const deadline = Date.now() + WINDOW_POLL_TIMEOUT_MS;
  let sawEarlyExit = false;
  let retried = false;
  let windows = [];
  let dataDirAppeared = existsSync(dataDir);

  while (Date.now() < deadline) {
    await sleep(WINDOW_POLL_INTERVAL_MS);
    dataDirAppeared = dataDirAppeared || existsSync(dataDir);
    if (hasXdotool) {
      windows = snapshotPaySwapWindows(displayEnv);
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
        child = launchDetached(execBinary, ["--no-sandbox"], probeDisplay.display);
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

  // Cleanup: kill the detached app process group, then our Xvfb.
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
  if (probeDisplay.xvfbChild) {
    try {
      process.kill(-probeDisplay.xvfbChild.pid, "SIGTERM");
    } catch {
      try {
        probeDisplay.xvfbChild.kill("SIGTERM");
      } catch {
        // already gone
      }
    }
  }

  return { unsupported: false, findings };
}
