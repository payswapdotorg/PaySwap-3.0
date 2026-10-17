/**
 * @payswap/onchain-security/threat-intel — the immune-system bridge:
 * advisory proposals (R2-W2; PORT+ADAPT of payswap.org@8a735bf
 * packages/onchain-threat-intel/src/advisory-bridge.ts, split for the
 * ≤400-line law; threat-signature registrations live in
 * threat-signatures.ts).
 *
 * This module is the STRUCTURAL ALIGNMENT SURFACE between detected
 * threats and the immune system. It declares contract shapes that are
 * structurally assignable to the immune system's own inputs:
 *
 * - `ThreatAdvisoryProposal` ~ the advisory registry's publish input
 *   (advisoryId, title, severity, description, affected component refs
 *   with the SAME component-kind vocabulary, action, remediation,
 *   provenance). This package's zero-sibling-import law means the src
 *   layer composes through these pure-data shapes; the WIRING LAYER (and
 *   the composition tests, which drive a structural wiring double of the
 *   epoch/block/advisory machinery) performs the actual publication/
 *   enforcement. That is exactly the kernel composition pattern:
 *   `OnchainSecurityState` is pure data; the wiring layer projects it
 *   from the real machines (TL accept-time integration).
 *
 * - `bridge component kinds` — the immune system's component-kind
 *   vocabulary re-declared as a structural local union (identical
 *   literals — NO parallel vocabulary).
 *
 * Deterministic only: proposals are pure functions of (assessment,
 * policy); no clock (the assessment's analyzedAt is the instant), no
 * randomness.
 */

import type { ThreatAssessment } from "./agent.ts";
import type { OnchainThreatPolicy } from "./policy.ts";
import type { ThreatFamily, ThreatSeverity } from "./families.ts";

// ---------------------------------------------------------------------------
// Evidence refs (structural alignment with the immune system's evidence
// artifact reference: evidenceId + artifactRef + contentDigest)
// ---------------------------------------------------------------------------

/**
 * Reference to an immutable evidence artifact. Structurally identical to
 * the immune system's EvidenceRef (content-addressed artifact pointers);
 * quarantine RELEASE requires exactly these, so proposals carry them.
 */
export interface EvidenceRef {
  readonly evidenceId: string;
  readonly artifactRef: string;
  readonly contentDigest: string;
}

// ---------------------------------------------------------------------------
// Structural alignment surface: the immune component-kind vocabulary
// ---------------------------------------------------------------------------

/**
 * The immune system's component kinds (structurally identical literals —
 * NO parallel vocabulary; see module doc). Used by advisory proposals so
 * the wiring layer can publish them into the advisory registry verbatim.
 */
export const IMMUNE_COMPONENT_KINDS = [
  "agent_package",
  "agent_body",
  "agent_instance",
  "agent_key",
  "extension",
  "capability",
  "connected_instance",
] as const;

export type ImmuneComponentKind = (typeof IMMUNE_COMPONENT_KINDS)[number];

/** One affected component of a proposal (kind + id + optional range). */
export interface ThreatAffectedComponent {
  readonly kind: ImmuneComponentKind;
  readonly id: string;
  /** Inclusive affected-version range, when known. */
  readonly versionRange?: { minVersion?: string; maxVersion?: string };
}

// ---------------------------------------------------------------------------
// Advisory proposals (quarantine/restrict/retire flows)
// ---------------------------------------------------------------------------

/**
 * A proposal to publish a security advisory from a threat assessment.
 * Structurally assignable to the advisory registry's publish input; the
 * WIRING LAYER performs the publication (real composition happens in the
 * composition tests and the runtime wiring).
 */
export interface ThreatAdvisoryProposal {
  readonly proposalId: string;
  readonly title: string;
  /** low | medium | high | critical (the advisory severity vocabulary). */
  readonly severity: "low" | "medium" | "high" | "critical";
  readonly description: string;
  readonly affected: readonly ThreatAffectedComponent[];
  /** restrict < quarantine < retire (the advisory action vocabulary). */
  readonly action: "restrict" | "quarantine" | "retire";
  readonly remediation: {
    readonly summary: string;
    readonly workarounds: readonly string[];
  };
  readonly declaredBy: string;
  readonly publishedAt: number;
  /** Evidence refs binding the proposal to the assessment's chains. */
  readonly evidence: readonly EvidenceRef[];
  /** Signal ids that drove the proposal (audit lineage). */
  readonly sourceSignalIds: readonly string[];
}

/** Raised on invalid proposal construction (fail closed). */
export class InvalidThreatAdvisoryProposalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidThreatAdvisoryProposalError";
  }
}

/** Families whose critical detections may justify retirement. */
export const RETIRE_ELIGIBLE_FAMILIES: readonly ThreatFamily[] = Object.freeze([
  "token_impersonation",
  "honeypot_transfer_restriction",
  "proxy_admin_change",
  "bridge_compromise",
]);

/** The advisory action vocabulary (restrict < quarantine < retire). */
export type ThreatAdvisoryAction = "restrict" | "quarantine" | "retire";

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

import { advisorySeverityFor, familySignalClass } from "./families.ts";

export function isImmuneComponentKind(
  value: unknown,
): value is ImmuneComponentKind {
  return (
    typeof value === "string" &&
    (IMMUNE_COMPONENT_KINDS as readonly unknown[]).includes(value)
  );
}

/**
 * Project a threat assessment onto evidence refs: one per signal (the
 * signal's own digest is the artifact content digest; the signal id is
 * the artifact ref) plus the assessment digest itself.
 */
export function evidenceRefsFromAssessment(
  assessment: ThreatAssessment,
): readonly EvidenceRef[] {
  const refs: EvidenceRef[] = [
    {
      evidenceId: `evidence:assessment:${assessment.assessmentId}`,
      artifactRef: `assessment:${assessment.assessmentId}`,
      contentDigest: assessment.assessmentId,
    },
  ];
  for (const signal of assessment.signals) {
    refs.push({
      evidenceId: `evidence:signal:${signal.signalId}`,
      artifactRef: `signal:${signal.signalId}`,
      contentDigest: signal.signalId,
    });
  }
  return refs;
}

/**
 * Derive the advisory action for a driving signal (deterministic):
 * - critical → quarantine (component pulled from circulation pending
 *   remediation; release requires explicit remediation + closure);
 * - high → restrict (global restriction while investigating);
 * - retirement is proposed ONLY for retire-eligible families with
 *   critical severity AND an explicit policy opt-in
 *   (`retireCompromisedContracts: true`) — irreversible steps demand an
 *   explicit versioned decision, never a heuristic.
 */
export function advisoryActionForDrivingSignal(
  family: ThreatFamily,
  severity: ThreatSeverity,
  policy: OnchainThreatPolicy,
): ThreatAdvisoryAction {
  if (
    policy.retireCompromisedContracts === true &&
    severity === "critical" &&
    RETIRE_ELIGIBLE_FAMILIES.includes(family)
  ) {
    return "retire";
  }
  if (severity === "critical") {
    return "quarantine";
  }
  return "restrict";
}

function targetComponentsForSignal(
  assessment: ThreatAssessment,
  signalId: string,
): readonly ThreatAffectedComponent[] {
  const signal = assessment.signals.find((s) => s.signalId === signalId);
  if (signal === undefined) {
    return [];
  }
  // Deterministic mapping: the evidence's observation refs name the
  // threatened surface; extract the concrete component id from the ref's
  // conventional `<source>:<component-id>` shape. Detectors emit refs
  // whose suffix after the LAST source tag identifies a concrete chain
  // surface (spender address, asset id, contract address, bridge id, ...
  // — see the detector conventions).
  const components: ThreatAffectedComponent[] = [];
  for (const ref of signal.evidence.observationRefs) {
    const id = componentIdFromObservationRef(ref);
    if (id !== undefined) {
      components.push({ kind: "extension", id });
    }
  }
  return components;
}

/**
 * Extract a concrete component id from a conventional observation ref:
 * - `approval:<spender address>` → the spender;
 * - `registry:<chain>:<assetId>` → the asset id (last segment);
 * - `protocol:<protocolId>@<contract address>` → the contract address
 *   (after the last `@`);
 * - `bridge:<bridgeId>` / `venue:<venueId>` → the bridge/venue id;
 * - Direct observation ids and other refs (routes, chains, simulation-
 *   internal refs) do NOT identify a quarantinable component —
 *   quarantining an observation id would quarantine nothing.
 */
function componentIdFromObservationRef(ref: string): string | undefined {
  if (ref.length === 0 || /\s/.test(ref)) {
    return undefined;
  }
  if (ref.startsWith("approval:")) {
    return ref.slice("approval:".length) || undefined;
  }
  if (ref.startsWith("registry:")) {
    const segments = ref.split(":");
    const last = segments[segments.length - 1];
    return last !== undefined && last.length > 0 ? last : undefined;
  }
  if (ref.startsWith("protocol:")) {
    const at = ref.lastIndexOf("@");
    if (at !== -1) {
      const address = ref.slice(at + 1);
      return address.length > 0 ? address : undefined;
    }
    return undefined;
  }
  if (ref.startsWith("venue:")) {
    const id = ref.slice("venue:".length);
    return id.length > 0 ? id : undefined;
  }
  if (ref.startsWith("bridge:")) {
    // bridge:<bridgeId> — bridge hop coverage refs carry the venue/bridge
    // id directly after the prefix.
    const id = ref.slice("bridge:".length);
    return id.length > 0 ? id : undefined;
  }
  // route:/chain:/token-registry:/spender-intel:/oracle:/mempool:/domain:/
  // finality:/address:/simulation-internal refs name observations, chains
  // or routes — none of them is a quarantinable component identity.
  return undefined;
}

/**
 * Propose immune-system advisories from a threat assessment.
 *
 * Rules (deterministic):
 * - only signals at high/critical severity drive proposals (the
 *   policy's BLOCK/REQUIRE_CONFIRMATION-grade drivers);
 * - one proposal per driving signal family (deduplicated by family, most
 *   severe instance first — assessment signals are severity-ordered);
 * - the action follows advisoryActionForDrivingSignal;
 * - evidence refs bind every proposal to the assessment's evidence
 *   chains (quarantine release later REQUIRES such evidence);
 * - zero proposals when no signal reaches the bar.
 */
export function proposeAdvisoriesFromAssessment(
  assessment: ThreatAssessment,
  policy: OnchainThreatPolicy,
): readonly ThreatAdvisoryProposal[] {
  const evidence = evidenceRefsFromAssessment(assessment);
  const proposals: ThreatAdvisoryProposal[] = [];
  const seenFamilies = new Set<ThreatFamily>();

  for (const signal of assessment.signals) {
    if (seenFamilies.has(signal.family)) {
      continue;
    }
    if (signal.severity !== "high" && signal.severity !== "critical") {
      continue;
    }
    seenFamilies.add(signal.family);
    const affected = targetComponentsForSignal(assessment, signal.signalId);
    if (affected.length === 0) {
      continue;
    }
    const action = advisoryActionForDrivingSignal(signal.family, signal.severity, policy);
    proposals.push({
      proposalId: `adv-proposal:${signal.family}:${assessment.assessmentId}`,
      title: `${signal.family} threat detected (${signal.severity})`,
      severity: advisorySeverityFor(signal.severity),
      description:
        `${signal.summary}. Detected by ${assessment.agentRef} at ${assessment.analyzedAt} ` +
        `with calibrated confidence ${signal.confidenceBps} bps; evidence chain bound to ${assessment.evidenceRefs.join(", ")}.`,
      affected: Object.freeze(affected.map((a) => Object.freeze(a))),
      action,
      remediation: {
        summary: `Investigate the ${signal.family} detection and remediate the affected component(s); release of any resulting quarantine requires verified remediation and advisory closure.`,
        workarounds: Object.freeze([
          "halt writes referencing the affected component(s)",
          "revoke outstanding approvals to the affected spender(s)",
        ]),
      },
      declaredBy: assessment.agentRef,
      publishedAt: assessment.analyzedAt,
      evidence: Object.freeze(evidence),
      sourceSignalIds: Object.freeze([signal.signalId]),
    });
  }

  return Object.freeze(proposals);
}
