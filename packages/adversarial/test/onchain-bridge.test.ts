/**
 * The D-1 wiring contract end-to-end (P6-W3, lane r4-w3; NET-NEW — the
 * onchain-security seam composition through the STRUCTURAL PINS: threat
 * proposals → the REAL immune machinery; the immune state projection;
 * the harden-only BLOCK escalation. The kernel side is supplied as
 * PINNED pure data, exactly as the wiring layer will).
 */

import { describe, expect, it } from "vitest";
import {
  advisoryInputsFromProviderAssessment,
  advisoryActionForProviderSignal,
  ADVISORY_GRADE_PROVIDER_FAMILIES,
  assertEscalationOnly,
  BlockEscalationError,
  BlockEscalationLedger,
  blockRegistrationInputFor,
  capabilityCaseInputsFromProviderAssessment,
  enforceThreatAdvisoryProposal,
  ImmuneGate,
  InvalidBridgeInputError,
  projectOnchainSecurityState,
  proposeBlockEscalation,
  providerSignalsToAgentFlags,
  QuarantineLedger,
  SecurityAdvisoryRegistry,
  SecurityEpochAuthority,
  type ThreatAdvisoryProposal,
} from "../src/index.ts";
import { AdversarialProviderAgent } from "../src/provider/index.ts";
import {
  agentBehaviorFixture,
  credentialChangeFixture,
  emptyBundle,
  incidentFixture,
  packageIntegrityFixture,
  TIGHT_THRESHOLDS,
} from "./helpers.ts";

function gate() {
  return new ImmuneGate({
    advisories: new SecurityAdvisoryRegistry(),
    quarantine: new QuarantineLedger(),
    epochs: new SecurityEpochAuthority(),
  });
}

function kernelProposal(overrides: Partial<ThreatAdvisoryProposal> = {}): ThreatAdvisoryProposal {
  return {
    proposalId: "adv-proposal:bridge_compromise:assess-1",
    title: "bridge compromise detected (critical)",
    severity: "critical",
    description: "fixture kernel proposal",
    affected: [{ kind: "extension", id: "ext-bridge-1" }],
    action: "quarantine",
    remediation: { summary: "investigate + remediate", workarounds: ["halt writes"] },
    declaredBy: "agent:threat-intel-1",
    publishedAt: 1_000,
    evidence: [{ evidenceId: "e-1", artifactRef: "signal:sig-1", contentDigest: "fnv1a64:0000000000000001" }],
    sourceSignalIds: ["sig-1"],
    ...overrides,
  };
}

describe("the D-1 wiring contract (onchain-security seam, via pins)", () => {
  it("enforces a kernel-shaped threat proposal: publish → quarantine → project", () => {
    const immune = gate();
    const result = enforceThreatAdvisoryProposal({
      gate: immune,
      proposal: kernelProposal(),
    });
    expect(result.advisory.advisoryId).toBe("adv-proposal:bridge_compromise:assess-1");
    expect(result.enforcement.action).toBe("quarantine");
    expect(result.enforcement.quarantinedComponents).toEqual([
      { kind: "extension", id: "ext-bridge-1" },
    ]);
    expect(immune.quarantine.isQuarantined({ kind: "extension", id: "ext-bridge-1" })).toBe(true);
    // The projection onto the kernel's composed state (the pinned shape).
    const state = projectOnchainSecurityState({
      advisories: immune.advisories,
      quarantine: immune.quarantine,
      epochs: immune.epochs,
      observedAt: 1_500,
    });
    expect(state.networkEpoch).toBe(0n);
    expect(state.quarantinedComponents).toEqual(["extension:ext-bridge-1"]);
    expect(state.restrictedComponents).toEqual(["extension:ext-bridge-1"]);
    expect(state.activeAdvisoryRefs).toEqual(["adv-proposal:bridge_compromise:assess-1"]);
  });

  it("the optional epoch advance VOIDS authorizations granted under it", () => {
    const immune = gate();
    enforceThreatAdvisoryProposal({
      gate: immune,
      proposal: kernelProposal({ proposalId: "adv-proposal:x:1" }),
      advanceEpoch: true,
    });
    expect(immune.epochs.currentEpoch().value).toBe(1n);
    expect(immune.epochs.currentEpoch().advisoryRef).toBe("adv-proposal:x:1");
    const state = projectOnchainSecurityState({
      advisories: immune.advisories,
      quarantine: immune.quarantine,
      epochs: immune.epochs,
      observedAt: 1_500,
    });
    expect(state.networkEpoch).toBe(1n);
    // Every epoch-scoped authorization issued at epoch 0 is now stale:
    expect(() =>
      immune.checkSensitiveAction({
        authorization: {
          authorizationRef: "authz-stale",
          principalRef: "user:customer-1",
          actionClass: "money_movement",
          issuedAtEpoch: 0n,
          expiresAt: 10_000,
        },
        at: 1_500,
      }),
    ).toThrowError(/Stale security epoch/);
  });

  it("malformed kernel proposals fail closed (the bridge never guesses)", () => {
    const immune = gate();
    expect(() =>
      enforceThreatAdvisoryProposal({ gate: immune, proposal: kernelProposal({ proposalId: "" }) }),
    ).toThrowError(InvalidBridgeInputError);
    expect(() =>
      enforceThreatAdvisoryProposal({
        gate: immune,
        proposal: kernelProposal({ affected: [] }),
      }),
    ).toThrowError(/at least one component/);
    expect(() =>
      enforceThreatAdvisoryProposal({
        gate: immune,
        proposal: kernelProposal({
          affected: [{ kind: "vendor_plugin" as never, id: "x" }],
        }),
      }),
    ).toThrowError(/immune component vocabulary/);
    expect(() =>
      enforceThreatAdvisoryProposal({
        gate: immune,
        proposal: kernelProposal({ remediation: { summary: "", workarounds: [] } }),
      }),
    ).toThrowError(/remediation summary/);
  });

  it("provider assessments derive advisory publications for the advisory-grade families", () => {
    const agent = new AdversarialProviderAgent("agent:provider-intel-1");
    const assessment = agent.analyze({
      bundle: emptyBundle({
        agentBehaviors: [
          agentBehaviorFixture({ observationId: "agent:key-abc:1", proposalShapeValid: false }),
        ],
        packageIntegrities: [
          packageIntegrityFixture({
            observationId: "package:pkg-checkout:1.4.2",
            observedContentDigest: "fnv1a64:0000000000000009",
          }),
        ],
      }),
      thresholds: TIGHT_THRESHOLDS,
      at: 1_000,
    });
    const publications = advisoryInputsFromProviderAssessment(assessment, {
      policyId: "policy-1",
      version: 1,
    });
    expect(publications.map((p) => p.advisoryId).sort()).toEqual([
      "adv:malicious_agent:" + assessment.assessmentId,
      "adv:package_compromise:" + assessment.assessmentId,
    ]);
    const agentAdvisory = publications.find((p) => p.advisoryId.includes("malicious_agent"));
    expect(agentAdvisory?.affected).toEqual([{ kind: "agent_key", id: "key-abc" }]);
    expect(agentAdvisory?.action).toBe("quarantine");
    expect(agentAdvisory?.severity).toBe("critical");
    expect(agentAdvisory?.evidence.length).toBeGreaterThan(0);
    // Publishing + enforcing drives the REAL machinery (the D-1 loop).
    const immune = gate();
    for (const publication of publications) {
      const advisory = immune.advisories.publish(publication);
      immune.enforceAdvisory(advisory);
    }
    expect(immune.quarantine.isQuarantined({ kind: "agent_key", id: "key-abc" })).toBe(true);
    expect(immune.quarantine.isQuarantined({ kind: "agent_package", id: "pkg-checkout" })).toBe(true);
  });

  it("retirement is proposed ONLY under the explicit policy opt-in (never a heuristic default)", () => {
    const agent = new AdversarialProviderAgent("agent:provider-intel-1");
    const assessment = agent.analyze({
      bundle: emptyBundle({
        packageIntegrities: [
          packageIntegrityFixture({
            observationId: "package:pkg-x:1.0.0",
            observedContentDigest: "fnv1a64:0000000000000002",
          }),
        ],
      }),
      thresholds: TIGHT_THRESHOLDS,
      at: 1_000,
    });
    expect(
      advisoryActionForProviderSignal("package_compromise", "critical", {
        policyId: "p",
        version: 1,
      }),
    ).toBe("quarantine");
    expect(
      advisoryActionForProviderSignal("package_compromise", "critical", {
        policyId: "p",
        version: 1,
        retireCompromisedContracts: true,
      }),
    ).toBe("retire");
    expect(
      advisoryActionForProviderSignal("malicious_agent", "critical", {
        policyId: "p",
        version: 1,
        retireCompromisedContracts: true,
      }),
    ).toBe("quarantine");
    const withOptIn = advisoryInputsFromProviderAssessment(assessment, {
      policyId: "p",
      version: 1,
      retireCompromisedContracts: true,
    });
    expect(withOptIn[0]?.action).toBe("retire");
  });

  it("non-advisory families surface as capability CASES (incidents feed evidence + learning)", () => {
    const agent = new AdversarialProviderAgent("agent:provider-intel-1");
    const assessment = agent.analyze({
      bundle: emptyBundle({
        incidents: [
          incidentFixture({
            observationId: "incident:provider:card-a:1",
            providerRef: "provider:card-a",
            incidentKind: "unknown",
          }),
        ],
      }),
      thresholds: TIGHT_THRESHOLDS,
      at: 1_000,
    });
    const cases = capabilityCaseInputsFromProviderAssessment(assessment);
    expect(cases).toHaveLength(1);
    expect(cases[0]?.component).toEqual({ kind: "connected_instance", id: "provider:card-a" });
    expect(cases[0]?.signal.signalKind).toBe("provider_incident");
    expect(cases[0]?.evidence.length).toBeGreaterThan(0);
    // Advisory-grade families do NOT open cases (no double reporting).
    const takeoverOnly = agent.analyze({
      bundle: emptyBundle({
        credentialChanges: [credentialChangeFixture({ observationId: "credential:user:1" })],
      }),
      thresholds: TIGHT_THRESHOLDS,
      at: 1_000,
    });
    expect(capabilityCaseInputsFromProviderAssessment(takeoverOnly)).toEqual([]);
    expect(ADVISORY_GRADE_PROVIDER_FAMILIES).toEqual([
      "account_takeover",
      "malicious_agent",
      "package_compromise",
    ]);
  });

  it("provider signals project onto the kernel's ADVISORY-ONLY flag channel", () => {
    const agent = new AdversarialProviderAgent("agent:provider-intel-1");
    const assessment = agent.analyze({
      bundle: emptyBundle({
        agentBehaviors: [
          agentBehaviorFixture({ observationId: "agent:key-1:1", proposalShapeValid: false }),
        ],
      }),
      thresholds: TIGHT_THRESHOLDS,
      at: 1_000,
    });
    const flags = providerSignalsToAgentFlags(assessment);
    expect(flags).toHaveLength(assessment.signals.length);
    for (const flag of flags) {
      expect(flag.flaggedBy).toBe("agent:provider-intel-1");
      expect(flag.dimension).toBe("general");
      expect(flag.flaggedAt).toBe(1_000);
      expect(flag.note).toContain("confidence=");
    }
  });

  it("the projection is a pure deterministic function of the machinery state", () => {
    const immune = gate();
    const advisory = immune.advisories.publish({
      advisoryId: "adv-1",
      title: "t",
      severity: "high",
      description: "d",
      affected: [{ kind: "extension", id: "ext-b" }, { kind: "extension", id: "ext-a" }],
      action: "restrict",
      remediation: { summary: "s", workarounds: [] },
      declaredBy: "source:cert-intel",
      publishedAt: 1_000,
    });
    immune.enforceAdvisory(advisory);
    const first = projectOnchainSecurityState({
      advisories: immune.advisories,
      quarantine: immune.quarantine,
      epochs: immune.epochs,
      observedAt: 2_000,
    });
    const second = projectOnchainSecurityState({
      advisories: immune.advisories,
      quarantine: immune.quarantine,
      epochs: immune.epochs,
      observedAt: 2_000,
    });
    expect(first).toEqual(second);
    // Deterministic ordering: restricted keys sorted.
    expect(first.restrictedComponents).toEqual(["extension:ext-a", "extension:ext-b"]);
    expect(() =>
      projectOnchainSecurityState({
        advisories: immune.advisories,
        quarantine: immune.quarantine,
        epochs: immune.epochs,
        observedAt: -1,
      }),
    ).toThrowError(/non-negative integer/);
  });
});
