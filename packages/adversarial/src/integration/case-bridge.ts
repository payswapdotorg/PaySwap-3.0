/**
 * @payswap/adversarial — the provider-assessment case bridge + the
 * kernel flag channel (P6-W3, lane r4-w3; split from
 * ./onchain-bridge.ts for the <=400-line file law).
 *
 * THE LEARNING-FEED LAW (old INV-S04): incidents FEED evidence and
 * security learning. Every provider family WITHOUT an advisory-grade
 * immune target surfaces as a CAPABILITY CASE (evidence-mandatory,
 * append-only learning records) — the old corpus's incident path.
 *
 * THE FLAG CHANNEL (INV-21): provider signals project onto the
 * kernel's ADVISORY-ONLY channel (the pinned AgentSecurityFlag shape)
 * — flags ride alongside gated evaluations and NEVER mutate a
 * decision.
 *
 * Deterministic only: pure functions of the assessment.
 */

import type { AgentSecurityFlag } from "../pins/index.ts";
import { IMMUNE_COMPONENT_KINDS } from "../pins/index.ts";
import type { EvidenceRef as LocalEvidenceRef } from "../quarantine-ledger.ts";
import type { ProviderThreatAssessment } from "../provider/agent.ts";
import type { ProviderThreatSignal } from "../provider/signals.ts";
import { ADVISORY_GRADE_PROVIDER_FAMILIES } from "./onchain-bridge.ts";
import { PROVIDER_FAMILY_DECLARATIONS } from "../provider/families.ts";

// ---------------------------------------------------------------------------
// The provider-assessment case bridge (the learning-feed law)
// ---------------------------------------------------------------------------

/** One derived capability-case input (pure data, not yet opened). */
export interface ProviderCapabilityCaseInput {
  readonly caseId: string;
  readonly kind: "incident" | "observation";
  readonly title: string;
  readonly component: {
    readonly kind: (typeof IMMUNE_COMPONENT_KINDS)[number];
    readonly id: string;
  };
  readonly signal: {
    readonly signalKind:
      | "device_change" | "sim_change" | "account_change" | "beneficiary_change"
      | "graph_anomaly" | "velocity" | "provider_incident" | "agent_behavior"
      | "package_behavior" | "verification_failure" | "expert_finding"
      | "coordinated_abuse";
    readonly observedAt: number;
    readonly detail: string;
    readonly sourceRef: string;
  };
  readonly evidence: readonly LocalEvidenceRef[];
  readonly openedAt: number;
}

/** The case signal kind of one family (fail-closed lookup). */
function caseSignalKindFor(
  family: keyof typeof PROVIDER_FAMILY_DECLARATIONS,
): ProviderCapabilityCaseInput["signal"]["signalKind"] {
  const kind = PROVIDER_FAMILY_CASE_SIGNAL_KIND[family];
  if (kind === undefined) {
    throw new Error(`no case signal kind recorded for family '${family}'`);
  }
  return kind;
}

/** The case signal kind per provider family (deterministic map). */
export const PROVIDER_FAMILY_CASE_SIGNAL_KIND: Readonly<
  Record<keyof typeof PROVIDER_FAMILY_DECLARATIONS, ProviderCapabilityCaseInput["signal"]["signalKind"]>
> = Object.freeze({
  duplicated_commands: "provider_incident",
  lost_webhooks: "provider_incident",
  ambiguous_provider: "provider_incident",
  account_takeover: "account_change",
  malicious_agent: "agent_behavior",
  package_compromise: "package_behavior",
  incentive_sybil_collusion_wash: "coordinated_abuse",
  leaderboard_gaming: "velocity",
  provider_outage: "provider_incident",
  clock_skew: "verification_failure",
  partial_payment: "provider_incident",
});

/**
 * Derive capability-case inputs from a provider assessment for every
 * family NOT advisory-grade (incidents feed evidence + learning — the
 * learning-feed law). One case per family (most severe instance), the
 * component derived from the observation-ref convention
 * (`<source>:<component-id>:…` → connected_instance for provider
 * surfaces).
 */
export function capabilityCaseInputsFromProviderAssessment(
  assessment: ProviderThreatAssessment,
): readonly ProviderCapabilityCaseInput[] {
  const cases: ProviderCapabilityCaseInput[] = [];
  const seenFamilies = new Set<string>();
  for (const signal of assessment.signals) {
    if (ADVISORY_GRADE_PROVIDER_FAMILIES.includes(signal.family)) {
      continue;
    }
    if (seenFamilies.has(signal.family)) {
      continue;
    }
    seenFamilies.add(signal.family);
    const componentId = componentIdForProviderSignal(signal);
    if (componentId === undefined) {
      continue;
    }
    cases.push({
      caseId: `case:${signal.family}:${assessment.assessmentId}`,
      kind: "incident",
      title: `${signal.family} detection (${signal.severity})`,
      component: { kind: "connected_instance", id: componentId },
      signal: {
        signalKind: caseSignalKindFor(signal.family),
        observedAt: assessment.analyzedAt,
        detail: signal.summary,
        sourceRef: assessment.agentRef,
      },
      evidence: signal.evidence.digestRefs.map((digest) => ({
        evidenceId: `evidence:signal:${signal.signalId}`,
        artifactRef: `signal:${signal.signalId}`,
        contentDigest: digest,
      })),
      openedAt: assessment.analyzedAt,
    });
  }
  return Object.freeze(cases);
}

/** The provider component id from a signal's observation refs. */
function componentIdForProviderSignal(signal: ProviderThreatSignal): string | undefined {
  for (const ref of signal.evidence.observationRefs) {
    const segments = ref.split(":");
    const source = segments[0] ?? "";
    const id = segments[1] ?? "";
    if (
      ["incident", "webhook", "clock", "idempotency", "capture", "incentive"].includes(source) &&
      id.length > 0
    ) {
      return id;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// The kernel flag channel (advisory only — INV-21)
// ---------------------------------------------------------------------------

/**
 * Project a provider assessment's signals onto the kernel's
 * ADVISORY-ONLY channel (the pinned AgentSecurityFlag shape): one flag
 * per signal, carrying the family + severity + confidence + evidence
 * refs in the note. Flags ride alongside a gated evaluation and NEVER
 * mutate a decision (INV-21 — the kernel's own attachAgentFlag
 * contract; the wiring layer attaches them at the kernel seam).
 */
export function providerSignalsToAgentFlags(
  assessment: ProviderThreatAssessment,
): readonly AgentSecurityFlag[] {
  return Object.freeze(
    assessment.signals.map((signal) => ({
      flagId: `flag:${signal.signalId}`,
      flaggedBy: assessment.agentRef,
      dimension: "general" as const,
      note:
        `${signal.family} [${signal.severity}] ${signal.summary} ` +
        `confidence=${signal.confidenceBps}bps evidence=(obs:${signal.evidence.observationRefs.join(",")}|digest:${signal.evidence.digestRefs.join(",")})`,
      flaggedAt: assessment.analyzedAt,
    })),
  );
}
