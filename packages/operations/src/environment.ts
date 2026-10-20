/**
 * @payswap/operations — environment records, the configuration contract
 * and preview/production parity (P8-W3, law 1 support).
 *
 * REAUTHORED from payswap.org@8a735bf packages/operations/src/
 * deployment.ts (the environment-manifest half) onto the canonical
 * PaySwap 3.0 architecture: the deployable topology is the canonical
 * plane set (not the old six-worker monolith), secrets cross only as
 * `*_REF` handles (INV-19 discipline, pinned), and the sandbox/live
 * separation rides the pinned @payswap/provider-runtime execution-mode
 * vocabulary. PORT never authorizes copying; the parity/completeness
 * algorithms are re-derived.
 *
 * Laws implemented here:
 * - an ENVIRONMENT RECORD is the typed identity of a deployment target
 *   (tier + region + execution mode + config fingerprint) — it is one of
 *   the four required components of a deployment identity (see
 *   deployment-identity.ts);
 * - the CONFIGURATION CONTRACT is checkable data: every required
 *   variable, the planes that consume it, and whether it is secret-backed
 *   (a secret-backed entry must be present as its documented `*_REF`
 *   name — the value itself never crosses into a config artifact);
 * - COMPLETENESS: a missing required variable for a plane blocks release;
 * - PARITY: preview and production manifests must expose the same plane
 *   set and versions, and config differences are allowed ONLY on the
 *   explicit environment allowlist (endpoints/credentials/sinks) —
 *   "environment differences are explicit and checked".
 *
 * Deterministic only: pure functions; no network, no filesystem, no
 * ambient time. Fingerprints use the package-local canonical digest.
 */

import { contentDigest } from "./digest.js";
import { isPinnedExecutionMode } from "./pins/provider-runtime.js";

/** Raised when an environment-record contract is violated. */
export class EnvironmentContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvironmentContractError";
  }
}

// ---------------------------------------------------------------------------
// Environment tiers and deployable planes
// ---------------------------------------------------------------------------

/**
 * The four operational tiers of the release pipeline. `production` is the
 * only LIVE tier and only with live evidence; everything below it is
 * SANDBOX execution (INV-25: explicit, never ambient).
 */
export const ENVIRONMENT_TIERS = ["local", "preview", "staging", "production"] as const;
export type EnvironmentTier = (typeof ENVIRONMENT_TIERS)[number];

export function isEnvironmentTier(value: unknown): value is EnvironmentTier {
  return (
    typeof value === "string" &&
    (ENVIRONMENT_TIERS as readonly unknown[]).includes(value)
  );
}

/**
 * The deployable planes of the canonical PaySwap 3.0 topology (as named
 * by @payswap/surface outcome dispatch + the platform substrate): the
 * release manifest deploys planes, not old-repo worker roles.
 */
export const DEPLOYABLE_PLANES = [
  "surface-web",
  "command-plane",
  "economic-intent-plane",
  "provider-runtime-plane",
  "operations-plane",
  "lab-plane",
] as const;
export type DeployablePlane = (typeof DEPLOYABLE_PLANES)[number];

export function isDeployablePlane(value: unknown): value is DeployablePlane {
  return (
    typeof value === "string" &&
    (DEPLOYABLE_PLANES as readonly unknown[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// The configuration contract — as checkable data
// ---------------------------------------------------------------------------

/** One environment variable of the configuration contract. */
export interface EnvironmentVariableRequirement {
  /** The variable name exactly as documented. */
  readonly name: string;
  /** The planes that consume it. */
  readonly requiredBy: readonly DeployablePlane[];
  /**
   * True when the variable is a vault-backed SECRET REFERENCE (`*_REF`)
   * resolved at runtime — never a committed value (secrets.ts owns the
   * hygiene scan).
   */
  readonly secretBacked: boolean;
  readonly purpose: string;
}

/**
 * The configuration contract. Provider credential references follow the
 * `PROVIDER_<NAME>_CREDENTIAL_REF` template (any concrete key of that
 * shape satisfies the template entry for adapter-bearing planes).
 */
export const CONFIGURATION_CONTRACT: readonly EnvironmentVariableRequirement[] =
  Object.freeze([
    {
      name: "DATABASE_URL",
      requiredBy: [...DEPLOYABLE_PLANES],
      secretBacked: true,
      purpose: "System-of-record connection (journal + projections)",
    },
    {
      name: "VAULT_REF",
      requiredBy: [...DEPLOYABLE_PLANES],
      secretBacked: true,
      purpose: "Vault/secret-store mount holding every secret reference",
    },
    {
      name: "OBJECT_STORAGE_ENDPOINT",
      requiredBy: ["surface-web", "command-plane", "operations-plane"],
      secretBacked: false,
      purpose: "Large/immutable evidence artifacts (R2-compatible)",
    },
    {
      name: "OBJECT_STORAGE_BUCKET",
      requiredBy: ["surface-web", "command-plane", "operations-plane"],
      secretBacked: false,
      purpose: "Evidence artifact bucket",
    },
    {
      name: "PROVIDER_CREDENTIAL_REF",
      requiredBy: ["provider-runtime-plane"],
      secretBacked: true,
      purpose:
        "Per-provider credential reference (PROVIDER_<NAME>_CREDENTIAL_REF template)",
    },
    {
      name: "WEBHOOK_SIGNING_SECRET_REF",
      requiredBy: ["command-plane"],
      secretBacked: true,
      purpose: "Resolves the inbound-webhook signature key",
    },
    {
      name: "OBSERVABILITY_ENDPOINT",
      requiredBy: [...DEPLOYABLE_PLANES],
      secretBacked: false,
      purpose: "Vendor-neutral metrics/logs/traces sink",
    },
  ]);

// ---------------------------------------------------------------------------
// Environment manifests (tier + plane deployments + config)
// ---------------------------------------------------------------------------

/** One deployable plane inside an environment manifest. */
export interface PlaneDeployment {
  /** Stable identity, e.g. `payswap-surface-web`. */
  readonly planeId: string;
  readonly plane: DeployablePlane;
  /** The version being deployed for this plane. */
  readonly version: string;
  /**
   * Effective configuration — VALUES with secret-backed entries as
   * REFERENCE NAMES only (`*_REF`); checked by checkSecretReferenceHygiene
   * (secrets.ts).
   */
  readonly config: Readonly<Record<string, string>>;
}

/** The manifest of one environment: its planes and their config. */
export interface EnvironmentManifest {
  readonly tier: EnvironmentTier;
  readonly services: readonly PlaneDeployment[];
  /** Deterministic fingerprint of the effective configuration. */
  readonly configFingerprint: string;
}

/** Compute the deterministic fingerprint of a config map. */
export function computeConfigFingerprint(
  config: Readonly<Record<string, string>>,
): string {
  return contentDigest(config);
}

/** Assemble an environment manifest, fingerprinting the whole plane set. */
export function defineEnvironmentManifest(input: {
  readonly tier: EnvironmentTier;
  readonly services: readonly PlaneDeployment[];
}): EnvironmentManifest {
  if (!isEnvironmentTier(input.tier)) {
    throw new EnvironmentContractError(
      `unknown environment tier '${String(input.tier)}'`,
    );
  }
  const seen = new Set<string>();
  for (const service of input.services) {
    if (!isDeployablePlane(service.plane)) {
      throw new EnvironmentContractError(
        `plane deployment '${service.planeId}' has unknown plane '${String(service.plane)}'`,
      );
    }
    if (seen.has(service.planeId)) {
      throw new EnvironmentContractError(
        `duplicate planeId '${service.planeId}' in environment '${input.tier}'`,
      );
    }
    seen.add(service.planeId);
  }
  return {
    tier: input.tier,
    services: input.services,
    configFingerprint: contentDigest(
      input.services.map((service) => ({
        planeId: service.planeId,
        plane: service.plane,
        version: service.version,
        config: service.config,
      })),
    ),
  };
}

// ---------------------------------------------------------------------------
// The environment record (a deployment-identity component — law 1)
// ---------------------------------------------------------------------------

/**
 * The typed identity of a deployment TARGET: tier, region, the pinned
 * execution mode of the tier, the provider-environment binding digest and
 * the manifest fingerprint. This record is REQUIRED (all fields) by
 * defineDeploymentIdentity — an unrecorded environment cannot have a
 * deployment identity.
 */
export interface EnvironmentRecord {
  readonly tier: EnvironmentTier;
  /** Deployment region (explicit; no default). */
  readonly region: string;
  /**
   * The execution mode every LIVE-capable plane runs under in this
   * environment (pinned @payswap/provider-runtime vocabulary). Only
   * `production` may declare LIVE.
   */
  readonly executionMode: "SANDBOX" | "LIVE";
  /** Digest of the environment manifest (defineEnvironmentManifest). */
  readonly manifestFingerprint: string;
  /** Digest of the provider-environment bindings (rollout.ts). */
  readonly providerBindingsFingerprint: string;
  /** Free-form operational notes (secret-free — hygiene applies). */
  readonly notes: readonly string[];
}

/** Assemble + validate an environment record (fail-closed). */
export function defineEnvironmentRecord(input: {
  readonly tier: EnvironmentTier;
  readonly region: string;
  readonly executionMode: "SANDBOX" | "LIVE";
  readonly manifestFingerprint: string;
  readonly providerBindingsFingerprint: string;
  readonly notes?: readonly string[];
}): EnvironmentRecord {
  if (!isEnvironmentTier(input.tier)) {
    throw new EnvironmentContractError(
      `unknown environment tier '${String(input.tier)}'`,
    );
  }
  if (!isPinnedExecutionMode(input.executionMode)) {
    throw new EnvironmentContractError(
      `execution mode must be the pinned vocabulary (SANDBOX|LIVE), got '${String(input.executionMode)}'`,
    );
  }
  if (input.tier !== "production" && input.executionMode === "LIVE") {
    throw new EnvironmentContractError(
      `tier '${input.tier}' may not declare LIVE execution — only production can, and only with live evidence`,
    );
  }
  if (typeof input.region !== "string" || input.region.length < 2) {
    throw new EnvironmentContractError("region must be a non-trivial string");
  }
  for (const field of [
    ["manifestFingerprint", input.manifestFingerprint],
    ["providerBindingsFingerprint", input.providerBindingsFingerprint],
  ] as const) {
    if (typeof field[1] !== "string" || field[1].length < 3) {
      throw new EnvironmentContractError(
        `${field[0]} must be a non-trivial digest string`,
      );
    }
  }
  return {
    tier: input.tier,
    region: input.region,
    executionMode: input.executionMode,
    manifestFingerprint: input.manifestFingerprint,
    providerBindingsFingerprint: input.providerBindingsFingerprint,
    notes: [...(input.notes ?? [])],
  };
}
