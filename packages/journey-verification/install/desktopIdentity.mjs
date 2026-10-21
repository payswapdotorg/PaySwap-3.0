#!/usr/bin/env node
/**
 * @payswap/journey-verification — installed desktop-identity assertions
 * (the assertion half of install-verify.mjs; extracted so the runner stays
 * under the repository max-lines lint gate).
 *
 * Every function here returns FINDINGS — it never exits the process. The
 * runner owns the exit protocol and turns findings into failures.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const APPLICATIONS_DIR = "/usr/share/applications";
const ICON_ROOTS = ["/usr/share/icons/hicolor", "/usr/share/pixmaps", "/usr/share/icons"];

/** Exactly-one /usr/share/applications entry with Name=PaySwap. */
export function findDesktopEntry() {
  if (!existsSync(APPLICATIONS_DIR)) {
    return null;
  }
  const candidates = [];
  for (const name of readdirSync(APPLICATIONS_DIR)) {
    if (!name.endsWith(".desktop")) {
      continue;
    }
    const path = join(APPLICATIONS_DIR, name);
    const content = readFileSync(path, "utf8");
    const nameMatch = /^Name=(.*)$/m.exec(content);
    if (nameMatch && nameMatch[1].trim() === "PaySwap") {
      candidates.push({ path, content });
    }
  }
  if (candidates.length === 1) {
    return candidates[0];
  }
  return candidates.length > 1 ? candidates : null;
}

/** Resolve an Icon= value (absolute or hicolor/pixmaps name) to a file. */
export function resolveIcon(iconValue) {
  if (!iconValue) {
    return null;
  }
  if (iconValue.startsWith("/")) {
    return existsSync(iconValue) ? iconValue : null;
  }
  const sizes = ["", "512x512", "256x256", "128x128", "96x96", "64x64", "48x48", "scalable", "symbolic"];
  for (const root of ICON_ROOTS) {
    for (const size of sizes) {
      for (const extension of [".png", ".svg", ".xpm", ""]) {
        const candidate = join(root, size, "apps", `${iconValue}${extension}`);
        if (existsSync(candidate)) {
          return candidate;
        }
      }
    }
  }
  return null;
}

/** Resolve the desktop entry Exec= binary to an absolute path (or null). */
export function resolveDesktopEntryExecBinary(entryContent, run) {
  const execMatch = /^Exec=(.*)$/m.exec(entryContent);
  const execValue = execMatch?.[1]?.trim();
  if (!execValue) {
    return null;
  }
  const binaryToken = execValue.split(/\s+/)[0];
  if (binaryToken.startsWith("/")) {
    return binaryToken;
  }
  const which = run("which", [binaryToken]);
  return which.status === 0 ? which.stdout : null;
}

/**
 * AppImage structural checks (ELF magic + checksum). Returns
 * { findings, notes } — never exits. The executable bit is NOT a
 * finding: a plain HTTPS download can never preserve it (GitHub release
 * downloads arrive 0644 for every AppImage ever published); the
 * documented user step is `chmod +x` (README), so the probe sets it and
 * records a note.
 */
export function collectAppImageFindings({ path, checksums, assetName, chmodSync }) {
  const findings = [];
  const notes = [];
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
    const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
    if (actual !== expected) {
      findings.push(`AppImage checksum mismatch (expected ${expected}, got ${actual})`);
    }
  }
  if ((stat.mode & 0o111) === 0) {
    if (chmodSync) {
      chmodSync(path, 0o755);
    }
    notes.push("AppImage downloaded without the executable bit (expected for any HTTPS download); chmod +x applied — the documented user step");
  }
  return { findings, notes };
}

/**
 * The full installed-identity battery. Returns
 * { findings: string[], logLines: string[], execBinary: string | null }.
 */
export function collectDesktopIdentityFindings({ run }) {
  const findings = [];
  const logLines = [];
  let execBinary = null;

  const entry = findDesktopEntry();
  if (!entry) {
    findings.push(`no ${APPLICATIONS_DIR}/*.desktop entry with Name=PaySwap was found`);
  } else if (Array.isArray(entry)) {
    findings.push(`multiple desktop entries claim Name=PaySwap: ${entry.map((item) => item.path).join(", ")}`);
  } else {
    logLines.push(`[install-verify] desktop entry: ${entry.path} (Name=PaySwap ✓)`);

    const iconMatch = /^Icon=(.*)$/m.exec(entry.content);
    const iconValue = iconMatch?.[1]?.trim();
    if (!iconValue) {
      findings.push("the desktop entry has no Icon= line");
    } else {
      const resolved = resolveIcon(iconValue);
      if (!resolved) {
        findings.push(`Icon=${iconValue} does not resolve to a file on disk`);
      } else {
        logLines.push(`[install-verify] icon resolved: ${resolved} ✓`);
      }
    }

    execBinary = resolveDesktopEntryExecBinary(entry.content, run);
    if (!execBinary) {
      findings.push("the desktop entry Exec= binary does not resolve on disk");
    } else if (!existsSync(execBinary) || (statSync(execBinary).mode & 0o111) === 0) {
      findings.push(`Exec binary ${execBinary} is missing or not executable`);
    } else {
      logLines.push(`[install-verify] exec binary: ${execBinary} (executable) ✓`);
    }
  }

  const status = run("dpkg", ["-s", "payswap"]);
  if (status.status !== 0 || !/^Status:\s*install ok installed$/m.test(status.stdout)) {
    findings.push("dpkg -s payswap does not report 'install ok installed'");
  } else {
    logLines.push("[install-verify] package payswap: install ok installed ✓");
  }

  const files = run("dpkg", ["-L", "payswap"]);
  if (files.status !== 0) {
    findings.push("dpkg -L payswap failed");
  } else {
    const listed = files.stdout.split(/\r?\n/);
    const hasDesktop = listed.some(
      (path) => path.startsWith("/usr/share/applications/") && path.endsWith(".desktop"),
    );
    if (!hasDesktop) {
      findings.push("the package file list carries no .desktop entry under /usr/share/applications/");
    } else {
      logLines.push("[install-verify] package ships the desktop entry ✓");
    }
    const hasPayswapExecutable = listed.some((path) => path.endsWith("/payswap"));
    logLines.push(
      hasPayswapExecutable
        ? "[install-verify] package ships a payswap executable ✓ (app-data path pattern: ~/.config/PaySwap — productName-derived; runtime-asserted only under --launch)"
        : "[install-verify] NOTE: no literal 'payswap' path in the package list (exec binary name asserted via the desktop entry instead)",
    );
  }

  return { findings, logLines, execBinary };
}
