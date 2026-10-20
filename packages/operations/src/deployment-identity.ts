/**
 * @payswap/operations — the deployment identity (P8-W3, hard law 1).
 *
 * A deployment is identified by EXACTLY four components —
 *   (commit SHA, environment record, build digest, manifest digest) —
 * all four REQUIRED, digest-chained, byte-deterministic:
 *
 * - the COMMIT SHA pins the source tree (40-hex git object id, validated
 *   by shape — never fetched: no network, ever);
 * - the ENVIRONMENT RECORD (environment.ts) pins the target (tier,
 *   region, execution mode, manifest + provider-binding fingerprints);
 * - the BUILD DIGEST is the sha256 of the deterministic archive the
 *   substrate tool (scripts/deterministic-tar-archive.mjs) produces from
 *   the tree — this package owns the CONTRACT + VERIFICATION, not the
 *   tool (reproducible-build.ts);
 * - the MANIFEST DIGEST is the total digest of the deterministic release
 *   manifest (scripts/release/build-release-manifest.mjs).
 *
 * The identity is DIGEST-CHAINED: identityDigest = contentDigest over
 * the four components in a fixed order, and `verifyDeploymentIdentity`
 * re-derives it — any tampering with any component (or with the chain
 * itself) fails closed. Byte-determinism: the same four components
 * always produce the byte-identical serialized identity.
 *
 * REAUTHORED from payswap.org@8a735bf packages/operations/src/
 * deployment.ts (the identity/fingerprint half). Deterministic only.
 */

import { contentDigest, deepFreeze } from "./digest.js";
import type { EnvironmentRecord } from "./environment.js";

/** Raised when the deployment-identity contract is violated. */
export class DeploymentIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeploymentIdentityError";
  }
}

/** A full git commit SHA (40 lowercase hex characters). */
export const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/;

/** A sha256 hex digest as produced by the substrate tooling (64 hex). */
export const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

/** The manifest-schema version this identity shape speaks. */
export const DEPLOYMENT_IDENTITY_SCHEMA_VERSION = "1.0" as const;

/**
 * The four required components. Every field is required — there is no
 * optional component and no default.
 */
export interface DeploymentIdentityComponents {
  /** Exact commit SHA of the released tree (40-hex). */
  readonly commitSha: string;
  /** The typed environment record of the deployment target. */
  readonly environment: EnvironmentRecord;
  /** sha256 of the deterministic build archive (64-hex). */
  readonly buildDigest: string;
  /** Total sha256 digest of the deterministic release manifest (64-hex). */
  readonly manifestDigest: string;
}

/** An assembled deployment identity — immutable, digest-chained. */
export interface DeploymentIdentity {
  readonly schema_version: typeof DEPLOYMENT_IDENTITY_SCHEMA_VERSION;
  readonly commitSha: string;
  readonly environment: EnvironmentRecord;
  readonly buildDigest: string;
  readonly manifestDigest: string;
  /**
   * The chain digest: contentDigest over the four components in fixed
   * order (commitSha, environment, buildDigest, manifestDigest).
   */
  readonly identityDigest: string;
}

/** The fixed chain order (documented + machine-checked — never reorder). */
export const IDENTITY_CHAIN_ORDER = Object.freeze([
  "commitSha",
  "environment",
  "buildDigest",
  "manifestDigest",
] as const);

function validateComponents(
  components: DeploymentIdentityComponents,
): void {
  if (!COMMIT_SHA_PATTERN.test(components.commitSha)) {
    throw new DeploymentIdentityError(
      `commitSha must be a full 40-hex git object id, got '${components.commitSha}'`,
    );
  }
  if (components.environment === undefined) {
    throw new DeploymentIdentityError(
      "the environment record is REQUIRED — a deployment without a target identity cannot exist",
    );
  }
  if (!SHA256_HEX_PATTERN.test(components.buildDigest)) {
    throw new DeploymentIdentityError(
      `buildDigest must be a 64-hex sha256 (the deterministic archive digest), got '${components.buildDigest}'`,
    );
  }
  if (!SHA256_HEX_PATTERN.test(components.manifestDigest)) {
    throw new DeploymentIdentityError(
      `manifestDigest must be a 64-hex sha256 (the release-manifest total digest), got '${components.manifestDigest}'`,
    );
  }
}

/**
 * Assemble the deployment identity from its four REQUIRED components.
 * Fail-closed: any missing/malformed component throws; the result is
 * deep-frozen and carries the chain digest.
 */
export function defineDeploymentIdentity(
  components: DeploymentIdentityComponents,
): DeploymentIdentity {
  validateComponents(components);
  const identity: DeploymentIdentity = deepFreeze({
    schema_version: DEPLOYMENT_IDENTITY_SCHEMA_VERSION,
    commitSha: components.commitSha,
    environment: components.environment,
    buildDigest: components.buildDigest,
    manifestDigest: components.manifestDigest,
    identityDigest: computeIdentityDigest(components),
  });
  return identity;
}

/** The chain digest derivation (fixed order, canonical serialization). */
export function computeIdentityDigest(
  components: Pick<
    DeploymentIdentityComponents,
    "commitSha" | "environment" | "buildDigest" | "manifestDigest"
  >,
): string {
  return contentDigest({
    commitSha: components.commitSha,
    environment: components.environment,
    buildDigest: components.buildDigest,
    manifestDigest: components.manifestDigest,
  });
}

// ---------------------------------------------------------------------------
// Verification — the chain re-derivation (tamper-evident)
// ---------------------------------------------------------------------------

export interface IdentityVerificationReport {
  readonly ok: boolean;
  readonly problems: readonly string[];
}

/**
 * Verify an assembled identity: shape (schema version, the four
 * components present + well-formed) and CHAIN INTEGRITY (the
 * identityDigest equals the digest re-derived from the components in
 * the fixed order). A tampered component, a reordered chain or a forged
 * digest all fail closed.
 */
export function verifyDeploymentIdentity(
  identity: unknown,
): IdentityVerificationReport {
  const problems: string[] = [];
  if (typeof identity !== "object" || identity === null) {
    return { ok: false, problems: ["identity is not an object"] };
  }
  const record = identity as Readonly<Record<string, unknown>>;
  if (record.schema_version !== DEPLOYMENT_IDENTITY_SCHEMA_VERSION) {
    problems.push(
      `schema_version must be "${DEPLOYMENT_IDENTITY_SCHEMA_VERSION}"`,
    );
  }
  for (const field of IDENTITY_CHAIN_ORDER) {
    if (record[field] === undefined) {
      problems.push(`required component '${field}' is missing`);
    }
  }
  if (typeof record.commitSha === "string" && !COMMIT_SHA_PATTERN.test(record.commitSha)) {
    problems.push("commitSha is not a full 40-hex git object id");
  }
  if (typeof record.buildDigest === "string" && !SHA256_HEX_PATTERN.test(record.buildDigest)) {
    problems.push("buildDigest is not a 64-hex sha256");
  }
  if (typeof record.manifestDigest === "string" && !SHA256_HEX_PATTERN.test(record.manifestDigest)) {
    problems.push("manifestDigest is not a 64-hex sha256");
  }
  if (typeof record.environment !== "object" || record.environment === null) {
    problems.push("environment record is missing or not an object");
  }

  if (problems.length === 0) {
    const typed = identity as DeploymentIdentity;
    const recomputed = computeIdentityDigest(typed);
    if (recomputed !== typed.identityDigest) {
      problems.push(
        `identityDigest chain mismatch (record says '${typed.identityDigest}', components digest '${recomputed}') — the identity was altered after assembly`,
      );
    }
  }
  return { ok: problems.length === 0, problems };
}

/**
 * Byte-deterministic serialization of an identity (canonical JSON). The
 * same components always produce the same bytes — the reproducibility
 * law applied to the identity artifact itself.
 */
export function serializeDeploymentIdentity(
  identity: DeploymentIdentity,
): string {
  return JSON.stringify(
    {
      schema_version: identity.schema_version,
      commitSha: identity.commitSha,
      environment: identity.environment,
      buildDigest: identity.buildDigest,
      manifestDigest: identity.manifestDigest,
      identityDigest: identity.identityDigest,
    },
    null,
    0,
  );
}

/**
 * Check that two identities assembled from the same components are
 * byte-identical (the determinism proof used by the battery).
 */
export function identitiesAreByteIdentical(
  left: DeploymentIdentity,
  right: DeploymentIdentity,
): boolean {
  return (
    serializeDeploymentIdentity(left) === serializeDeploymentIdentity(right)
  );
}
