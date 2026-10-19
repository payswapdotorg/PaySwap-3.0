import { describe, expect, it } from "vitest";
import {
  asChainId,
  asCheckoutFlowId,
  asCryptoAcceptanceActivationId,
  asCryptoAssetId,
  asMerchantCheckoutSessionId,
  asMerchantCryptoAcceptancePolicyId,
  asMerchantId,
  asMerchantPaymentAttemptId,
  asMerchantPaymentIntentId,
  asQuoteId,
  asRefundId,
  asSettlementInstructionId,
  asWebhookEventId,
} from "../src/identifiers.ts";
import { InvalidIdentifierError } from "../src/errors.ts";

/**
 * The branded-id suite (PORT/ADAPT of the old merchant-crypto
 * test/assets.test.ts "branded ids" block — 3 sites over
 * asCryptoAssetId/asChainId — widened to the ONE shared law now
 * declared for the whole 12-member merchant id family, plus the
 * pinned SettlementInstructionId law that is NET-NEW to P5-W3: the
 * delegation handle this package carries but never owns).
 *
 * The shared law (identical to the old lane's law, re-declared
 * locally): every branded id is a non-empty string of at most 256
 * characters carrying no surrounding whitespace; violation is a typed
 * InvalidIdentifierError. Branding is identity-preserving — the brand
 * is a compile-time refinement of plain string.
 */

const MERCHANT_ID_FAMILY: ReadonlyArray<{
  readonly name: string;
  readonly valid: string;
  readonly validate: (value: string) => string;
}> = [
  { name: "asMerchantId", valid: "merchant.fixture.1", validate: asMerchantId },
  { name: "asQuoteId", valid: "quote.usdc.1", validate: asQuoteId },
  { name: "asCryptoAssetId", valid: "asset.usdc", validate: asCryptoAssetId },
  { name: "asChainId", valid: "chain.eth-mainnet", validate: asChainId },
  {
    name: "asMerchantPaymentIntentId",
    valid: "intent.fixture.1",
    validate: asMerchantPaymentIntentId,
  },
  {
    name: "asMerchantPaymentAttemptId",
    valid: "attempt.fixture.1",
    validate: asMerchantPaymentAttemptId,
  },
  {
    name: "asMerchantCheckoutSessionId",
    valid: "session.fixture.1",
    validate: asMerchantCheckoutSessionId,
  },
  { name: "asCheckoutFlowId", valid: "flow.fixture.1", validate: asCheckoutFlowId },
  {
    name: "asMerchantCryptoAcceptancePolicyId",
    valid: "policy.crypto.1",
    validate: asMerchantCryptoAcceptancePolicyId,
  },
  {
    name: "asCryptoAcceptanceActivationId",
    valid: "activation.fixture.1",
    validate: asCryptoAcceptanceActivationId,
  },
  { name: "asRefundId", valid: "refund.fixture.1", validate: asRefundId },
  { name: "asWebhookEventId", valid: "evt.fixture.1", validate: asWebhookEventId },
];

describe("the branded-id law shared by every merchant id (ADAPT of the old crypto-lane id sites)", () => {
  it("accepts a valid id for each of the twelve family validators and returns the identical string", () => {
    for (const entry of MERCHANT_ID_FAMILY) {
      expect(entry.validate(entry.valid)).toBe(entry.valid);
    }
    expect(asMerchantId("m:1")).toBe("m:1");
    expect(asChainId("chain:ethereum")).toBe("chain:ethereum");
  });

  it("rejects the empty string for every family validator with the typed identifier error", () => {
    for (const entry of MERCHANT_ID_FAMILY) {
      expect(() => entry.validate("")).toThrow(InvalidIdentifierError);
      expect(() => entry.validate("")).toThrow(/non-empty/);
    }
  });

  it("enforces the 256-character boundary for every family validator (256 ok, 257 fails)", () => {
    const atBoundary = "a".repeat(256);
    const beyondBoundary = "a".repeat(257);
    for (const entry of MERCHANT_ID_FAMILY) {
      expect(entry.validate(atBoundary)).toBe(atBoundary);
      expect(() => entry.validate(beyondBoundary)).toThrow(InvalidIdentifierError);
      expect(() => entry.validate(beyondBoundary)).toThrow(/exceeds 256 characters/);
    }
  });

  it("rejects surrounding whitespace for every family validator (leading, trailing, tab, newline)", () => {
    for (const entry of MERCHANT_ID_FAMILY) {
      const padded = [
        ` ${entry.valid}`,
        `${entry.valid} `,
        `\t${entry.valid}`,
        `${entry.valid}\n`,
      ];
      for (const value of padded) {
        expect(() => entry.validate(value)).toThrow(InvalidIdentifierError);
        expect(() => entry.validate(value)).toThrow(/surrounding whitespace/);
      }
    }
  });

  it("rejects non-string values for every family validator (undefined, null, numbers, booleans, objects)", () => {
    const nonStrings: readonly unknown[] = [undefined, null, 42, 3.14, true, {}, ["id"]];
    for (const entry of MERCHANT_ID_FAMILY) {
      for (const bad of nonStrings) {
        expect(() => entry.validate(bad as string)).toThrow(InvalidIdentifierError);
        expect(() => entry.validate(bad as string)).toThrow(/non-empty/);
      }
    }
  });
});

describe("asSettlementInstructionId — the pinned protocol-lane law (the delegation handle)", () => {
  it("brands a valid id into the pinned typed reference, identity-preserving", () => {
    const handle = asSettlementInstructionId("settle.instruction.1");
    expect(handle).toBe("settle.instruction.1");
    expect(handle.length).toBe("settle.instruction.1".length);
  });

  it("accepts the 256-character boundary exactly", () => {
    const atBoundary = "s".repeat(256);
    expect(asSettlementInstructionId(atBoundary)).toBe(atBoundary);
  });

  it("rejects 257 characters with the pinned max-length law", () => {
    expect(() => asSettlementInstructionId("s".repeat(257))).toThrow(InvalidIdentifierError);
    expect(() => asSettlementInstructionId("s".repeat(257))).toThrow(/exceeds 256 characters/);
  });

  it("rejects the empty string and non-string values", () => {
    expect(() => asSettlementInstructionId("")).toThrow(InvalidIdentifierError);
    expect(() => asSettlementInstructionId("")).toThrow(/non-empty/);
    const nonStrings: readonly string[] = [undefined, null, 42, {}] as unknown as string[];
    for (const bad of nonStrings) {
      expect(() => asSettlementInstructionId(bad)).toThrow(InvalidIdentifierError);
      expect(() => asSettlementInstructionId(bad)).toThrow(/non-empty/);
    }
  });

  it("rejects surrounding whitespace", () => {
    const padded = [" settle.instruction.1", "settle.instruction.1 ", "\tsettle.instruction.1"];
    for (const value of padded) {
      expect(() => asSettlementInstructionId(value)).toThrow(InvalidIdentifierError);
      expect(() => asSettlementInstructionId(value)).toThrow(/surrounding whitespace/);
    }
  });
});

describe("the brand is identity-preserving (compile-time refinement only)", () => {
  it("a branded id is strictly its raw string: string operations, JSON and cross-brand equality are untouched", () => {
    const merchantId = asMerchantId("m:1");
    const quoteId = asQuoteId("m:1");
    expect(merchantId === "m:1").toBe(true);
    expect(String(merchantId)).toBe("m:1");
    expect(JSON.stringify(merchantId)).toBe('"m:1"');
    expect(merchantId.length).toBe(3);
    expect(merchantId.trim()).toBe("m:1");
    expect(asMerchantId("m:1") === asMerchantId("m:1")).toBe(true);
    // Distinct compile-time brands over one runtime string stay strictly equal.
    const quoteIdAsPlainString: string = quoteId;
    expect(merchantId === quoteIdAsPlainString).toBe(true);
    expect(`${merchantId}|${quoteId}`).toBe("m:1|m:1");
  });
});
