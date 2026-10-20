/**
 * @payswap/operations — the NO-DEPLOYMENT-EXECUTION law (P8-W3, law 9).
 *
 * The package is CONTRACTS + VERIFICATION ONLY. It never executes a
 * deployment, never touches a live provider, never fabricates runtime
 * evidence. Actual production deployment remains OPERATOR-AUTHORIZED
 * (the standing law); the records this package declares make it
 * verifiable WHEN it happens.
 *
 * This module encodes the law mechanically:
 * - `OPERATIONS_CAPABILITY_CLASS` declares the capability class;
 * - `FORBIDDEN_EXECUTION_CAPABILITIES` is the closed vocabulary of
 *   execution machinery no file under src/ may contain (process
 *   spawning, network clients, container/cluster drivers, exit calls);
 * - `checkContractsOnlySources` scans PROVIDED sources (comment- and
 *   string-literal-aware) for that vocabulary — the battery runs it over
 *   the real src tree, and the TL can run it at integration;
 * - `OPERATOR_AUTHORIZATION_BOUNDARY` records the standing law as data,
 *   digest-anchored so the evidence records cite it exactly.
 *
 * Deterministic only: data + a pure scanner.
 */

import { contentDigest } from "./digest.js";

/** The capability class of this package (law 9, as data). */
export const OPERATIONS_CAPABILITY_CLASS =
  "CONTRACTS_AND_VERIFICATION_ONLY" as const;

const OPERATOR_AUTHORIZATION_LAW_TEXT = [
  "Production deployment remains subject to explicit operator authorization.",
  "The operations package declares contracts and verification only:",
  "it never executes a deployment, never touches a live provider, and",
  "never fabricates runtime evidence. Its records make the operator's",
  "deployment verifiable when it happens.",
].join(" ");

/**
 * The standing law, as digest-anchored data: production deployment is
 * executed only under explicit operator authorization. This package
 * certifies release-READINESS — the capability + the evidence — never a
 * deployment.
 */
export const OPERATOR_AUTHORIZATION_BOUNDARY: {
  readonly law: string;
  readonly digest: string;
} = Object.freeze({
  law: OPERATOR_AUTHORIZATION_LAW_TEXT,
  digest: contentDigest(OPERATOR_AUTHORIZATION_LAW_TEXT),
});

// ---------------------------------------------------------------------------
// The forbidden execution vocabulary (closed set)
// ---------------------------------------------------------------------------

/**
 * Execution machinery no src/ file may contain — in CODE (comments and
 * string literals are stripped before matching, so this file's own
 * vocabulary literals do not self-match). Process spawning, network
 * clients, container/cluster drivers, ambient exits.
 */
export const FORBIDDEN_EXECUTION_CAPABILITIES: readonly string[] =
  Object.freeze([
    "node:child_process",
    "child_process",
    "spawnSync",
    "execSync",
    "execFile",
    "spawn(",
    "kubectl",
    "dockerode",
    "docker(",
    "SSHClient",
    "tls.connect",
    "net.connect",
    "http.request",
    "https.request",
    "XMLHttpRequest",
    "WebSocket(",
    "fetch(",
    "process.exit",
    "process.kill",
    "deployNow",
    "executeDeployment",
  ]);

// ---------------------------------------------------------------------------
// The contracts-only scanner (pure)
// ---------------------------------------------------------------------------

/** Strip quoted string literals (prose/declarations are not code). */
function stripStringLiterals(source: string): string {
  let result = "";
  let quote: '"' | "'" | "`" | null = null;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quote !== null) {
      if (char === "\\") {
        i += 1; // skip the escaped character
        continue;
      }
      if (char === quote) {
        quote = null;
        result += "''";
      }
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    result += char;
  }
  return result;
}

/** Strip line + block comments (prose is not code). */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

export interface ContractsOnlyReport {
  readonly ok: boolean;
  readonly violations: readonly string[];
}

/**
 * Scan provided sources for execution machinery (law 9). Pure: takes
 * `{ path, source }` pairs, strips comments and string literals, and
 * reports every file that contains forbidden execution vocabulary in
 * code. The battery runs this over the real src tree.
 */
export function checkContractsOnlySources(
  files: readonly { readonly path: string; readonly source: string }[],
): ContractsOnlyReport {
  const violations: string[] = [];
  for (const file of files) {
    const code = stripStringLiterals(stripComments(file.source));
    for (const capability of FORBIDDEN_EXECUTION_CAPABILITIES) {
      if (code.includes(capability)) {
        violations.push(
          `${file.path} contains execution machinery '${capability}' — contracts + verification only (law 9)`,
        );
      }
    }
  }
  return { ok: violations.length === 0, violations };
}

/**
 * Classify a capability name against the boundary: is the named
 * operation inside this package's authority (a contract/checker) or
 * outside it (execution)? Used by the evidence records to classify each
 * declared export honestly.
 */
export function classifyCapability(
  capabilityName: string,
): "IN_PACKAGE_AUTHORITY" | "OPERATOR_AUTHORIZED_EXECUTION" {
  return FORBIDDEN_EXECUTION_CAPABILITIES.some((capability) =>
    capabilityName.includes(capability.replace("(", "")),
  )
    ? "OPERATOR_AUTHORIZED_EXECUTION"
    : "IN_PACKAGE_AUTHORITY";
}
