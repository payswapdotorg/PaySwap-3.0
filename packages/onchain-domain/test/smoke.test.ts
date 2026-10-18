import { describe, expect, it } from "vitest";
import * as onchainDomain from "../src/index.ts";

/** Smoke: the canonical package export surface exists and is importable. */
describe("smoke (@payswap/onchain-domain)", () => {
  it("exports the canonical onchain domain vocabulary", () => {
    expect(onchainDomain.PACKAGE_NAME).toBe("@payswap/onchain-domain");
    // Versioning + provenance policy.
    expect(onchainDomain.ONCHAIN_DOMAIN_VERSION).toBe("1.0.0");
    expect(onchainDomain.ONCHAIN_DOMAIN_PROVENANCE.workOrder).toBe("P4-W1");
    // Chain vocabulary.
    expect(typeof onchainDomain.chainCapabilityId).toBe("function");
    expect(typeof onchainDomain.validateChainDefinition).toBe("function");
    expect(typeof onchainDomain.validateConnectedChainInstance).toBe("function");
    expect(typeof onchainDomain.assertConnectedChainInstance).toBe("function");
    // Asset vocabulary.
    expect(typeof onchainDomain.canonicalAssetRef).toBe("function");
    expect(typeof onchainDomain.validateAssetDefinition).toBe("function");
    expect(typeof onchainDomain.validateAssetObservation).toBe("function");
    // Operation semantics.
    expect(typeof onchainDomain.onchainOperationSemantics).toBe("function");
    // Wallet/signer vocabulary.
    expect(typeof onchainDomain.validateSignerHandle).toBe("function");
    // Protocol vocabulary.
    expect(typeof onchainDomain.validateProtocolDefinition).toBe("function");
    // Capability flavors.
    expect(typeof onchainDomain.validateOnchainCapabilityDefinition).toBe("function");
    // Execution vocabulary.
    expect(typeof onchainDomain.validateOnchainExecutionRequest).toBe("function");
    expect(typeof onchainDomain.validateOnchainExecutionObservation).toBe("function");
    expect(typeof onchainDomain.assertOnchainExecutionScope).toBe("function");
    // Settlement mapping.
    expect(typeof onchainDomain.onchainRailId).toBe("function");
    expect(typeof onchainDomain.mapObservationToRailOutcome).toBe("function");
    expect(typeof onchainDomain.mapToRailOperation).toBe("function");
    // The pinned wire shapes (zero sibling imports — structural mirrors).
    expect(typeof onchainDomain.validatePinnedConnectedInstance).toBe("function");
    expect(typeof onchainDomain.validatePinnedExecutionRequest).toBe("function");
    expect(typeof onchainDomain.validateSmartContractExtensionPin).toBe("function");
    expect(onchainDomain.PINNED_EXECUTION_MODE_VOCABULARY_VERSION).toBe("1.0.0");
  });

  it("the pinned-anchor vocabularies are present on the public surface", () => {
    const anchors = [
      "PINNED_CAPABILITY_CLASSES",
      "PINNED_EXECUTION_MODES",
      "PINNED_EXECUTION_MODE_VOCABULARY_VERSION",
      "PINNED_FINANCIAL_EFFECT_CLASSES",
      "PINNED_SMART_CONTRACT_AUTHORITY_KINDS",
      "PINNED_SMART_CONTRACT_KIND",
      "PINNED_SETTLEMENT_ATTEMPT_STATES",
      "PINNED_SETTLEMENT_ATTEMPT_EVENTS",
      "PINNED_SETTLEMENT_IN_FLIGHT_TRANSITIONS",
      "PINNED_SETTLEMENT_OUTCOME_UNKNOWN_EXITS",
      "CHAIN_FAMILIES",
      "CHAIN_FAMILY_SEMANTICS",
      "ONCHAIN_OPERATION_KINDS",
      "ONCHAIN_OPERATION_SEMANTICS",
      "ONCHAIN_CAPABILITY_KINDS",
      "WALLET_CUSTODY_MODELS",
      "ONCHAIN_EXECUTION_OUTCOMES",
      "ONCHAIN_FAILURE_CLASSES",
      "ASSET_OBSERVATION_KIND",
    ] as const;
    for (const anchor of anchors) {
      expect((onchainDomain as Record<string, unknown>)[anchor], `missing export: ${anchor}`).toBeDefined();
    }
  });
});
