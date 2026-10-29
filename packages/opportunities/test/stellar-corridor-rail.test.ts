import { describe, expect, it } from "vitest";
import { discoverOpportunity } from "../src/discovery.ts";
import { OpportunityDiscoveryError } from "../src/errors.ts";
import { REPAIR_OPERATORS } from "../src/repair-operators.ts";
import {
  PINNED_STELLAR_ISSUER_STRKEY_PATTERN,
  pinnedIsValidCapitalAssetRef,
} from "../src/pins/onchain-domain.ts";
import { healthyLiquidityObservation } from "./fixtures.ts";

/**
 * P22-C (ADR-0016 D2/D3 + the frozen appendix): the corridor's ONCHAIN-rail
 * vocabulary in the opportunities domain — the stellar:testnet rail (an
 * ONCHAIN-kind rail whose key IS the chain key) and the ISSUER-SCOPED
 * capital asset (`stellar:testnet/asset:USDC:<issuerG>` — two issuers of
 * the same code are two assets, the collision law). The two-segment
 * canonical asset form stays byte-identical (the authority's identity law
 * unchanged); the repair catalogue's cross-provider row records the P22-C
 * delivery honestly.
 */

/** PUBLIC: the documented Stellar TESTNET USDC issuer (public testnet metadata). */
const STELLAR_TESTNET_USDC_ISSUER =
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const STELLAR_CHAIN_KEY = "stellar:testnet";
const ISSUER_SCOPED_USDC = `${STELLAR_CHAIN_KEY}/asset:USDC:${STELLAR_TESTNET_USDC_ISSUER}`;

describe("the issuer-scoped capital asset ref (ADR-0016 D3 — the collision law)", () => {
  it("the pinned Stellar issuer StrKey shape admits canonical G… accounts only", () => {
    expect(PINNED_STELLAR_ISSUER_STRKEY_PATTERN.test(STELLAR_TESTNET_USDC_ISSUER)).toBe(true);
    expect(PINNED_STELLAR_ISSUER_STRKEY_PATTERN.test(`G${"A".repeat(55)}`)).toBe(true);
    // A secret-shaped S… value is NEVER an issuer scope.
    expect(PINNED_STELLAR_ISSUER_STRKEY_PATTERN.test(`S${"Q".repeat(55)}`)).toBe(false);
    // A contract-shaped C… value is NEVER an issuer scope.
    expect(PINNED_STELLAR_ISSUER_STRKEY_PATTERN.test(`C${"B".repeat(55)}`)).toBe(false);
    expect(PINNED_STELLAR_ISSUER_STRKEY_PATTERN.test("GBBD47IF6LWK")).toBe(false);
    expect(PINNED_STELLAR_ISSUER_STRKEY_PATTERN.test("")).toBe(false);
  });

  it("the issuer-scoped three-segment form validates; the two-segment form stays byte-identical", () => {
    expect(pinnedIsValidCapitalAssetRef(STELLAR_CHAIN_KEY, ISSUER_SCOPED_USDC)).toBe(true);
    expect(pinnedIsValidCapitalAssetRef(STELLAR_CHAIN_KEY, `${STELLAR_CHAIN_KEY}/asset:XLM`)).toBe(
      true,
    );
    expect(pinnedIsValidCapitalAssetRef("ethereum:mainnet", "ethereum:mainnet/asset:USCD")).toBe(
      true,
    );
  });

  it("a wrong-rail prefix, a malformed code, or a non-G… issuer scope is REJECTED (fail closed)", () => {
    // A rail prefix that does not match the input's rail key.
    expect(
      pinnedIsValidCapitalAssetRef(STELLAR_CHAIN_KEY, `ethereum:mainnet/asset:USDC:${STELLAR_TESTNET_USDC_ISSUER}`),
    ).toBe(false);
    // A two-segment remainder with no symbol.
    expect(pinnedIsValidCapitalAssetRef(STELLAR_CHAIN_KEY, `${STELLAR_CHAIN_KEY}/asset:`)).toBe(
      false,
    );
    // An issuer segment that is not a G… StrKey (a secret, a hash, a word).
    expect(
      pinnedIsValidCapitalAssetRef(STELLAR_CHAIN_KEY, `${STELLAR_CHAIN_KEY}/asset:USDC:not-an-issuer`),
    ).toBe(false);
    expect(
      pinnedIsValidCapitalAssetRef(STELLAR_CHAIN_KEY, `${STELLAR_CHAIN_KEY}/asset:USDC:S${"Q".repeat(55)}`),
    ).toBe(false);
    // A malformed code segment.
    expect(
      pinnedIsValidCapitalAssetRef(STELLAR_CHAIN_KEY, `${STELLAR_CHAIN_KEY}/asset:usdc:${STELLAR_TESTNET_USDC_ISSUER}`),
    ).toBe(false);
  });

  it("TWO issuers of the same code are TWO assets (distinct refs, both valid — never conflated)", () => {
    const otherIssuer = `G${"X".repeat(55)}`;
    const first = `${STELLAR_CHAIN_KEY}/asset:USDC:${STELLAR_TESTNET_USDC_ISSUER}`;
    const second = `${STELLAR_CHAIN_KEY}/asset:USDC:${otherIssuer}`;
    expect(first).not.toEqual(second);
    expect(pinnedIsValidCapitalAssetRef(STELLAR_CHAIN_KEY, first)).toBe(true);
    expect(pinnedIsValidCapitalAssetRef(STELLAR_CHAIN_KEY, second)).toBe(true);
  });
});

describe("the corridor rail through the discovery-input laws (the ONCHAIN rail admission)", () => {
  it("a liquidity observation on the stellar:testnet ONCHAIN rail with the issuer-scoped USDC capital discovers honestly", () => {
    const opportunity = discoverOpportunity(
      {
        ...healthyLiquidityObservation(),
        venueId: "venue:stellar-usdc-pool",
        protocolKey: "protocol:stellar-amm",
        railKind: "ONCHAIN",
        railKey: STELLAR_CHAIN_KEY,
        adapterId: "adapter:stellar:horizon",
        capitalRequired: { assetRef: ISSUER_SCOPED_USDC, minorUnits: "1250000000" },
      },
      1_000,
    );
    expect(opportunity.rail.railKind).toBe("ONCHAIN");
    expect(opportunity.rail.railKey).toBe(STELLAR_CHAIN_KEY);
  });

  it("a malformed issuer scope in the capital asset is a TYPED discovery refusal (never sanitized)", () => {
    expect(() =>
      discoverOpportunity(
        {
          ...healthyLiquidityObservation(),
          railKey: STELLAR_CHAIN_KEY,
          capitalRequired: {
            assetRef: `${STELLAR_CHAIN_KEY}/asset:USDC:not-an-issuer`,
            minorUnits: "1250000000",
          },
        },
        1_000,
      ),
    ).toThrow(OpportunityDiscoveryError);
    expect(() =>
      discoverOpportunity(
        {
          ...healthyLiquidityObservation(),
          railKey: STELLAR_CHAIN_KEY,
          capitalRequired: {
            assetRef: `${STELLAR_CHAIN_KEY}/asset:USDC:not-an-issuer`,
            minorUnits: "1250000000",
          },
        },
        1_000,
      ),
    ).toThrow(/issuer-scoped/);
  });

  it("the two-segment canonical form still validates on the corridor rail (the byte-compat law)", () => {
    const opportunity = discoverOpportunity(
      {
        ...healthyLiquidityObservation(),
        railKey: STELLAR_CHAIN_KEY,
        capitalRequired: { assetRef: `${STELLAR_CHAIN_KEY}/asset:XLM`, minorUnits: "10000000000" },
      },
      1_000,
    );
    expect(opportunity.rail.railKey).toBe(STELLAR_CHAIN_KEY);
  });
});

describe("the repair catalogue's cross-provider row records the P22-C delivery honestly", () => {
  it("the platform:cross-provider-route-shape row names the DELIVERED shape and the residual gap (never the stale missing-vocabulary claim)", () => {
    const row = REPAIR_OPERATORS.find(
      (operator) => operator.operatorId === "platform:cross-provider-route-shape",
    );
    expect(row).toBeDefined();
    expect(row!.kind).toBe("PLATFORM_WORK");
    expect(row!.evidenceLaw).toContain("P22-C DELIVERED the cross-provider-corridor shape");
    expect(row!.evidenceLaw).toContain("the unobserved middle and the H-lane composite execution");
    // The stale P21-0 claim is gone.
    expect(row!.evidenceLaw).not.toContain("has no cross-provider composition");
    // The advisory laws are unchanged.
    expect(row!.advisoryOnly).toBe(true);
    expect(row!.permitsExecution).toBe(false);
  });
});
