// workspace.mjs — workspace package discovery (P0-W2).
//
// Reads pnpm-workspace.yaml `packages:` globs (supporting the only wildcard
// forms this repository uses: literal dirs and `*` segments) and every
// matching directory containing a package.json. Pure fs, zero deps.

import fs from "node:fs";
import path from "node:path";
import { parseYamlMini } from "./yaml-mini.mjs";

const IGNORE_DIR_NAMES = new Set([
  "node_modules",
  "dist",
  "dist-types",
  "out",
  "build",
  "coverage",
  ".turbo",
  ".next",
]);

/**
 * Expand a pnpm workspace glob like "packages/*" or "apps/zcode-cli".
 * Only `*` wildcards are supported (the repository uses nothing else).
 * @param {string} root absolute repo root
 * @param {string} glob workspace pattern
 * @returns {string[]} repo-relative matching directories
 */
export function expandWorkspaceGlob(root, glob) {
  const normalized = glob.replaceAll("\\", "/").replace(/\/+$/, "");
  const segments = normalized.split("/");
  const results = [];
  function walk(index, currentDir) {
    if (index >= segments.length) {
      if (fs.existsSync(path.join(root, currentDir, "package.json"))) {
        results.push(currentDir);
      }
      return;
    }
    const segment = segments[index];
    if (segment === "*") {
      let entries = [];
      try {
        entries = fs.readdirSync(path.join(root, currentDir), { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
        if (IGNORE_DIR_NAMES.has(entry.name)) continue;
        walk(index + 1, currentDir ? `${currentDir}/${entry.name}` : entry.name);
      }
      return;
    }
    const nextDir = currentDir ? `${currentDir}/${segment}` : segment;
    if (fs.existsSync(path.join(root, nextDir))) {
      walk(index + 1, nextDir);
    }
  }
  walk(0, "");
  return results;
}

/**
 * Discover all workspace packages.
 * @param {string} root absolute repo root
 * @returns {{dir: string, absDir: string, name: string, exports: object|null,
 *            dependencies: string[], devDependencies: string[], srcRoot: string}[]}
 */
export function discoverWorkspacePackages(root) {
  const workspaceFile = path.join(root, "pnpm-workspace.yaml");
  if (!fs.existsSync(workspaceFile)) {
    throw new Error(`pnpm-workspace.yaml not found at ${workspaceFile}`);
  }
  const workspace = parseYamlMini(fs.readFileSync(workspaceFile, "utf8"));
  const globs = Array.isArray(workspace.packages) ? workspace.packages : [];
  if (globs.length === 0) {
    throw new Error("pnpm-workspace.yaml contains no packages globs");
  }
  const dirs = new Set();
  for (const glob of globs) {
    if (typeof glob !== "string") continue;
    for (const dir of expandWorkspaceGlob(root, glob)) dirs.add(dir);
  }
  const packages = [];
  for (const dir of Array.from(dirs).sort()) {
    const absDir = path.join(root, dir);
    const packageJsonPath = path.join(absDir, "package.json");
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    } catch (error) {
      throw new Error(`unreadable package.json at ${packageJsonPath}: ${error.message}`);
    }
    packages.push({
      dir,
      absDir,
      name: typeof manifest.name === "string" ? manifest.name : dir,
      exports:
        manifest.exports && typeof manifest.exports === "object" && !Array.isArray(manifest.exports)
          ? manifest.exports
          : null,
      dependencies: Object.keys(manifest.dependencies ?? {}),
      devDependencies: Object.keys(manifest.devDependencies ?? {}),
      srcRoot: path.join(absDir, "src"),
    });
  }
  // Duplicate npm names across distinct directories are a workspace defect:
  // resolution by name would be ambiguous. Fail closed with a precise error.
  const byName = new Map();
  for (const pkg of packages) {
    const existing = byName.get(pkg.name);
    if (existing && existing.dir !== pkg.dir) {
      throw new Error(
        `duplicate workspace package name "${pkg.name}" in ${existing.dir} and ${pkg.dir}`,
      );
    }
    byName.set(pkg.name, pkg);
  }
  return packages;
}

/**
 * Walk code files under a directory (scanner-supported extensions only).
 * @param {string} absDir
 * @returns {string[]} absolute file paths
 */
export function walkCodeFiles(absDir) {
  const files = [];
  if (!fs.existsSync(absDir)) return files;
  const stack = [absDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const stats = fs.statSync(current);
    if (stats.isDirectory()) {
      let entries = [];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (IGNORE_DIR_NAMES.has(entry.name)) continue;
        stack.push(path.join(current, entry.name));
      }
      continue;
    }
    files.push(current);
  }
  return files.sort();
}

/**
 * Find the package owning a file path.
 * @param {string} absFilePath
 * @param {{absDir: string}[]} packages
 */
export function findOwningPackage(absFilePath, packages) {
  let best = null;
  for (const pkg of packages) {
    if (absFilePath === pkg.absDir || absFilePath.startsWith(`${pkg.absDir}${path.sep}`)) {
      if (!best || pkg.absDir.length > best.absDir.length) best = pkg;
    }
  }
  return best;
}
