#!/usr/bin/env node
/**
 * @payswap/journey-verification — the INSTALL-VERIFICATION RUNNER
 * (JOURNEY-MAP.md §3 flows 11–13; PRODUCT-IDENTITY.md §6 gate
 * "clean-install verified").
 *
 * Given a release tag, this runner performs the deb install acceptance
 * flow against the PUBLISHED GitHub release:
 *
 *   1. fetch the release JSON (GitHub API);
 *   2. download the .deb (+ AppImage when published) + SHA256SUMS;
 *   3. verify every checksum (SHA256SUMS is authoritative; a missing
 *      entry for a downloaded asset is a FAILURE, not a skip);
 *   4. dpkg -i the .deb;
 *   5. assert the installed product identity (desktopIdentity.mjs):
 *        - exactly one /usr/share/applications/*.desktop with Name=PaySwap;
 *        - the Icon= target resolves on disk;
 *        - the Exec= binary exists and is executable;
 *        - dpkg -s payswap reports 'install ok installed';
 *   6. under --launch (BEFORE cleanup, while the package is installed):
 *        - launch the desktop-entry Exec binary (directly under a
 *          DISPLAY, or wrapped in xvfb-run when available);
 *        - assert ~/.config/PaySwap appears (productName-derived
 *          app-data path);
 *        - assert a real window exists with a PaySwap WM_CLASS and a
 *          PaySwap title (xdotool, when installed — this assertion is
 *          what would have caught the v1.0.0 force-update block, where
 *          the app created its data dir but never a main window);
 *   7. dpkg -r (cleanup — always attempted, even on failure paths,
 *      unless --keep);
 *   8. AppImage (when published): ELF magic + checksum + executable bit;
 *   9. write a JSON receipt (the evidence the acceptance record cites).
 *
 * HONEST FAILURE MODES (every one exits non-zero with an explicit
 * message — this runner never fabricates a pass):
 *   - exit 2  — usage / environment error (bad args, no network config);
 *   - exit 3  — NO RELEASE EXISTS for the tag;
 *   - exit 4  — release exists but the expected assets are missing;
 *   - exit 5  — checksum verification failed;
 *   - exit 6  — install environment not usable (no dpkg, no root/sudo);
 *   - exit 7  — an identity assertion failed (desktop entry / icon /
 *               binary / package name / launch / window identity);
 *   - exit 8  — AppImage structural checks failed;
 *   - exit 9  — launch requested but the environment cannot support it.
 *
 * Usage:
 *   node install-verify.mjs --repo <owner/name> --tag <tag|latest>
 *     [--workdir <dir>] [--keep] [--skip-appimage] [--launch]
 *
 * Environment: GITHUB_TOKEN (optional), GITHUB_API_URL (optional).
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

import { collectAppImageFindings, collectDesktopIdentityFindings } from "./desktopIdentity.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_WORKDIR = join(HERE, ".cache-install-verify");
const LAUNCH_SETTLE_TIMEOUT_MS = 25_000;
const WINDOW_POLL_TIMEOUT_MS = 20_000;
const WINDOW_POLL_INTERVAL_MS = 1_000;

const EXIT = {
  USAGE: 2,
  NO_RELEASE: 3,
  MISSING_ASSETS: 4,
  CHECKSUM: 5,
  ENVIRONMENT: 6,
  IDENTITY: 7,
  APPIMAGE: 8,
  LAUNCH_UNSUPPORTED: 9,
};

function fail(code, message) {
  console.error(`[install-verify] FAIL (exit ${code}): ${message}`);
  process.exitCode = code;
  throw new Error(`__exit_${code}__`);
}

function parseArgs(argv) {
  const args = { repo: process.env.PAYSWAP_RELEASE_REPO ?? null, tag: null, workdir: DEFAULT_WORKDIR, keep: false, skipAppImage: false, launch: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--repo") {
      args.repo = argv[++index] ?? null;
    } else if (arg === "--tag") {
      args.tag = argv[++index] ?? null;
    } else if (arg === "--workdir") {
      args.workdir = resolve(argv[++index] ?? DEFAULT_WORKDIR);
    } else if (arg === "--keep") {
      args.keep = true;
    } else if (arg === "--skip-appimage") {
      args.skipAppImage = true;
    } else if (arg === "--launch") {
      args.launch = true;
    } else {
      fail(EXIT.USAGE, `unknown argument ${JSON.stringify(arg)}`);
    }
  }
  if (!args.repo || !args.tag) {
    fail(
      EXIT.USAGE,
      "usage: node install-verify.mjs --repo <owner/name> --tag <tag|latest> [--workdir <dir>] [--keep] [--skip-appimage] [--launch]",
    );
  }
  return args;
}

async function fetchRelease(args) {
  const apiBase = process.env.GITHUB_API_URL ?? "https://api.github.com";
  const endpoint =
    args.tag === "latest"
      ? `${apiBase}/repos/${args.repo}/releases/latest`
      : `${apiBase}/repos/${args.repo}/releases/tags/${encodeURIComponent(args.tag)}`;
  const headers = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "payswap-journey-verification",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  let response;
  try {
    response = await fetch(endpoint, { headers });
  } catch (error) {
    fail(EXIT.USAGE, `cannot reach the GitHub API at ${apiBase} (${String(error)})`);
  }
  if (response.status === 404) {
    fail(
      EXIT.NO_RELEASE,
      `no release exists for ${args.tag === "latest" ? "this repository" : `tag ${args.tag}`} at ${args.repo}. ` +
        "The install-verification flow requires a PUBLISHED release (the P9-B 'GitHub installer published' gate). " +
        "This is the honest failure mode — nothing was verified and nothing was fabricated.",
    );
  }
  if (!response.ok) {
    fail(EXIT.USAGE, `GitHub API returned HTTP ${response.status} for ${endpoint}`);
  }
  return await response.json();
}

async function downloadAsset(url, targetPath) {
  const response = await fetch(url, {
    headers: { "user-agent": "payswap-journey-verification" },
  });
  if (!response.ok) {
    fail(EXIT.MISSING_ASSETS, `download failed for ${url} (HTTP ${response.status})`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(targetPath, buffer);
  return buffer;
}

function sha256OfBuffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function parseChecksums(text) {
  const entries = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = /^([0-9a-fA-F]{64})\s+\*?(.+)$/.exec(line.trim());
    if (match) {
      entries.set(match[2].trim(), match[1].toLowerCase());
    }
  }
  return entries;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  return {
    status: result.status,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
  };
}

function installRootPrefix() {
  if (typeof process.geteuid === "function" && process.geteuid() === 0) {
    return { command: "dpkg", prefixArgs: [] };
  }
  const probe = run("sudo", ["-n", "true"]);
  if (probe.status === 0) {
    return { command: "sudo", prefixArgs: ["-n", "dpkg"] };
  }
  return null;
}

function resolveLaunchWrapper() {
  if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) {
    return { supported: true, wrapper: null };
  }
  const xvfb = run("which", ["xvfb-run"]);
  if (xvfb.status === 0) {
    return { supported: true, wrapper: xvfb.stdout };
  }
  return { supported: false, wrapper: null };
}

/** Poll xdotool for a window whose WM_CLASS or title matches PaySwap. */
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

/** The launch verification battery (runs while the package is installed). */
function verifyLaunch({ execBinary, receipt }) {
  const launchSupport = resolveLaunchWrapper();
  if (!launchSupport.supported) {
    fail(
      EXIT.LAUNCH_UNSUPPORTED,
      "--launch requested but no display and no xvfb-run are available. Launch verification requires a display environment — run on a desktop host or under xvfb-run.",
    );
  }
  const home = os.homedir();
  const dataDir = join(home, ".config", "PaySwap");
  const before = existsSync(dataDir);
  const wrapper = launchSupport.wrapper;
  console.error(`[install-verify] launching ${execBinary} (wrapper: ${wrapper ?? "direct display"})…`);

  const attempts = [{ args: [], note: null }];
  let launched = null;
  let launchNote = null;
  for (const attempt of attempts) {
    const result = wrapper
      ? run(wrapper, ["-a", execBinary, ...attempt.args], { timeout: LAUNCH_SETTLE_TIMEOUT_MS })
      : run(execBinary, attempt.args, { timeout: LAUNCH_SETTLE_TIMEOUT_MS });
    if (wrapper) {
      // xvfb-run stays foreground for the app's lifetime on success; a fast
      // exit means the app itself died. Record and retry once with
      // --no-sandbox (chrome-sandbox needs its setuid bit, which
      // non-install extractions can lose) — the retry is RECORDED, never
      // silent.
      launched = result;
    } else {
      launched = result;
    }
    if (launched.status !== null && launched.status !== 0 && !attempt.args.includes("--no-sandbox")) {
      attempts.push({ args: ["--no-sandbox"], note: "retried with --no-sandbox (recorded)" });
      launchNote = "first launch attempt exited non-zero; retried with --no-sandbox";
      continue;
    }
    break;
  }

  const after = existsSync(dataDir);
  const findings = [];
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
  if (findings.length > 0) {
    fail(EXIT.IDENTITY, `launch verification failed:\n  - ${findings.join("\n  - ")}`);
  }
}

/** The single receipt object — written on BOTH pass and fail paths. */
const receipt = {
  runner: "@payswap/journey-verification install-verify.mjs",
  startedAt: new Date().toISOString(),
  repo: null,
  tag: null,
  assets: [],
  assertions: [],
  cleanup: null,
  verdict: "INCOMPLETE",
};

function writeReceipt(workdir, verdict, detail = null) {
  receipt.verdict = verdict;
  if (detail) {
    receipt.failure = detail;
  }
  receipt.finishedAt = new Date().toISOString();
  mkdirSync(workdir, { recursive: true });
  const receiptPath = join(workdir, "install-verify-receipt.json");
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.error(`[install-verify] receipt: ${receiptPath}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  receipt.repo = args.repo;
  receipt.tag = args.tag;
  let activeWorkdir = args.workdir;
  try {
    await verifyRelease(args, (workdir) => {
      activeWorkdir = workdir;
    });
    writeReceipt(activeWorkdir, "PASS");
    console.error("[install-verify] PASS");
  } catch (error) {
    const detail = typeof error?.message === "string" && error.message.startsWith("__exit_") ? null : String(error);
    writeReceipt(activeWorkdir, "FAIL", detail);
    throw error;
  }
}

async function verifyRelease(args, onWorkdir) {
  console.error(`[install-verify] verifying release ${args.repo}@${args.tag}`);

  const release = await fetchRelease(args);
  console.error(`[install-verify] release: ${release.name ?? release.tag_name} (${release.html_url})`);
  receipt.releaseUrl = release.html_url;
  receipt.releaseName = release.name ?? null;
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const debAsset = assets.find((asset) => asset.name.endsWith(".deb")) ?? null;
  const appImageAsset = assets.find((asset) => asset.name.endsWith(".AppImage")) ?? null;
  const checksumsAsset = assets.find((asset) => /^SHA256SUMS(\.txt)?$/i.test(asset.name)) ?? null;

  if (!debAsset) {
    fail(
      EXIT.MISSING_ASSETS,
      `the release ${release.tag_name} carries no .deb asset — the deb install flow (JOURNEY-MAP flow 11) cannot run. ` +
        `Assets present: ${assets.map((asset) => asset.name).join(", ") || "(none)"}`,
    );
  }
  if (!checksumsAsset) {
    fail(
      EXIT.MISSING_ASSETS,
      `the release ${release.tag_name} carries no SHA256SUMS asset — checksum verification (flow 11) is mandatory, never skipped`,
    );
  }

  mkdirSync(args.workdir, { recursive: true });
  onWorkdir(args.workdir);

  const checksumsBuffer = await downloadAsset(checksumsAsset.browser_download_url, join(args.workdir, checksumsAsset.name));
  const checksums = parseChecksums(checksumsBuffer.toString("utf8"));
  const debBuffer = await downloadAsset(debAsset.browser_download_url, join(args.workdir, debAsset.name));

  const debExpected = checksums.get(debAsset.name);
  if (!debExpected) {
    fail(EXIT.CHECKSUM, `SHA256SUMS has no entry for ${debAsset.name}`);
  }
  const debActual = sha256OfBuffer(debBuffer);
  if (debActual !== debExpected) {
    fail(EXIT.CHECKSUM, `${debAsset.name} checksum mismatch (expected ${debExpected}, got ${debActual})`);
  }
  console.error(`[install-verify] ${debAsset.name} checksum verified ✓`);
  receipt.assets.push({ name: debAsset.name, size: debAsset.size, sha256: debActual, checksumVerified: true });

  const dpkg = installRootPrefix();
  if (!dpkg) {
    fail(
      EXIT.ENVIRONMENT,
      "cannot run dpkg: not root and passwordless sudo is unavailable. Run as root (CI) or with sudo -n capability — the install flow is never silently skipped.",
    );
  }
  const dpkgCommand = dpkg.command === "dpkg" ? "dpkg" : "sudo";
  const dpkgArgs = dpkg.command === "dpkg" ? [] : ["-n", "dpkg"];

  const installResult = run(dpkgCommand, [...dpkgArgs, "-i", join(args.workdir, debAsset.name)]);
  if (installResult.status !== 0) {
    console.error(installResult.stdout);
    console.error(installResult.stderr);
    fail(EXIT.ENVIRONMENT, `dpkg -i failed (exit ${installResult.status})`);
  }
  console.error("[install-verify] dpkg -i payswap ✓");
  receipt.assertions.push("dpkg -i ok");

  // Identity assertions + launch BOTH run while the package is installed;
  // cleanup runs afterwards on every path (the v1.0.1 restructuring: the
  // original order launched AFTER dpkg -r, which could never work).
  try {
    const identity = collectDesktopIdentityFindings({ run });
    for (const line of identity.logLines) {
      console.error(line);
    }
    if (identity.findings.length > 0) {
      fail(EXIT.IDENTITY, `installed product identity assertions failed:\n  - ${identity.findings.join("\n  - ")}`);
    }
    receipt.assertions.push("desktop entry Name=PaySwap ok", "icon ok", "exec binary ok", "package payswap ok");

    if (args.launch) {
      if (!identity.execBinary) {
        fail(EXIT.IDENTITY, "--launch requested but the desktop entry Exec= binary did not resolve");
      }
      verifyLaunch({ execBinary: identity.execBinary, receipt });
    }
  } finally {
    if (!args.keep) {
      const removeResult = run(dpkgCommand, [...dpkgArgs, "-r", "payswap"]);
      receipt.cleanup = removeResult.status === 0 ? "dpkg -r payswap ok" : `dpkg -r failed (exit ${removeResult.status})`;
      console.error(`[install-verify] ${receipt.cleanup}`);
    } else {
      receipt.cleanup = "kept installed (--keep)";
    }
  }

  if (appImageAsset && !args.skipAppImage) {
    const appImagePath = join(args.workdir, appImageAsset.name);
    await downloadAsset(appImageAsset.browser_download_url, appImagePath);
    const appImageFindings = collectAppImageFindings({
      path: appImagePath,
      checksums,
      assetName: appImageAsset.name,
      chmodSync,
    });
    if (appImageFindings.length > 0) {
      fail(EXIT.APPIMAGE, `AppImage checks failed:\n  - ${appImageFindings.join("\n  - ")}`);
    }
    console.error("[install-verify] AppImage structure + checksum + executable bit ✓");
    receipt.assets.push({
      name: appImageAsset.name,
      size: appImageAsset.size,
      checksumVerified: true,
      structureChecked: true,
    });
  }

  receipt.finishedAt = new Date().toISOString();
}

main().catch((error) => {
  if (typeof error?.message === "string" && error.message.startsWith("__exit_")) {
    return;
  }
  console.error("[install-verify] unexpected failure:", error);
  process.exit(1);
});
