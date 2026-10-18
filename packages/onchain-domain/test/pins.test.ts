import { describe, expect, it } from "vitest";
import { ValidationError } from "../src/errors.ts";
import {
  PINNED_CAPABILITY_CLASSES,
  PINNED_EXECUTION_MODES,
  PINNED_EXECUTION_MODE_VOCABULARY_VERSION,
  PINNED_FINANCIAL_EFFECT_CLASSES,
} from "../src/pins.ts";
import {
  isPinnedCapabilityClass,
  isPinnedExecutionMode,
  validatePinnedDefinitionBase,
  isConnectedInstancePin,
  validatePinnedConnectedInstance,
  isProviderCatalogueEntryPin,
  validatePinnedExecutionRequest,
  validatePinnedProviderImplementation,
} from "../src/pins-validation.ts";
import {
  PINNED_SMART_CONTRACT_AUTHORITY_KINDS,
  PINNED_SMART_CONTRACT_KIND,
  validateSmartContractExtensionPin,
  assessPinnedSmartContractRisk,
} from "../src/pins-smart-contract.ts";
import {
  PINNED_SETTLEMENT_ATTEMPT_EVENTS,
  PINNED_SETTLEMENT_ATTEMPT_STATES,
  PINNED_SETTLEMENT_IN_FLIGHT_TRANSITIONS,
  PINNED_SETTLEMENT_OUTCOME_UNKNOWN_EXITS,
} from "../src/pins-settlement.ts";
import { assertConnectedChainInstance } from "../src/chain.ts";
import {
  bridgeSmartContract,
  connectedChainInstance,
  baseNonExecutableDefinition,
  baseExecutableDefinition,
} from "./fixtures.ts";

/**
 * NET-NEW (the 3.0 laws): the structural pins are byte-identical to the
 * authority lanes' vocabularies and enforce the pinned subset of their
 * laws. This suite is the cross-lane consistency evidence for the
 * zero-sibling-import reconciliation (value pinning, never value imports).
 */

describe("pinned vocabularies (byte-identical to the authority lanes)", () => {
  it("PINNED_CAPABILITY_CLASSES matches the capability fabric's 13 classes", () => {
    expect([...PINNED_CAPABILITY_CLASSES]).toEqual([
      "rail_movement",
      "liquidity",
      "fx",
      "credit",
      "lending",
      "merchant_acceptance",
      "identity_kyc_aml",
      "expert_resolution",
      "agent_behavior",
      "software_extension",
      "developer_service",
      "verification",
      "data_oracle",
    ]);
    expect(isPinnedCapabilityClass("rail_movement")).toBe(true);
    expect(isPinnedCapabilityClass("rail-movement")).toBe(false);
  });

  it("PINNED_EXECUTION_MODES is the fabric's 3-mode vocabulary with the provider-native baseline first (INV-15)", () => {
    expect([...PINNED_EXECUTION_MODES]).toEqual([
      "PASS_THROUGH_NATIVE",
      "COMPOSED_PAYSWAP",
      "OPTIMIZED_MULTI_PROVIDER",
    ]);
    expect(PINNED_EXECUTION_MODE_VOCABULARY_VERSION).toBe("1.0.0");
    expect(isPinnedExecutionMode("PASS_THROUGH_NATIVE")).toBe(true);
    expect(isPinnedExecutionMode("PASS_THROUGH")).toBe(false);
  });

  it("PINNED_FINANCIAL_EFFECT_CLASSES is the fabric's 4-class vocabulary", () => {
    expect([...PINNED_FINANCIAL_EFFECT_CLASSES]).toEqual([
      "NO_EFFECT",
      "OBSERVATION_ONLY",
      "PENDING_EXTERNAL_COMMAND",
      "CONSEQUENTIAL_EXTERNAL_EFFECT",
    ]);
  });

  it("PINNED_SMART_CONTRACT_AUTHORITY_KINDS is the fabric's 5-kind vocabulary", () => {
    expect([...PINNED_SMART_CONTRACT_AUTHORITY_KINDS]).toEqual([
      "IMMUTABLE",
      "PROVIDER_GOVERNED",
      "MULTISIG",
      "UPGRADEABLE",
      "DAO",
    ]);
    expect(PINNED_SMART_CONTRACT_KIND).toBe("smart_contract_extension");
  });

  it("the settlement machinery pins are byte-identical to the protocol lane's state machine vocabulary", () => {
    expect([...PINNED_SETTLEMENT_ATTEMPT_STATES]).toEqual([
      "PENDING",
      "IN_FLIGHT",
      "OUTCOME_UNKNOWN",
      "SUCCEEDED",
      "FAILED",
    ]);
    expect([...PINNED_SETTLEMENT_ATTEMPT_EVENTS]).toEqual([
      "START",
      "CONFIRM_SUCCEEDED",
      "CONFIRM_FAILED",
      "OUTCOME_UNKNOWN",
      "RECONCILE_RESOLVED_SUCCEEDED",
      "RECONCILE_RESOLVED_FAILED",
    ]);
    expect(PINNED_SETTLEMENT_IN_FLIGHT_TRANSITIONS.CONFIRM_SUCCEEDED).toBe("SUCCEEDED");
    expect(PINNED_SETTLEMENT_IN_FLIGHT_TRANSITIONS.CONFIRM_FAILED).toBe("FAILED");
    expect(PINNED_SETTLEMENT_IN_FLIGHT_TRANSITIONS.OUTCOME_UNKNOWN).toBe("OUTCOME_UNKNOWN");
    expect([...PINNED_SETTLEMENT_OUTCOME_UNKNOWN_EXITS]).toEqual([
      "RECONCILE_RESOLVED_SUCCEEDED",
      "RECONCILE_RESOLVED_FAILED",
    ]);
    // The pinned IN_FLIGHT table is FROZEN (deterministic data).
    expect(Object.isFrozen(PINNED_SETTLEMENT_IN_FLIGHT_TRANSITIONS)).toBe(true);
    expect(Object.isFrozen(PINNED_SETTLEMENT_OUTCOME_UNKNOWN_EXITS)).toBe(true);
  });
});

describe("the pinned catalogue base (the executable/non-executable discriminator law)", () => {
  it("validates a canonical non-executable base", () => {
    const base = validatePinnedDefinitionBase(baseNonExecutableDefinition("chain.test:1"));
    expect(base.executable).toBe(false);
    if (base.executable === false) {
      expect(base.nonExecutableReason).toBeDefined();
    }
  });

  it("validates a canonical executable base (execution declaration present, opaque)", () => {
    const base = validatePinnedDefinitionBase(baseExecutableDefinition("cap.test:1"));
    expect(base.executable).toBe(true);
    if (base.executable === true) {
      expect(typeof base.execution).toBe("object");
    }
  });

  it("rejects a base without the discriminator (silent executable absence)", () => {
    const { executable, nonExecutableReason, ...rest } = baseNonExecutableDefinition("chain.test:2");
    void executable;
    void nonExecutableReason;
    expect(() => validatePinnedDefinitionBase(rest)).toThrow(/executable must be true or false/);
  });

  it("rejects a non-executable base without an explicit reason", () => {
    const { nonExecutableReason, ...rest } = baseNonExecutableDefinition("chain.test:3");
    void nonExecutableReason;
    expect(() => validatePinnedDefinitionBase(rest)).toThrow(/nonExecutableReason/);
  });

  it("rejects a base without provenance (an anonymous catalogue claim is rejected)", () => {
    const { provenance, ...rest } = baseNonExecutableDefinition("chain.test:4");
    void provenance;
    expect(() => validatePinnedDefinitionBase(rest)).toThrow(/provenance/);
  });

  it("rejects an unknown capability class (the pinned vocabulary, never guessed)", () => {
    expect(() =>
      validatePinnedDefinitionBase({
        ...baseNonExecutableDefinition("chain.test:5"),
        capabilityClass: "blockchain",
      }),
    ).toThrow(/capabilityClass/);
  });
});

describe("the pinned connected instance (the INV-13 authorization scope)", () => {
  it("validates a canonical instance and the guard accepts it", () => {
    const instance = validatePinnedConnectedInstance(connectedChainInstance());
    expect(instance.instanceId).toBe("instance:ethereum:mainnet:001");
    expect(isConnectedInstancePin(connectedChainInstance())).toBe(true);
  });

  it("rejects an instance without the account/tenant scope", () => {
    const { accountRef, ...rest } = connectedChainInstance();
    void accountRef;
    expect(() => validatePinnedConnectedInstance(rest)).toThrow(/accountRef/);
  });

  it("rejects an instance with an unknown authorization status", () => {
    expect(() =>
      validatePinnedConnectedInstance({
        ...connectedChainInstance(),
        authorization: { status: "SUPER_ACTIVE" },
      }),
    ).toThrow(/authorization.status/);
  });

  it("rejects an instance with an empty currency scope", () => {
    expect(() =>
      validatePinnedConnectedInstance({ ...connectedChainInstance(), currencies: [] }),
    ).toThrow(/currencies/);
  });

  it("rejects an instance with a malformed credential scope (opaque reference only — INV-19)", () => {
    expect(() =>
      validatePinnedConnectedInstance({
        ...connectedChainInstance(),
        credentialScope: { credentialRef: "cred:001", credentialKind: "ROOT_PRIVATE_KEY" },
      }),
    ).toThrow(/credentialKind/);
    expect(() =>
      validatePinnedConnectedInstance({
        ...connectedChainInstance(),
        credentialScope: { credentialRef: "", credentialKind: "API_KEY" },
      }),
    ).toThrow(/credentialRef/);
  });

  it("the provider catalogue entry pin is an advertisement, never authority (INV-13)", () => {
    const catalogueEntry = {
      catalogueEntryId: "cat:001",
      providerName: "chain-observer",
      providerVersion: "1.0.0",
      capabilityId: "chain.ethereum:mainnet",
      summary: "advertised capability",
      advertisedScope: {
        platformWide: true as const,
        advertisedGeographies: ["US"],
        advertisedCurrencies: ["USD"],
      },
    };
    expect(isProviderCatalogueEntryPin(catalogueEntry)).toBe(true);
    expect(isProviderCatalogueEntryPin(connectedChainInstance())).toBe(false);
    expect(isProviderCatalogueEntryPin({})).toBe(false);
    // And the execution-scope assertion rejects it with the typed error.
    expect(() => assertConnectedChainInstance(catalogueEntry)).toThrow(
      /advertisement and can never authorize execution/,
    );
  });
});

describe("the pinned execution request (the explicit-mode + authorization-link law)", () => {
  function canonicalRequest() {
    return {
      executionMode: "PASS_THROUGH_NATIVE" as const,
      modeVocabularyVersion: "1.0.0" as const,
      capabilityInstanceId: "instance:ethereum:mainnet:001",
      providerRequest: { opaque: true },
      idempotencyKey: "idem:001",
      protocolAuthorization: {
        commandId: "cmd:001",
        principal: { principalType: "user", principalId: "user:001" },
        authorizationEvidenceRef: "authz-evidence:001",
      },
    };
  }

  it("accepts a canonical request (PASS_THROUGH_NATIVE is a legal baseline — INV-15)", () => {
    const result = validatePinnedExecutionRequest(canonicalRequest());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mode).toBe("PASS_THROUGH_NATIVE");
    }
  });

  it("rejects a request without an explicit mode (the mode is never inferred)", () => {
    const { executionMode, ...rest } = canonicalRequest();
    void executionMode;
    const result = validatePinnedExecutionRequest(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations.some((v) => v.includes("executionMode is REQUIRED"))).toBe(true);
    }
  });

  it("rejects a request with a stale mode vocabulary version", () => {
    const result = validatePinnedExecutionRequest({
      ...canonicalRequest(),
      modeVocabularyVersion: "0.9.0",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations.some((v) => v.includes("modeVocabularyVersion"))).toBe(true);
    }
  });

  it("rejects a request without the connected-instance reference, the idempotency key or the protocol authorization", () => {
    const { capabilityInstanceId, ...noInstance } = canonicalRequest();
    void capabilityInstanceId;
    expect(validatePinnedExecutionRequest(noInstance).ok).toBe(false);

    const { idempotencyKey, ...noKey } = canonicalRequest();
    void idempotencyKey;
    const noKeyResult = validatePinnedExecutionRequest(noKey);
    expect(noKeyResult.ok).toBe(false);
    if (!noKeyResult.ok) {
      expect(noKeyResult.violations.some((v) => v.includes("idempotencyKey is required"))).toBe(true);
    }

    const { protocolAuthorization, ...noAuth } = canonicalRequest();
    void protocolAuthorization;
    const noAuthResult = validatePinnedExecutionRequest(noAuth);
    expect(noAuthResult.ok).toBe(false);
    if (!noAuthResult.ok) {
      expect(
        noAuthResult.violations.some((v) =>
          v.includes("no execution mode (including PASS_THROUGH_NATIVE) can bypass protocol authorization"),
        ),
      ).toBe(true);
    }
  });

  it("requires the full protocol authorization shape (principal + evidence lineage)", () => {
    // A non-string principal member fails the authorization-link check
    // (the pinned validator mirrors the authority lane's shape law).
    const result = validatePinnedExecutionRequest({
      ...canonicalRequest(),
      protocolAuthorization: {
        commandId: "cmd:001",
        principal: { principalType: "user", principalId: 42 as never },
        authorizationEvidenceRef: "authz-evidence:001",
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations.some((v) => v.includes("protocolAuthorization is required"))).toBe(
        true,
      );
    }
    // A missing evidence reference fails too (INV-5 evidence lineage).
    const noEvidence = validatePinnedExecutionRequest({
      ...canonicalRequest(),
      protocolAuthorization: {
        commandId: "cmd:001",
        principal: { principalType: "user", principalId: "user:001" },
        authorizationEvidenceRef: "",
      },
    });
    expect(noEvidence.ok).toBe(false);
  });
});

describe("the pinned provider implementation subset (the exact version-pin law)", () => {
  it("validates a canonical implementation subset", () => {
    const implementation = validatePinnedProviderImplementation({
      implementationId: "impl:chain:001",
      providerName: "chain-observer",
      providerVersion: "1.0.0",
      capabilityId: "chain.ethereum:mainnet",
      capabilityVersion: "1.0.0",
      version: "1.0.0",
      adapterRef: "adapter:json-rpc",
    });
    expect(implementation.capabilityVersion).toBe("1.0.0");
  });

  it("rejects a subset missing the exact capability-version pin", () => {
    const { capabilityVersion, ...rest } = {
      implementationId: "impl:chain:001",
      providerName: "chain-observer",
      providerVersion: "1.0.0",
      capabilityId: "chain.ethereum:mainnet",
      capabilityVersion: "1.0.0",
      version: "1.0.0",
      adapterRef: "adapter:json-rpc",
    };
    void capabilityVersion;
    expect(() => validatePinnedProviderImplementation(rest)).toThrow(/capabilityVersion/);
  });
});
