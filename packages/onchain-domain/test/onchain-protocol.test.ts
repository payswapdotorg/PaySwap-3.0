import { describe, expect, it } from "vitest";
import { ValidationError } from "../src/errors.ts";
import {
  canonicalProtocolRef,
  protocolCapabilityId,
  validateProtocolDefinition,
  validateProtocolDescriptor,
  validateProtocolImplementation,
  validateConnectedProtocolInstance,
  PROTOCOL_CLASSES,
} from "../src/onchain-protocol.ts";
import {
  validateSmartContractExtensionPin,
  assessPinnedSmartContractRisk,
} from "../src/pins-smart-contract.ts";
import { protocolDefinition, ETHEREUM_CHAIN_KEY, connectedChainInstance, baseExecutableDefinition } from "./fixtures.ts";

describe("protocol definitions (compose the pinned smart-contract declaration — never duplicate)", () => {
  it("validates a canonical protocol definition", () => {
    const definition = validateProtocolDefinition(protocolDefinition());
    expect(definition.protocol.protocolKey).toBe("bridge-example");
    expect(definition.protocol.protocolClass).toBe("BRIDGE");
    expect(definition.executable).toBe(true);
  });

  it("REUSES the pinned smart-contract declaration vocabulary: the declaration validates through the structural pin", () => {
    const definition = validateProtocolDefinition(protocolDefinition());
    const contract = definition.protocol.smartContracts[0]!;
    // The pinned declaration validator accepts the reused declaration.
    expect(() => validateSmartContractExtensionPin(contract)).not.toThrow();
    // And the mirrored deterministic risk assessment runs on it (the
    // declaration-completeness + custody-declaration law).
    const risk = assessPinnedSmartContractRisk(contract);
    expect(risk.custodyRisk).toBe("CUSTODIAL");
    expect(risk.pauseRisk).toBe("PRESENT");
    expect(risk.governanceRisk).toBe("LOW");
  });

  it("enforces the deterministic protocol identity", () => {
    const expected = protocolCapabilityId("bridge-example", ETHEREUM_CHAIN_KEY);
    expect(expected).toBe("protocol.ethereum:mainnet:bridge-example");
    expect(canonicalProtocolRef("bridge-example", ETHEREUM_CHAIN_KEY)).toBe(
      "ethereum:mainnet/protocol:bridge-example",
    );
    const tampered = { ...protocolDefinition(), id: "protocol.nowhere:x" };
    expect(() => validateProtocolDefinition(tampered)).toThrow(/deterministic/);
  });

  it("requires at least one smart-contract declaration (declarations are never empty)", () => {
    const empty = {
      ...protocolDefinition(),
      protocol: { ...protocolDefinition().protocol, smartContracts: [] },
    };
    expect(() => validateProtocolDefinition(empty)).toThrow(/at least one smart contract/);
  });

  it("rejects a contract whose declared chain does not match the protocol's chain", () => {
    const offChain = {
      ...protocolDefinition(),
      protocol: {
        ...protocolDefinition().protocol,
        smartContracts: [
          {
            ...protocolDefinition().protocol.smartContracts[0]!,
            chainRef: "solana:mainnet-beta",
          },
        ],
      },
    };
    expect(() => validateProtocolDefinition(offChain)).toThrow(/does not match the protocol chain/);
  });

  it("rejects an incomplete smart-contract declaration (undeclared property — the completeness law)", () => {
    const undeclared = {
      ...protocolDefinition(),
      protocol: {
        ...protocolDefinition().protocol,
        smartContracts: [
          { ...protocolDefinition().protocol.smartContracts[0]!, custody: undefined },
        ],
      },
    };
    expect(() => validateProtocolDefinition(undeclared)).toThrow(/custody must be declared/);
  });

  it("rejects an unknown protocol class and malformed protocol keys", () => {
    expect(() =>
      validateProtocolDescriptor({
        ...protocolDefinition().protocol,
        protocolClass: "MONEY_PRINTER",
      }),
    ).toThrow(/protocolClass/);
    expect(() =>
      validateProtocolDescriptor({ ...protocolDefinition().protocol, protocolKey: "Not Canonical!" }),
    ).toThrow(/protocolKey/);
  });

  it("protocol class vocabulary covers the onchain protocol families", () => {
    for (const cls of ["DEX", "BRIDGE", "INTENT_NETWORK", "LENDING", "ESCROW"] as const) {
      expect(PROTOCOL_CLASSES).toContain(cls);
    }
  });
});

describe("protocol implementations and connected instances", () => {
  it("validates a canonical protocol implementation", () => {
    const implementation = validateProtocolImplementation({
      implementationId: "impl:protocol:001",
      providerName: "protocol-connector",
      providerVersion: "1.0.0",
      capabilityId: protocolCapabilityId("bridge-example", ETHEREUM_CHAIN_KEY),
      capabilityVersion: "1.0.0",
      version: "1.0.0",
      adapterRef: "adapter:protocol",
      protocolKey: "bridge-example",
      chainKey: ETHEREUM_CHAIN_KEY,
    });
    expect(implementation.protocolKey).toBe("bridge-example");
  });

  it("validates a canonical connected protocol instance with the deterministic linkage", () => {
    const instance = validateConnectedProtocolInstance({
      ...connectedChainInstance(),
      capabilityId: protocolCapabilityId("bridge-example", ETHEREUM_CHAIN_KEY),
      protocolKey: "bridge-example",
      chainKey: ETHEREUM_CHAIN_KEY,
    });
    expect(instance.protocolKey).toBe("bridge-example");
  });

  it("rejects a connected protocol instance without the deterministic capability linkage", () => {
    expect(() =>
      validateConnectedProtocolInstance({
        ...connectedChainInstance(),
        protocolKey: "bridge-example",
        chainKey: ETHEREUM_CHAIN_KEY,
      }),
    ).toThrow(/deterministic protocol capability id/);
  });

  it("a protocol DEFINITION is not an instance: it carries no authorization scope", () => {
    const definition = protocolDefinition();
    const record = definition as unknown as Record<string, unknown>;
    expect(record.instanceId).toBeUndefined();
    expect(record.accountRef).toBeUndefined();
    expect(record.tenantRef).toBeUndefined();
    expect(record.authorization).toBeUndefined();
    expect(record.credentialScope).toBeUndefined();
    expect(record.permissionState).toBeUndefined();
    // The definition IS an executable catalogue declaration (its capabilities
    // execute consequential writes) — but an executable DECLARATION is not an
    // authorization scope: the catalogue never authorizes (INV-13).
    expect(definition.executable).toBe(true);
    expect(typeof definition.execution).toBe("object");
  });

  it("the executable catalogue base validates through the pinned base (reconciliation with the fabric)", () => {
    const base = baseExecutableDefinition(
      protocolCapabilityId("bridge-example", ETHEREUM_CHAIN_KEY),
    );
    const definition = validateProtocolDefinition({
      ...base,
      protocol: protocolDefinition().protocol,
    });
    expect(definition.id).toBe("protocol.ethereum:mainnet:bridge-example");
    expect(() => validateProtocolDefinition(definition)).not.toThrow();
  });

  it("a protocol implementation missing the exact capability-version pin is rejected", () => {
    expect(() =>
      validateProtocolImplementation({
        implementationId: "impl:protocol:001",
        providerName: "protocol-connector",
        providerVersion: "1.0.0",
        capabilityId: protocolCapabilityId("bridge-example", ETHEREUM_CHAIN_KEY),
        version: "1.0.0",
        adapterRef: "adapter:protocol",
        protocolKey: "bridge-example",
        chainKey: ETHEREUM_CHAIN_KEY,
      }),
    ).toThrow(ValidationError);
  });
});
