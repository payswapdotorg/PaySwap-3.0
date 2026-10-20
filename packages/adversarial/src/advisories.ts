/**
 * @payswap/adversarial — security advisories and the GLOBAL restriction
 * view (P6-W3, lane r4-w3; PORT+ADAPT of payswap.org@8a735bf
 * packages/security/src/advisories.ts — the canonical INV citations are
 * re-homed: old INV-S01 → the canonical global-restriction law under
 * INV-21's security plane; the ValidationError import becomes the local
 * pin; the digest becomes the local pin, structurally identical).
 *
 * THE LAW (old INV-S01, re-cited): an advisory restricts affected
 * components GLOBALLY. The restriction view computed here has NO scope
 * parameter: there is no tenant, no source, no principal and no
 * capability-graph view through which a restricted component could
 * appear unrestricted. Whatever identity is presented — from any
 * source, any graph, any network partition that has observed the
 * advisory — `restrictionFor` answers the same. The registry is the
 * single network-wide source of truth.
 *
 * THE D-1 WIRING CONTRACT (advisory outcomes map to quarantine /
 * restrict / retire): the action vocabulary is ordered
 * restrict < quarantine < retire; `restrictionFor` computes the
 * effective per-component view across EVERY active advisory (retire ≥
 * quarantine ≥ restricted). Quarantine EXECUTION is owned by
 * ./quarantine-ledger.ts (release requires verified remediation);
 * restriction and retirement are computed live from the active set.
 *
 * Lifecycle: advisories are historical protocol facts. The registry
 * keeps an APPEND-ONLY event log (PUBLISHED / CLOSED); history() is
 * never rewritten. Closing an advisory requires VERIFIED remediation —
 * the precondition for quarantine release (./quarantine-ledger.ts).
 *
 * Deterministic only: every decision is a pure function of the registry
 * state and the input; fail-closed on malformed input.
 */

import { ValidationError } from "./pins/index.ts";
import type { ComponentIdentity, ComponentKind, VersionRange } from "./component-identity.ts";
import { versionInRange } from "./component-identity.ts";

// ---------------------------------------------------------------------------
// Advisory contracts
// ---------------------------------------------------------------------------

export const ADVISORY_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type AdvisorySeverity = (typeof ADVISORY_SEVERITIES)[number];

export function isAdvisorySeverity(value: unknown): value is AdvisorySeverity {
  return (
    typeof value === "string" &&
    (ADVISORY_SEVERITIES as readonly unknown[]).includes(value)
  );
}

/**
 * The enforcement actions an advisory can order, in increasing strength:
 * restrict < quarantine < retire (the D-1 wiring contract's advisory
 * outcome vocabulary). Quarantine execution is owned by
 * ./quarantine-ledger.ts; restriction and retirement are computed live
 * from the active advisory set here.
 */
export const ADVISORY_ACTIONS = ["restrict", "quarantine", "retire"] as const;
export type AdvisoryAction = (typeof ADVISORY_ACTIONS)[number];

export function isAdvisoryAction(value: unknown): value is AdvisoryAction {
  return (
    typeof value === "string" &&
    (ADVISORY_ACTIONS as readonly unknown[]).includes(value)
  );
}

/** One affected component with an optional affected-version range. */
export interface AffectedComponentRef {
  readonly kind: ComponentKind;
  readonly id: string;
  readonly versionRange?: VersionRange;
}

/** How to remediate the vulnerability (severity, affected ranges, remediation). */
export interface RemediationGuidance {
  readonly summary: string;
  /** First version containing the fix, when one exists. */
  readonly patchedVersion?: string;
  /** Interim mitigations, in declared order. */
  readonly workarounds: readonly string[];
}

/** Mandatory advisory provenance. */
export interface AdvisoryProvenance {
  readonly declaredBy: string;
  readonly contentHash: string;
  readonly publishedAt: number;
}

export type AdvisoryStatus = "active" | "closed";

/** A published security advisory. Immutable once published. */
export interface SecurityAdvisory {
  readonly advisoryId: string;
  readonly title: string;
  readonly severity: AdvisorySeverity;
  readonly description: string;
  readonly affected: readonly AffectedComponentRef[];
  readonly action: AdvisoryAction;
  readonly remediation: RemediationGuidance;
  readonly provenance: AdvisoryProvenance;
  readonly status: AdvisoryStatus;
  /** Present iff status is closed. */
  readonly closedAt?: number;
  /** Present iff status is closed. */
  readonly closureNote?: string;
}

/** Append-only advisory lifecycle event. */
export type AdvisoryEvent =
  | { readonly eventType: "published"; readonly advisory: SecurityAdvisory }
  | {
      readonly eventType: "closed";
      readonly advisoryId: string;
      readonly closedAt: number;
      readonly closureNote: string;
      readonly remediationVerified: boolean;
    };

/** Raised for invalid advisory operations. */
export class SecurityAdvisoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecurityAdvisoryError";
  }
}

// ---------------------------------------------------------------------------
// The global restriction view (the old INV-S01 law)
// ---------------------------------------------------------------------------

/**
 * The effective restriction of one component identity, computed from
 * EVERY active advisory. There is deliberately no scope parameter: the
 * same component identity is restricted identically across the whole
 * network model.
 */
export interface ComponentRestriction {
  /** Component this restriction describes (kind + id + version). */
  readonly component: ComponentIdentity;
  /** True when any active advisory orders `restrict` or stronger. */
  readonly restricted: boolean;
  /** True when any active advisory orders `quarantine` or stronger. */
  readonly quarantined: boolean;
  /** True when any active advisory orders `retire`. */
  readonly retired: boolean;
  /** Active advisories driving the strongest action, most severe first. */
  readonly advisoryRefs: readonly string[];
}

/** The deterministic severity rank (low < medium < high < critical). */
export const SEVERITY_RANK: Readonly<Record<AdvisorySeverity, number>> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/** The deterministic action rank (restrict < quarantine < retire). */
export const ADVISORY_ACTION_RANK: Readonly<Record<AdvisoryAction, number>> =
  Object.freeze({ restrict: 0, quarantine: 1, retire: 2 });

/** True iff the action orders at least the floor's strength. */
export function actionAtLeast(action: AdvisoryAction, floor: AdvisoryAction): boolean {
  return ADVISORY_ACTION_RANK[action] >= ADVISORY_ACTION_RANK[floor];
}

/**
 * Does the advisory's affected set cover this identity (kind + id +
 * range)?
 *
 * RESTRICTION IS FAIL-CLOSED (contrast with signature matching in
 * ./threat-signatures.ts, which is evidence-generating and therefore
 * fail-open): when an advisory is version-scoped and the presented
 * identity carries no version, the component is treated as AFFECTED —
 * the network restricts what it cannot verify as safe.
 */
export function advisoryAffects(
  advisory: SecurityAdvisory,
  identity: ComponentIdentity,
): boolean {
  for (const affected of advisory.affected) {
    if (affected.kind !== identity.kind || affected.id !== identity.id) {
      continue;
    }
    const range = affected.versionRange;
    if (range === undefined) {
      return true;
    }
    if (identity.version === undefined) {
      // Version-scoped advisory, version unknown: fail closed (affected).
      return true;
    }
    if (versionInRange(identity.version, range)) {
      return true;
    }
  }
  return false;
}

