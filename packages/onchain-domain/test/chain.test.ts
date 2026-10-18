import { describe, expect, it } from "vitest";
import { ValidationError, CatalogueNotAuthorityError, OnchainDomainError } from "../src/errors.ts";
import {
  chainCapabilityId,
  validateChainDefinition,
  validateChainDescriptor,
  validateChainImplementation,
  validateConnectedChainInstance,
  assertConnectedChainInstance,
  isChainCatalogueShape,
} from "../src/chain.ts";
import { chainFamilySemantics, finalityReorgConsistency, CHAIN_FAMILIES } from "../src/family.ts";
import type { ChainFamily } from "../src/family.ts";
import {
  ethereumChainDefinition,
  solanaChainDefinition,
  connectedChainInstance,
  baseNonExecutableDefinition,
  ETHEREUM_CHAIN_KEY,
} from "./fixtures.ts";

describe("chain family vocabulary (deterministic family dispatch)", () => {
  it("every declared family has exactly one deterministic semantics entry", () => {
    for (const family of CHAIN_FAMILIES) {
      const semantics = chainFamilySemantics(family);
      expect(semantics.family).toBe(family);
      expect(semantics.addressModel).toBeDefined();
      expect(semantics.finalityModel).toBeDefined();
      expect(semantics.reorgRisk).toBeDefined();
    }
  });

  it("non-EVM families are first-class: dispatch is total and distinct", () => {
    const evm = chainFamilySemantics("EVM");
    const solana = chainFamilySemantics("SOLANA");
    const utxo = chainFamilySemantics("UTXO");
    const move = chainFamilySemantics("MOVE");
    expect(utxo.addressModel).toBe("UTXO_BASED");
    expect(solana.addressModel).toBe("ACCOUNT_BASED");
    expect(move.addressModel).toBe("OBJECT_BASED");
    expect(evm.addressModel).toBe("ACCOUNT_BASED");
    expect(move.finalityModel).toBe("DETERMINISTIC");
  });

  it("finality/reorg consistency coupling is deterministic", () => {
    expect(finalityReorgConsistency("PROBABILISTIC", "PRESENT")).toBe(true);
    expect(finalityReorgConsistency("PROBABILISTIC", "NONE")).toBe(false);
    expect(finalityReorgConsistency("HYBRID", "PRESENT")).toBe(true);
    expect(finalityReorgConsistency("DETERMINISTIC", "NONE")).toBe(true);
    expect(finalityReorgConsistency("INSTANT", "NONE")).toBe(true);
    expect(finalityReorgConsistency("DETERMINISTIC", "PRESENT")).toBe(false);
  });
});

describe("chain definitions (deterministic identity)", () => {
  it("validates a canonical EVM-family chain definition with its optional family extension", () => {
    const definition = validateChainDefinition(ethereumChainDefinition());
    expect(definition.chain.chainKey).toBe(ETHEREUM_CHAIN_KEY);
    expect(definition.chain.family).toBe("EVM");
    expect(definition.chain.familyExtension?.family).toBe("EVM");
    expect(definition.executable).toBe(false);
  });

  it("validates a non-EVM chain definition WITHOUT any family extension (extensions are never required)", () => {
    const definition = validateChainDefinition(solanaChainDefinition());
    expect(definition.chain.family).toBe("SOLANA");
    expect(definition.chain.familyExtension).toBeUndefined();
  });

  it("enforces the deterministic capability identity rule: id === chain.<chainKey>", () => {
    const tampered = {
      ...ethereumChainDefinition(),
      id: "chain.some:other",
    };
    expect(() => validateChainDefinition(tampered)).toThrow(ValidationError);
    expect(chainCapabilityId("ethereum:mainnet")).toBe("chain.ethereum:mainnet");
  });

  it("rejects a chain catalogue entry declared EXECUTABLE (a chain is an observation surface — the old kind:READ law on the fabric discriminator)", () => {
    const executable = {
      ...ethereumChainDefinition(),
      executable: true as const,
      execution: { declaration: "should not exist on a chain catalogue entry" },
    };
    expect(() => validateChainDefinition(executable)).toThrow(
      /non-executable catalogue entry/,
    );
  });

  it("rejects inconsistent finality semantics (reorg risk never assumed away)", () => {
    const inconsistent = {
      ...ethereumChainDefinition(),
      chain: {
        ...ethereumChainDefinition().chain,
        finality: {
          finalityModel: "PROBABILISTIC" as const,
          reorgRisk: "NONE" as const,
          confirmationGuidance: "n/a",
        },
      },
    };
    expect(() => validateChainDefinition(inconsistent)).toThrow(/inconsistent/);
  });

  it("requires a family label for the OTHER family (never assumed)", () => {
    const unlabeled = {
      ...solanaChainDefinition(),
      chain: {
        ...solanaChainDefinition().chain,
        family: "OTHER" as ChainFamily,
      },
    };
    expect(() => validateChainDefinition(unlabeled)).toThrow(/familyLabel is required/);
  });

  it("rejects a malformed chain key", () => {
    const malformed = {
      ...ethereumChainDefinition(),
      chain: { ...ethereumChainDefinition().chain, chainKey: "Ethereum Mainnet" },
    };
    expect(() => validateChainDefinition(malformed)).toThrow(ValidationError);
  });

  it("rejects a family extension whose discriminant does not match the descriptor family", () => {
    const mismatched = {
      ...solanaChainDefinition(),
      chain: {
        ...solanaChainDefinition().chain,
        familyExtension: {
          family: "EVM" as const,
          evmChainId: "1",
          contractAddressFormat: "HEX_20_BYTE" as const,
          feeModel: "GAS_AUCTION" as const,
        },
      },
    };
    expect(() => validateChainDefinition(mismatched)).toThrow(/does not match the descriptor family/);
  });
});

describe("chain implementations", () => {
  it("validates a canonical chain implementation", () => {
    const implementation = validateChainImplementation({
      implementationId: "impl:chain:001",
      providerName: "chain-observer",
      providerVersion: "1.0.0",
      capabilityId: chainCapabilityId(ETHEREUM_CHAIN_KEY),
      capabilityVersion: "1.0.0",
      version: "1.0.0",
      adapterRef: "adapter:json-rpc",
      chainKey: ETHEREUM_CHAIN_KEY,
    });
    expect(implementation.chainKey).toBe(ETHEREUM_CHAIN_KEY);
  });

  it("rejects a non-canonical chain key", () => {
    expect(() =>
      validateChainImplementation({
        implementationId: "impl:chain:001",
        providerName: "chain-observer",
        providerVersion: "1.0.0",
        capabilityId: chainCapabilityId(ETHEREUM_CHAIN_KEY),
        capabilityVersion: "1.0.0",
        version: "1.0.0",
        adapterRef: "adapter:json-rpc",
        chainKey: "not canonical",
      }),
    ).toThrow(ValidationError);
  });

  it("requires the exact capability-version pin (deterministic catalogue resolution)", () => {
    expect(() =>
      validateChainImplementation({
        implementationId: "impl:chain:001",
        providerName: "chain-observer",
        providerVersion: "1.0.0",
        capabilityId: chainCapabilityId(ETHEREUM_CHAIN_KEY),
        version: "1.0.0",
        adapterRef: "adapter:json-rpc",
        chainKey: ETHEREUM_CHAIN_KEY,
      }),
    ).toThrow(/capabilityVersion/);
  });
});

describe("connected chain instances (the only chain-shaped authorization scope)", () => {
  it("validates a canonical connected chain instance with its optional family extension", () => {
    const instance = validateConnectedChainInstance(connectedChainInstance());
    expect(instance.chainKey).toBe(ETHEREUM_CHAIN_KEY);
    expect(instance.family).toBe("EVM");
    expect(instance.familyExtension?.evmChainId).toBe("1");
    expect(instance.authorization.status).toBe("ACTIVE");
  });

  it("validates a non-EVM connected chain instance without any family extension", () => {
    const { familyExtension, ...rest } = connectedChainInstance("solana:mainnet-beta");
    void familyExtension;
    const solanaInstance = validateConnectedChainInstance({
      ...rest,
      family: "SOLANA" as const,
    });
    expect(solanaInstance.family).toBe("SOLANA");
    expect(solanaInstance.familyExtension).toBeUndefined();
  });

  it("requires the deterministic chain capability id linkage", () => {
    const orphan = {
      ...connectedChainInstance(),
      capabilityId: "cap.something.else",
    };
    expect(() => validateConnectedChainInstance(orphan)).toThrow(/deterministic chain capability id/);
  });
});

describe("catalogue never authorizes (INV-13 discipline)", () => {
  it("a ChainDefinition is discriminated as a catalogue shape", () => {
    expect(isChainCatalogueShape(ethereumChainDefinition())).toBe(true);
    expect(isChainCatalogueShape(solanaChainDefinition())).toBe(true);
    expect(isChainCatalogueShape(connectedChainInstance())).toBe(false);
    expect(isChainCatalogueShape({})).toBe(false);
    expect(isChainCatalogueShape(null)).toBe(false);
  });

  it("assertConnectedChainInstance REJECTS a chain definition with the explicit catalogue error", () => {
    expect(() => assertConnectedChainInstance(ethereumChainDefinition())).toThrow(
      CatalogueNotAuthorityError,
    );
    try {
      assertConnectedChainInstance(ethereumChainDefinition());
    } catch (error) {
      expect(error).toBeInstanceOf(CatalogueNotAuthorityError);
      expect(error).toBeInstanceOf(OnchainDomainError);
      expect((error as CatalogueNotAuthorityError).message).toMatch(
        /can never authorize onchain execution/,
      );
      expect((error as CatalogueNotAuthorityError).code).toBe("CATALOGUE_NOT_AUTHORITY");
    }
  });

  it("assertConnectedChainInstance rejects a bare chain descriptor", () => {
    expect(() =>
      assertConnectedChainInstance(ethereumChainDefinition().chain),
    ).toThrow(CatalogueNotAuthorityError);
  });

  it("assertConnectedChainInstance accepts only a genuinely connected instance", () => {
    expect(() => assertConnectedChainInstance(connectedChainInstance())).not.toThrow();
  });

  it("an asset catalogue entry (descriptive) is never a connected instance", () => {
    const assetCatalogueEntry = {
      assetId: "ethereum:mainnet/asset:ETH",
      symbol: "ETH",
      displayName: "Ether",
      assetClass: "NATIVE",
      minorUnitDigits: 18,
      chainKey: ETHEREUM_CHAIN_KEY,
      provenance: {
        declaredBy: "catalogue-operator",
        artifactRef: "catalogue/assets/eth.json",
        contentHash: "sha256:0000",
      },
    };
    expect(() => assertConnectedChainInstance(assetCatalogueEntry)).toThrow(ValidationError);
  });

  it("a chain catalogue entry cannot be laundered into an instance by adding an instanceId alone", () => {
    const laundered = {
      ...ethereumChainDefinition(),
      instanceId: "instance:fake:001",
    };
    // The catalogue shape no longer trips the chain-catalogue discrimination
    // (instanceId present + chain descriptor), so it falls through to the
    // pinned connected-instance validation, which rejects the missing
    // account/tenant/authorization/credential/permission scope — the
    // catalogue still never authorizes.
    expect(() => assertConnectedChainInstance(laundered)).toThrow(ValidationError);
  });

  it("a provider catalogue entry is rejected by the pinned catalogue-entry discrimination", () => {
    const providerCatalogueEntry = {
      catalogueEntryId: "cat:001",
      providerName: "chain-observer",
      providerVersion: "1.0.0",
      capabilityId: chainCapabilityId(ETHEREUM_CHAIN_KEY),
      summary: "advertised capability",
      advertisedScope: {
        platformWide: true as const,
        advertisedGeographies: ["US"],
        advertisedCurrencies: ["USD"],
      },
    };
    expect(() => assertConnectedChainInstance(providerCatalogueEntry)).toThrow(
      CatalogueNotAuthorityError,
    );
  });

  it("a bare pinned-base definition without the chain descriptor is not an instance either", () => {
    expect(() =>
      assertConnectedChainInstance(baseNonExecutableDefinition("chain.nowhere:1")),
    ).toThrow(ValidationError);
  });
});
