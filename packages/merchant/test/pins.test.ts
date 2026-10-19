import { describe, expect, it } from "vitest";
import {
  PINNED_EXECUTION_MODES,
  PINNED_EXECUTION_MODE_VOCABULARY_VERSION,
  PINNED_SETTLEMENT_ATTEMPT_STATES,
  PINNED_SETTLEMENT_ATTEMPT_EVENTS,
  PINNED_SETTLEMENT_ATTEMPT_TRANSITIONS,
  PINNED_SETTLEMENT_ATTEMPT_TERMINAL_STATES,
  PINNED_SETTLEMENT_INSTRUCTION_ID_MAX_LENGTH,
  pinnedSettlementInstructionIdIsShaped,
  PINNED_MERCHANT_SETTLEMENT_AUTHORITY,
  PINNED_MERCHANT_SETTLEMENT_MODES,
  PINNED_MERCHANT_NATIVE_SETTLEMENT_UNAVAILABLE_NOTICE,
  PINNED_PAYMENT_METHOD_KINDS,
  PINNED_RECOURSE_POLICY_KINDS,
  PINNED_ACCEPTANCE_REJECTION_REASONS,
  PINNED_STRIPE_DEFAULT_API_BASE,
  PINNED_STRIPE_API_VERSION,
  PINNED_STRIPE_PROVIDER_NAME,
  PINNED_STRIPE_RESOURCE_PATHS,
  PINNED_STRIPE_PAYMENT_INTENT_STATUS_MAPPING,
  PINNED_STRIPE_TERMINAL_PAYMENT_INTENT_STATES,
  pinnedStripeIdempotencyKey,
  pinnedStripeKeyKindOf,
  PINNED_WALLET_PAYMENT_PORT_METHODS,
  PINNED_WALLET_PAYMENT_HANDOFF_STATES,
  pinnedWalletPaymentPortIsShaped,
} from "../src/index.ts";

/**
 * The cross-lane PIN CONSISTENCY suite (NET-NEW): every pinned wire
 * shape is asserted byte-identical against its AUTHORITY's law so the
 * two sides of each seam can never drift silently. The pins name their
 * authorities in src/pins/*.ts; this suite is the machine check.
 */

describe("pins: the capability-lane seam (execution modes, CREDITED)", () => {
  it("the execution-mode vocabulary is pinned byte-identical (members and order)", () => {
    expect([...PINNED_EXECUTION_MODES]).toEqual([
      "PASS_THROUGH_NATIVE",
      "COMPOSED_PAYSWAP",
      "OPTIMIZED_MULTI_PROVIDER",
    ]);
  });

  it("the execution-mode vocabulary version is pinned '1.0.0' (stale vocabularies are detectable)", () => {
    expect(PINNED_EXECUTION_MODE_VOCABULARY_VERSION).toBe("1.0.0");
  });

  it("INV-15 baseline discipline: the vocabulary assigns no priority (frozen, PASS_THROUGH_NATIVE never disadvantaged)", () => {
    expect(Object.isFrozen(PINNED_EXECUTION_MODES)).toBe(true);
    expect(PINNED_EXECUTION_MODES.indexOf("PASS_THROUGH_NATIVE")).toBe(0);
  });
});

describe("pins: the protocol-lane seam (the pinned money lifecycle)", () => {
  it("the settlement-attempt states are pinned byte-identical", () => {
    expect([...PINNED_SETTLEMENT_ATTEMPT_STATES]).toEqual([
      "PENDING",
      "IN_FLIGHT",
      "OUTCOME_UNKNOWN",
      "SUCCEEDED",
      "FAILED",
    ]);
  });

  it("the settlement-attempt transitions pin the INV-04 law: OUTCOME_UNKNOWN exits ONLY through reconciliation", () => {
    const unknownExits = PINNED_SETTLEMENT_ATTEMPT_TRANSITIONS.filter(
      (rule) => rule.from === "OUTCOME_UNKNOWN",
    );
    expect(unknownExits.map((rule) => rule.on)).toEqual([
      "RECONCILE_RESOLVED_SUCCEEDED",
      "RECONCILE_RESOLVED_FAILED",
    ]);
    const intoUnknown = PINNED_SETTLEMENT_ATTEMPT_TRANSITIONS.filter(
      (rule) => rule.to === "OUTCOME_UNKNOWN",
    );
    expect(intoUnknown.map((rule) => `${rule.from}--${rule.on}`)).toEqual([
      "IN_FLIGHT--OUTCOME_UNKNOWN",
    ]);
  });

  it("the settlement-attempt terminal states are pinned (SUCCEEDED/FAILED only — monotonic)", () => {
    expect([...PINNED_SETTLEMENT_ATTEMPT_TERMINAL_STATES]).toEqual(["SUCCEEDED", "FAILED"]);
    expect([...PINNED_SETTLEMENT_ATTEMPT_EVENTS]).toContain("START");
  });

  it("the SettlementInstructionId shape law is pinned (non-empty, <=256, no surrounding whitespace)", () => {
    expect(PINNED_SETTLEMENT_INSTRUCTION_ID_MAX_LENGTH).toBe(256);
    expect(pinnedSettlementInstructionIdIsShaped("si:1")).toBe(true);
    expect(pinnedSettlementInstructionIdIsShaped("")).toBe(false);
    expect(pinnedSettlementInstructionIdIsShaped(" si:1")).toBe(false);
    expect(pinnedSettlementInstructionIdIsShaped("si:1 ")).toBe(false);
    expect(pinnedSettlementInstructionIdIsShaped("x".repeat(257))).toBe(false);
    expect(pinnedSettlementInstructionIdIsShaped(42)).toBe(false);
  });
});

describe("pins: the payment-plane seam (frozen vocabularies)", () => {
  it("the FROZEN §6A method kinds are pinned byte-identical (10 members)", () => {
    expect([...PINNED_PAYMENT_METHOD_KINDS]).toEqual([
      "CARD",
      "BANK_TRANSFER",
      "ACH_EFT",
      "INSTANT_PAYMENT",
      "MOBILE_MONEY",
      "WALLET",
      "STABLECOIN_CRYPTO",
      "VIRTUAL_CARD",
      "BNPL_CREDIT",
      "CHECK_CASH_EXTERNAL",
    ]);
  });

  it("the recourse policy kinds are pinned byte-identical (4 members)", () => {
    expect([...PINNED_RECOURSE_POLICY_KINDS]).toEqual([
      "NONE",
      "CHARGEBACK_ONLY",
      "MERCHANT_DISPUTE_WINDOW",
      "ESCROW_PROTECTED",
    ]);
    expect([...PINNED_ACCEPTANCE_REJECTION_REASONS]).toContain("METHOD_NOT_IN_CATALOG");
  });
});

describe("pins: the ACCEPTED R3-W1 route-compiler seam (byte-identical)", () => {
  it("the merchant settlement authority marker is 'P5-W3' (this lane is the awaiting authority)", () => {
    expect(PINNED_MERCHANT_SETTLEMENT_AUTHORITY).toBe("P5-W3");
  });

  it("the route-compiler settlement modes and the verbatim honest notice are pinned byte-identical", () => {
    expect([...PINNED_MERCHANT_SETTLEMENT_MODES]).toEqual([
      "NATIVE_MERCHANT_SETTLEMENT",
      "EXTERNAL_PAYSWAP_ROUTE",
    ]);
    expect(PINNED_MERCHANT_NATIVE_SETTLEMENT_UNAVAILABLE_NOTICE).toBe(
      "native merchant-balance settlement unavailable for this route",
    );
  });
});

describe("pins: the Stripe PSP surface (byte-verified vs old rails/adapters evidence)", () => {
  it("the provider identity constants are byte-identical (base, version, provider)", () => {
    expect(PINNED_STRIPE_PROVIDER_NAME).toBe("stripe");
    expect(PINNED_STRIPE_DEFAULT_API_BASE).toBe("https://api.stripe.com");
    expect(PINNED_STRIPE_API_VERSION).toBe("2025-08-27.basil");
  });

  it("the merchant-relevant resource paths are byte-identical to the old rail evidence", () => {
    expect(PINNED_STRIPE_RESOURCE_PATHS.account).toBe("/v1/account");
    expect(PINNED_STRIPE_RESOURCE_PATHS.balance).toBe("/v1/balance");
    expect(PINNED_STRIPE_RESOURCE_PATHS.payouts).toBe("/v1/payouts");
    expect(PINNED_STRIPE_RESOURCE_PATHS.charges).toBe("/v1/charges");
    expect(PINNED_STRIPE_RESOURCE_PATHS.paymentIntents).toBe("/v1/payment_intents");
    expect(PINNED_STRIPE_RESOURCE_PATHS.paymentIntentConfirm).toBe(
      "/v1/payment_intents/{id}/confirm",
    );
    expect(PINNED_STRIPE_RESOURCE_PATHS.paymentIntentCapture).toBe(
      "/v1/payment_intents/{id}/capture",
    );
    expect(PINNED_STRIPE_RESOURCE_PATHS.paymentIntentCancel).toBe(
      "/v1/payment_intents/{id}/cancel",
    );
    expect(PINNED_STRIPE_RESOURCE_PATHS.refunds).toBe("/v1/refunds");
    expect(PINNED_STRIPE_RESOURCE_PATHS.disputes).toBe("/v1/disputes");
    expect(PINNED_STRIPE_RESOURCE_PATHS.balanceTransactions).toBe("/v1/balance_transactions");
  });

  it("the PaymentIntent status mapping rows are byte-identical (7 provider states, terminal set derived)", () => {
    expect(PINNED_STRIPE_PAYMENT_INTENT_STATUS_MAPPING.map((row) => row.providerState)).toEqual([
      "requires_payment_method",
      "requires_confirmation",
      "requires_action",
      "processing",
      "requires_capture",
      "succeeded",
      "canceled",
    ]);
    expect([...PINNED_STRIPE_TERMINAL_PAYMENT_INTENT_STATES]).toEqual([
      "succeeded",
      "canceled",
    ]);
    const processing = PINNED_STRIPE_PAYMENT_INTENT_STATUS_MAPPING.find(
      (row) => row.providerState === "processing",
    );
    expect(processing?.family).toBe("async_processing");
    expect(processing?.isTerminal).toBe(false);
  });

  it("the idempotency-key derivation law is byte-identical (payswap: namespace, deterministic)", () => {
    expect(pinnedStripeIdempotencyKey("op-1")).toBe("payswap:op-1");
    expect(pinnedStripeIdempotencyKey("op-1")).toBe(pinnedStripeIdempotencyKey("op-1"));
    expect(() => pinnedStripeIdempotencyKey("")).toThrow();
  });

  it("the key-kind shapes flag sk_/rk_/whsec_ and NEVER a publishable key or public address", () => {
    expect(pinnedStripeKeyKindOf("sk_live_" + "A".repeat(24))).toBe("SECRET_KEY");
    expect(pinnedStripeKeyKindOf("sk_test_" + "B".repeat(24))).toBe("SECRET_KEY");
    expect(pinnedStripeKeyKindOf("rk_live_" + "C".repeat(24))).toBe("RESTRICTED_KEY");
    expect(pinnedStripeKeyKindOf("rk_test_" + "D".repeat(24))).toBe("RESTRICTED_KEY");
    expect(pinnedStripeKeyKindOf("whsec_" + "E".repeat(24))).toBe("WEBHOOK_SIGNING_SECRET");
    // publishable keys are public by design — never flagged as secrets
    expect(pinnedStripeKeyKindOf("pk_live_" + "F".repeat(24))).toBe("PUBLISHABLE_KEY");
    // public addresses and provider object ids are not keys
    expect(pinnedStripeKeyKindOf("0x1111111111111111111111111111111111111111")).toBeUndefined();
    expect(pinnedStripeKeyKindOf("pi_fixture_0001")).toBeUndefined();
    expect(pinnedStripeKeyKindOf("")).toBeUndefined();
  });
});

describe("pins: the wallet-payment DELEGATION seam (handoff-only)", () => {
  it("the port method vocabulary is EXACTLY ['handoff'] — the handoff-only exit", () => {
    expect([...PINNED_WALLET_PAYMENT_PORT_METHODS]).toEqual(["handoff"]);
  });

  it("the handoff-state vocabulary is pinned (SUBMITTED/REFUSED/OUTCOME_UNKNOWN)", () => {
    expect([...PINNED_WALLET_PAYMENT_HANDOFF_STATES]).toEqual([
      "SUBMITTED",
      "REFUSED",
      "OUTCOME_UNKNOWN",
    ]);
  });

  it("the port shape law: a handoff-only object passes; extra function members fail", () => {
    const legal = { handoff: () => ({}) };
    expect(pinnedWalletPaymentPortIsShaped(legal)).toBe(true);
    const illegal = { handoff: () => ({}), settle: () => ({}), broadcast: () => ({}) };
    expect(pinnedWalletPaymentPortIsShaped(illegal)).toBe(false);
    const missing = { execute: () => ({}) };
    expect(pinnedWalletPaymentPortIsShaped(missing)).toBe(false);
    expect(pinnedWalletPaymentPortIsShaped(null)).toBe(false);
  });
});
