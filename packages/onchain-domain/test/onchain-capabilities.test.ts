import { describe, expect, it } from "vitest";
import { ValidationError } from "../src/errors.ts";
import {
  validateOnchainCapabilityDefinition,
} from "../src/onchain-capability-validation.ts";
import { ONCHAIN_CAPABILITY_KINDS } from "../src/onchain-capabilities.ts";
import type { OnchainCapability } from "../src/onchain-capabilities.ts";
import { validatePinnedDefinitionBase } from "../src/pins-validation.ts";
import { ONCHAIN_OPERATION_KINDS, onchainOperationSemantics, ONCHAIN_OPERATION_SEMANTICS } from "../src/operations.ts";
import { baseExecutableDefinition, ETHEREUM_CHAIN_KEY } from "./fixtures.ts";

describe("onchain operation semantics (deterministic authority table)", () => {
  it("every declared operation has exactly one deterministic semantics entry", () => {
    for (const operation of ONCHAIN_OPERATION_KINDS) {
      const semantics = onchainOperationSemantics(operation);
      expect(semantics.operation).toBe(operation);
      expect(semantics.consequentialWrite).toBe(true);
      expect(ONCHAIN_OPERATION_SEMANTICS[operation]).toBeDefined();
    }
  });

  it("unknown operations fail closed (no default semantics)", () => {
    expect(() => onchainOperationSemantics("onchain.magic" as never)).toThrow(
      /no declared semantics/,
    );
  });

  it("the generic contract interaction's financial effect is DECLARED BY THE CERTIFIED METHOD — never defaulted (INV-20)", () => {
    expect(onchainOperationSemantics("onchain.contract_call").financialEffect).toBe(
      "DECLARED_BY_CERTIFIED_METHOD",
    );
    expect(onchainOperationSemantics("onchain.transfer").financialEffect).toBe(
      "CONSEQUENTIAL_EXTERNAL_EFFECT",
    );
    expect(onchainOperationSemantics("onchain.approval").financialEffect).toBe("NO_EFFECT");
  });

  it("the financial-effect vocabulary is RECONCILED to the capability fabric's pinned classes", () => {
    // The old per-side-effect vocabulary (MOVES_VALUE etc.) does not
    // transfer; every declared effect is a pinned fabric class or the
    // certified-method marker.
    for (const operation of ONCHAIN_OPERATION_KINDS) {
      const effect = onchainOperationSemantics(operation).financialEffect;
      expect([
        "NO_EFFECT",
        "OBSERVATION_ONLY",
        "PENDING_EXTERNAL_COMMAND",
        "CONSEQUENTIAL_EXTERNAL_EFFECT",
        "DECLARED_BY_CERTIFIED_METHOD",
      ]).toContain(effect);
    }
  });

  it("required-field coupling is deterministic per operation", () => {
    expect(onchainOperationSemantics("onchain.transfer").requires).toEqual({
      destination: true,
      spender: false,
      asset: true,
      amount: true,
      protocol: false,
    });
    expect(onchainOperationSemantics("onchain.approval").requires.spender).toBe(true);
    expect(onchainOperationSemantics("onchain.contract_call").requires.protocol).toBe(true);
    expect(onchainOperationSemantics("onchain.bridge").requires.destination).toBe(true);
    expect(onchainOperationSemantics("onchain.swap").requires.protocol).toBe(true);
  });
});

describe("onchain capability flavor discrimination (deterministic dispatch)", () => {
  it("validates each canonical flavor through the SAME pinned base validator", () => {
    const flavors: readonly OnchainCapability[] = [
      {
        ...baseExecutableDefinition("cap.onchain.wallet.001"),
        onchain: {
          capabilityKind: "wallet",
          custodyModel: "NON_CUSTODIAL_EXTERNAL",
          supportedFamilies: ["EVM", "SOLANA", "UTXO"],
          supportedOperations: ["onchain.transfer"],
        },
      },
      {
        ...baseExecutableDefinition("cap.onchain.signer.001"),
        onchain: {
          capabilityKind: "signer",
          custodyModel: "HARDWARE",
          signableOperations: ["onchain.transfer", "onchain.approval"],
          requiresUserPresence: true,
          supportsSessionKeys: false,
        },
      },
      {
        ...baseExecutableDefinition("cap.onchain.account.001"),
        onchain: {
          capabilityKind: "smart_account",
          permissionEnvelopeRequired: true,
          supportsSessionKeys: true,
          supportsSpendingPolicies: true,
          supportsBatchExecution: true,
          supportsGasSponsorship: true,
          recoveryModel: "declared: quorum",
        },
      },
      {
        ...baseExecutableDefinition("cap.onchain.execute.001"),
        onchain: {
          capabilityKind: "onchain_execution",
          supportedOperations: ["onchain.transfer"],
          supportedFamilies: ["EVM", "SOLANA", "UTXO"],
          supportsSimulation: true,
          preBroadcastRecheckRequired: true,
        },
      },
      {
        ...baseExecutableDefinition("cap.onchain.contract.001"),
        onchain: {
          capabilityKind: "contract_interaction",
          controlledEscapeHatch: true,
          certificationRequired: true,
          certifiedMethodIds: ["method:certified:001"],
          unknownWritePolicy: "REQUIRE_ESCALATION",
        },
      },
      {
        ...baseExecutableDefinition("cap.onchain.dex.001"),
        onchain: {
          capabilityKind: "dex",
          supportedSwapKinds: ["EXACT_INPUT", "EXACT_OUTPUT"],
          supportedChains: [ETHEREUM_CHAIN_KEY],
          quoteSemantics: "EXECUTABLE",
          slippageProtection: "DECLARED_LIMIT",
        },
      },
      {
        ...baseExecutableDefinition("cap.onchain.bridge.001"),
        onchain: {
          capabilityKind: "bridge",
          sourceChains: [ETHEREUM_CHAIN_KEY],
          destinationChains: ["solana:mainnet-beta"],
          custodialTransit: false,
          destinationFinality: "OBSERVED",
        },
      },
      {
        ...baseExecutableDefinition("cap.onchain.intent.001"),
        onchain: {
          capabilityKind: "intent",
          supportedDomains: [ETHEREUM_CHAIN_KEY],
          settlementModel: "FULFILLER_SETTLED",
          solverCompetition: "OPEN",
        },
      },
    ];
    for (const flavor of flavors) {
      const validated = validateOnchainCapabilityDefinition(flavor);
      // The pinned base surface is validated too (the same object passes
      // the pinned base validator untouched — reconciliation with the
      // capability fabric's hierarchy).
      expect(() => validatePinnedDefinitionBase(validated)).not.toThrow();
      expect(validated.onchain.capabilityKind).toBeDefined();
    }
    expect(flavors).toHaveLength(8);
    expect(ONCHAIN_CAPABILITY_KINDS).toHaveLength(8);
  });

  it("an unknown flavor discriminant fails closed", () => {
    expect(() =>
      validateOnchainCapabilityDefinition({
        ...baseExecutableDefinition("cap.onchain.unknown.001"),
        onchain: { capabilityKind: "teleport" },
      }),
    ).toThrow(/flavor discrimination fails closed/);
  });

  it("a missing flavor declaration fails closed", () => {
    expect(() =>
      validateOnchainCapabilityDefinition(baseExecutableDefinition("cap.onchain.none.001")),
    ).toThrow(/must declare its 'onchain' flavor declaration/);
  });

  it("a NON-executable base fails closed (flavors are executable capabilities)", () => {
    const nonExecutable = {
      ...baseExecutableDefinition("cap.onchain.read-only.001"),
      executable: false as const,
      nonExecutableReason: "not an onchain capability flavor",
    };
    expect(() => validateOnchainCapabilityDefinition(nonExecutable)).toThrow(
      /must declare executable true/,
    );
  });
});

describe("GenericContractInteractionCapability — the CONTROLLED escape hatch (INV-20)", () => {
  it("unknown generic contract writes never execute silently: there is no allow-silent policy", () => {
    expect(() =>
      validateOnchainCapabilityDefinition({
        ...baseExecutableDefinition("cap.onchain.contract.002"),
        onchain: {
          capabilityKind: "contract_interaction",
          controlledEscapeHatch: true,
          certificationRequired: true,
          certifiedMethodIds: ["method:certified:001"],
          unknownWritePolicy: "ALLOW_SILENT",
        },
      }),
    ).toThrow(/unknownWritePolicy/);
  });

  it("the escape hatch and certification literals cannot be weakened", () => {
    expect(() =>
      validateOnchainCapabilityDefinition({
        ...baseExecutableDefinition("cap.onchain.contract.003"),
        onchain: {
          capabilityKind: "contract_interaction",
          controlledEscapeHatch: false,
          certificationRequired: true,
          certifiedMethodIds: ["method:certified:001"],
          unknownWritePolicy: "BLOCK",
        },
      }),
    ).toThrow(/controlledEscapeHatch must be true/);
    expect(() =>
      validateOnchainCapabilityDefinition({
        ...baseExecutableDefinition("cap.onchain.contract.004"),
        onchain: {
          capabilityKind: "contract_interaction",
          controlledEscapeHatch: true,
          certificationRequired: false,
          certifiedMethodIds: ["method:certified:001"],
          unknownWritePolicy: "BLOCK",
        },
      }),
    ).toThrow(/certificationRequired must be true/);
  });

  it("an empty certified method allowlist executes nothing and is rejected", () => {
    expect(() =>
      validateOnchainCapabilityDefinition({
        ...baseExecutableDefinition("cap.onchain.contract.005"),
        onchain: {
          capabilityKind: "contract_interaction",
          controlledEscapeHatch: true,
          certificationRequired: true,
          certifiedMethodIds: [],
          unknownWritePolicy: "BLOCK",
        },
      }),
    ).toThrow(/certifiedMethodIds/);
  });
});

describe("onchain execution capability declaration (INV-18 literals)", () => {
  it("preBroadcastRecheckRequired cannot be weakened", () => {
    expect(() =>
      validateOnchainCapabilityDefinition({
        ...baseExecutableDefinition("cap.onchain.execute.002"),
        onchain: {
          capabilityKind: "onchain_execution",
          supportedOperations: ["onchain.transfer"],
          supportedFamilies: ["EVM"],
          supportsSimulation: true,
          preBroadcastRecheckRequired: false,
        },
      }),
    ).toThrow(/preBroadcastRecheckRequired must be true/);
  });

  it("DEX flavor rejects malformed declarations", () => {
    expect(() =>
      validateOnchainCapabilityDefinition({
        ...baseExecutableDefinition("cap.onchain.dex.002"),
        onchain: {
          capabilityKind: "dex",
          supportedSwapKinds: ["EXACT_WHATEVER"],
          supportedChains: [ETHEREUM_CHAIN_KEY],
          quoteSemantics: "INDICATIVE",
          slippageProtection: "DECLARED_LIMIT",
        },
      }),
    ).toThrow(ValidationError);
  });

  it("bridge flavor requires canonical chain keys on both sides", () => {
    expect(() =>
      validateOnchainCapabilityDefinition({
        ...baseExecutableDefinition("cap.onchain.bridge.002"),
        onchain: {
          capabilityKind: "bridge",
          sourceChains: ["not a chain key"],
          destinationChains: [ETHEREUM_CHAIN_KEY],
          custodialTransit: false,
          destinationFinality: "OBSERVED",
        },
      }),
    ).toThrow(/sourceChains/);
  });
});
