/**
 * @payswap/operations — environment gates: completeness + parity (P8-W3).
 *
 * The two checkable gates over environment manifests (the manifest shapes
 * live in environment.ts):
 * - COMPLETENESS: a required configuration variable missing for a plane
 *   BLOCKS release (the contract is data — CONFIGURATION_CONTRACT).
 * - PARITY: the two compared environments must expose the same plane set
 *   and versions, and config differences are allowed ONLY on the explicit
 *   environment allowlist — "environment differences are explicit and
 *   checked".
 *
 * REAUTHORED from payswap.org@8a735bf packages/operations/src/
 * deployment.ts (the completeness/parity half). Deterministic only.
 */

import { contentDigest } from "./digest.js";
import {
  CONFIGURATION_CONTRACT,
  type DeployablePlane,
  type EnvironmentManifest,
  type EnvironmentTier,
  type EnvironmentVariableRequirement,
} from "./environment.js";

// ---------------------------------------------------------------------------
// Completeness gate (a missing required variable blocks release)
// ---------------------------------------------------------------------------

export interface PlaneEnvCheck {
  readonly planeId: string;
  readonly plane: DeployablePlane;
  readonly missing: readonly string[];
  readonly passed: boolean;
}

export interface EnvCompletenessReport {
  readonly passed: boolean;
  readonly services: readonly PlaneEnvCheck[];
}

function providerCredentialRefPresent(
  config: Readonly<Record<string, string>>,
): boolean {
  return Object.keys(config).some(
    (key) =>
      key.startsWith("PROVIDER_") &&
      key.endsWith("_CREDENTIAL_REF") &&
      key !== "PROVIDER_CREDENTIAL_REF" &&
      config[key] !== "",
  );
}

/**
 * Check every plane against the configuration contract: a missing
 * variable for the declared environment BLOCKS release. Secret-backed
 * entries must be present as their documented name (the value is only
 * ever a vault reference — never checked here).
 */
export function checkEnvironmentVariableCompleteness(
  manifest: EnvironmentManifest,
  contract: readonly EnvironmentVariableRequirement[] = CONFIGURATION_CONTRACT,
): EnvCompletenessReport {
  const services: PlaneEnvCheck[] = manifest.services.map((service) => {
    const missing = contract
      .filter((requirement) => requirement.requiredBy.includes(service.plane))
      .filter((requirement) => {
        if (requirement.name === "PROVIDER_CREDENTIAL_REF") {
          return !providerCredentialRefPresent(service.config);
        }
        const value = service.config[requirement.name];
        return value === undefined || value === "";
      })
      .map((requirement) => requirement.name);
    return {
      planeId: service.planeId,
      plane: service.plane,
      missing,
      passed: missing.length === 0,
    };
  });
  return { passed: services.every((check) => check.passed), services };
}

// ---------------------------------------------------------------------------
// Preview/production parity (differences are explicit and checked)
// ---------------------------------------------------------------------------

/**
 * Config keys that are LEGITIMATELY environment-specific. Everything else
 * must be identical between the two compared manifests.
 */
export const PARITY_ALLOWED_DIFFERENCES: readonly string[] = Object.freeze([
  "DATABASE_URL",
  "OBJECT_STORAGE_ENDPOINT",
  "OBJECT_STORAGE_BUCKET",
  "VAULT_REF",
  "PROVIDER_CREDENTIAL_REF",
  "WEBHOOK_SIGNING_SECRET_REF",
  "OBSERVABILITY_ENDPOINT",
]);

export interface PlaneParityDiff {
  readonly planeId: string;
  readonly plane: DeployablePlane;
  readonly versionDrift: boolean;
  readonly previewVersion?: string;
  readonly productionVersion?: string;
  /** Config keys that differ and are NOT on the allowlist. */
  readonly unexpectedConfigDifferences: readonly string[];
  readonly passed: boolean;
}

export interface ParityReport {
  readonly lowerTier: EnvironmentTier;
  readonly higherTier: EnvironmentTier;
  readonly servicesMissingInHigher: readonly string[];
  readonly servicesMissingInLower: readonly string[];
  readonly serviceDiffs: readonly PlaneParityDiff[];
  readonly passed: boolean;
  readonly digest: string;
}

function unexpectedConfigDeltas(
  lowerConfig: Readonly<Record<string, string>>,
  higherConfig: Readonly<Record<string, string>>,
): string[] {
  const keys = new Set([
    ...Object.keys(lowerConfig),
    ...Object.keys(higherConfig),
  ]);
  const deltas: string[] = [];
  for (const key of keys) {
    const lowerValue = lowerConfig[key];
    const higherValue = higherConfig[key];
    const differs =
      lowerValue === undefined || higherValue === undefined
        ? true
        : lowerValue !== higherValue;
    if (differs && !PARITY_ALLOWED_DIFFERENCES.includes(key)) {
      deltas.push(key);
    }
  }
  return deltas.sort();
}

/**
 * Deterministic parity diff over two environment manifests. Passes iff
 * both expose the SAME plane set, every common plane deploys the SAME
 * version, and every config difference is on the explicit allowlist.
 */
export function verifyEnvironmentParity(
  lower: EnvironmentManifest,
  higher: EnvironmentManifest,
): ParityReport {
  const lowerIds = new Set(lower.services.map((s) => s.planeId));
  const higherIds = new Set(higher.services.map((s) => s.planeId));
  const missingInHigher = [...lowerIds].filter((id) => !higherIds.has(id));
  const missingInLower = [...higherIds].filter((id) => !lowerIds.has(id));

  const serviceDiffs: PlaneParityDiff[] = [];
  for (const lowerService of lower.services) {
    const higherService = higher.services.find(
      (candidate) => candidate.planeId === lowerService.planeId,
    );
    if (higherService === undefined) {
      continue; // reported in missingInHigher
    }
    const versionDrift = lowerService.version !== higherService.version;
    const unexpected = unexpectedConfigDeltas(
      lowerService.config,
      higherService.config,
    );
    serviceDiffs.push({
      planeId: lowerService.planeId,
      plane: lowerService.plane,
      versionDrift,
      previewVersion: lowerService.version,
      productionVersion: higherService.version,
      unexpectedConfigDifferences: unexpected,
      passed: !versionDrift && unexpected.length === 0,
    });
  }

  const body = {
    lowerTier: lower.tier,
    higherTier: higher.tier,
    servicesMissingInHigher: missingInHigher,
    servicesMissingInLower: missingInLower,
    serviceDiffs,
  };
  const passed =
    missingInHigher.length === 0 &&
    missingInLower.length === 0 &&
    serviceDiffs.every((diff) => diff.passed);
  return { ...body, passed, digest: contentDigest(body) };
}
