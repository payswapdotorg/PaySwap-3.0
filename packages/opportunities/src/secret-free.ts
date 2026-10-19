/**
 * @payswap/opportunities — the secret-free law (P6-W2, lane r4-w2; hard
 * law 5: no credential-shaped constants anywhere; generalizes the old
 * W1-002 assertNoSecretMaterial discipline).
 *
 * Agent-facing artifacts NEVER carry key material. The scrubber scans
 * DEEPLY for forbidden KEY NAMES (privateKey, seedPhrase, mnemonic,
 * password, apiKey, secret, ... at any depth) and CREDENTIAL-SHAPED
 * VALUES (PAT shapes, PEM blocks, 0x+64-hex, sk- keys, Bearer tokens).
 * Deterministic and pure. The pattern list carries NO complete secret
 * literal — the detection fixtures are ASSEMBLED AT RUNTIME from
 * fragments (GitHub-push-protection discipline).
 */

import { SecretMaterialError } from "./errors.ts";

/**
 * The frozen forbidden key-name vocabulary (case-insensitive match at any
 * nesting depth).
 */
export const SECRET_KEY_NAME_PATTERNS: readonly RegExp[] = Object.freeze([
  /^privatekey$/i,
  /^seedphrase$/i,
  /^mnemonic$/i,
  /^password$/i,
  /^apikey$/i,
  /^apisecret$/i,
  /^secret$/i,
  /^clientsecret$/i,
  /^accesstoken$/i,
  /^refreshtoken$/i,
  /^credential$/i,
  /^credentials$/i,
  /^keystore$/i,
  /^walletfile$/i,
]);

/**
 * The frozen credential-shaped VALUE patterns (run against every string
 * field value). Each pattern is a SHAPE, not a literal secret: no
 * complete secret appears in this source.
 */
export const SECRET_VALUE_PATTERNS: readonly RegExp[] = Object.freeze([
  /^gh[pousr]_[A-Za-z0-9]{20,}$/,
  /^github_pat_[A-Za-z0-9_]{20,}$/,
  /^-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /^0x[0-9a-fA-F]{64}$/,
  /^sk-[A-Za-z0-9]{20,}$/,
  /^Bearer\s+[A-Za-z0-9._-]{16,}$/,
]);

/** One secret-material finding (the path and why it matched). */
export interface SecretFinding {
  /** The property path where the finding occurred. */
  readonly path: string;
  /** The matched key name, when a key-name pattern fired. */
  readonly keyName?: string;
  /** The matched value snippet (truncated — never echoed in full). */
  readonly matched: string;
}

function looksLikeSecretValue(value: string): SecretFinding | undefined {
  for (const pattern of SECRET_VALUE_PATTERNS) {
    const match = pattern.exec(value);
    if (match !== null) {
      return {
        path: "",
        matched: `${match[0].substring(0, 8)}...`,
      };
    }
  }
  return undefined;
}

/**
 * Scans a value deeply for secret material. Deterministic: the same value
 * always yields the same findings in traversal order. Cycles are
 * traversed once (seen-set); arrays are scanned element-wise.
 */
export function scanForSecretMaterial(value: unknown): readonly SecretFinding[] {
  const findings: SecretFinding[] = [];
  const seen = new Set<unknown>();
  const scan = (current: unknown, path: string): void => {
    if (current === null || typeof current !== "object") {
      return;
    }
    if (seen.has(current)) {
      return;
    }
    seen.add(current);
    const record = current as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      const nextPath = `${path}.${key}`;
      for (const pattern of SECRET_KEY_NAME_PATTERNS) {
        if (pattern.test(key)) {
          findings.push({ path: nextPath, keyName: key, matched: "(key name)" });
          break;
        }
      }
      const entry = record[key];
      if (typeof entry === "string") {
        const valueFinding = looksLikeSecretValue(entry);
        if (valueFinding !== undefined) {
          findings.push({ path: nextPath, matched: valueFinding.matched });
        }
      } else {
        scan(entry, nextPath);
      }
    }
  };
  scan(value, "$");
  return Object.freeze(findings);
}

/**
 * THE agent-facing artifact gate: asserts a value carries NO secret
 * material (deep key-name + credential-shaped-value scan). Throws
 * `SecretMaterialError` naming every finding path — an opportunity that
 * carries key material cannot be surfaced to agents at all.
 */
export function assertNoSecretMaterial(value: unknown, label: string): void {
  const findings = scanForSecretMaterial(value);
  if (findings.length > 0) {
    const detail = findings
      .map(
        (finding) =>
          `${finding.path}${finding.keyName !== undefined ? ` (key '${finding.keyName}')` : ` (value '${finding.matched}')`}`,
      )
      .join(", ");
    throw new SecretMaterialError(
      `secret material detected in '${label}': ${detail} — agent-facing artifacts never carry key material (P6-W2 law)`,
    );
  }
}

/** Total predicate: true iff the value carries no secret material. */
export function isSecretFree(value: unknown): boolean {
  return scanForSecretMaterial(value).length === 0;
}
