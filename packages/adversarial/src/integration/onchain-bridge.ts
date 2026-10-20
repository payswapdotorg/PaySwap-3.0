/**
 * @payswap/adversarial — the D-1 advisory bridge: threat assessments →
 * immune advisories + the kernel flag channel (P6-W3, lane r4-w3;
 * PORT+ADAPT of the kernel's advisory-bridge consumption seam — this
 * package owns the REAL registry the kernel's proposals publish into;
 * NET-NEW for the provider-assessment side).
 *
 * THE D-1 WIRING CONTRACT (advisory outcomes map to quarantine /
 * restrict / retire):
 *
 * - `enforceThreatAdvisoryProposal` consumes a kernel-shaped
 *   `ThreatAdvisoryProposal` (the PINNED D-1 seam shape — the exact
 *   wire the onchain-security threat-intel subpath emits), publishes
 *   it into the REAL advisory registry and enforces it through the
 *   immune gate (quarantine creation for quarantine-grade actions,
 *   live restriction for restrict/retire, optional epoch advance that
 *   VOIDS every epoch-scoped authorization issued under it);
 * - `advisoryInputsFromProviderAssessment` derives the same
 *   publication inputs from THIS package's provider assessments
 *   (advisory-grade families only: account takeover, malicious
 *   agents, package compromise — the families whose immune targets
 *   the old corpus actually quarantined/restricted);
 * - `capabilityCaseInputsFromProviderAssessment` derives
 *   incident/observation CASES for the remaining families (incidents
 *   feed evidence + learning — the learning-feed law);
 * - `threatSignalsToAgentFlags` projects signals onto the kernel's
 *   ADVISORY-ONLY channel (the pinned AgentSecurityFlag): flags ride
 *   alongside decisions and NEVER mutate them (INV-21).
 *
 * Action derivation (deterministic, mirroring the kernel's own
 * advisoryActionForDrivingSignal): critical → quarantine (or RETIRE
 * for retire-eligible families under the explicit policy opt-in);
 * high → restrict. Retirement is irreversible — never a heuristic
 * default.
 *
 * Deterministic only: pure functions of (assessment, policy, bundle).
 */

import type {
  AgentSecurityFlag,
  OnchainThreatPolicyView,
  ThreatAdvisoryProposal,
} from "../pins/index.ts";
import type { AdvisorySeverity, EvidenceRef } from "../pins/threat-intel.ts";
import { IMMUNE_COMPONENT_KINDS } from "../pins/index.ts";
import type { SecurityAdvisory } from "../advisories.ts";
import type { PublishAdvisoryInput } from "../advisory-registry.ts";
import type { EnforcementRecord } from "../immune-gate.ts";
import { ImmuneGate } from "../immune-gate.ts";
import type { EvidenceRef as LocalEvidenceRef } from "../quarantine-ledger.ts";
import type { ProviderThreatAssessment } from "../provider/agent.ts";
import type { ProviderThreatSignal } from "../provider/signals.ts";
import { PROVIDER_FAMILY_DECLARATIONS } from "../provider/families.ts";

/** Raised on an invalid bridge input (fail closed). */
export class InvalidBridgeInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBridgeInputError";
  }
}

// ---------------------------------------------------------------------------
// The kernel-proposal enforcement (the D-1 seam, threat side)
// ---------------------------------------------------------------------------

/** What enforcing one kernel-shaped advisory proposal did. */
export interface ThreatProposalEnforcement {
  /** The published advisory (registry state changed). */
  readonly advisory: SecurityAdvisory;
  /** What the immune gate did (quarantine/restrict/retire + epoch). */
  readonly enforcement: EnforcementRecord;
  /** The proposal's evidence refs (quarantine release requires them). */
  readonly evidence: readonly EvidenceRef[];
  /** Signal ids that drove the proposal (audit lineage). */
  readonly sourceSignalIds: readonly string[];
}

/** The advisory severity for a signal severity (no info level). */
function advisorySeverityFor(severity: string): AdvisorySeverity {
  switch (severity) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "medium":
      return "medium";
    default:
      return "low";
  }
}

/**
 * Enforce a kernel-shaped threat advisory proposal: publish it into
 * the REAL advisory registry (advisoryId = proposalId) and run the
 * immune gate (advisory outcome → quarantine / restrict / retire, with
 * the OPTIONAL epoch advance that voids every epoch-scoped
 * authorization issued under it). Fail-closed on every malformed
 * field.
 */
export function enforceThreatAdvisoryProposal(input: {
  readonly gate: ImmuneGate;
  readonly proposal: ThreatAdvisoryProposal;
  readonly advanceEpoch?: boolean;
}): ThreatProposalEnforcement {
  const proposal = input.proposal;
  if (proposal.proposalId.length === 0) {
    throw new InvalidBridgeInputError("proposal requires a proposalId");
  }
  if (proposal.title.length === 0) {
    throw new InvalidBridgeInputError("proposal requires a title");
  }
  if (proposal.declaredBy.length === 0) {
    throw new InvalidBridgeInputError("proposal requires a declaredBy ref");
  }
  if (proposal.affected.length === 0) {
    throw new InvalidBridgeInputError(
      "proposal must affect at least one component (an empty advisory cannot restrict anything)",
    );
  }
  for (const affected of proposal.affected) {
    if (!(IMMUNE_COMPONENT_KINDS as readonly unknown[]).includes(affected.kind)) {
      throw new InvalidBridgeInputError(
        `proposal affected kind '${String(affected.kind)}' is outside the immune component vocabulary`,
      );
    }
    if (affected.id.length === 0) {
      throw new InvalidBridgeInputError("proposal affected component id must not be empty");
    }
  }
  if (proposal.remediation.summary.length === 0) {
    throw new InvalidBridgeInputError("proposal requires a remediation summary");
  }
  const publish: PublishAdvisoryInput = {
    advisoryId: proposal.proposalId,
    title: proposal.title,
    severity: proposal.severity,
    description: proposal.description,
    affected: proposal.affected.map((component) => ({
      kind: component.kind,
      id: component.id,
      ...(component.versionRange === undefined
        ? {}
        : { versionRange: component.versionRange }),
    })),
    action: proposal.action,
    remediation: {
      summary: proposal.remediation.summary,
      workarounds: [...proposal.remediation.workarounds],
    },
    declaredBy: proposal.declaredBy,
    publishedAt: proposal.publishedAt,
  };
  const advisory = input.gate.advisories.publish(publish);
  const enforcement = input.gate.enforceAdvisory(advisory, {
    ...(input.advanceEpoch === undefined ? {} : { advanceEpoch: input.advanceEpoch }),
  });
  return {
    advisory,
    enforcement,
    evidence: [...proposal.evidence],
    sourceSignalIds: [...proposal.sourceSignalIds],
  };
}

// ---------------------------------------------------------------------------
// The provider-assessment bridge (advisory-grade families)
// ---------------------------------------------------------------------------

/** The families whose detections publish advisories (immune targets). */
export const ADVISORY_GRADE_PROVIDER_FAMILIES: readonly (typeof PROVIDER_FAMILY_DECLARATIONS[keyof typeof PROVIDER_FAMILY_DECLARATIONS]["family"])[] =
  Object.freeze(["account_takeover", "malicious_agent", "package_compromise"]);

/** One derived advisory publication input (pure data, not yet published). */
export interface ProviderAdvisoryPublication extends PublishAdvisoryInput {
  /** Evidence refs binding the advisory to the assessment's signals. */
  readonly evidence: readonly LocalEvidenceRef[];
  /** Signal ids that drove the publication (audit lineage). */
  readonly sourceSignalIds: readonly string[];
}

/**
 * Derive the advisory action for a driving provider signal
 * (deterministic; mirrors the kernel's own derivation):
 * - critical → quarantine (retire ONLY for retire-eligible families
 *   under the explicit `retireCompromisedContracts` opt-in);
 * - high → restrict.
 */
export function advisoryActionForProviderSignal(
  family: keyof typeof PROVIDER_FAMILY_DECLARATIONS,
  severity: "info" | "low" | "medium" | "high" | "critical",
  policy: OnchainThreatPolicyView,
): "restrict" | "quarantine" | "retire" {
  const declaration = PROVIDER_FAMILY_DECLARATIONS[family];
  if (
    policy.retireCompromisedContracts === true &&
    severity === "critical" &&
    declaration.retireEligible
  ) {
    return "retire";
  }
  if (severity === "critical") {
    return "quarantine";
  }
  return "restrict";
}

/**
 * Derive advisory publications from a provider assessment (pure — the
 * caller publishes + enforces through the immune gate). Rules:
 * - only ADVISORY_GRADE_PROVIDER_FAMILIES at high/critical severity
 *   drive publications, deduplicated per family (most severe first —
 *   the assessment's signals are severity-ordered);
 * - the immune target is derived from the driving observation's id
 *   convention (`agent:<ref>:…` → agent_key; `package:<ref>:…` →
 *   agent_package; `credential:<ref>:…` → agent_key);
 * - evidence refs bind every publication to the signal chains
 *   (quarantine release later REQUIRES such evidence);
 * - the action follows advisoryActionForProviderSignal.
 */
export function advisoryInputsFromProviderAssessment(
  assessment: ProviderThreatAssessment,
  policy: OnchainThreatPolicyView,
): readonly ProviderAdvisoryPublication[] {
  const publications: ProviderAdvisoryPublication[] = [];
  const seenFamilies = new Set<string>();
  for (const signal of assessment.signals) {
    if (!ADVISORY_GRADE_PROVIDER_FAMILIES.includes(signal.family)) {
      continue;
    }
    if (signal.severity !== "high" && signal.severity !== "critical") {
      continue;
    }
    if (seenFamilies.has(signal.family)) {
      continue;
    }
    seenFamilies.add(signal.family);
    const target = immuneTargetForSignal(signal);
    if (target === undefined) {
      continue;
    }
    const action = advisoryActionForProviderSignal(
      signal.family,
      signal.severity,
      policy,
    );
    publications.push({
      advisoryId: `adv:${signal.family}:${assessment.assessmentId}`,
      title: `${signal.family} threat detected (${signal.severity})`,
      severity: advisorySeverityFor(signal.severity),
      description:
        `${signal.summary}. Detected by ${assessment.agentRef} at ${assessment.analyzedAt} ` +
        `with calibrated confidence ${signal.confidenceBps} bps; evidence chain bound to ` +
        `${signal.evidence.digestRefs.join(", ")}.`,
      affected: [target],
      action,
      remediation: {
        summary:
          `Investigate the ${signal.family} detection and remediate the affected component; ` +
          `release of any resulting quarantine requires verified remediation and advisory closure.`,
        workarounds: [
          "halt delegated actions referencing the affected component",
          "revoke outstanding delegations of the affected key",
        ],
      },
      declaredBy: assessment.agentRef,
      publishedAt: assessment.analyzedAt,
      evidence: signal.evidence.digestRefs.map((digest) => ({
        evidenceId: `evidence:signal:${signal.signalId}`,
        artifactRef: `signal:${signal.signalId}`,
        contentDigest: digest,
      })),
      sourceSignalIds: [signal.signalId],
    });
  }
  return Object.freeze(publications);
}

/** Derive the immune target (kind + id) from a signal's observation refs. */
function immuneTargetForSignal(
  signal: ProviderThreatSignal,
): { kind: (typeof IMMUNE_COMPONENT_KINDS)[number]; id: string } | undefined {
  for (const ref of signal.evidence.observationRefs) {
    if (ref.startsWith("agent:")) {
      const id = ref.slice("agent:".length).split(":")[0] ?? "";
      if (id.length > 0) {
        return { kind: "agent_key", id };
      }
    }
    if (ref.startsWith("package:")) {
      const id = ref.slice("package:".length).split(":")[0] ?? "";
      if (id.length > 0) {
        return { kind: "agent_package", id };
      }
    }
    if (ref.startsWith("credential:")) {
      const id = ref.slice("credential:".length).split(":")[0] ?? "";
      if (id.length > 0) {
        return { kind: "agent_key", id };
      }
    }
  }
  return undefined;
}
