import { describe, expect, it } from "vitest";
import {
  defineCryptoAssetAcceptance,
  defineMerchantCryptoAcceptancePolicy,
  offeredAssets,
} from "../src/acceptance-policy.ts";
import type { CryptoAcceptanceRequest, CryptoAssetAcceptance } from "../src/acceptance-policy.ts";
import {
  evaluateCryptoAcceptance,
  matchesBaseAcceptance,
  matchesCryptoAcceptance,
} from "../src/acceptance-evaluate.ts";
import { defineCryptoQuote } from "../src/quotes.ts";
import type { CryptoQuote } from "../src/quotes.ts";
import { asChainId, asCryptoAssetId } from "../src/identifiers.ts";
import type { ChainId, CryptoAssetId } from "../src/identifiers.ts";
import type { CryptoAmount } from "../src/assets.ts";
import type { PinnedAcceptanceRequest, PinnedPaymentAcceptancePolicy } from "../src/index.ts";
import { ValidationError } from "../src/errors.ts";
import {
  BASE_POLICY,
  CRYPTO_POLICY,
  ETH,
  T0,
  T1,
  USDC,
  canonicalQuote,
  ethAmount,
  usd,
  usdcAmount,
} from "./fixtures.ts";

/**
 * The crypto acceptance suite (PORTED+ADAPTED from old
 * packages/merchant-crypto/test/acceptance.test.ts @ 8a735bf — 28
 * sites): per-asset acceptance construction, the merchant crypto
 * acceptance policy (narrowing a base policy that declares
 * STABLECOIN_CRYPTO), the typed-reason matchers of BOTH planes and the
 * two-plane evaluator. Every instant is a fixed bigint from the fixture
 * clock (no Date, no randomness).
 */

const ETH_CHAIN = asChainId("chain.eth-mainnet");
const BASE_CHAIN = asChainId("chain.base-mainnet");
const POLYGON_CHAIN = asChainId("chain.polygon-mainnet");
const USDT_ID = asCryptoAssetId("asset.usdt");
const ON_ETH = ["chain.eth-mainnet"];

/** A base policy that does NOT declare STABLECOIN_CRYPTO (the narrowing law). */
const NO_CRYPTO_BASE: PinnedPaymentAcceptancePolicy = Object.freeze({
  ...BASE_POLICY,
  methods: Object.freeze(["CARD", "BANK_TRANSFER"] as const),
});

const usdcAcceptance = defineCryptoAssetAcceptance({
  assetId: USDC.id,
  chains: ["chain.eth-mainnet", "chain.base-mainnet"],
  minAmount: usdcAmount(1_000_000n),
  requiredConfirmations: 3n,
});

type AssetAcceptanceInput = Parameters<typeof defineCryptoAssetAcceptance>[0];
type PolicyInput = Parameters<typeof defineMerchantCryptoAcceptancePolicy>[0];

/** The pinned rejection law: the typed error class AND the documented message. */
function expectValidationError(action: () => unknown, pattern: RegExp): void {
  expect(action).toThrow(ValidationError);
  expect(action).toThrow(pattern);
}

function rejectAssetAcceptance(input: AssetAcceptanceInput, pattern: RegExp): void {
  expectValidationError(() => defineCryptoAssetAcceptance(input), pattern);
}

function rejectPolicy(
  input: PolicyInput,
  basePolicy: PinnedPaymentAcceptancePolicy,
  pattern: RegExp,
): void {
  expectValidationError(() => defineMerchantCryptoAcceptancePolicy(input, basePolicy), pattern);
}

function policyInput(
  overrides: { basePolicyId?: string; assets?: readonly CryptoAssetAcceptance[]; quoteValidityMs?: bigint } = {},
): PolicyInput {
  return {
    id: "policy.crypto.test.x",
    merchantRef: "merchant.fixture.1",
    basePolicyId: overrides.basePolicyId ?? BASE_POLICY.id,
    assets: overrides.assets ?? [usdcAcceptance],
    quoteValidityMs: overrides.quoteValidityMs ?? 300_000n,
  };
}

type RequestOverrides = {
  readonly assetId?: CryptoAssetId;
  readonly chainId?: ChainId;
  readonly amount?: CryptoAmount;
  readonly quote?: CryptoQuote;
};

function request(overrides: RequestOverrides = {}): CryptoAcceptanceRequest {
  const assetId = overrides.assetId ?? USDC.id;
  const chainId = overrides.chainId ?? ETH_CHAIN;
  const amount = overrides.amount ?? usdcAmount(2_000_000n);
  return { assetId, chainId, amount, ...(overrides.quote !== undefined ? { quote: overrides.quote } : {}) };
}

function baseRequest(
  overrides: { methodId?: string; currency?: string; country?: string } = {},
): PinnedAcceptanceRequest {
  const methodId = overrides.methodId ?? "method.usdc";
  const currency = overrides.currency ?? "USD";
  return { methodId, currency, ...(overrides.country !== undefined ? { country: overrides.country } : {}) };
}

describe("defineCryptoAssetAcceptance (per-asset narrowing)", () => {
  it("builds a frozen acceptance with branded chains, conditional bounds and a confirmation policy", () => {
    const acceptance = defineCryptoAssetAcceptance({
      assetId: USDC.id,
      chains: ["chain.eth-mainnet", "chain.base-mainnet"],
      minAmount: usdcAmount(1_000_000n), maxAmount: usdcAmount(1_000_000_000_000n), requiredConfirmations: 3n,
    });
    expect(acceptance.assetId).toBe(USDC.id);
    expect(acceptance.chains).toEqual([ETH_CHAIN, BASE_CHAIN]);
    expect(acceptance.minAmount?.value).toBe(1_000_000n);
    expect(acceptance.maxAmount?.value).toBe(1_000_000_000_000n);
    expect(acceptance.confirmations.requiredConfirmations).toBe(3n);
    expect(Object.isFrozen(acceptance)).toBe(true);
    expect(Object.isFrozen(acceptance.chains)).toBe(true);
    expect(Object.isFrozen(acceptance.confirmations)).toBe(true);
    // min === max is an inclusive bound pair; one confirmation is the floor.
    const pinned = defineCryptoAssetAcceptance({
      assetId: USDC.id, chains: ON_ETH,
      minAmount: usdcAmount(1_000_000n), maxAmount: usdcAmount(1_000_000n), requiredConfirmations: 1n,
    });
    expect(pinned.minAmount?.value).toBe(pinned.maxAmount?.value);
    expect(pinned.confirmations.requiredConfirmations).toBe(1n);
  });

  it("requires at least one chain and rejects duplicate chains", () => {
    rejectAssetAcceptance({ assetId: USDC.id, chains: [], requiredConfirmations: 3n }, /at least one chain/);
    rejectAssetAcceptance(
      { assetId: USDC.id, chains: ["chain.eth-mainnet", "chain.eth-mainnet"], requiredConfirmations: 3n },
      /must not repeat/,
    );
  });

  it("requires requiredConfirmations >= 1n, min <= max and bounds in the accepted asset", () => {
    rejectAssetAcceptance({ assetId: USDC.id, chains: ON_ETH, requiredConfirmations: 0n }, /at least one/);
    rejectAssetAcceptance(
      {
        assetId: USDC.id, chains: ON_ETH,
        minAmount: usdcAmount(2_000_000n), maxAmount: usdcAmount(1_000_000n), requiredConfirmations: 3n,
      },
      /must not exceed maxAmount/,
    );
    rejectAssetAcceptance(
      { assetId: USDC.id, chains: ON_ETH, minAmount: ethAmount(1_000_000_000_000_000n), requiredConfirmations: 3n },
      /asset's own minor units/,
    );
    rejectAssetAcceptance(
      { assetId: USDC.id, chains: ON_ETH, maxAmount: ethAmount(1_000_000_000_000_000n), requiredConfirmations: 3n },
      /accepted asset/,
    );
  });
});

describe("defineMerchantCryptoAcceptancePolicy (the narrowing statement)", () => {
  it("builds a frozen policy narrowing a base policy that declares STABLECOIN_CRYPTO", () => {
    const policy = defineMerchantCryptoAcceptancePolicy(
      {
        id: "policy.crypto.test.1", merchantRef: "merchant.fixture.1", basePolicyId: BASE_POLICY.id,
        assets: [usdcAcceptance], quoteValidityMs: 300_000n,
      },
      BASE_POLICY,
    );
    expect(policy.id).toBe("policy.crypto.test.1");
    expect(policy.merchantRef).toBe("merchant.fixture.1");
    expect(policy.basePolicyId).toBe(BASE_POLICY.id);
    expect(policy.assets).toEqual([usdcAcceptance]);
    expect(policy.quoteValidityMs).toBe(300_000n);
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy.assets)).toBe(true);
    // The shared fixture policy composes the same law over two assets.
    expect(CRYPTO_POLICY.basePolicyId).toBe(BASE_POLICY.id);
    expect(CRYPTO_POLICY.assets.length).toBe(2);
    expect(CRYPTO_POLICY.quoteValidityMs).toBe(300_000n);
    expect(Object.isFrozen(CRYPTO_POLICY)).toBe(true);
  });

  it("requires the base policy to declare STABLECOIN_CRYPTO and the basePolicyId to reference it exactly", () => {
    rejectPolicy(policyInput(), NO_CRYPTO_BASE, /STABLECOIN_CRYPTO/);
    rejectPolicy(
      policyInput({ basePolicyId: "policy.base.someone-else" }),
      BASE_POLICY,
      /reference the base acceptance policy exactly/,
    );
  });

  it("requires non-empty unique assets and a positive quoteValidityMs", () => {
    const secondUsdc = defineCryptoAssetAcceptance({
      assetId: USDC.id, chains: ["chain.polygon-mainnet"], requiredConfirmations: 32n,
    });
    rejectPolicy(policyInput({ assets: [] }), BASE_POLICY, /at least one asset/);
    rejectPolicy(policyInput({ assets: [usdcAcceptance, secondUsdc] }), BASE_POLICY, /must not repeat/);
    rejectPolicy(policyInput({ quoteValidityMs: 0n }), BASE_POLICY, /positive bigint/);
    rejectPolicy(policyInput({ quoteValidityMs: -1n }), BASE_POLICY, /positive bigint/);
  });
});

describe("matchesCryptoAcceptance (typed reasons)", () => {
  it("accepts a coherent in-bounds request and resolves the per-asset acceptance", () => {
    const decision = matchesCryptoAcceptance(CRYPTO_POLICY, request(), T1);
    expect(decision.accepted).toBe(true);
    expect(decision.reasons).toEqual([]);
    expect(decision.asset?.assetId).toBe(USDC.id);
    expect(decision.asset?.confirmations.requiredConfirmations).toBe(3n);
    expect(Object.isFrozen(decision)).toBe(true);
    expect(Object.isFrozen(decision.reasons)).toBe(true);
  });

  it("rejects unknown assets and incoherent amounts as ASSET_NOT_ACCEPTED", () => {
    const unknown = matchesCryptoAcceptance(CRYPTO_POLICY, request({ assetId: USDT_ID }), T1);
    expect(unknown.accepted).toBe(false); expect(unknown.reasons).toEqual(["ASSET_NOT_ACCEPTED"]);
    expect(unknown.asset).toBeUndefined();
    // An amount denominated in a different asset is an incoherent
    // asset/amount pair — bounds are never evaluated across assets.
    const incoherent = matchesCryptoAcceptance(CRYPTO_POLICY, request({ amount: ethAmount(2_000_000n) }), T1);
    expect(incoherent.accepted).toBe(false); expect(incoherent.reasons).toEqual(["ASSET_NOT_ACCEPTED"]);
    const mixed = matchesCryptoAcceptance(CRYPTO_POLICY, request({ assetId: USDT_ID, amount: ethAmount(500_000n) }), T1);
    expect(mixed.accepted).toBe(false); expect(mixed.reasons).toEqual(["ASSET_NOT_ACCEPTED"]);
  });

  it("rejects a chain the asset is not accepted on with CHAIN_NOT_ACCEPTED", () => {
    const decision = matchesCryptoAcceptance(CRYPTO_POLICY, request({ chainId: POLYGON_CHAIN }), T1);
    expect(decision.accepted).toBe(false); expect(decision.reasons).toEqual(["CHAIN_NOT_ACCEPTED"]);
    expect(decision.asset?.assetId).toBe(USDC.id);
  });

  it("rejects amounts below the minimum and above the maximum (bounds are inclusive)", () => {
    const below = matchesCryptoAcceptance(CRYPTO_POLICY, request({ amount: usdcAmount(500_000n) }), T1);
    expect(below.accepted).toBe(false); expect(below.reasons).toEqual(["AMOUNT_BELOW_MINIMUM"]);
    const above = matchesCryptoAcceptance(CRYPTO_POLICY, request({ amount: usdcAmount(2_000_000_000_000n) }), T1);
    expect(above.accepted).toBe(false); expect(above.reasons).toEqual(["AMOUNT_ABOVE_MAXIMUM"]);
    const atMin = matchesCryptoAcceptance(CRYPTO_POLICY, request({ amount: usdcAmount(1_000_000n) }), T1);
    expect(atMin.accepted).toBe(true);
    const atMax = matchesCryptoAcceptance(CRYPTO_POLICY, request({ amount: usdcAmount(1_000_000_000_000n) }), T1);
    expect(atMax.accepted).toBe(true);
  });

  it("rejects an expired quote AT the boundary and accepts it one instant before", () => {
    const quote = canonicalQuote();
    const expired = matchesCryptoAcceptance(CRYPTO_POLICY, request({ quote }), quote.validUntil);
    expect(expired.accepted).toBe(false); expect(expired.reasons).toEqual(["QUOTE_EXPIRED"]);
    const lastInstant = matchesCryptoAcceptance(CRYPTO_POLICY, request({ quote }), quote.validUntil - 1n);
    expect(lastInstant.accepted).toBe(true); expect(lastInstant.reasons).toEqual([]);
  });

  it("rejects quotes for a different asset or a different chain", () => {
    const ethQuote = defineCryptoQuote({
      id: "quote.eth.usd.001", assetId: ETH.id, chainId: "chain.eth-mainnet",
      fiatAmount: usd(10_000n), cryptoAmount: ethAmount(5_000_000_000_000_000n),
      ratio: { numerator: 1n, denominator: 500_000_000_000n },
      fees: usd(30n), quotedAt: T0, validUntil: T0 + 7_200_000n, sourceRef: "source.psp.fixture",
    });
    const assetMismatch = matchesCryptoAcceptance(CRYPTO_POLICY, request({ quote: ethQuote }), T1);
    expect(assetMismatch.accepted).toBe(false);
    expect(assetMismatch.reasons).toEqual(["QUOTE_ASSET_MISMATCH"]);
    const baseChainQuote = defineCryptoQuote({
      id: "quote.usdc.usd.002", assetId: USDC.id, chainId: "chain.base-mainnet",
      fiatAmount: usd(10_000n), cryptoAmount: usdcAmount(100_000_000n),
      ratio: { numerator: 1n, denominator: 10_000n },
      fees: usd(30n), quotedAt: T0, validUntil: T0 + 7_200_000n, sourceRef: "source.psp.fixture",
    });
    const chainMismatch = matchesCryptoAcceptance(CRYPTO_POLICY, request({ quote: baseChainQuote }), T1);
    expect(chainMismatch.accepted).toBe(false);
    expect(chainMismatch.reasons).toEqual(["QUOTE_CHAIN_MISMATCH"]);
  });

  it("freezes the decision and deduplicates reasons across the matcher's checks", () => {
    const quote = canonicalQuote();
    const decision = matchesCryptoAcceptance(
      CRYPTO_POLICY,
      request({ assetId: USDT_ID, chainId: POLYGON_CHAIN, amount: usdcAmount(500_000n), quote }),
      quote.validUntil,
    );
    expect(decision.accepted).toBe(false);
    expect(decision.reasons).toEqual([
      "ASSET_NOT_ACCEPTED",
      "QUOTE_ASSET_MISMATCH",
      "QUOTE_CHAIN_MISMATCH",
      "QUOTE_EXPIRED",
    ]);
    expect(Object.isFrozen(decision)).toBe(true);
    expect(Object.isFrozen(decision.reasons)).toBe(true);
    expect(decision.asset).toBeUndefined();
  });
});

describe("offeredAssets (session snapshots)", () => {
  it("returns a fresh frozen snapshot that later policy edits cannot rewrite", () => {
    const snapshot = offeredAssets(CRYPTO_POLICY);
    expect(snapshot).toEqual(CRYPTO_POLICY.assets);
    expect(snapshot).not.toBe(CRYPTO_POLICY.assets);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot.length).toBe(2);
    expect(snapshot[0]).not.toBe(CRYPTO_POLICY.assets[0]);
    expect(Object.isFrozen(snapshot[0])).toBe(true);
    expect(snapshot[0]?.assetId).toBe(USDC.id);
    // Simulate a later policy edit: a NEW narrowed policy cannot rewrite
    // the session snapshot already handed out (INV-3: historical facts
    // are immutable).
    const narrowed = defineMerchantCryptoAcceptancePolicy(
      {
        id: "policy.crypto.narrowed.1", merchantRef: CRYPTO_POLICY.merchantRef,
        basePolicyId: CRYPTO_POLICY.basePolicyId, assets: [CRYPTO_POLICY.assets[0]!],
        quoteValidityMs: CRYPTO_POLICY.quoteValidityMs,
      },
      BASE_POLICY,
    );
    expect(offeredAssets(narrowed).length).toBe(1);
    expect(snapshot.length).toBe(2);
    expect(snapshot).toEqual(CRYPTO_POLICY.assets);
    // The frozen snapshot cannot be mutated in place.
    expect(() => {
      (snapshot as unknown as string[]).push("x");
    }).toThrow();
    expect(CRYPTO_POLICY.assets.length).toBe(2);
    expect(offeredAssets(CRYPTO_POLICY).length).toBe(2);
  });
});

describe("matchesBaseAcceptance (the base canonical plane)", () => {
  it("reports every typed base-plane reason (catalog, kind, currency, geography)", () => {
    const unknownMethod = matchesBaseAcceptance(
      BASE_POLICY,
      baseRequest({ methodId: "method.paypal", currency: "GBP", country: "JP" }),
    );
    expect(unknownMethod.accepted).toBe(false);
    expect(unknownMethod.reasons).toEqual([
      "METHOD_NOT_IN_CATALOG",
      "CURRENCY_NOT_ACCEPTED",
      "GEOGRAPHY_NOT_SERVED",
    ]);
    expect(unknownMethod.method).toBeUndefined();
    const kindRejected = matchesBaseAcceptance(NO_CRYPTO_BASE, baseRequest({ methodId: "method.usdc" }));
    expect(kindRejected.accepted).toBe(false); expect(kindRejected.reasons).toEqual(["METHOD_KIND_NOT_ACCEPTED"]);
    expect(kindRejected.method?.id).toBe("method.usdc");
    const countryless = matchesBaseAcceptance(BASE_POLICY, baseRequest({ country: "" }));
    expect(countryless.accepted).toBe(false); expect(countryless.reasons).toEqual(["COUNTRY_NOT_LISTED"]);
    // Country codes are case-normalized; a matching lowercase code is served.
    const normalized = matchesBaseAcceptance(BASE_POLICY, baseRequest({ country: "us" }));
    expect(normalized.accepted).toBe(true);
    expect(normalized.reasons).toEqual([]);
    expect(normalized.method?.id).toBe("method.usdc");
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized.reasons)).toBe(true);
  });
});

describe("evaluateCryptoAcceptance (both planes)", () => {
  it("unions BASE_POLICY_REJECTED with the crypto reasons; accepts when both planes accept", () => {
    const union = evaluateCryptoAcceptance(
      CRYPTO_POLICY,
      BASE_POLICY,
      request({ assetId: USDT_ID }),
      baseRequest({ methodId: "method.paypal", currency: "GBP" }),
      T1,
    );
    expect(union.accepted).toBe(false);
    expect(union.reasons).toEqual(["BASE_POLICY_REJECTED", "ASSET_NOT_ACCEPTED"]);
    expect(Object.isFrozen(union)).toBe(true); expect(Object.isFrozen(union.reasons)).toBe(true);
    expect(union.asset).toBeUndefined();
    const accepted = evaluateCryptoAcceptance(CRYPTO_POLICY, BASE_POLICY, request(), baseRequest(), T1);
    expect(accepted.accepted).toBe(true); expect(accepted.reasons).toEqual([]);
    expect(accepted.asset?.assetId).toBe(USDC.id);
    // When the base plane accepts, the decision carries ONLY the crypto
    // reasons (never BASE_POLICY_REJECTED).
    const cryptoOnly = evaluateCryptoAcceptance(
      CRYPTO_POLICY,
      BASE_POLICY,
      request({ chainId: POLYGON_CHAIN }),
      baseRequest(),
      T1,
    );
    expect(cryptoOnly.accepted).toBe(false);
    expect(cryptoOnly.reasons).toEqual(["CHAIN_NOT_ACCEPTED"]);
    expect(cryptoOnly.reasons).not.toContain("BASE_POLICY_REJECTED");
  });
});
