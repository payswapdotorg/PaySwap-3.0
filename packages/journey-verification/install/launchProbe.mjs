#!/usr/bin/env node
/**
 * @payswap/journey-verification — the LAUNCH-VERIFICATION probe (the
 * --launch half of install-verify.mjs; extracted to keep the runner under
 * the repository max-lines lint gate).
 *
 * Launches the installed desktop binary (directly under a display, or
 * wrapped in xvfb-run when no display exists) and asserts:
 *   - the productName-derived app-data path ~/.config/PaySwap appears;
 *   - a REAL window with a PaySwap WM_CLASS + a PaySwap title exists
 *     (xdotool, polled). This window assertion is the v1.0.0 lesson: the
 *     broken release created its app-data dir but never a main window
 *     (the force-update block), so a data-dir check alone proved nothing.
 *
 * Honest boundary: without xdotool the window identity is returned as
 * NOT ASSERTED — never fabricated. A failed first launch retries once
 * with --no-sandbox and the retry is REPORTED.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

const LAUNCH_SETTLE_TIMEOUT_MS = 25_000;
const WINDOW_POLL_TIMEOUT_MS = 20_000;
const WINDOW_POLL_INTERVAL_MS = 1_000;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  return {
    status: result.status,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
  };
}

export function resolveLaunchWrapper() {
  if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) {
    return { supported: true, wrapper: null };
  }
  const xvfb = run("which", ["xvfb-run"]);
  if (xvfb.status === 0) {
    return { supported: true, wrapper: xvfb.stdout };
  }
  return { supported: false, wrapper: null };
}

/** Poll xdotool for a window whose WM_CLASS matches payswap. */
function pollForPaySwapWindow() {
  const xdotool = run("which", ["xdotool"]);
  if (xdotool.status !== 0) {
    return {
      asserted: false,
      reason: "xdotool unavailable — window identity NOT ASSERTED (recorded, never fabricated)",
      windows: [],
    };
  }
  const deadline = Date.now() + WINDOW_POLL_TIMEOUT_MS;
  const windows = [];
  while (Date.now() < deadline) {
    const search = run("xdotool", ["search", "--class", "payswap"]);
    if (search.status === 0 && search.stdout) {
      for (const id of search.stdout.split(/\s+/).filter(Boolean)) {
        const name = run("xdotool", ["getwindowname", id]);
        windows.push({ id, name: name.status === 0 ? name.stdout : "(name unavailable)" });
      }
      if (windows.length > 0) {
        return { asserted: true, reason: null, windows };
      }
    }
    run("sleep", [`${WINDOW_POLL_INTERVAL_MS / 1000}`]);
  }
  return {
    asserted: true,
    reason: "no window with a PaySwap WM_CLASS appeared within the timeout",
    windows,
  };
}

/**
 * The launch verification battery (runs while the package is installed).
 * Returns findings — the runner owns the exit protocol.
 */
export function collectLaunchFindings({ execBinary, receipt }) {
  const launchSupport = resolveLaunchWrapper();
  if (!launchSupport.supported) {
    return {
      unsupported: true,
      findings: [
        "--launch requested but no display and no xvfb-run are available. Launch verification requires a display environment — run on a desktop host or under xvfb-run.",
      ],
    };
  }
  const home = os.homedir();
  const dataDir = join(home, ".config", "PaySwap");
  const before = existsSync(dataDir);
  const wrapper = launchSupport.wrapper;
  console.error(`[install-verify] launching ${execBinary} (wrapper: ${wrapper ?? "direct display"})…`);

  let launchNote = null;
  let result = wrapper
    ? run(wrapper, ["-a", execBinary], { timeout: LAUNCH_SETTLE_TIMEOUT_MS })
    : run(execBinary, [], { timeout: LAUNCH_SETTLE_TIMEOUT_MS });
  if (result.status !== null && result.status !== 0) {
    // One recorded retry: chrome-sandbox needs its setuid bit, which
    // non-install extractions can lose. The retry is REPORTED, never
    // silent.
    launchNote = `first launch attempt exited ${result.status}; retried with --no-sandbox`;
    result = wrapper
      ? run(wrapper, ["-a", execBinary, "--no-sandbox"], { timeout: LAUNCH_SETTLE_TIMEOUT_MS })
      : run(execBinary, ["--no-sandbox"], { timeout: LAUNCH_SETTLE_TIMEOUT_MS });
  }

  const findings = [];
  const after = existsSync(dataDir);
  if (!after) {
    findings.push(
      `launch verification failed: ${dataDir} did not appear (app-data path pattern ~/.config/PaySwap, productName-derived)${before ? " (it existed before launch — pre-existing state, inconclusive)" : ""}`,
    );
  } else {
    console.error("[install-verify] app-data path ~/.config/PaySwap present after launch ✓");
    receipt.assertions.push("launch: app-data path ~/.config/PaySwap ok");
  }

  const windowResult = pollForPaySwapWindow();
  receipt.launchWindows = windowResult.windows;
  if (!windowResult.asserted) {
    console.error(`[install-verify] ${windowResult.reason}`);
    receipt.assertions.push(`launch: window identity not asserted (${windowResult.reason})`);
  } else if (windowResult.reason) {
    findings.push(`launch verification failed: ${windowResult.reason}`);
  } else {
    const titled = windowResult.windows.filter((window) => /payswap/i.test(window.name));
    if (titled.length === 0) {
      findings.push(
        `windows exist but none carries a PaySwap title (observed: ${JSON.stringify(windowResult.windows)})`,
      );
    } else {
      console.error(`[install-verify] PaySwap window present: ${titled.map((w) => JSON.stringify(w.name)).join(", ")} ✓`);
      receipt.assertions.push(`launch: PaySwap-branded window ok (${titled.map((w) => w.name).join(" | ")})`);
    }
  }

  if (launchNote) {
    receipt.assertions.push(`launch: ${launchNote}`);
  }
  return { unsupported: false, findings };
}
