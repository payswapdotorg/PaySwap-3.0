/**
 * @payswap/client-certification — the secret boundary (P8-W2, hard law 1).
 *
 * REAUTHORED from the old-repo disciplines (payswap.org@8a735bf
 * packages/operations provider-activation secret-shape scanning +
 * browser-verification secret-exclusion artifacts) onto the canonical
 * architecture, with the vocabulary PINNED from @payswap/onchain-security
 * (R2-W2): the same forbidden key names, the same value-shape detectors,
 * the same redaction markers, fail-closed.
 *
 * THE CLIENT BOUNDARY LAW: secrets never reach
 *   (a) client-renderable state,
 *   (b) model-visible context,
 *   (c) logs,
 *   (d) artifacts.
 * The gate scans all four probes as the surface declared them, and
 * separately certifies the surface's SCRUBBER CONTRACT: given
 * secret-bearing fixtures (assembled at runtime from fragments in the
 * test battery), the scrubber's output must be free of secret-shaped
 * material. Boundary violations BLOCK — escalate-only, no downgrade.
 *
 * Deterministic only: pure folds; no ambient clock/randomness/network.
 */

import {
  PINNED_FORBIDDEN_SECRET_KEY_EXACT,
  PINNED_FORBIDDEN_SECRET_KEY_SUBSTRINGS,
  pinnedIsMnemonicShape,
  pinnedIsRawKeyShape,
} from "./pins/onchain-security.ts";
import { CLIENT_GATE_HALT_ACTION, CLIENT_GATE_SEVERITY } from "./verdict.ts";
import type { ClientGateResult, CertificationViolation } from "./verdict.ts";
import { violationOf } from "./verdict.ts";
import { contentDigest } from "./digest.ts";

/** The law this gate enforces (hard law 1). */
const LAW = "secret-boundary" as const;

/** The four probes of the client boundary. */
export const SECRET_PROBE_KINDS = Object.freeze([
  "client-state",
  "model-context",
  "log",
  "artifact",
] as const);

export type SecretProbeKind = (typeof SECRET_PROBE_KINDS)[number];

/** One raw finding of the boundary scan. */
export interface BoundaryFinding {
  readonly probe: SecretProbeKind;
  readonly path: string;
  readonly kind: "forbidden_key" | "secret_shaped_value";
  readonly detail: string;
}

/** What the surface declares it would render/model/log/persist. */
export interface SecretBoundaryProbes {
  readonly clientRenderableState: unknown;
  readonly modelVisibleContext: unknown;
  readonly logs: readonly unknown[];
  readonly artifacts: readonly unknown[];
}

/**
 * The scrubber CONTRACT every certified surface implements: a total,
 * deterministic value-level redactor. Given any payload it returns a
 * payload with secret-shaped VALUES replaced by redaction markers
 * (pinned vocabulary: raw_key / mnemonic / forbidden_key).
 */
export interface SecretBoundaryScrubber {
  scrub(value: unknown): unknown;
}

const MAX_SCAN_DEPTH = 8;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, "");
}

/** VALUE PIN (behaviour) — @payswap/onchain-security `isForbiddenKeyNameLocal`. */
export function isForbiddenKeyName(key: string): boolean {
  const normalized = normalizeKey(key);
  if ((PINNED_FORBIDDEN_SECRET_KEY_EXACT as readonly string[]).includes(normalized)) {
    return true;
  }
  return (PINNED_FORBIDDEN_SECRET_KEY_SUBSTRINGS as readonly string[]).some(
    (fragment) => normalized.includes(fragment),
  );
}

/** PEM private-key block shape (structure only). */
function isPemPrivateKeyShape(value: string): boolean {
  return /-----BEGIN[A-Z ]*PRIVATE KEY-----/.test(value);
}

/** Provider token shape: known prefix + long body. */
function isProviderTokenShape(value: string): boolean {
  return /^(ghp_|github_pat_|sk-)[A-Za-z0-9_]{20,}$/.test(value);
}

/** True when a string VALUE is secret-shaped (any detector). */
export function isSecretShapedValue(value: string): boolean {
  return (
    pinnedIsRawKeyShape(value) ||
    pinnedIsMnemonicShape(value) ||
    isPemPrivateKeyShape(value) ||
    isProviderTokenShape(value)
  );
}

function scanValue(
  probe: SecretProbeKind,
  value: unknown,
  path: string,
  depth: number,
  seen: Set<object>,
  findings: BoundaryFinding[],
): void {
  if (depth > MAX_SCAN_DEPTH) {
    return;
  }
  if (typeof value === "string") {
    if (isSecretShapedValue(value)) {
      findings.push({
        probe,
        path,
        kind: "secret_shaped_value",
        detail: `secret-shaped value at ${path} (${probe})`,
      });
    }
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      scanValue(probe, entry, `${path}[${index}]`, depth + 1, seen, findings);
    });
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (isForbiddenKeyName(key)) {
      findings.push({
        probe,
        path: `${path}.${key}`,
        kind: "forbidden_key",
        detail: `forbidden key name '${key}' at ${path} (${probe}) — use vaultRef/credentialRef naming`,
      });
    }
    scanValue(probe, entry, `${path}.${key}`, depth + 1, seen, findings);
  }
}

/** Scan all four probes of the boundary (deterministic, pure). */
export function scanSecretBoundary(
  probes: SecretBoundaryProbes,
): readonly BoundaryFinding[] {
  const findings: BoundaryFinding[] = [];
  scanValue("client-state", probes.clientRenderableState, "$", 0, new Set(), findings);
  scanValue("model-context", probes.modelVisibleContext, "$", 0, new Set(), findings);
  for (const [index, log] of probes.logs.entries()) {
    scanValue("log", log, `$[${index}]`, 0, new Set(), findings);
  }
  for (const [index, artifact] of probes.artifacts.entries()) {
    scanValue("artifact", artifact, `$[${index}]`, 0, new Set(), findings);
  }
  return findings;
}

function redactionMarkerFor(value: string): string {
  if (pinnedIsRawKeyShape(value) || isPemPrivateKeyShape(value) || isProviderTokenShape(value)) {
    return "[REDACTED:raw_key]";
  }
  return "[REDACTED:mnemonic]";
}

/**
 * The REFERENCE scrubber (NET-NEW): a conforming implementation of the
 * scrubber contract. Deep-walks the payload; every secret-shaped string
 * value is replaced by its pinned redaction marker; forbidden-key
 * fields have their values redacted with the forbidden_key marker
 * (the key NAME itself is a surface-shape defect the surface must fix —
 * the scrubber never silently launders it away).
 */
export function makeReferenceScrubber(): SecretBoundaryScrubber {
  const scrub = (value: unknown, depth: number): unknown => {
    if (depth > MAX_SCAN_DEPTH) {
      return value;
    }
    if (typeof value === "string") {
      return isSecretShapedValue(value) ? redactionMarkerFor(value) : value;
    }
    if (value === null || typeof value !== "object") {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((entry) => scrub(entry, depth + 1));
    }
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[key] = isForbiddenKeyName(key)
        ? "[REDACTED:forbidden_key]"
        : scrub(entry, depth + 1);
    }
    return output;
  };
  return {
    scrub: (value: unknown) => scrub(value, 0),
  };
}

function remainingSecretShapes(value: unknown): readonly BoundaryFinding[] {
  const findings: BoundaryFinding[] = [];
  scanValue("artifact", value, "$scrubbed", 0, new Set(), findings);
  return findings.filter((finding) => finding.kind === "secret_shaped_value");
}

/**
 * The secret-boundary gate (hard law 1). Scans the declared probes AND
 * certifies the scrubber contract over the supplied secret-bearing
 * fixtures. Any violation is a HALT for the release.
 */
export function runSecretBoundaryGate(input: {
  readonly probes: SecretBoundaryProbes;
  readonly scrubber: SecretBoundaryScrubber;
  readonly scrubberProbes: readonly unknown[];
}): ClientGateResult {
  const violations: CertificationViolation[] = [];
  const findings = scanSecretBoundary(input.probes);
  for (const finding of findings) {
    violations.push(
      violationOf(
        LAW,
        finding.kind === "forbidden_key"
          ? "forbidden_key_at_boundary"
          : "secret_material_at_boundary",
        finding.detail,
      ),
    );
  }
  let scrubbedChecked = 0;
  for (const fixture of input.scrubberProbes) {
    let scrubbed: unknown;
    try {
      scrubbed = input.scrubber.scrub(fixture);
      scrubbedChecked += 1;
    } catch {
      violations.push(
        violationOf(
          LAW,
          "scrubber_not_total",
          "the scrubber threw on a secret-bearing fixture — the contract requires a total function",
        ),
      );
      continue;
    }
    for (const finding of remainingSecretShapes(scrubbed)) {
      violations.push(
        violationOf(
          LAW,
          "scrubber_contract_violated",
          `the scrubber left secret-shaped material in its output (${finding.path})`,
        ),
      );
    }
  }
  return Object.freeze({
    law: LAW,
    severity: CLIENT_GATE_SEVERITY,
    passed: violations.length === 0,
    violations: Object.freeze(violations),
    checked: 4 + input.scrubberProbes.length,
    digest: contentDigest({
      law: LAW,
      haltAction: CLIENT_GATE_HALT_ACTION,
      findings,
      violations,
    }),
  });
}
