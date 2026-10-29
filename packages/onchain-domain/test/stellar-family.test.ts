import { describe, expect, it } from "vitest";
import {
  CHAIN_FAMILIES,
  CHAIN_FAMILY_SEMANTICS,
  chainFamilySemantics,
  finalityReorgConsistency,
} from "../src/family.ts";
import {
  CHAIN_DESCRIPTOR_EXTENSION_FAMILIES,
  STELLAR_ASSET_CODE_PATTERN,
  STELLAR_STRKEY_ACCOUNT_PATTERN,
  STELLAR_STRKEY_CONTRACT_PATTERN,
  STELLAR_STRKEY_SECRET_PATTERN,
  isStellarStrKeyAccount,
  isStellarStrKeyContract,
  isStellarStrKeySecret,
  validateAssetFamilyExtension,
  validateChainDescriptorFamilyExtension,
} from "../src/family-extensions.ts";
import { validateChainDescriptor } from "../src/chain.ts";
import { chainCapabilityId } from "../src/chain.ts";
import { baseNonExecutableDefinition } from "./fixtures.ts";

/**
 * P22-A (ADR-0016 D2/D3): the STELLAR chain family member — the family
 * vocabulary, the pinned semantics-table entry (account-based; finality per
 * Stellar's closed-ledger consensus-class; reorg risk NONE-class), the
 * StrKey G…/S…/C… address-shape laws and the Stellar family extension
 * (the EVM/SOLANA/UTXO precedent, extended by one member).
 *
 * StrKey fixtures here are SHAPE fixtures (the pinned law is the base32
 * shape ^[GSC][A-Z2-7]{55}$, exactly the ADR-0016 D9 shape law); the one
 * PUBLIC issuer literal is the documented Stellar TESTNET USDC issuer
 * (public testnet metadata, never a secret).
 */

/** PUBLIC: the documented Stellar TESTNET USDC issuer (public testnet metadata). */
export const STELLAR_TESTNET_USDC_ISSUER =
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
/** A deterministic second issuer shape (the collision-law fixture; not a real account). */
export const STELLAR_OTHER_ISSUER = `G${"X".repeat(55)}`;
/** Secret/contract shapes are ASSEMBLED AT RUNTIME from fragments (never realistic literals). */
const strkeySecretFixture = (): string => `S${"A".repeat(55)}`;
/** A deterministic contract-id shape fixture (exported for the deploy battery). */
export const strkeyContractFixture = (): string => `C${"B".repeat(55)}`;

const STELLAR_TESTNET_CHAIN_KEY = "stellar:testnet";

describe("the STELLAR family member (ADR-0016 D2 — the frozen vocabulary grows exactly one member)", () => {
  it("CHAIN_FAMILIES declares STELLAR (byte-identical member)", () => {
    expect(CHAIN_FAMILIES).toContain("STELLAR");
    expect(CHAIN_FAMILIES.filter((family) => family === "STELLAR")).toHaveLength(1);
  });

  it("the semantics table stays TOTAL over every declared family", () => {
    for (const family of CHAIN_FAMILIES) {
      expect(chainFamilySemantics(family).family).toBe(family);
      expect(CHAIN_FAMILY_SEMANTICS[family]).toBeDefined();
    }
  });

  it("the pinned STELLAR semantics: account-based, deterministic closed-ledger finality, reorg risk NONE", () => {
    const semantics = chainFamilySemantics("STELLAR");
    expect(semantics).toEqual({
      family: "STELLAR",
      addressModel: "ACCOUNT_BASED",
      finalityModel: "DETERMINISTIC",
      reorgRisk: "NONE",
    });
  });

  it("the finality/reorg coupling holds for the STELLAR declaration (NONE is consistent with deterministic finality)", () => {
    expect(finalityReorgConsistency("DETERMINISTIC", "NONE")).toBe(true);
    expect(finalityReorgConsistency("DETERMINISTIC", "PRESENT")).toBe(false);
  });

  it("the chain-descriptor extension vocabulary declares STELLAR (the EVM/SOLANA/UTXO precedent extended)", () => {
    expect(CHAIN_DESCRIPTOR_EXTENSION_FAMILIES).toContain("STELLAR");
  });
});

describe("the StrKey address-shape laws (ADR-0016 D2/D9 — G accounts, S secrets, C contracts)", () => {
  it("the three pinned patterns are exactly ^G/^S/^C + 55 base32 characters", () => {
    expect(String(STELLAR_STRKEY_ACCOUNT_PATTERN)).toBe("/^G[A-Z2-7]{55}$/");
    expect(String(STELLAR_STRKEY_SECRET_PATTERN)).toBe("/^S[A-Z2-7]{55}$/");
    expect(String(STELLAR_STRKEY_CONTRACT_PATTERN)).toBe("/^C[A-Z2-7]{55}$/");
  });

  it("canonical G/S/C shapes validate through the guards", () => {
    expect(isStellarStrKeyAccount(STELLAR_TESTNET_USDC_ISSUER)).toBe(true);
    expect(isStellarStrKeyAccount(STELLAR_OTHER_ISSUER)).toBe(true);
    expect(isStellarStrKeySecret(strkeySecretFixture())).toBe(true);
    expect(isStellarStrKeyContract(strkeyContractFixture())).toBe(true);
  });

  it("malformed shapes are rejected: wrong version byte, wrong length, lowercase, non-base32 digits", () => {
    // Wrong version bytes (an account shape is never a secret or contract shape).
    expect(isStellarStrKeyAccount(strkeySecretFixture())).toBe(false);
    expect(isStellarStrKeyAccount(strkeyContractFixture())).toBe(false);
    expect(isStellarStrKeySecret(STELLAR_TESTNET_USDC_ISSUER)).toBe(false);
    // Wrong lengths.
    expect(isStellarStrKeyAccount(`G${"A".repeat(54)}`)).toBe(false);
    expect(isStellarStrKeyAccount(`G${"A".repeat(56)}`)).toBe(false);
    expect(isStellarStrKeyAccount("G")).toBe(false);
    expect(isStellarStrKeyAccount("")).toBe(false);
    // Lowercase and whitespace never validate.
    expect(isStellarStrKeyAccount(`g${"a".repeat(55)}`)).toBe(false);
    expect(isStellarStrKeyAccount(`G ${"A".repeat(54)}`)).toBe(false);
    // 0/1/8/9 are NOT base32 characters.
    expect(isStellarStrKeyAccount(`G${"0".repeat(55)}`)).toBe(false);
    expect(isStellarStrKeyAccount(`G${"1".repeat(55)}`)).toBe(false);
    expect(isStellarStrKeyAccount(`G${"9".repeat(55)}`)).toBe(false);
    expect(isStellarStrKeySecret(`S${"8".repeat(55)}`)).toBe(false);
    expect(isStellarStrKeyContract(`C${"0".repeat(55)}`)).toBe(false);
    // Non-strings never validate.
    expect(isStellarStrKeyAccount(undefined)).toBe(false);
    expect(isStellarStrKeyAccount(56)).toBe(false);
    expect(isStellarStrKeySecret(null)).toBe(false);
  });

  it("the asset-code law: 1-12 uppercase alphanumerics (the classic asset-code vocabulary)", () => {
    expect(String(STELLAR_ASSET_CODE_PATTERN)).toBe("/^[A-Z0-9]{1,12}$/");
    expect(STELLAR_ASSET_CODE_PATTERN.test("USDC")).toBe(true);
    expect(STELLAR_ASSET_CODE_PATTERN.test("XLM")).toBe(true);
    expect(STELLAR_ASSET_CODE_PATTERN.test("CENTUS")).toBe(true);
    expect(STELLAR_ASSET_CODE_PATTERN.test("")).toBe(false);
    expect(STELLAR_ASSET_CODE_PATTERN.test("usdc")).toBe(false);
    expect(STELLAR_ASSET_CODE_PATTERN.test("A13CHARACTERS")).toBe(false);
    expect(STELLAR_ASSET_CODE_PATTERN.test("USD C")).toBe(false);
  });
});

describe("the Stellar chain descriptor + family extension (the EVM/SOLANA/UTXO precedent)", () => {
  it("a stellar:testnet descriptor with the Stellar family extension validates (finality DETERMINISTIC / reorg NONE)", () => {
    const descriptor = validateChainDescriptor({
      chainKey: STELLAR_TESTNET_CHAIN_KEY,
      family: "STELLAR",
      displayName: "stellar-testnet",
      nativeAssetRef: `${STELLAR_TESTNET_CHAIN_KEY}/asset:XLM`,
      finality: {
        finalityModel: "DETERMINISTIC",
        reorgRisk: "NONE",
        confirmationGuidance:
          "Closed-ledger consensus (~3s ledger close); finality stays protocol-owned.",
      },
      familyExtension: {
        family: "STELLAR",
        networkPassphrase: "Test SDF Network ; September 2015",
      },
    });
    expect(descriptor.chainKey).toBe(STELLAR_TESTNET_CHAIN_KEY);
    expect(descriptor.family).toBe("STELLAR");
    expect(descriptor.familyExtension).toEqual({
      family: "STELLAR",
      networkPassphrase: "Test SDF Network ; September 2015",
    });
  });

  it("the family extension is OPTIONAL (a Stellar chain validates without one — the core stays family-neutral)", () => {
    const descriptor = validateChainDescriptor({
      chainKey: STELLAR_TESTNET_CHAIN_KEY,
      family: "STELLAR",
      displayName: "stellar-testnet",
      finality: {
        finalityModel: "DETERMINISTIC",
        reorgRisk: "NONE",
        confirmationGuidance: "Closed-ledger consensus.",
      },
    });
    expect(descriptor.familyExtension).toBeUndefined();
  });

  it("the extension discriminant must match the descriptor family (fail closed)", () => {
    expect(() =>
      validateChainDescriptorFamilyExtension(
        { family: "EVM", evmChainId: "1", contractAddressFormat: "HEX_20_BYTE", feeModel: "GAS_AUCTION" },
        "STELLAR",
      ),
    ).toThrow(/does not match the descriptor family/);
  });

  it("an inconsistent finality declaration on a STELLAR chain is rejected (reorg risk is never assumed away)", () => {
    expect(() =>
      validateChainDescriptor({
        chainKey: STELLAR_TESTNET_CHAIN_KEY,
        family: "STELLAR",
        displayName: "stellar-testnet",
        finality: {
          finalityModel: "DETERMINISTIC",
          reorgRisk: "PRESENT",
          confirmationGuidance: "Inconsistent on purpose.",
        },
      }),
    ).toThrow(/inconsistent/);
  });

  it("a stellar chain definition (the catalogue layer) composes the descriptor deterministically", () => {
    // Deterministic identity: id === chain.${chainKey} (the catalogue law).
    expect(chainCapabilityId(STELLAR_TESTNET_CHAIN_KEY)).toBe(
      "chain.stellar:testnet",
    );
    // The pinned-base non-executable arm composes (execution is a separate capability).
    expect(
      baseNonExecutableDefinition(chainCapabilityId(STELLAR_TESTNET_CHAIN_KEY)).executable,
    ).toBe(false);
  });
});

describe("the Stellar ASSET family extension (ADR-0016 D3 — the issuer-scoped shape)", () => {
  it("a well-formed issuer-scoped asset extension validates (issuer G… + asset code)", () => {
    const extension = validateAssetFamilyExtension({
      family: "STELLAR",
      issuerAccount: STELLAR_TESTNET_USDC_ISSUER,
      assetCode: "USDC",
    });
    expect(extension).toEqual({
      family: "STELLAR",
      issuerAccount: STELLAR_TESTNET_USDC_ISSUER,
      assetCode: "USDC",
    });
  });

  it("malformed issuer accounts and asset codes fail closed", () => {
    expect(() =>
      validateAssetFamilyExtension({
        family: "STELLAR",
        issuerAccount: "not-a-strkey",
        assetCode: "USDC",
      }),
    ).toThrow(/issuerAccount/);
    expect(() =>
      validateAssetFamilyExtension({
        family: "STELLAR",
        issuerAccount: strkeySecretFixture(),
        assetCode: "USDC",
      }),
    ).toThrow(/issuerAccount/);
    expect(() =>
      validateAssetFamilyExtension({
        family: "STELLAR",
        issuerAccount: STELLAR_TESTNET_USDC_ISSUER,
        assetCode: "TOOLONGASSETCODE13",
      }),
    ).toThrow(/assetCode/);
    expect(() =>
      validateAssetFamilyExtension({
        family: "STELLAR",
        issuerAccount: STELLAR_TESTNET_USDC_ISSUER,
        assetCode: "",
      }),
    ).toThrow(/assetCode/);
  });

  it("a non-STELLAR discriminant on the asset extension still fails closed (the EVM arm stays EVM)", () => {
    expect(() =>
      validateAssetFamilyExtension({
        family: "MOVE",
        issuerAccount: STELLAR_TESTNET_USDC_ISSUER,
        assetCode: "USDC",
      }),
    ).toThrow(/not supported/);
  });
});
