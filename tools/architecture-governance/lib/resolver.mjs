// resolver.mjs — import specifier classification and resolution (P0-W2).
//
// Resolution semantics follow the repository's own prior art
// (scripts/dependency-graph.mjs) with two governance additions:
//   - exports-map enforcement: subpath imports of a package that declares
//     `exports` must be covered by an exports key (including `*` patterns),
//     otherwise the edge is flagged as a deep import;
//   - cross-package relative imports (a relative path that escapes the
//     importing package) are flagged as boundary bypasses.
//
// `@/` aliases resolve inside the OWNING package's src/ (same semantics as
// the repo's existing tooling) and are therefore intra-package edges.

import fs from "node:fs";
import path from "node:path";

const EXTENSION_CANDIDATES = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  "/index.ts",
  "/index.tsx",
  "/index.mjs",
  "/index.cjs",
  "/index.js",
  "/index.jsx",
];

function fileExists(absPath) {
  try {
    return fs.statSync(absPath).isFile();
  } catch {
    return false;
  }
}

function resolveFileCandidates(basePath) {
  const normalized = basePath.replaceAll("\\", "/");
  // Exact match: specifier already carries a real file extension.
  if (/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(normalized) && fileExists(normalized)) {
    return normalized;
  }
  for (const suffix of EXTENSION_CANDIDATES) {
    const candidate = `${normalized}${suffix}`;
    if (fileExists(candidate)) return candidate;
  }
  // ESM `.js` specifier -> `.ts` source remap convention.
  if (normalized.endsWith(".js")) {
    const tsBase = `${normalized.slice(0, -3)}.ts`;
    if (fileExists(tsBase)) return tsBase;
  }
  return null;
}

/**
 * Extract the string target of an exports entry (string or nested
 * conditions object), following the same traversal as the repo's
 * existing tooling.
 */
export function extractStringExportTarget(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  for (const nestedValue of Object.values(value)) {
    const target = extractStringExportTarget(nestedValue);
    if (target) return target;
  }
  return null;
}

function matchStarKey(key, subpathLike) {
  const starIndex = key.indexOf("*");
  if (starIndex === -1) return null;
  const prefix = key.slice(0, starIndex);
  const suffix = key.slice(starIndex + 1);
  if (
    subpathLike.length >= prefix.length + suffix.length &&
    subpathLike.startsWith(prefix) &&
    subpathLike.endsWith(suffix)
  ) {
    return subpathLike.slice(prefix.length, subpathLike.length - suffix.length);
  }
  return null;
}

/**
 * Does an exports map cover the requested subpath? Handles `*` keys.
 * @param {object|null} exportsMap
 * @param {string} subpathLike "./x/y" or "."
 * @returns {boolean}
 */
export function exportsCovers(exportsMap, subpathLike) {
  if (!exportsMap) return false;
  if (Object.prototype.hasOwnProperty.call(exportsMap, subpathLike)) return true;
  for (const key of Object.keys(exportsMap)) {
    if (matchStarKey(key, subpathLike) !== null) return true;
  }
  return false;
}

/** Resolve an exports entry (exact or `*` key) to a file. */
function resolveViaExports(targetPackage, subpathLike) {
  const exact = targetPackage.exports?.[subpathLike];
  if (exact !== undefined) {
    const target = extractStringExportTarget(exact);
    if (target) {
      const resolved = resolveFileCandidates(path.join(targetPackage.absDir, target));
      if (resolved) return resolved;
    }
  }
  for (const key of Object.keys(targetPackage.exports ?? {})) {
    const captured = matchStarKey(key, subpathLike);
    if (captured === null) continue;
    const value = extractStringExportTarget(targetPackage.exports[key]);
    if (!value) continue;
    const starIndexValue = value.indexOf("*");
    const substituted =
      starIndexValue === -1
        ? value
        : `${value.slice(0, starIndexValue)}${captured}${value.slice(starIndexValue + 1)}`;
    const resolved = resolveFileCandidates(path.join(targetPackage.absDir, substituted));
    if (resolved) return resolved;
  }
  return null;
}

// Node core modules that may be imported without the `node:` prefix
// (documented list; anything else bare is treated as external).
const NODE_CORE_MODULES = new Set([
  "assert", "async_hooks", "buffer", "child_process", "cluster", "console",
  "constants", "crypto", "dgram", "dns", "domain", "events", "fs", "http",
  "http2", "https", "inspector", "module", "net", "os", "path", "perf_hooks",
  "process", "punycode", "querystring", "readline", "repl", "stream",
  "string_decoder", "sys", "timers", "tls", "trace_events", "tty", "url",
  "util", "v8", "vm", "wasi", "worker_threads", "zlib",
]);

/**
 * Classify and (when possible) resolve one import specifier.
 * @param {{specifier: string, line: number, kind: string, typeOnly: boolean}} occurrence
 * @param {string} sourceFile absolute path of the importing file
 * @param {{absDir: string, srcRoot: string, name: string, exports: object|null,
 *          dir: string}[]} packages all workspace packages
 * @param {string} currentPackageDir absolute dir of the importing package
 * @returns {{specifier: string, line: number, kind: string, typeOnly: boolean,
 *            classification: string, targetPackage: object|null,
 *            targetFile: string|null, deepImport: boolean,
 *            deepImportReason: string|null, crossPackageRelative: boolean}}
 */
export function resolveSpecifier(occurrence, sourceFile, packages, currentPackageDir) {
  const { specifier } = occurrence;
  const result = {
    specifier,
    line: occurrence.line,
    kind: occurrence.kind,
    typeOnly: occurrence.typeOnly,
    classification: "external",
    targetPackage: null,
    targetFile: null,
    deepImport: false,
    deepImportReason: null,
    crossPackageRelative: false,
  };

  if (specifier.startsWith("node:") || specifier.startsWith("bun:") || specifier === "bun") {
    result.classification = "builtin";
    return result;
  }
  const rootModuleName = specifier.startsWith("@")
    ? null
    : specifier.split("/")[0];
  if (rootModuleName && NODE_CORE_MODULES.has(rootModuleName)) {
    result.classification = "builtin";
    return result;
  }

  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const resolvedBase = path.resolve(path.dirname(sourceFile), specifier);
    const resolvedFile = resolveFileCandidates(resolvedBase);
    result.classification = "relative";
    if (!resolvedFile) return result;
    result.targetFile = resolvedFile;
    const escapes =
      !resolvedFile.startsWith(`${currentPackageDir}${path.sep}`) && resolvedFile !== currentPackageDir;
    if (escapes) {
      result.crossPackageRelative = true;
      result.targetPackage =
        packages.find(
          (pkg) => resolvedFile === pkg.absDir || resolvedFile.startsWith(`${pkg.absDir}${path.sep}`),
        ) ?? null;
    }
    return result;
  }

  if (specifier.startsWith("@/")) {
    const srcRoot = path.join(currentPackageDir, "src");
    const resolvedFile = resolveFileCandidates(path.join(srcRoot, specifier.slice(2)));
    result.classification = "alias";
    if (resolvedFile) {
      result.targetFile = resolvedFile;
      if (!resolvedFile.startsWith(`${currentPackageDir}${path.sep}`)) {
        result.crossPackageRelative = true;
      }
    }
    return result;
  }

  // Bare specifier: workspace package or external dependency.
  const segments = specifier.split("/");
  const isScoped = specifier.startsWith("@");
  const name = isScoped ? segments.slice(0, 2).join("/") : segments[0];
  const subPath = segments.slice(isScoped ? 2 : 1).join("/");
  const targetPackage = packages.find((pkg) => pkg.name === name) ?? null;
  if (!targetPackage) {
    result.classification = "external";
    return result;
  }
  result.classification = "workspace";
  result.targetPackage = targetPackage;

  if (subPath === "") {
    const rootExport = targetPackage.exports?.["."];
    if (rootExport !== undefined) {
      const target = extractStringExportTarget(rootExport);
      if (target) {
        const resolved = resolveFileCandidates(path.join(targetPackage.absDir, target));
        if (resolved) {
          result.targetFile = resolved;
          return result;
        }
      }
    }
    const resolved = resolveFileCandidates(path.join(targetPackage.srcRoot, "index"));
    if (resolved) result.targetFile = resolved;
    return result;
  }

  const subpathLike = `./${subPath}`;
  if (targetPackage.exports) {
    if (!exportsCovers(targetPackage.exports, subpathLike)) {
      result.deepImport = true;
      result.deepImportReason = "not-covered-by-exports";
    }
    const viaExports = resolveViaExports(targetPackage, subpathLike);
    if (viaExports) {
      result.targetFile = viaExports;
      return result;
    }
  } else {
    // No exports map at all: every subpath bypasses the package boundary.
    result.deepImport = true;
    result.deepImportReason = "no-exports-map";
  }
  const fallback = resolveFileCandidates(path.join(targetPackage.srcRoot, subPath));
  if (fallback) result.targetFile = fallback;
  return result;
}
