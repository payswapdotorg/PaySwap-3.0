/**
 * @payswap/adversarial — the provider threat families (P6-W3, lane
 * r4-w3; ADAPT of payswap.org@8a735bf packages/adversarial — the W2-007
 * fault-injection families re-based as the provider threat-intelligence
 * vocabulary; see the evidence record's D-decisions for the full
 * mapping).
 *
 * THE CONSOLIDATION: the OLD package injected eleven fault families
 * against the old merged journey world (protocol/journeys/rails/
 * participation + the old security machinery) and proved, per fault,
 * injection → invariant probes → an exact recovery path. In PaySwap
 * 3.0 that journey world does not exist at this base — but the
 * FAMILIES, the laws they endanger and the recovery paths are exactly
 * the provider threat-intelligence vocabulary this package owns:
 *
 * - the eleven families below keep the old taxonomy 1:1 (ids
 *   snake_cased, semantics preserved);
 * - each family DECLARES which canonical invariants it endangers
 *   (re-cited from the old W2-006/W2-007 invariant ids to the
 *   canonical 3.0 set);
 * - each family carries its RECOVERY-PATH CONTRACT (ordered steps as
 *   pure data — ./recovery.ts) — the old harness's "exact recovery
 *   path" law in declarative form;
 * - the DETECTORS (./detectors-provider.ts, ./detectors-agent.ts) are
 *   deterministic functions over provider observation bundles
 *   (./observations.ts) — the old injection checks re-based as
 *   evidence-generating detections.
 *
 * Deterministic only: pure data + pure functions.
 */

import type { ThreatSeverity } from "../pins/index.ts";

// ---------------------------------------------------------------------------
// The family vocabulary (the old W2-007 taxonomy, 1:1)
// ---------------------------------------------------------------------------

/** The eleven provider threat families (the adversarial fault taxonomy). */
export const PROVIDER_THREAT_FAMILIES = [
  "duplicated_commands",
  "lost_webhooks",
  "ambiguous_provider",
  "account_takeover",
  "malicious_agent",
  "package_compromise",
  "incentive_sybil_collusion_wash",
  "leaderboard_gaming",
  "provider_outage",
  "clock_skew",
  "partial_payment",
] as const;

export type ProviderThreatFamily = (typeof PROVIDER_THREAT_FAMILIES)[number];

export function isProviderThreatFamily(
  value: unknown,
): value is ProviderThreatFamily {
  return (
    typeof value === "string" &&
    (PROVIDER_THREAT_FAMILIES as readonly unknown[]).includes(value)
  );
}

/** Deterministic severity rank (info < low < medium < high < critical). */
export const PROVIDER_SEVERITY_RANK: Readonly<Record<ThreatSeverity, number>> =
  Object.freeze({ info: 0, low: 1, medium: 2, high: 3, critical: 4 });

export function threatSeverityRank(severity: ThreatSeverity): number {
  return PROVIDER_SEVERITY_RANK[severity];
}

// ---------------------------------------------------------------------------
// Family declarations (laws + endangerment, pure data)
// ---------------------------------------------------------------------------

/** One canonical-invariant endangerment of a family (audit lineage). */
export interface FamilyLawRef {
  /** Canonical invariant id (e.g. "INV-4") or law citation. */
  readonly invariantRef: string;
  readonly law: string;
}

/** The full declaration of one provider threat family. */
export interface ProviderFamilyDeclaration {
  readonly family: ProviderThreatFamily;
  readonly title: string;
  readonly description: string;
  /** The canonical laws a detection of this family endangers. */
  readonly endangers: readonly FamilyLawRef[];
  /**
   * The immune outcome this family's advisories map to under the D-1
   * wiring contract (escalation-only; see ../block-authority.ts — the
   * BLOCK-grade detections bind, the advisory proposals carry the
   * outcome).
   */
  readonly advisoryOutcome: "restrict" | "quarantine" | "retire";
  /**
   * Families whose CRITICAL detections may justify retirement
   * (irreversible — requires the explicit policy opt-in at the bridge).
   */
  readonly retireEligible: boolean;
}

/** The eleven family declarations (explicit, exported data). */
export const PROVIDER_FAMILY_DECLARATIONS: Readonly<
  Record<ProviderThreatFamily, ProviderFamilyDeclaration>
> = Object.freeze({
  duplicated_commands: {
    family: "duplicated_commands",
    title: "duplicated commands / replay",
    description:
      "the same command submitted twice or replayed: one idempotency key must map to exactly one authoritative result; the journal must never double-post; a mutated re-binding is refused with CONFLICT while state stays unchanged",
    endangers: [
      { invariantRef: "INV-6", law: "state-changing commands are idempotent and replay-safe" },
      { invariantRef: "INV-3", law: "historical financial facts are immutable and versioned" },
    ],
    advisoryOutcome: "restrict",
    retireEligible: false,
  },
  lost_webhooks: {
    family: "lost_webhooks",
    title: "lost webhooks / outbox loss",
    description:
      "a provider webhook never arrives: the outbox event stays PENDING (no silent loss); recovery is external-object re-fetch and reconciliation ONLY, with an append-only re-fetch history",
    endangers: [
      { invariantRef: "INV-5", law: "every consequential financial effect has evidence lineage" },
      { invariantRef: "INV-14", law: "provider state is preserved for action/reconciliation/audit" },
    ],
    advisoryOutcome: "restrict",
    retireEligible: false,
  },
  ambiguous_provider: {
    family: "ambiguous_provider",
    title: "ambiguous provider outcomes",
    description:
      "a provider call times out or answers ambiguously: the in-flight write is UNKNOWN requiring reconciliation — never FAILED; the blind retry is forbidden; recovery runs reconciliation then a SAFE_TO_RETRY retry",
    endangers: [
      { invariantRef: "INV-4", law: "UNKNOWN is distinct from FAILED and is reconciled rather than blindly retried" },
    ],
    advisoryOutcome: "restrict",
    retireEligible: false,
  },
  account_takeover: {
    family: "account_takeover",
    title: "account takeover / SIM swap",
    description:
      "credential compromise (SIM/device/account change near a sensitive use): the temporally-valid authorization is revoked through the epoch bump; the quarantined key's cached-capability re-entry is denied; recovery requires re-verification issuing a fresh epoch-current authorization",
    endangers: [
      { invariantRef: "INV-19", law: "raw credentials and session material never enter context" },
      { invariantRef: "INV-21", law: "adversarial intelligence cannot downgrade BLOCK" },
    ],
    advisoryOutcome: "quarantine",
    retireEligible: false,
  },
  malicious_agent: {
    family: "malicious_agent",
    title: "malicious agents",
    description:
      "a delegated agent smuggles command-shaped proposals at depth, requests unrestricted transfers or widens authority: every path is denied with a recorded reason while the honest attenuated path keeps working",
    endangers: [
      { invariantRef: "INV-12", law: "child delegation is strictly attenuated" },
      { invariantRef: "INV-5", law: "every consequential effect has authorization lineage" },
    ],
    advisoryOutcome: "quarantine",
    retireEligible: false,
  },
  package_compromise: {
    family: "package_compromise",
    title: "package compromise",
    description:
      "a deployed package's content digest diverges from the sealed release: the affected package is restricted globally through the advisory, cannot write financial state, the sealed release stays immutable; recovery requires a patched version, advisory closure and evidenced quarantine release",
    endangers: [
      { invariantRef: "INV-24", law: "no dead actions, fake success states or fabricated effects" },
      { invariantRef: "INV-3", law: "historical facts are immutable and versioned" },
    ],
    advisoryOutcome: "quarantine",
    retireEligible: true,
  },
  incentive_sybil_collusion_wash: {
    family: "incentive_sybil_collusion_wash",
    title: "incentive Sybil/collusion/wash",
    description:
      "fabricated contribution records are excluded and rank is refused as authorization; the clawback is a SEPARATE adjustment obligation while history remains; recovery runs gate enforcement and post-hoc clawback",
    endangers: [
      { invariantRef: "INV-3", law: "historical facts are immutable (clawback is a separate adjustment, never a rewrite)" },
      { invariantRef: "INV-5", law: "effects carry evidence lineage" },
    ],
    advisoryOutcome: "restrict",
    retireEligible: false,
  },
  leaderboard_gaming: {
    family: "leaderboard_gaming",
    title: "leaderboard gaming",
    description:
      "gaming the ranking with fabricated or velocity-anomalous records: records without provenance are excluded from ranking and rank never widens authority; recovery re-ranks on the verified set",
    endangers: [
      { invariantRef: "INV-10", law: "opportunity/discovery output cannot directly authorize execution" },
    ],
    advisoryOutcome: "restrict",
    retireEligible: false,
  },
  provider_outage: {
    family: "provider_outage",
    title: "provider outage",
    description:
      "a provider/rail outage: the in-flight write surfaces as UNKNOWN requiring reconciliation (never FAILED); the outage window is evidenced; recovery probes the provider, reconciles, awaits finality and re-drains the outbox",
    endangers: [
      { invariantRef: "INV-4", law: "UNKNOWN is distinct from FAILED and is reconciled" },
      { invariantRef: "INV-14", law: "provider state is preserved for reconciliation/audit" },
    ],
    advisoryOutcome: "restrict",
    retireEligible: false,
  },
  clock_skew: {
    family: "clock_skew",
    title: "clock skew / regression",
    description:
      "a provider's clock jumps backwards or regresses: an expired grant is never resurrected through clock regression; epoch regression is detected; terminal transitions stay monotonic; recovery re-synchronizes on the verified clock",
    endangers: [
      { invariantRef: "INV-6", law: "commands are idempotent and replay-safe" },
      { invariantRef: "INV-2", law: "exact/lossless representation (no time-based release)" },
    ],
    advisoryOutcome: "restrict",
    retireEligible: false,
  },
  partial_payment: {
    family: "partial_payment",
    title: "partial payment / capture edges",
    description:
      "a capture lands short of the requested amount: the effect surfaces as PARTIALLY_EXECUTED; the over-reservation is refused without side effects; gross obligations stay visible behind the net position; recovery completes with evidence on a balanced journal",
    endangers: [
      { invariantRef: "INV-2", law: "exact/lossless monetary representation" },
      { invariantRef: "INV-5", law: "effects carry authorization + evidence lineage" },
    ],
    advisoryOutcome: "restrict",
    retireEligible: false,
  },
});

/** The families whose critical detections are retire-eligible. */
export const RETIRE_ELIGIBLE_PROVIDER_FAMILIES: readonly ProviderThreatFamily[] =
  Object.freeze(
    PROVIDER_THREAT_FAMILIES.filter(
      (family) => PROVIDER_FAMILY_DECLARATIONS[family].retireEligible,
    ),
  );
