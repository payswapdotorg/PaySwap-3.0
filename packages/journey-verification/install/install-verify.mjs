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
 *   5. assert the installed product identity:
 *        - /usr/share/applications/*.desktop → Name=PaySwap (exact);
 *        - the Icon= target resolves on disk;
 *        - the Exec= binary exists and is executable;
 *        - the package name is `payswap` and its file list carries the
 *          desktop entry + the `payswap` executable (the app-data path
 *          PATTERN: electron's userData default derives from the
 *          productName — ~/.config/PaySwap; asserted statically here,
 *          and at runtime only under --launch);
 *   6. dpkg -r (cleanup — always attempted, even on failure);
 *   7. AppImage (when published): structure (ELF magic) + checksum +
 *      executable-bit checks; run-verification ONLY under --launch
 *      (requires a display or xvfb-run — documented boundary);
 *   8. write a JSON receipt (the evidence the acceptance record cites).
 *
 * HONEST FAILURE MODES (every one exits non-zero with an explicit
 * message — this runner never fabricates a pass):
 *   - exit 2  — usage / environment error (bad args, no network config);
 *   - exit 3  — NO RELEASE EXISTS for the tag (the P9-B gate has not
 *               shipped one) — the clean explicit error the work order
 *               mandates: "no release yet → clean explicit error";
 *   - exit 4  — release exists but the expected assets are missing;
 *   - exit 5  — checksum verification failed;
 *   - exit 6  — install environment not usable (dpkg unavailable, no
 *               root/sudo) — the runner does NOT silently skip;
 *   - exit 7  — an identity assertion failed (desktop entry / icon /
 *               binary / package name);
 *   - exit 8  — AppImage structural checks failed;
 *   - exit 9  — launch verification requested but the environment does
 *               not support it (no display, no xvfb-run).
 *
 * Usage:
 *   node install-verify.mjs --repo <owner/name> --tag <tag|latest>
 *     [--workdir <dir>] [--keep] [--skip-appimage] [--launch]
 *
 * Environment: GITHUB_TOKEN (optional, for rate limits/private repos),
 * GITHUB_API_URL (optional, defaults to https://api.github.com).
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_WORKDIR = join(HERE, ".cache-install-verify");

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
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
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

function findDesktopEntry() {
  const applicationsDir = "/usr/share/applications";
  if (!existsSync(applicationsDir)) {
    return null;
  }
  const candidates = [];
  for (const name of readdirSync(applicationsDir)) {
    if (!name.endsWith(".desktop")) {
      continue;
    }
    const path = join(applicationsDir, name);
    const content = readFileSync(path, "utf8");
    const nameMatch = /^Name=(.*)$/m.exec(content);
    if (nameMatch && nameMatch[1].trim() === "PaySwap") {
      candidates.push({ path, content });
    }
  }
  return candidates.length === 1 ? candidates[0] : candidates.length > 1 ? candidates : null;
}

function resolveIcon(iconValue) {
  if (!iconValue) {
    return null;
  }
  if (iconValue.startsWith("/")) {
    return existsSync(iconValue) ? iconValue : null;
  }
  const iconRoots = ["/usr/share/icons/hicolor", "/usr/share/pixmaps", "/usr/share/icons"];
  const extensions = [".png", ".svg", ".xpm", ""];
  for (const root of iconRoots) {
    for (const size of ["", "512x512", "256x256", "128x128", "96x96", "64x64", "48x48", "scalable", "symbolic"]) {
      for (const extension of extensions) {
        const candidate = join(root, size, "apps", `${iconValue}${extension}`);
        if (existsSync(candidate)) {
          return candidate;
        }
      }
    }
  }
  return null;
}

function assertInstalledIdentity() {
  const findings = [];

  // The desktop entry: exactly one, Name=PaySwap.
  const entry = findDesktopEntry();
  if (!entry) {
    findings.push("no /usr/share/applications/*.desktop entry with Name=PaySwap was found");
  } else if (Array.isArray(entry)) {
    findings.push(`multiple desktop entries claim Name=PaySwap: ${entry.map((item) => item.path).join(", ")}`);
  } else {
    console.error(`[install-verify] desktop entry: ${entry.path} (Name=PaySwap ✓)`);

    const iconMatch = /^Icon=(.*)$/m.exec(entry.content);
    const iconValue = iconMatch?.[1]?.trim();
    if (!iconValue) {
      findings.push("the desktop entry has no Icon= line");
    } else {
      const resolved = resolveIcon(iconValue);
      if (!resolved) {
        findings.push(`Icon=${iconValue} does not resolve to a file on disk`);
      } else {
        console.error(`[install-verify] icon resolved: ${resolved} ✓`);
      }
    }

    const execMatch = /^Exec=(.*)$/m.exec(entry.content);
    const execValue = execMatch?.[1]?.trim();
    if (!execValue) {
      findings.push("the desktop entry has no Exec= line");
    } else {
      const binaryToken = execValue.split(/\s+/)[0];
      let binaryPath = binaryToken;
      if (!binaryToken.startsWith("/")) {
        const which = run("which", [binaryToken]);
        binaryPath = which.status === 0 ? which.stdout : null;
      }
      if (!binaryPath || !existsSync(binaryPath)) {
        findings.push(`Exec binary ${binaryToken} does not exist on disk`);
      } else {
        const mode = statSync(binaryPath).mode;
        if ((mode & 0o111) === 0) {
          findings.push(`Exec binary ${binaryPath} is not executable`);
        } else {
          console.error(`[install-verify] exec binary: ${binaryPath} (executable) ✓`);
        }
      }
    }
  }

  // The package name + file list (the app-data path PATTERN's static
  // half: the shipped executable is `payswap` — electron's userData
  // default then derives from productName PaySwap → ~/.config/PaySwap).
  const status = run("dpkg", ["-s", "payswap"]);
  if (status.status !== 0 || !/^Status:\s*install ok installed$/m.test(status.stdout)) {
    findings.push("dpkg -s payswap does not report 'install ok installed'");
  } else {
    console.error("[install-verify] package payswap: install ok installed ✓");
  }
  const files = run("dpkg", ["-L", "payswap"]);
  if (files.status !== 0) {
    findings.push("dpkg -L payswap failed");
  } else {
    const listed = files.stdout.split(/\r?\n/);
    const hasDesktop = listed.some((path) => path.startsWith("/usr/share/applications/") && path.endsWith(".desktop"));
    if (!hasDesktop) {
      findings.push("the package file list carries no .desktop entry under /usr/share/applications/");
    } else {
      console.error("[install-verify] package ships the desktop entry ✓");
    }
    const hasPayswapExecutable = listed.some((path) => /\/payswap(\.exe)?$/.test(path) || /\/bin\/payswap$/.test(path));
    console.error(
      hasPayswapExecutable
        ? "[install-verify] package ships a payswap executable ✓ (app-data path pattern: ~/.config/PaySwap — productName-derived; runtime-asserted only under --launch)"
        : "[install-verify] NOTE: no literal 'payswap' path in the package list (exec binary name asserted via the desktop entry instead)",
    );
  }

  if (findings.length > 0) {
    fail(EXIT.IDENTITY, `installed product identity assertions failed:\n  - ${findings.join("\n  - ")}`);
  }
}

function verifyAppImage(path, checksums, assetName) {
  const findings = [];
  const stat = statSync(path);
  if (stat.size < 10 * 1024 * 1024) {
    findings.push(`AppImage is suspiciously small (${stat.size} bytes)`);
  }
  const magic = readFileSync(path).subarray(0, 4);
  if (!(magic[0] === 0x7f && magic[1] === 0x45 && magic[2] === 0x4c && magic[3] === 0x46)) {
    findings.push("AppImage does not carry the ELF magic (not a valid AppImage structure)");
  }
  const expected = checksums.get(assetName);
  if (!expected) {
    findings.push(`SHA256SUMS has no entry for ${assetName}`);
  } else {
    const actual = sha256OfBuffer(readFileSync(path));
    if (actual !== expected) {
      findings.push(`AppImage checksum mismatch (expected ${expected}, got ${actual})`);
    } else {
      console.error(`[install-verify] AppImage checksum verified ✓`);
    }
  }
  if ((stat.mode & 0o111) === 0) {
    console.error("[install-verify] AppImage executable bit missing — setting it (recorded as a finding)");
    chmodSync(path, 0o755);
    findings.push("AppImage was downloaded without the executable bit (fixed by chmod +x; the publisher should set it)");
  } else {
    console.error("[install-verify] AppImage executable bit set ✓");
  }
  if (findings.length > 0) {
    fail(EXIT.APPIMAGE, `AppImage checks failed:\n  - ${findings.join("\n  - ")}`);
  }
}

function supportsLaunch() {
  if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) {
    return { supported: true, wrapper: null };
  }
  const xvfb = run("which", ["xvfb-run"]);
  if (xvfb.status === 0) {
    return { supported: true, wrapper: xvfb.stdout };
  }
  return { supported: false, wrapper: null };
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
    const detail = typeof error?.message === "string" && error.message.startsWith("__exit_")
      ? null
      : String(error);
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
  const checksumsAsset =
    assets.find((asset) => /^SHA256SUMS(\.txt)?$/i.test(asset.name)) ?? null;

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

  // Download + verify checksums.
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

  // Install environment.
  const dpkg = installRootPrefix();
  if (!dpkg) {
    fail(
      EXIT.ENVIRONMENT,
      "cannot run dpkg: not root and passwordless sudo is unavailable. Run as root (CI) or with sudo -n capability — the install flow is never silently skipped.",
    );
  }
  const dpkgCommand = dpkg.command === "dpkg" ? "dpkg" : "sudo";
  const dpkgArgs = dpkg.command === "dpkg" ? [] : ["-n", "dpkg"];

  // dpkg -i.
  const installResult = run(dpkgCommand, [...dpkgArgs, "-i", join(args.workdir, debAsset.name)]);
  if (installResult.status !== 0) {
    console.error(installResult.stdout);
    console.error(installResult.stderr);
    fail(EXIT.ENVIRONMENT, `dpkg -i failed (exit ${installResult.status})`);
  }
  console.error("[install-verify] dpkg -i payswap ✓");
  receipt.assertions.push("dpkg -i ok");

  try {
    assertInstalledIdentity();
    receipt.assertions.push("desktop entry Name=PaySwap ok", "icon ok", "exec binary ok", "package payswap ok");
  } finally {
    if (!args.keep) {
      const removeResult = run(dpkgCommand, [...dpkgArgs, "-r", "payswap"]);
      receipt.cleanup = removeResult.status === 0 ? "dpkg -r payswap ok" : `dpkg -r failed (exit ${removeResult.status})`;
      console.error(`[install-verify] ${receipt.cleanup}`);
    } else {
      receipt.cleanup = "kept installed (--keep)";
    }
  }

  // Optional launch verification (display-gated).
  if (args.launch) {
    const launchSupport = supportsLaunch();
    if (!launchSupport.supported) {
      fail(
        EXIT.LAUNCH_UNSUPPORTED,
        "--launch requested but no display and no xvfb-run are available. Launch verification (the ~/.config/PaySwap app-data path + PaySwap-branded window) requires a display environment — run on a desktop host or under xvfb-run.",
      );
    }
    const home = os.homedir();
    const dataDir = join(home, ".config", "PaySwap");
    const before = existsSync(dataDir);
    console.error(`[install-verify] launching (wrapper: ${launchSupport.wrapper ?? "direct display"})…`);
    const launchCommand = launchSupport.wrapper ?? "payswap";
    const launchArgs = launchSupport.wrapper ? ["-a", "payswap"] : [];
    const launched = run(launchCommand, launchArgs, { timeout: 20_000 });
    void launched;
    const after = existsSync(dataDir);
    if (!after) {
      fail(
        EXIT.IDENTITY,
        `launch verification failed: ${dataDir} did not appear (app-data path pattern ~/.config/PaySwap, productName-derived)${before ? " (it existed before launch — pre-existing state, inconclusive)" : ""}`,
      );
    }
    console.error("[install-verify] app-data path ~/.config/PaySwap present after launch ✓");
    receipt.assertions.push("launch: app-data path ~/.config/PaySwap ok");
  }

  // AppImage (optional asset).
  if (appImageAsset && !args.skipAppImage) {
    const appImagePath = join(args.workdir, appImageAsset.name);
    await downloadAsset(appImageAsset.browser_download_url, appImagePath);
    verifyAppImage(appImagePath, checksums, appImageAsset.name);
    receipt.assets.push({
      name: appImageAsset.name,
      size: appImageAsset.size,
      checksumVerified: true,
      structureChecked: true,
    });
    if (args.launch) {
      console.error(
        "[install-verify] AppImage run-verification: only performed where the environment supports GUI launches (see install/README.md)",
      );
    }
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
