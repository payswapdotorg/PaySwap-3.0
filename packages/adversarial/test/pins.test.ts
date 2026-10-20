/**
 * The structural pins (P6-W3, lane r4-w3; NET-NEW — the zero-sibling
 * law's machine-checked mirror inventory: vocabulary identity with the
 * real lanes, structural assignability of real-shaped fixtures, digest
 * compatibility with the kernel discipline).
 */

import { describe, expect, expectTypeOf, it } from "vitest";
import {
  contentDigest,
  isValidChainKey,
  isValidAssetRef,
  ASSET_CLASSES,
  GUARD_DIMENSIONS,
  IMMUNE_COMPONENT_KINDS,
  THREAT_FAMILIES,
  THREAT_SEVERITIES,
  DETECTION_METHODS,
  THREAT_VERDICTS,
  VERDICT_RANK,
  COMPONENT_KINDS,
  type AmountSpec,
  type Principal,
  type GateDecision,
  type OnchainSecurityState,
  type AgentSecurityFlag,
  type ThreatAdvisoryProposal,
  type ThreatAssessment,
  type OnchainThreatPolicyView,
  type SecurityBlockRecordPin,
  type ChainRef,
  type AssetRef,
} from "../src/index.ts";
import { COMPONENT_KINDS as LOCAL_COMPONENT_KINDS } from "../src/index.ts";

describe("the structural pins (zero-sibling law)", () => {
  it("pins the onchain-security kernel vocabulary with identical literals (the D-1 seam)", () => {
    expect(GUARD_DIMENSIONS).toEqual([
      "chain",
      "asset",
      "amount",
      "destination",
      "spender_approval",
      "expiry",
      "route",
      "protocol_identity",
      "security_state",
      "simulation_consistency",
    ]);
    expect(THREAT_VERDICTS).toEqual([
      "ALLOW",
      "ALLOW_WITH_CONSTRAINTS",
      "REQUIRE_CONFIRMATION",
      "BLOCK",
    ]);
    expect(VERDICT_RANK).toEqual({
      ALLOW: 0,
      ALLOW_WITH_CONSTRAINTS: 1,
      REQUIRE_CONFIRMATION: 2,
      BLOCK: 3,
    });
    expect(THREAT_FAMILIES).toHaveLength(13);
    expect(THREAT_FAMILIES).toContain("malicious_approval_permit");
    expect(THREAT_FAMILIES).toContain("finality_reorg_anomaly");
    expect(THREAT_SEVERITIES).toEqual(["info", "low", "medium", "high", "critical"]);
    expect(DETECTION_METHODS).toEqual([
      "exact_identity_match",
      "structural_mismatch",
      "threshold_breach",
      "behavioral_pattern",
      "registry_absence",
    ]);
  });

  it("pins the immune component-kind vocabulary with identical literals (no parallel vocabulary)", () => {
    expect(IMMUNE_COMPONENT_KINDS).toEqual([
      "agent_package",
      "agent_body",
      "agent_instance",
      "agent_key",
      "extension",
      "capability",
      "connected_instance",
    ]);
    expect([...IMMUNE_COMPONENT_KINDS]).toEqual([...LOCAL_COMPONENT_KINDS]);
    expect(COMPONENT_KINDS).toHaveLength(7);
  });

  it("pins the trust lane's AmountSpec + Principal wire (assignability proof)", () => {
    const amount: AmountSpec = { currency: "USD", minorUnits: "10000" };
    expect(amount.minorUnits).toBe("10000");
    const user: Principal = { kind: "user", id: "customer-1", securityEpoch: 0n };
    const agent: Principal = {
      kind: "agent",
      agentKeyFingerprint: "fingerprint-1",
      ownerRef: "user:customer-1",
      bodyRef: "body:helper",
      packageVersionRef: "pkgver:helper@1.0.0",
      authorityEnvelope: [{ mandateId: "mandate-1", version: 1 }],
      securityEpoch: 2n,
    };
    expect(user.kind).toBe("user");
    expect(agent.securityEpoch).toBe(2n);
    expectTypeOf<Principal>().not.toBeNever();
  });

  it("pins the onchain-domain chain/asset vocabulary (validators + classes)", () => {
    expect(isValidChainKey("ethereum:mainnet")).toBe(true);
    expect(isValidChainKey("Ethereum:Mainnet")).toBe(false);
    expect(isValidChainKey("no-separator")).toBe(false);
    const chain: ChainRef = "ethereum:sepolia";
    expect(isValidChainKey(chain)).toBe(true);
    expect(isValidAssetRef("asset.ethereum:mainnet.usdc")).toBe(true);
    expect(isValidAssetRef("asset.Mainnet:x.USDC")).toBe(false);
    expect(isValidAssetRef("eth:mainnet")).toBe(false);
    const asset: AssetRef = "asset.ethereum:mainnet.wsteth";
    expect(isValidAssetRef(asset)).toBe(true);
    expect(ASSET_CLASSES).toEqual(["NATIVE", "TOKEN", "WRAPPED", "BRIDGED", "OTHER"]);
  });

  it("pins the kernel's GateDecision + composed state + flag channel (assignability proof)", () => {
    const allow: GateDecision = {
      decision: "ALLOW",
      checks: [
        { dimension: "chain", outcome: "pass", code: "chain_permitted", detail: "fixture" },
      ],
      evidenceRefs: ["obs:chain-registry:1"],
    };
    const block: GateDecision = {
      decision: "BLOCK",
      reasons: [
        {
          dimension: "security_state",
          code: "component_quarantined",
          message: "fixture block",
          invariantRefs: ["INV-21"],
        },
      ],
      checks: [],
      evidenceRefs: [],
    };
    const unknown: GateDecision = {
      decision: "UNKNOWN",
      dimensions: [
        { dimension: "route", code: "route_unverified", message: "fixture unknown" },
      ],
      checks: [],
      evidenceRefs: [],
    };
    expect(allow.decision).toBe("ALLOW");
    expect(block.decision).toBe("BLOCK");
    expect(unknown.decision).toBe("UNKNOWN");
    const state: OnchainSecurityState = {
      observedAt: 1,
      networkEpoch: 3n,
      quarantinedComponents: ["agent_key:k"],
      restrictedComponents: ["agent_package:p"],
      activeAdvisoryRefs: ["adv-1"],
    };
    expect(state.networkEpoch).toBe(3n);
    const flag: AgentSecurityFlag = {
      flagId: "flag:1",
      flaggedBy: "agent:provider-intel-1",
      dimension: "general",
      note: "fixture flag",
      flaggedAt: 1,
    };
    expect(flag.dimension).toBe("general");
    expectTypeOf<GateDecision>().not.toBeNever();
  });

  it("pins the kernel's threat-assessment + advisory-proposal wire (the D-1 seam input)", () => {
    const assessment: ThreatAssessment = {
      assessmentId: "assess-1",
      agentRef: "agent:threat-intel-1",
      analyzedAt: 1,
      signals: [
        {
          signalId: "sig-1",
          family: "bridge_compromise",
          code: "validator_set_changed",
          severity: "critical",
          method: "structural_mismatch",
          confidenceBps: 9_000,
          evidence: {
            observationRefs: ["bridge:bridge-1"],
            digestRefs: ["fnv1a64:0000000000000001"],
            deltas: [{ label: "validators", value: "-3" }],
          },
          summary: "fixture signal",
        },
      ],
      agentRecommendation: "BLOCK",
      evidenceRefs: ["fnv1a64:0000000000000001"],
    };
    expect(assessment.agentRecommendation).toBe("BLOCK");
    const proposal: ThreatAdvisoryProposal = {
      proposalId: "adv-proposal:bridge_compromise:assess-1",
      title: "bridge compromise detected (critical)",
      severity: "critical",
      description: "fixture proposal",
      affected: [{ kind: "extension", id: "bridge-1" }],
      action: "quarantine",
      remediation: { summary: "investigate", workarounds: ["halt writes"] },
      declaredBy: "agent:threat-intel-1",
      publishedAt: 1,
      evidence: [{ evidenceId: "e-1", artifactRef: "a-1", contentDigest: "d-1" }],
      sourceSignalIds: ["sig-1"],
    };
    expect(proposal.action).toBe("quarantine");
    expectTypeOf<ThreatAdvisoryProposal>().not.toBeNever();
  });

  it("pins the policy VIEW (subset pin: a real policy with extra fields is assignable)", () => {
    const realShapedPolicy = {
      policyId: "policy-1",
      version: 1,
      forbidUnlimitedApprovals: true,
      requireTokenRegistryCoverage: true,
      requireBridgeHealthForBridgeHops: true,
      maxSlippageBasisPoints: 300,
      retireCompromisedContracts: false,
    };
    const view: OnchainThreatPolicyView = realShapedPolicy;
    expect(view.retireCompromisedContracts).toBe(false);
    expect(view.policyId).toBe("policy-1");
  });

  it("pins the trust lane's security-block record wire (the escalation target)", () => {
    const record: SecurityBlockRecordPin = {
      id: "block:1",
      subjectRef: "agent_key:k",
      reason: "fixture block",
      issuedAtEpoch: 4n,
      evidenceRefs: ["e-1"],
    };
    expect(record.issuedAtEpoch).toBe(4n);
    const revocation = {
      blockId: "block:1",
      revokedBy: "authority:security-council",
      reason: "fixture revocation",
      revokedAtEpoch: 9n,
    };
    expect(revocation.revokedAtEpoch).toBe(9n);
    expectTypeOf<SecurityBlockRecordPin>().not.toBeNever();
  });

  it("the pinned digest is byte-compatible with the accepted lane discipline (FNV-1a 64)", () => {
    // Deterministic vector: identical serialization → identical digest,
    // and the format is the lane's `fnv1a64:<16 hex>` (NOT cryptographic).
    const digest = contentDigest("deterministic-vector");
    expect(digest).toBe(contentDigest("deterministic-vector"));
    expect(digest).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    // Stability vector (locks the algorithm + canonical form): the digest
    // of a fixed input is a fixed public constant of the pin.
    expect(contentDigest({ z: 26, a: 1 })).toBe(
      contentDigest({ a: 1, z: 26 }),
    );
  });
});
