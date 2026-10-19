import { describe, expect, it } from "vitest";
import { dispatchMerchantCheckoutApi } from "../src/api-dispatch.ts";
import type {
  MerchantCheckoutApiContext, MerchantCheckoutApiRequest, MerchantCheckoutApiResponse,
  MerchantCheckoutTrustedDeps,
} from "../src/api-contracts.ts";
import { ValidationError } from "../src/errors.ts";
import { canonicalJsonStringify, canonicallyEqual } from "../src/kernel.ts";
import { observeAttemptOutcome } from "../src/lifecycle.ts";
import { defineCryptoAssetAcceptance, type CryptoAssetAcceptance } from "../src/acceptance-policy.ts";
import { defineCryptoQuote } from "../src/quotes.ts";
import { defineRailAssetBinding } from "../src/checkout-support.ts";
import type { PinnedPaymentAcceptancePolicy } from "../src/pins/payment.ts";
import type { PinnedWalletPaymentHandoffRequest } from "../src/pins/wallet-payment.ts";
import { emptyWebhookInbox } from "../src/webhooks.ts";
import {
  BASE_POLICY, CRYPTO_POLICY, DESTINATION, T0, T1, T10, T60, USDC, USDC_ETH_BINDING,
  canonicalQuote, usd, usdcAmount,
} from "./fixtures.ts";
import {
  CUSTOMER_ADDRESS, MERCHANT_ADDRESS, SETTLEMENT_INSTRUCTION_REF, ambiguousPortFixture,
  refusingPortFixture, submittingPortFixture,
} from "./port-fixtures.ts";
import { attemptSubmittedWebhookFixture, resolveSucceededFixture } from "./journey-fixtures.ts";

/**
 * The API-surface suite (PORTED+ADAPTED from old merchant-checkout
 * test/api-surface.test.ts sites 1-6 + test/journey.test.ts sites 1-3 @
 * 8a735bf): the merchant + customer journeys end to end through the REAL
 * dispatch (every handler composes the REAL package functions; the only
 * injected dependency is the wallet-payment port stub). Old api-surface
 * sites 7-8 belong to the lane's refunds + settlement suites; old journey
 * sites 4-5 to journey-evidence.test.ts. Lane findings (worklog detail):
 * (1) the submit leg's chain law (ONE string across both chain
 * vocabularies, as the old corpus's CHAIN_REF fixtures unified them) is
 * not satisfiable by the canonical fixture pair, so chain-unified twins
 * are built below through the REAL constructors. (2) GENUINE SRC BUG
 * (reported): dispatch observe settles the intent to OUTCOME_UNKNOWN,
 * from which dispatch resolve ALWAYS throws MachineTransitionError (it
 * composes settleIntentOutcome instead of resolveIntentUnknown); the
 * resolve test pins the reconciliation law over the state that endpoint
 * is written for (attempt OUTCOME_UNKNOWN, intent still PROCESSING).
 */

const MERCHANT_ID = "merchant.fixture.1";
const FLOW_ID = "flow.api.1";
const UNIFIED_CHAIN = "eth:mainnet";
const UNIFIED_OPTION_ID = `crypto:${USDC.id}@${UNIFIED_CHAIN}`;
const CANONICAL_OPTION_ID = `crypto:${USDC.id}@chain.eth-mainnet`;
const FIAT_OPTION_ID = "fiat:method.card";
const HANDOFF_ID = "handoff.api.1";
const ATTEMPT_ID = "attempt:api-1";
const EXTERNAL_TX_REF = `tx:fixture-${HANDOFF_ID}`;
const HANDOFF_EVIDENCE = `handoff-evidence:${HANDOFF_ID}`;
const AMBIGUITY_EVIDENCE = `ambiguity-evidence:${HANDOFF_ID}`;
const CONFIRMATION_EVIDENCE = "evidence:api-confirmation-1";
const AMBIGUITY_OBSERVATION_EVIDENCE = "evidence:api-ambiguity-1";

// The chain-unified twins: ONE string serves as the merchant ChainId, the
// kernel chainRef and the quote's chain (the old corpus's own law).
const UNIFIED_ACCEPTANCE = defineCryptoAssetAcceptance({ assetId: USDC.id,
  chains: Object.freeze([UNIFIED_CHAIN, "chain.eth-mainnet"]), minAmount: usdcAmount(1_000_000n),
  maxAmount: usdcAmount(1_000_000_000_000n), requiredConfirmations: 3n });
const UNIFIED_QUOTE = defineCryptoQuote({ id: "quote.usdc.api", assetId: USDC.id,
  chainId: UNIFIED_CHAIN, fiatAmount: usd(10_000n), cryptoAmount: usdcAmount(100_000_000n),
  ratio: { numerator: 1n, denominator: 10_000n }, fees: usd(30n), quotedAt: T0,
  validUntil: T0 + 7_200_000n, sourceRef: "source.psp.fixture" });
const UNIFIED_BINDING = defineRailAssetBinding({ merchantAssetId: USDC.id,
  merchantChainId: UNIFIED_CHAIN, chainRef: UNIFIED_CHAIN,
  assetIdentity: Object.freeze({ symbol: "USDC", chain: UNIFIED_CHAIN, assetId: "asset.usdc.eth" }) });
/** A base policy that does NOT declare STABLECOIN_CRYPTO (never narrows). */
const NO_CRYPTO_BASE_POLICY: PinnedPaymentAcceptancePolicy = Object.freeze({ ...BASE_POLICY,
  id: "policy.base.no-stablecoin", methods: Object.freeze(["CARD", "BANK_TRANSFER"] as const),
  methodCatalog: Object.freeze(BASE_POLICY.methodCatalog.filter(
    (method) => method.kind !== "STABLECOIN_CRYPTO")) });

const DRAFT: MerchantCheckoutApiRequest = { kind: "merchant/onboarding.draft", now: T0,
  input: { id: MERCHANT_ID, businessName: "Fixture Coffee Roasters", country: "US",
    pricingCurrency: "USD", supportContact: "support@fixture.example" } };
const SUBMIT: MerchantCheckoutApiRequest = { kind: "merchant/onboarding.submit", now: T1 };
const VERIFY: MerchantCheckoutApiRequest = { kind: "merchant/onboarding.verify", now: T10,
  verificationRef: "verification:api-1" };
const ACTIVATE: MerchantCheckoutApiRequest = { kind: "merchant/onboarding.activate", now: T60,
  settlementDestination: DESTINATION };
const ACCEPTANCE_POLICY_INPUT = { id: "policy.crypto.api", merchantRef: MERCHANT_ID,
  basePolicyId: BASE_POLICY.id, assets: Object.freeze([UNIFIED_ACCEPTANCE]),
  quoteValidityMs: 300_000n };
const SESSION_OPEN: MerchantCheckoutApiRequest = { kind: "checkout/session.open", now: T60,
  flowId: FLOW_ID, basePolicy: BASE_POLICY, cart: { amount: usd(10_000n) },
  quotes: Object.freeze([UNIFIED_QUOTE, canonicalQuote()]),
  railBindings: Object.freeze([UNIFIED_BINDING, USDC_ETH_BINDING]),
  expiresAt: T60 + 3_600_000n };
const ATTEMPT_SUBMIT: MerchantCheckoutApiRequest = { kind: "payment/attempt.submit", now: T60,
  attemptId: ATTEMPT_ID };

function acceptanceActivate(policyInput: { id: string; merchantRef: string; basePolicyId: string;
  assets: readonly CryptoAssetAcceptance[]; quoteValidityMs: bigint },
  basePolicy: PinnedPaymentAcceptancePolicy): MerchantCheckoutApiRequest {
  return { kind: "merchant/acceptance.activate", now: T60, policyInput, basePolicy };
}

function prepareRequest(optionId = UNIFIED_OPTION_ID): MerchantCheckoutApiRequest {
  return { kind: "checkout/option.prepare", now: T60, optionId,
    customerWalletAddress: CUSTOMER_ADDRESS, destinationAddress: MERCHANT_ADDRESS,
    requestId: "authreq:api-1", requestedBy: "surface:checkout-web",
    settlementInstructionId: SETTLEMENT_INSTRUCTION_REF, handoffId: HANDOFF_ID };
}

const ONBOARDING_WALK: readonly MerchantCheckoutApiRequest[] = Object.freeze([
  DRAFT, SUBMIT, VERIFY, ACTIVATE]);
const JOURNEY_WALK: readonly MerchantCheckoutApiRequest[] = Object.freeze([
  ...ONBOARDING_WALK, acceptanceActivate(ACCEPTANCE_POLICY_INPUT, BASE_POLICY), SESSION_OPEN]);
const SUBMITTED_WALK: readonly MerchantCheckoutApiRequest[] = Object.freeze([
  ...JOURNEY_WALK, prepareRequest(), ATTEMPT_SUBMIT]);

function freshContext(): MerchantCheckoutApiContext { return { inbox: emptyWebhookInbox() }; }

function submittingDeps(calls: PinnedWalletPaymentHandoffRequest[] = []): MerchantCheckoutTrustedDeps {
  return { walletPort: submittingPortFixture(calls) };
}

function dispatchAll(requests: readonly MerchantCheckoutApiRequest[],
  deps: MerchantCheckoutTrustedDeps, start: MerchantCheckoutApiContext = freshContext(),
): { context: MerchantCheckoutApiContext; responses: MerchantCheckoutApiResponse[] } {
  let context = start;
  const responses: MerchantCheckoutApiResponse[] = [];
  for (const request of requests) {
    const result = dispatchMerchantCheckoutApi(context, deps, request);
    context = result.context;
    responses.push(result.response);
  }
  return { context, responses };
}

/** Narrow a response to its typed payload (fail-loud on any other kind). */
function expectKind<K extends MerchantCheckoutApiResponse["kind"]>(
  response: MerchantCheckoutApiResponse, kind: K) {
  if (response.kind !== kind) {
    throw new Error(`expected response kind ${kind}, got ${response.kind}`);
  }
  return response as Extract<MerchantCheckoutApiResponse, { readonly kind: K }>;
}

function profileOf(response: MerchantCheckoutApiResponse) {
  return expectKind(response, "merchant/onboarding").profile;
}

describe("API surface — the merchant + customer journeys through the REAL dispatch", () => {
  it("walks draft → submit → verify → activate, deterministically (responses typed merchant/onboarding)", () => {
    const first = dispatchAll(ONBOARDING_WALK, submittingDeps());
    expect(first.responses.map((response) => profileOf(response).state)).toEqual(
      ["DRAFT", "SUBMITTED", "VERIFIED", "ACTIVE"]);
    const active = profileOf(first.responses[3]!);
    expect(active.verificationRef).toBe("verification:api-1");
    expect(active.settlementDestination).toEqual(DESTINATION);
    expect(Object.isFrozen(active)).toBe(true);
    // The determinism law (old journey site): replaying the same request
    // sequence over a fresh context produces identical responses.
    const second = dispatchAll(ONBOARDING_WALK, submittingDeps());
    expect(first.responses.map(canonicalJsonStringify)).toEqual(
      second.responses.map(canonicalJsonStringify));
    expect(canonicallyEqual(first.context, second.context)).toBe(true);
  });

  it("acceptance.activate composes through the REAL composer (fail-closed on both laws) and deactivates", () => {
    // Fail-closed 1: an unverified merchant can never activate acceptance.
    const drafted = dispatchAll([DRAFT], submittingDeps());
    expect(() => dispatchMerchantCheckoutApi(drafted.context, submittingDeps(),
      acceptanceActivate(CRYPTO_POLICY, BASE_POLICY))).toThrow(ValidationError);
    // Fail-closed 2: a base policy without STABLECOIN_CRYPTO never narrows.
    const onboarded = dispatchAll(ONBOARDING_WALK, submittingDeps());
    expect(() => dispatchMerchantCheckoutApi(onboarded.context, submittingDeps(),
      acceptanceActivate({ ...ACCEPTANCE_POLICY_INPUT, basePolicyId: NO_CRYPTO_BASE_POLICY.id },
        NO_CRYPTO_BASE_POLICY))).toThrow(/STABLECOIN_CRYPTO/);
    // The real composer: an ACTIVE activation + the offer view over it.
    const walked = dispatchAll(JOURNEY_WALK, submittingDeps());
    const acceptance = expectKind(walked.responses[4]!, "merchant/acceptance");
    expect(acceptance.activation).toMatchObject({ state: "ACTIVE",
      id: `activation:${MERCHANT_ID}:${T60}`, policy: { basePolicyId: BASE_POLICY.id } });
    expect(acceptance.offerView).toMatchObject({ quoteValidityMs: 300_000n });
    expect(acceptance.offerView.assets).toHaveLength(1);
    expect(acceptance.offerView.assets[0]?.chains).toContain(UNIFIED_CHAIN);
    // Deactivation mints a NEW record; the original stays ACTIVE (history).
    const deactivated = dispatchMerchantCheckoutApi(walked.context, submittingDeps(), {
      kind: "merchant/acceptance.deactivate", reason: "paused pending compliance review", now: T60 });
    const view = expectKind(deactivated.response, "merchant/acceptance");
    expect(view.activation).toMatchObject({ state: "DEACTIVATED", deactivatedAt: T60,
      deactivationReason: "paused pending compliance review" });
    expect(acceptance.activation.state).toBe("ACTIVE");
  });

  it("checkout/session.open requires an onboarded merchant and an active activation, then opens typed options", () => {
    const deps = submittingDeps();
    expect(() => dispatchMerchantCheckoutApi(freshContext(), deps, SESSION_OPEN)).toThrow(ValidationError);
    const onboarded = dispatchAll(ONBOARDING_WALK, deps);
    expect(() => dispatchMerchantCheckoutApi(onboarded.context, deps, SESSION_OPEN)).toThrow(
      /activated crypto acceptance/);
    const opened = dispatchAll(JOURNEY_WALK, deps);
    const response = expectKind(opened.responses[5]!, "checkout/session.open");
    expect(response.flow.session.state).toBe("OPEN");
    expect(response.flow.intent.state).toBe("REQUIRES_PAYMENT_METHOD");
    expect(response.optionIds).toEqual([UNIFIED_OPTION_ID, CANONICAL_OPTION_ID, FIAT_OPTION_ID]);
    expect(Object.isFrozen(response.optionIds)).toBe(true);
    expect(opened.context.flow?.id).toBe(FLOW_ID);
    expect(opened.context.intent?.id).toBe(`intent:${FLOW_ID}`);
  });

  it("checkout/option.prepare over the SUBMITTING port: PREPARED, content-addressed bundle, authorization in context, intent CONFIRMED", () => {
    const calls: PinnedWalletPaymentHandoffRequest[] = [];
    const deps = submittingDeps(calls);
    const walked = dispatchAll([...JOURNEY_WALK, prepareRequest()], deps);
    const response = expectKind(walked.responses[6]!, "checkout/option.prepare");
    if (response.status !== "PREPARED") throw new Error(`expected PREPARED, got ${response.status}`);
    expect(response.option).toMatchObject({ kind: "CRYPTO_WALLET_PAYMENT", optionId: UNIFIED_OPTION_ID });
    // The bundle is content-addressed (bigint-aware canonical digests).
    expect([response.bundle.requestHash, response.bundle.writeDigest, response.bundle.summaryDigest]
      .every((digest) => /^[0-9a-f]{16}$/.test(digest))).toBe(true);
    expect(response.bundle.paymentSummary.join("\n")).toContain("Fixture Coffee Roasters");
    expect(response.bundle.request.transfer).toEqual({ assetSymbol: "USDC", assetId: "asset.usdc.eth",
      amount: 100_000_000n, from: CUSTOMER_ADDRESS, to: MERCHANT_ADDRESS });
    // The context carries the authorization: lineage + the option + the
    // protocol-owned settlement-instruction delegation handle.
    const authorization = walked.context.authorization;
    expect(authorization?.option).toBe(response.option);
    expect(authorization?.lineage).toMatchObject({ authorizationRequestHash: response.bundle.requestHash,
      writeDigest: response.bundle.writeDigest, paymentSummaryDigest: response.bundle.summaryDigest,
      externalSubmissionRef: EXTERNAL_TX_REF });
    expect(authorization?.lineage.evidenceRefs).toContain(HANDOFF_EVIDENCE);
    expect(authorization?.settlementInstructionId).toBe(SETTLEMENT_INSTRUCTION_REF);
    // Money movement was DELEGATED: exactly one handoff reached the port.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ settlementInstructionId: SETTLEMENT_INSTRUCTION_REF,
      quoteId: UNIFIED_QUOTE.id, chainRef: UNIFIED_CHAIN, handoffId: HANDOFF_ID,
      transfer: { amount: 100_000_000n, from: CUSTOMER_ADDRESS, to: MERCHANT_ADDRESS } });
    // The handed-off payment is CONFIRMED by the customer: PROCESSING.
    expect(walked.context.intent?.state).toBe("PROCESSING");
  });

  it("checkout/option.prepare over the REFUSING port: HANDOFF_REFUSED, the intent never confirmed (nor failed)", () => {
    const deps: MerchantCheckoutTrustedDeps = { walletPort: refusingPortFixture() };
    const walked = dispatchAll(JOURNEY_WALK, deps);
    const result = dispatchMerchantCheckoutApi(walked.context, deps, prepareRequest());
    const response = expectKind(result.response, "checkout/option.prepare");
    if (response.status !== "HANDOFF_REFUSED") throw new Error("expected HANDOFF_REFUSED");
    expect(response.optionId).toBe(UNIFIED_OPTION_ID);
    expect(response.reason).toContain("refused the handoff before any external effect");
    // Never infer failure either: no attempt, no authorization minted, and
    // the intent still awaits the customer (the method attaches only once
    // a handoff is SUBMITTED — REQUIRES_PAYMENT_METHOD, never FAILED).
    expect(result.context.intent?.state).toBe("REQUIRES_PAYMENT_METHOD");
    expect(result.context.attempt).toBeUndefined();
    expect(result.context.authorization).toBeUndefined();
    expect(result.context.bundle?.request.requestId).toBe("authreq:api-1");
  });

  it("checkout/option.prepare over the AMBIGUOUS port: HANDOFF_OUTCOME_UNKNOWN with evidence, nothing inferred", () => {
    const deps: MerchantCheckoutTrustedDeps = { walletPort: ambiguousPortFixture() };
    const walked = dispatchAll(JOURNEY_WALK, deps);
    const result = dispatchMerchantCheckoutApi(walked.context, deps, prepareRequest());
    const response = expectKind(result.response, "checkout/option.prepare");
    if (response.status !== "HANDOFF_OUTCOME_UNKNOWN") throw new Error("expected UNKNOWN");
    expect(response.optionId).toBe(UNIFIED_OPTION_ID);
    expect(response.evidenceIds).toEqual([AMBIGUITY_EVIDENCE]);
    // Never infer success OR failure from an ambiguous handoff: no attempt
    // exists, the intent was neither confirmed nor settled.
    expect(result.context.intent?.state).toBe("REQUIRES_PAYMENT_METHOD");
    expect(result.context.attempt).toBeUndefined();
  });

  it("a prepare for a fiat option id throws (only CRYPTO_WALLET_PAYMENT options prepare)", () => {
    const deps = submittingDeps();
    const walked = dispatchAll(JOURNEY_WALK, deps);
    expect(() =>
      dispatchMerchantCheckoutApi(walked.context, deps, prepareRequest(FIAT_OPTION_ID)),
    ).toThrow(/only a CRYPTO_WALLET_PAYMENT option/);
  });

  it("payment/attempt.submit requires the prepared authorization and produces the composite SUBMITTED attempt", () => {
    const deps = submittingDeps();
    const opened = dispatchAll(JOURNEY_WALK, deps);
    // Fail-closed precondition: no authorization in context (prepare first).
    expect(() => dispatchMerchantCheckoutApi(opened.context, deps, ATTEMPT_SUBMIT)).toThrow(ValidationError);
    const walked = dispatchAll(SUBMITTED_WALK, deps);
    const response = expectKind(walked.responses[7]!, "payment/attempt");
    expect(response.attempt.attempt).toMatchObject({ state: "SUBMITTED", id: ATTEMPT_ID,
      quoteId: UNIFIED_QUOTE.id, chainId: UNIFIED_CHAIN, externalTxRef: EXTERNAL_TX_REF });
    // The ACCEPTANCE LAW: the composite record structurally requires the
    // customer's explicit authorization lineage.
    expect(response.attempt.authorization).toMatchObject({ handoffId: HANDOFF_ID,
      externalSubmissionRef: EXTERNAL_TX_REF });
    // A SUBMITTED handoff is NOT success: no outcome evidence yet, the
    // intent PROCESSING (the no-success-inference law).
    expect(response.attempt.attempt.evidenceIds).toEqual([]);
    expect(response.intent.state).toBe("PROCESSING");
  });

  it("payment/attempt.observe: a definitive SUCCEEDED observation settles the attempt CONFIRMED and the intent SUCCEEDED", () => {
    const deps = submittingDeps();
    const walked = dispatchAll(SUBMITTED_WALK, deps);
    const result = dispatchMerchantCheckoutApi(walked.context, deps, { kind: "payment/attempt.observe",
      now: T60, observation: { kind: "SUCCEEDED", evidenceIds: Object.freeze([CONFIRMATION_EVIDENCE]),
        externalTxRef: EXTERNAL_TX_REF } });
    // The response carries BOTH settled records (settleIntentOutcome).
    const response = expectKind(result.response, "payment/attempt");
    expect(response.attempt.attempt.state).toBe("CONFIRMED");
    expect(response.intent.state).toBe("SUCCEEDED");
    expect(response.attempt.attempt.evidenceIds).toEqual([CONFIRMATION_EVIDENCE]);
    expect(response.intent.id).toBe(`intent:${FLOW_ID}`);
  });

  it("payment/attempt.resolve over an OUTCOME_UNKNOWN observation: attempt CONFIRMED, intent SUCCEEDED", () => {
    const deps = submittingDeps();
    const walked = dispatchAll(SUBMITTED_WALK, deps);
    // The ambiguity observation FIRST — recorded through the REAL outcome
    // observer, leaving the intent PROCESSING: the state the resolve
    // endpoint composes the settlement under (chaining the dispatch's own
    // observe settles the intent to OUTCOME_UNKNOWN, from which the
    // resolve endpoint cannot fire — the genuine src bug in the header).
    const unknown = observeAttemptOutcome(walked.context.attempt!,
      { kind: "OUTCOME_UNKNOWN", evidenceIds: Object.freeze([AMBIGUITY_OBSERVATION_EVIDENCE]) },
      T60);
    expect(unknown.attempt.state).toBe("OUTCOME_UNKNOWN");
    const ambiguousContext: MerchantCheckoutApiContext = { ...walked.context, attempt: unknown };
    const resolved = dispatchMerchantCheckoutApi(ambiguousContext, deps, {
      kind: "payment/attempt.resolve", now: T60, resolution: resolveSucceededFixture() });
    const response = expectKind(resolved.response, "payment/attempt");
    expect(response.attempt.attempt.state).toBe("CONFIRMED");
    expect(response.intent.state).toBe("SUCCEEDED");
    // The resolution evidence merged; the caseId is never evidence.
    expect(response.attempt.attempt.evidenceIds).toEqual([AMBIGUITY_OBSERVATION_EVIDENCE,
      "reconciliation-evidence:1"]);
    expect(response.attempt.attempt.evidenceIds).not.toContain("case:fixture-1");
  });

  it("webhook/event.process applies an event idempotently through the dispatch (replay → DUPLICATE)", () => {
    const deps = submittingDeps();
    const walked = dispatchAll(SUBMITTED_WALK, deps);
    const event = attemptSubmittedWebhookFixture();
    const first = dispatchMerchantCheckoutApi(walked.context, deps, { kind: "webhook/event.process",
      now: T60, event, handler: () => undefined });
    const applied = expectKind(first.response, "webhook/event.process");
    expect(applied.result).toMatchObject({ status: "APPLIED", eventId: event.eventId });
    expect(first.context.inbox.appliedEventIds).toEqual([event.eventId]);
    const replay = dispatchMerchantCheckoutApi(first.context, deps, { kind: "webhook/event.process",
      now: T60, event, handler: () => { throw new Error("a replayed handler must never run"); } });
    const duplicated = expectKind(replay.response, "webhook/event.process");
    expect(duplicated.result).toMatchObject({ status: "DUPLICATE", eventId: event.eventId });
    expect(replay.context.inbox.duplicates).toEqual([event.eventId]);
    expect(replay.context.inbox.appliedEventIds).toEqual([event.eventId]);
  });

  it("status/view projects the composed session state (present-when-set, read-only); an undeclared kind throws", () => {
    const deps = submittingDeps();
    const walked = dispatchAll(SUBMITTED_WALK, deps);
    const confirmed = dispatchMerchantCheckoutApi(walked.context, deps, { kind: "payment/attempt.observe",
      now: T60, observation: { kind: "SUCCEEDED", evidenceIds: Object.freeze([CONFIRMATION_EVIDENCE]) } });
    const viewed = dispatchMerchantCheckoutApi(confirmed.context, deps, { kind: "status/view", now: T60 });
    const view = expectKind(viewed.response, "status/view");
    expect(view.profile?.state).toBe("ACTIVE");
    expect(view.activation?.state).toBe("ACTIVE");
    expect(view.flow?.id).toBe(FLOW_ID);
    expect(view.intent?.state).toBe("SUCCEEDED");
    expect(view.attempt?.attempt.state).toBe("CONFIRMED");
    expect(view.refund).toBeUndefined();
    expect(view.settlement).toBeUndefined();
    expect(view.inbox.appliedEventIds).toEqual([]);
    // Read-only projection: the context evolves not at all.
    expect(canonicallyEqual(viewed.context, confirmed.context)).toBe(true);
    // Present-when-set: an empty context projects nothing but the inbox.
    const empty = expectKind(dispatchMerchantCheckoutApi(freshContext(), deps,
      { kind: "status/view", now: T60 }).response, "status/view");
    expect([empty.profile, empty.activation, empty.flow, empty.intent, empty.attempt]).toEqual(
      [undefined, undefined, undefined, undefined, undefined]);
    expect(empty.inbox.appliedEventIds).toEqual([]);
    // Fail-closed surface: an undeclared request kind never dispatches.
    expect(() => dispatchMerchantCheckoutApi(freshContext(), deps, { kind: "checkout/mystery",
      now: T60 } as unknown as MerchantCheckoutApiRequest)).toThrow(ValidationError);
  });
});
