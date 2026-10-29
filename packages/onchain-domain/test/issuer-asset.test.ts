import { describe, expect, it } from "vitest";
import {
  canonicalAssetRef,
  canonicalIssuerScopedAssetRef,
  validateAssetDefinition,
} from "../src/asset.ts";
import type { AssetDefinition } from "../src/asset.ts";
import { STELLAR_TESTNET_USDC_ISSUER, STELLAR_OTHER_ISSUER } from "./stellar-family.test.ts";

/**
 * P22-A (ADR-0016 D3): the issuer-scoped asset identity. An AssetDefinition
 * on a STELLAR-family chain MAY carry a familyExtension with the issuer
 * account (G…) + asset code; the canonical assetId then disambiguates
 * issuers (`stellar:testnet/asset:USDC:<issuerAccount>`). THE ISSUER-
 * COLLISION LAW: two issuers of the same code are two assets. The
 * declaredPeg stays descriptive (a claim, never authorization).
 */

const CHAIN = "stellar:testnet";

function issuerScopedUsdc(issuerAccount: string): AssetDefinition {
  const assetId = canonicalIssuerScopedAssetRef(CHAIN, "USDC", issuerAccount);
  return {
    assetId,
    symbol: "USDC",
    displayName: `USDC (${issuerAccount})`,
    assetClass: "TOKEN",
    minorUnitDigits: 7,
    chainKey: CHAIN,
    declaredPeg: {
      pegKind: "FIAT_PEGGED",
      declaredBy: "issuer-declared USD peg (testnet)",
    },
    provenance: {
      declaredBy: "catalogue-operator",
      artifactRef: "catalogue/assets/stellar-testnet-usdc.json",
      contentHash: "sha256:0000",
    },
    familyExtension: {
      family: "STELLAR",
      issuerAccount,
      assetCode: "USDC",
    },
  };
}

describe("the issuer-scoped canonical asset identity (ADR-0016 D3)", () => {
  it("the corridor's USDC: the assetId is exactly `stellar:testnet/asset:USDC:<issuerAccount>` when the extension is present", () => {
    const expected = `stellar:testnet/asset:USDC:${STELLAR_TESTNET_USDC_ISSUER}`;
    expect(canonicalIssuerScopedAssetRef(CHAIN, "USDC", STELLAR_TESTNET_USDC_ISSUER)).toBe(
      expected,
    );
    const asset = validateAssetDefinition(issuerScopedUsdc(STELLAR_TESTNET_USDC_ISSUER));
    expect(asset.assetId).toBe(expected);
    expect(asset.familyExtension).toEqual({
      family: "STELLAR",
      issuerAccount: STELLAR_TESTNET_USDC_ISSUER,
      assetCode: "USDC",
    });
  });

  it("THE ISSUER-COLLISION LAW: two issuers of the same code are TWO assets (distinct canonical assetIds)", () => {
    const issuerA = validateAssetDefinition(issuerScopedUsdc(STELLAR_TESTNET_USDC_ISSUER));
    const issuerB = validateAssetDefinition(issuerScopedUsdc(STELLAR_OTHER_ISSUER));
    expect(issuerA.assetId).not.toBe(issuerB.assetId);
    expect(issuerA.symbol).toBe(issuerB.symbol);
    expect(issuerA.chainKey).toBe(issuerB.chainKey);
    // The identity difference is exactly the issuer scope.
    expect(issuerA.assetId.endsWith(`:${STELLAR_TESTNET_USDC_ISSUER}`)).toBe(true);
    expect(issuerB.assetId.endsWith(`:${STELLAR_OTHER_ISSUER}`)).toBe(true);
  });

  it("identity is DETERMINISTIC: an assetId that omits the issuer while the extension is present is rejected", () => {
    const unscoped = issuerScopedUsdc(STELLAR_TESTNET_USDC_ISSUER);
    expect(() =>
      validateAssetDefinition({
        ...unscoped,
        assetId: canonicalAssetRef(CHAIN, "USDC"),
      }),
    ).toThrow(/asset identity is deterministic/);
  });

  it("identity is DETERMINISTIC: an assetId scoped to a DIFFERENT issuer than the extension is rejected", () => {
    const mismatched = issuerScopedUsdc(STELLAR_TESTNET_USDC_ISSUER);
    expect(() =>
      validateAssetDefinition({
        ...mismatched,
        assetId: canonicalIssuerScopedAssetRef(CHAIN, "USDC", STELLAR_OTHER_ISSUER),
      }),
    ).toThrow(/asset identity is deterministic/);
  });

  it("a native asset WITHOUT the extension keeps the plain unscoped identity (the optionality law)", () => {
    const native = validateAssetDefinition({
      assetId: canonicalAssetRef(CHAIN, "XLM"),
      symbol: "XLM",
      displayName: "Stellar Lumens",
      assetClass: "NATIVE",
      minorUnitDigits: 7,
      chainKey: CHAIN,
      provenance: {
        declaredBy: "catalogue-operator",
        artifactRef: "catalogue/assets/stellar-testnet-xlm.json",
        contentHash: "sha256:0000",
      },
    });
    expect(native.assetId).toBe("stellar:testnet/asset:XLM");
    expect(native.familyExtension).toBeUndefined();
  });

  it("a malformed issuer on the extension fails closed (the whole definition is rejected)", () => {
    expect(() =>
      validateAssetDefinition(issuerScopedUsdc("not-a-strkey")),
    ).toThrow(/issuerAccount/);
  });

  it("the declaredPeg stays DESCRIPTIVE — carried verbatim, a claim never an authorization", () => {
    const asset = validateAssetDefinition(issuerScopedUsdc(STELLAR_TESTNET_USDC_ISSUER));
    expect(asset.declaredPeg).toEqual({
      pegKind: "FIAT_PEGGED",
      declaredBy: "issuer-declared USD peg (testnet)",
    });
    // The peg never enters the identity and never widens it: the assetId is
    // the issuer-scoped canonical ref regardless of the peg claim.
    expect(asset.assetId).toBe(
      canonicalIssuerScopedAssetRef(CHAIN, "USDC", STELLAR_TESTNET_USDC_ISSUER),
    );
  });
});
