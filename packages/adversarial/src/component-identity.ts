/**
 * @payswap/adversarial — the component identity model + deterministic
 * version comparison (P6-W3, lane r4-w3; PORT+ADAPT of
 * payswap.org@8a735bf packages/security/src/signatures.ts, split for
 * the ≤400-line file law — the threat-signature registry lives in
 * ./threat-signatures.ts).
 *
 * The component identity model is the immune system's TARGET vocabulary:
 * the component kinds that can carry a vulnerability or be restricted,
 * quarantined or retired. The kind literals mirror the canonical
 * identity fields of the owning lanes — verbatim the union the
 * onchain-security kernel's advisory bridge pins as
 * IMMUNE_COMPONENT_KINDS (no parallel vocabulary; the pins/threat-intel
 * mirror is assignable to this by construction).
 *
 * Version comparison is the numeric dotted subset of semver: a total
 * deterministic order with missing segments comparing as zero.
 *
 * Deterministic only: pure functions of the inputs.
 */

import { ValidationError } from "./pins/index.ts";

// ---------------------------------------------------------------------------
// Component kinds (the immune target vocabulary)
// ---------------------------------------------------------------------------

/**
 * The component kinds that can carry a vulnerability or be restricted by
 * the immune system. The identity strings mirror the canonical identity
 * fields of the owning packages:
 * - agent_package     → AgentPackage.id;
 * - agent_body        → AgentBody.id;
 * - agent_instance    → AgentInstance.id;
 * - agent_key         → AgentPrincipalRef.agentKeyFingerprint;
 * - extension         → ExtensionManifest.id;
 * - capability        → Capability.id;
 * - connected_instance → ConnectedCapabilityInstance.instanceId.
 */
export const COMPONENT_KINDS = [
  "agent_package",
  "agent_body",
  "agent_instance",
  "agent_key",
  "extension",
  "capability",
  "connected_instance",
] as const;

export type ComponentKind = (typeof COMPONENT_KINDS)[number];

export function isComponentKind(value: unknown): value is ComponentKind {
  return (
    typeof value === "string" &&
    (COMPONENT_KINDS as readonly unknown[]).includes(value)
  );
}

/** Identity of one component the immune system can match or restrict. */
export interface ComponentIdentity {
  readonly kind: ComponentKind;
  readonly id: string;
  /** Component version when known (numeric dotted, e.g. "1.2.0"). */
  readonly version?: string;
}

/** Kind + id pair; the minimal unversioned identity used by quarantine. */
export interface ComponentRef {
  readonly kind: ComponentKind;
  readonly id: string;
}

/** Identity without the version axis. */
export function componentRef(identity: ComponentIdentity): ComponentRef {
  return { kind: identity.kind, id: identity.id };
}

/** Deterministic canonical string form of a component identity. */
export function componentKey(ref: ComponentRef): string {
  return `${ref.kind}:${ref.id}`;
}

// ---------------------------------------------------------------------------
// Deterministic version comparison (numeric dotted subset of semver)
// ---------------------------------------------------------------------------

/**
 * Inclusive version range. Both bounds are optional; an absent bound is
 * unbounded on that side. Versions are numeric dotted strings ("1.2.0").
 */
export interface VersionRange {
  /** Inclusive lower bound. */
  readonly minVersion?: string;
  /** Inclusive upper bound. */
  readonly maxVersion?: string;
}

const VERSION_PATTERN = /^\d+(\.\d+)*$/;

/** Parse/validate one numeric dotted version string. */
export function parseVersion(version: string): readonly number[] {
  if (!VERSION_PATTERN.test(version)) {
    throw new ValidationError(
      `invalid version '${version}': must be numeric dotted segments (e.g. 1.2.0)`,
    );
  }
  return version.split(".").map((part) => Number.parseInt(part, 10));
}

/**
 * Total deterministic order over numeric dotted versions. Missing segments
 * compare as zero ("1.2" === "1.2.0"). Not locale-aware, no allocation
 * beyond the parsed segments.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const left = parseVersion(a);
  const right = parseVersion(b);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const l = left[index] ?? 0;
    const r = right[index] ?? 0;
    if (l !== r) {
      return l < r ? -1 : 1;
    }
  }
  return 0;
}

/**
 * True iff `version` falls inside the inclusive range. An undefined bound
 * is unbounded; an entirely undefined range matches every version.
 */
export function versionInRange(version: string, range: VersionRange): boolean {
  if (range.minVersion !== undefined) {
    if (compareVersions(version, range.minVersion) < 0) {
      return false;
    }
  }
  if (range.maxVersion !== undefined) {
    if (compareVersions(version, range.maxVersion) > 0) {
      return false;
    }
  }
  return true;
}
