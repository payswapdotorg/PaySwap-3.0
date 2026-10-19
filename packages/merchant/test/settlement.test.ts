import { describe, expect, it } from "vitest";
import{ defineCryptoQuote, defineSettlementPolicy, isProviderVerifiedStripeSettlementRecord, MERCHANT_STRIPE_SETTLEMENT_MODES, NATIVE_SETTLEMENT_UNAVAILABLE_NOTICE, observeAttemptOutcome, observeStripeCryptoSettlementEligibility, recordStripeConnectionObservation, ROUTE_COMPILER_SEAM_MODES, routeFamilySettlementMode, selectSettlementRoute, settleConfirmedAttempt, settlementModeRouteCompilerMode, settlementModeRouteFamily, STRIPE_CONNECTION_LIFECYCLE_STEPS, assertSettlementModeDiscriminated, submitWalletPaymentAttempt, walletPaymentAuthorizationLineage } from "../src/index.ts";
import type{ CheckoutPaymentAttempt, CryptoQuote, MerchantSettlementModeConfig, MerchantSettlementRecord, PinnedConnectedInstance, SettlementRouteSelection } from "../src/index.ts";
import { SettlementModeConflationError, SyntheticStripeBalanceError, ValidationError } from "../src/errors.ts";
import { DESTINATION, T60, USDC, USDC_ETH_BINDING, canonicalQuote, eur, usd } from "./fixtures.ts";
import { CATALOGUE_ENTRY, CONNECTED_INSTANCE, PENDING_INSTANCE, intentFixture } from "./journey-fixtures.ts";
import { authorizationBundleFixture, performSubmittedHandoffFixture } from "./port-fixtures.ts";

/**
 * The merchant SETTLEMENT CONFIG + PATHS suite (P5-W3, lane R3-W3; PORT
 * of old merchant-checkout/test/settlement.test.ts @ 8a735bf — 23
 * §3.8+§3.9 sites consolidated into 18 tests): settlement policy is
 * CONFIGURATION AS TYPED DATA; the Stripe connection is a lossless
 * provider-state envelope (INV-14); the mode vocabulary reconciles onto
 * the LANDED route families + the R3-W1 seam; every fallback carries
 * the mandated notice; settlement executes only on a CONFIRMED attempt
 * (native: provider-verified confirmation; external: protocol refs,
 * NEVER a Stripe balance reference). Per-test classification in the
 * worklog (Task ID 3-i).
 */

// An ACTIVE but DISQUALIFIED instance (typed over the pinned shape).
const INELIGIBLE_INSTANCE: PinnedConnectedInstance = Object.freeze({ ...CONNECTED_INSTANCE,
  instanceId: "instance.stripe.fixture.ineligible",
  eligibility: Object.freeze({ eligible: false, reasons: Object.freeze(["crypto-payments-not-enabled"]) }) });
const CONFIRM_AT = T60 + 60_000n;
const SETTLE_AT = T60 + 300_000n;
const INSTRUCTION = "settlement-instruction:3i.1";
const ATTEMPT_IDS = ["settlement-attempt:3i.1"];
const PINNED_NOTICE = "native merchant-balance settlement unavailable for this route";
type PolicyInput = Parameters<typeof defineSettlementPolicy>[0];
type ConnectionInput = Parameters<typeof recordStripeConnectionObservation>[0];
type SettleInput = Parameters<typeof settleConfirmedAttempt>[0];
type NativeSelection = Extract<SettlementRouteSelection, { readonly selected: "NATIVE_STRIPE_CRYPTO" }>;
type ExternalSelection = Extract<SettlementRouteSelection, { readonly selected: "PAYSWAP_EXTERNAL_SETTLEMENT" }>;

// Local fixtures (kept local to this file per the task mandate) --------------

function basePolicyInput(overrides: Partial<PolicyInput> = {}): PolicyInput {
  return { policyId: "sp:3i.1", merchantRef: "merchant.fixture.1", destinationId: DESTINATION.id,
    schedule: "WEEKLY", thresholdAmount: usd(100_000n), currencyDenomination: "USD", ...overrides };
}

function connectionObservationFixture(overrides: Partial<ConnectionInput> = {}): ReturnType<typeof recordStripeConnectionObservation> {
  return recordStripeConnectionObservation({
    stripeAccountRef: "acct_fixture_connection_1", revision: "rev:3i.1",
    rawState: { status: "restricted", requirements: ["past_due"] },
    lifecycleStep: "restrict", isTerminal: false, requiresCustomerAction: true,
    actionRequired: { kind: "past_due_documents", message: "Upload the outstanding documents" },
    observedAt: "2026-10-19T00:00:00Z", ...overrides,
  });
}
function externalSelectionInput() {
  return { destinationId: DESTINATION.id, destinationKind: DESTINATION.kind, destinationCurrency: DESTINATION.currency,
    externalRef: DESTINATION.externalRef, provenance: DESTINATION.provenance,
    conversionChain: ["cap.convert.usdc-usd", "cap.offramp.bank"] };
}

function nativeSelectionFixture(): SettlementRouteSelection {
  return selectSettlementRoute({ desiredMode: "NATIVE_STRIPE_CRYPTO",
    native: { connectedInstance: CONNECTED_INSTANCE, settlementCurrency: "USD", supportedAssets: [USDC.id],
      evidenceRefs: ["evidence:eligibility-3i-1"] }, external: externalSelectionInput() });
}
function externalSelectionFixture(): SettlementRouteSelection {
  return selectSettlementRoute({ desiredMode: "PAYSWAP_EXTERNAL_SETTLEMENT", external: externalSelectionInput() });
}

/** A probe confirmation input for one connected instance (evidence as given). */
function probeConfirmationInput(connectedInstanceId: string, evidenceIds: readonly string[]) {
  return {
    confirmationId: `confirmation:3i.${connectedInstanceId}`, connectedInstanceId,
    stripeBalanceTxRef: "txn:stripe-3i-x", amount: usd(10_000n), providerStateEnvelopeRef: "envelope:stripe-3i-x", evidenceIds };
}

function baseSettleInput(overrides: Partial<SettleInput> = {}): SettleInput {
  return {
    settlementId: "settlement:3i.1", attempt: confirmedAttemptJourney().confirmed, selection: nativeSelectionFixture(),
    confirmationInput: { confirmationId: "confirmation:3i.1", connectedInstanceId: CONNECTED_INSTANCE.instanceId,
      stripeBalanceTxRef: "txn:stripe-3i-1", amount: usd(10_000n), providerStateEnvelopeRef: "envelope:stripe-3i-1",
      evidenceIds: ["provider-evidence:stripe-3i-1"] },
    protocolInstructionId: INSTRUCTION, protocolSettlementAttemptIds: ATTEMPT_IDS, now: SETTLE_AT, ...overrides,
  };
}

function baseExternalSettleInput(): SettleInput {
  const { confirmationInput: _omitted, ...rest } = baseSettleInput({ selection: externalSelectionFixture() });
  return rest;
}

/** LANE NOTE: submitWalletPaymentAttempt requires chainRef === quote.chainId; the shared
 * fixtures split the two vocabularies, so this walk re-anchors the quote (old: one CHAIN_REF). */
function chainAlignedQuote(): CryptoQuote {
  const c = canonicalQuote();
  return defineCryptoQuote({ id: "quote.usdc.1.kernel-chain", assetId: c.assetId, chainId: USDC_ETH_BINDING.chainRef,
    fiatAmount: c.fiatAmount, cryptoAmount: c.cryptoAmount, ratio: c.ratio, fees: c.fees,
    quotedAt: c.quotedAt, validUntil: c.validUntil, sourceRef: c.sourceRef });
}

function confirmedAttemptJourney(): { readonly submitted: CheckoutPaymentAttempt; readonly confirmed: CheckoutPaymentAttempt } {
  const bundle = authorizationBundleFixture();
  const { receipt } = performSubmittedHandoffFixture("handoff.settlement.1");
  const authorization = walletPaymentAuthorizationLineage({ bundle, handoffReceipt: receipt });
  const submitted = submitWalletPaymentAttempt({ attemptId: "attempt:settlement.1", intent: intentFixture(),
    quote: chainAlignedQuote(), authorization, now: T60 });
  const confirmed = observeAttemptOutcome(submitted, { kind: "SUCCEEDED", evidenceIds: ["evidence:attempt-confirmation-3i-1"] }, CONFIRM_AT);
  return { submitted, confirmed };
}

describe("settlement policy + Stripe connection — configuration as typed data (§3.8)", () => {
  it("constructs a validated, frozen policy that is PURE DATA (no callback can turn it into an effect)", () => {
    const policy = defineSettlementPolicy(basePolicyInput());
    expect(policy.schedule).toBe("WEEKLY");
    expect(policy.thresholdAmount?.value).toBe(100_000n); expect(policy.thresholdAmount?.currency).toBe("USD");
    expect(Object.isFrozen(policy)).toBe(true);
    // Pure data: every member is a string or plain object — no functions at all:
    expect(Object.values(policy).every((value) => typeof value !== "function")).toBe(true);
    expect(Object.keys(policy).sort()).toEqual(
      ["currencyDenomination", "destinationId", "merchantRef", "policyId", "schedule", "thresholdAmount"]);
    // Without a threshold the policy carries no thresholdAmount key at all:
    const { thresholdAmount: _omitted, ...lean } = basePolicyInput();
    expect(Object.keys(defineSettlementPolicy(lean)).sort()).toEqual(
      ["currencyDenomination", "destinationId", "merchantRef", "policyId", "schedule"]);
  });

  it("validates schedules, currency denominations and thresholds fail-closed", () => {
    expect(() => defineSettlementPolicy(basePolicyInput({ schedule: "HOURLY" as never }))).toThrow(ValidationError);
    expect(() => defineSettlementPolicy(basePolicyInput({ policyId: "" }))).toThrow(ValidationError);
    // 3-letter UPPERCASE ISO-style codes only; the threshold must be exact
    // positive Money in the POLICY currency:
    expect(() => defineSettlementPolicy(basePolicyInput({ currencyDenomination: "usd" }))).toThrow(ValidationError);
    expect(() => defineSettlementPolicy(basePolicyInput({ currencyDenomination: "USDD" }))).toThrow(ValidationError);
    expect(() => defineSettlementPolicy(basePolicyInput({ thresholdAmount: eur(100_000n) }))).toThrow(ValidationError);
    expect(() => defineSettlementPolicy(basePolicyInput({ thresholdAmount: usd(0n) }))).toThrow(ValidationError);
    expect(() => defineSettlementPolicy(
      basePolicyInput({ thresholdAmount: { value: 100_000, currency: "USD" } as never }))).toThrow(ValidationError);
  });

  it("records a connect/onboard/verify/restrict observation losslessly (raw provider state VERBATIM)", () => {
    expect([...STRIPE_CONNECTION_LIFECYCLE_STEPS]).toEqual(["connect", "onboard", "verify", "restrict"]);
    const rawState = { status: "restricted", requirements: ["past_due"] };
    const envelope = connectionObservationFixture({ rawState });
    // INV-14: the raw provider state passes through VERBATIM — never flattened:
    expect(envelope.state).toBe(rawState);
    expect(envelope.classification.family).toBe("connected_account");
    expect(envelope.classification.lifecycleStep).toBe("restrict");
    expect(envelope.classification.isTerminal).toBe(false); expect(envelope.classification.requiresCustomerAction).toBe(true);
    expect(envelope.provider).toEqual({ name: "stripe", version: "1" });
    expect(envelope.object).toEqual({ objectType: "stripe.account", externalId: "acct_fixture_connection_1" });
    expect(envelope.revision).toBe("rev:3i.1"); expect(envelope.timestamps.observedAt).toBe("2026-10-19T00:00:00Z");
    expect(envelope.provenance.source).toBe("PROVIDER_API"); expect(Object.isFrozen(envelope)).toBe(true);
  });

  it("rejects undeclared lifecycle steps and empty provenance fields fail-closed", () => {
    const undeclaredStep = () => connectionObservationFixture({ lifecycleStep: "teleport" as never });
    expect(undeclaredStep).toThrow(ValidationError);
    expect(undeclaredStep).toThrow(/connect, onboard, verify, restrict/);
    expect(() => connectionObservationFixture({ stripeAccountRef: "" })).toThrow(ValidationError);
    expect(() => connectionObservationFixture({ revision: "" })).toThrow(ValidationError);
    const noObservedAt = () => connectionObservationFixture({ observedAt: "" });
    expect(noObservedAt).toThrow(ValidationError); expect(noObservedAt).toThrow(/observedAt/);
    expect(() => connectionObservationFixture({ actionRequired: { kind: "", message: "" } })).toThrow(ValidationError);
  });
});

describe("the mode reconciliation + eligibility observation (DOCUMENTED, never a silent renaming)", () => {
  it("maps each settlement mode onto the LANDED route-family literal (undeclared modes throw)", () => {
    expect([...MERCHANT_STRIPE_SETTLEMENT_MODES]).toEqual(["NATIVE_STRIPE_CRYPTO", "PAYSWAP_EXTERNAL_SETTLEMENT"]);
    expect(settlementModeRouteFamily("NATIVE_STRIPE_CRYPTO")).toBe("NATIVE_STRIPE_CRYPTO");
    expect(settlementModeRouteFamily("PAYSWAP_EXTERNAL_SETTLEMENT")).toBe("EXTERNAL_PAYSWAP_CONVERSION");
    expect(() => settlementModeRouteFamily("SOME_THIRD_MODE" as never)).toThrow(ValidationError);
  });

  it("round-trips the mapping both directions (route-family → mode → route-family)", () => {
    expect(routeFamilySettlementMode("NATIVE_STRIPE_CRYPTO")).toBe("NATIVE_STRIPE_CRYPTO");
    expect(routeFamilySettlementMode("EXTERNAL_PAYSWAP_CONVERSION")).toBe("PAYSWAP_EXTERNAL_SETTLEMENT");
    for (const mode of ["NATIVE_STRIPE_CRYPTO", "PAYSWAP_EXTERNAL_SETTLEMENT"] as const) {
      expect(routeFamilySettlementMode(settlementModeRouteFamily(mode))).toBe(mode);
    }
    expect(() => routeFamilySettlementMode("SOME_THIRD_FAMILY" as never)).toThrow(ValidationError);
  });

  it("reconciles onto the ACCEPTED R3-W1 route-compiler seam without renaming either side", () => {
    expect(settlementModeRouteCompilerMode("NATIVE_STRIPE_CRYPTO")).toBe("NATIVE_MERCHANT_SETTLEMENT");
    expect(settlementModeRouteCompilerMode("PAYSWAP_EXTERNAL_SETTLEMENT")).toBe("EXTERNAL_PAYSWAP_ROUTE");
    // The seam modes are pinned byte-identical; every reconciliation result is declared:
    expect([...ROUTE_COMPILER_SEAM_MODES]).toEqual(["NATIVE_MERCHANT_SETTLEMENT", "EXTERNAL_PAYSWAP_ROUTE"]);
    for (const mode of MERCHANT_STRIPE_SETTLEMENT_MODES) {
      expect((ROUTE_COMPILER_SEAM_MODES as readonly string[]).includes(settlementModeRouteCompilerMode(mode))).toBe(true);
    }
  });

  it("mode configs are DISJOINT both directions (anti-conflation)", () => {
    const nativeConfig: MerchantSettlementModeConfig = {
      mode: "NATIVE_STRIPE_CRYPTO", connectedInstanceId: CONNECTED_INSTANCE.instanceId,
      stripeAccountRef: CONNECTED_INSTANCE.accountRef, settlementCurrency: "USD",
    };
    const externalConfig: MerchantSettlementModeConfig = {
      mode: "PAYSWAP_EXTERNAL_SETTLEMENT", destinationId: DESTINATION.id,
      conversionChain: ["cap.convert.usdc-usd", "cap.offramp.bank"],
    };
    expect(() => assertSettlementModeDiscriminated(nativeConfig)).not.toThrow();
    expect(() => assertSettlementModeDiscriminated(externalConfig)).not.toThrow();
    // A native config must not carry the external fields (and vice versa):
    expect(() => assertSettlementModeDiscriminated({ ...nativeConfig, destinationId: DESTINATION.id })).toThrow(SettlementModeConflationError);
    expect(() => assertSettlementModeDiscriminated({ ...nativeConfig, conversionChain: ["cap:x"] })).toThrow(SettlementModeConflationError);
    expect(() => assertSettlementModeDiscriminated({ ...externalConfig, connectedInstanceId: "instance:x" })).toThrow(SettlementModeConflationError);
    expect(() => assertSettlementModeDiscriminated({ ...externalConfig, stripeAccountRef: "acct_x" })).toThrow(SettlementModeConflationError);
    expect(() => assertSettlementModeDiscriminated({ ...externalConfig, settlementCurrency: "USD" })).toThrow(SettlementModeConflationError);
    // The mode vocabulary is closed and the required fields are mandatory:
    expect(() => assertSettlementModeDiscriminated({ mode: "SOME_THIRD_MODE" })).toThrow(ValidationError);
    expect(() => assertSettlementModeDiscriminated({ ...nativeConfig, connectedInstanceId: "" })).toThrow(ValidationError);
    expect(() => assertSettlementModeDiscriminated({ ...externalConfig, destinationId: "" })).toThrow(ValidationError);
    expect(() => assertSettlementModeDiscriminated({ ...externalConfig, conversionChain: [] })).toThrow(ValidationError);
  });

  it("observes eligibility through the provider-verified landed view (in-scope currency)", () => {
    const observation = observeStripeCryptoSettlementEligibility({
      observationId: "elig-obs:3i.1", connectedInstance: CONNECTED_INSTANCE,
      settlementCurrency: "USD", supportedAssets: [USDC.id],
      evidenceRefs: ["evidence:eligibility-3i-1"], observedAt: T60,
    });
    expect(observation.instanceId).toBe(CONNECTED_INSTANCE.instanceId);
    expect(observation.eligible).toBe(true); expect(observation.reasons).toEqual([]);
    expect(observation.capabilityId).toBe("cap.merchant.stripe.native-crypto-settlement");
    expect(observation.evidenceRefs).toEqual(["evidence:eligibility-3i-1"]);
  });

  it("grounds the observation on the ACTUAL instance only; every failing axis FAILS CLOSED", () => {
    // INV-13: a catalogue entry can never ground the eligibility observation:
    const catalogue = () => observeStripeCryptoSettlementEligibility({
      observationId: "elig-obs:3i.cat",
      connectedInstance: CATALOGUE_ENTRY as unknown as PinnedConnectedInstance,
      settlementCurrency: "USD", supportedAssets: [USDC.id], evidenceRefs: ["evidence:x"], observedAt: T60,
    });
    expect(catalogue).toThrow(ValidationError); expect(catalogue).toThrow(/catalogue/);
    // Catalogue presence is never connection — the observation is evidence-mandatory:
    const bare = () => observeStripeCryptoSettlementEligibility({
      observationId: "elig-obs:3i.bare", connectedInstance: CONNECTED_INSTANCE,
      settlementCurrency: "USD", supportedAssets: [USDC.id], evidenceRefs: [], observedAt: T60,
    });
    expect(bare).toThrow(ValidationError); expect(bare).toThrow(/evidence/);
    // The observation derives through the provider-verified route constructor, so a
    // not-ACTIVE instance or an out-of-scope currency fails closed (the TYPED
    // reasons surface at decision time through selectSettlementRoute, below):
    expect(() => observeStripeCryptoSettlementEligibility({
      observationId: "elig-obs:3i.pending", connectedInstance: PENDING_INSTANCE,
      settlementCurrency: "USD", supportedAssets: [USDC.id], evidenceRefs: ["evidence:x"], observedAt: T60,
    })).toThrow(ValidationError);
    expect(() => observeStripeCryptoSettlementEligibility({
      observationId: "elig-obs:3i.jpy", connectedInstance: CONNECTED_INSTANCE,
      settlementCurrency: "JPY", supportedAssets: [USDC.id], evidenceRefs: ["evidence:x"], observedAt: T60,
    })).toThrow(ValidationError);
  });
});

describe("route selection + settlement execution (§3.9, the honest-unavailability law)", () => {
  it("an explicitly-external merchant selection carries the notice with its honest reason", () => {
    const selection = externalSelectionFixture();
    expect(selection.selected).toBe("PAYSWAP_EXTERNAL_SETTLEMENT");
    const external = selection as ExternalSelection;
    expect(external.nativeUnavailable.reason).toBe("MERCHANT_CONFIGURED_EXTERNAL");
    expect(external.nativeUnavailable.notice).toBe(NATIVE_SETTLEMENT_UNAVAILABLE_NOTICE);
    expect(external.nativeUnavailable.notice).toBe(PINNED_NOTICE);
    expect(external.route.routeFamily).toBe("EXTERNAL_PAYSWAP_CONVERSION");
    // The external destination is ALWAYS required (the honest fallback — fail-closed):
    expect(() => selectSettlementRoute({ desiredMode: "PAYSWAP_EXTERNAL_SETTLEMENT", external: undefined as never })).toThrow(ValidationError);
    // The desired mode must be declared:
    expect(() => selectSettlementRoute({ desiredMode: "SOME_THIRD_MODE" as never, external: externalSelectionInput() })).toThrow(ValidationError);
  });

  it("native mode with NO connected instance falls back with the pinned notice; a catalogue entry never grounds the selection", () => {
    const selection = selectSettlementRoute({ desiredMode: "NATIVE_STRIPE_CRYPTO", external: externalSelectionInput() });
    expect(selection.selected).toBe("PAYSWAP_EXTERNAL_SETTLEMENT");
    const fallback = selection as ExternalSelection;
    expect(fallback.nativeUnavailable.reason).toBe("NO_CONNECTED_INSTANCE");
    expect(fallback.nativeUnavailable.notice).toBe(NATIVE_SETTLEMENT_UNAVAILABLE_NOTICE);
    // INV-13: a catalogue entry can never ground the native selection:
    const catalogue = () => selectSettlementRoute({
      desiredMode: "NATIVE_STRIPE_CRYPTO",
      native: { connectedInstance: CATALOGUE_ENTRY as unknown as PinnedConnectedInstance,
        settlementCurrency: "USD", supportedAssets: [USDC.id], evidenceRefs: ["evidence:x"] },
      external: externalSelectionInput(),
    });
    expect(catalogue).toThrow(ValidationError); expect(catalogue).toThrow(/catalogue/);
  });

  it("every failing native axis falls back to EXTERNAL with its TYPED reason and the mandated notice", () => {
    const cases = [
      { instance: PENDING_INSTANCE, currency: "USD", reason: "AUTHORIZATION_NOT_ACTIVE" },
      { instance: INELIGIBLE_INSTANCE, currency: "USD", reason: "INSTANCE_NOT_ELIGIBLE" },
      { instance: CONNECTED_INSTANCE, currency: "JPY", reason: "SETTLEMENT_CURRENCY_NOT_IN_SCOPE" },
    ] as const;
    for (const axis of cases) {
      const selection = selectSettlementRoute({
        desiredMode: "NATIVE_STRIPE_CRYPTO",
        native: { connectedInstance: axis.instance, settlementCurrency: axis.currency,
          supportedAssets: [USDC.id], evidenceRefs: ["evidence:eligibility-3i-1"] },
        external: externalSelectionInput(),
      });
      expect(selection.selected).toBe("PAYSWAP_EXTERNAL_SETTLEMENT");
      const fallback = selection as ExternalSelection;
      expect(fallback.nativeUnavailable.reason).toBe(axis.reason);
      expect(fallback.nativeUnavailable.notice).toBe(PINNED_NOTICE);
      expect(fallback.route.routeFamily).toBe("EXTERNAL_PAYSWAP_CONVERSION");
    }
  });

  it("selects the NATIVE route when the actual connected instance is eligible (the eligibility view attached)", () => {
    const selection = nativeSelectionFixture();
    expect(selection.selected).toBe("NATIVE_STRIPE_CRYPTO");
    const native = selection as NativeSelection;
    expect(native.route.providerVerified).toBe(true);
    expect(native.route.connectedInstanceId).toBe(CONNECTED_INSTANCE.instanceId);
    // The stripeAccountRef defaults to the instance's account ref:
    expect(native.route.stripeAccountRef).toBe(CONNECTED_INSTANCE.accountRef);
    expect(native.route.settlementCurrency).toBe("USD"); expect(native.route.evidenceRefs).toEqual(["evidence:eligibility-3i-1"]);
    // The deterministic eligibility view travels with the selection:
    expect(native.eligibility.eligible).toBe(true); expect(native.eligibility.reasons).toEqual([]);
  });

  it("executes settlement only on a CONFIRMED attempt (lifecycle rules are the authority)", () => {
    const { submitted } = confirmedAttemptJourney();
    const refused = () => settleConfirmedAttempt(baseSettleInput({ attempt: submitted }));
    expect(refused).toThrow(ValidationError); expect(refused).toThrow(/CONFIRMED/);
    // The protocol settlement references are mandatory:
    expect(() => settleConfirmedAttempt(baseSettleInput({ protocolInstructionId: "" }))).toThrow(ValidationError);
    expect(() => settleConfirmedAttempt(baseSettleInput({ protocolSettlementAttemptIds: [] }))).toThrow(ValidationError);
  });

  it("settles a CONFIRMED attempt natively with the provider-verified confirmation + evidence, and attaches the linkage", () => {
    const { confirmed } = confirmedAttemptJourney();
    const settled = settleConfirmedAttempt(baseSettleInput({ attempt: confirmed }));
    const settlement = settled.settlement;
    expect(settlement.routeFamily).toBe("NATIVE_STRIPE_CRYPTO"); expect(settlement.settlementMode).toBe("NATIVE_STRIPE_CRYPTO");
    expect(settlement.attemptId).toBe(confirmed.attempt.id); expect(Object.isFrozen(settlement)).toBe(true);
    if (settlement.routeFamily !== "NATIVE_STRIPE_CRYPTO") throw new Error("native path expected");
    const nativeSettlement = settlement as Extract<MerchantSettlementRecord, { readonly routeFamily: "NATIVE_STRIPE_CRYPTO" }>;
    expect(nativeSettlement.confirmation.confirmedByProvider).toBe(true);
    expect(nativeSettlement.confirmation.stripeBalanceTxRef).toBe("txn:stripe-3i-1");
    // The record carries the provider's own evidence:
    expect(settlement.evidenceIds).toEqual(["provider-evidence:stripe-3i-1"]);
    // The provider-verified-effects law (true only for native + confirmedByProvider):
    expect(isProviderVerifiedStripeSettlementRecord(settlement)).toBe(true);
    const tampered: MerchantSettlementRecord = {
      ...nativeSettlement, confirmation: { ...nativeSettlement.confirmation, confirmedByProvider: false as never },
    };
    expect(isProviderVerifiedStripeSettlementRecord(tampered)).toBe(false);
    // The attempt carries the protocol settlement linkage (the delegation handle):
    expect(settled.attempt.attempt.settlementInstructionId).toBe(INSTRUCTION);
    expect(settled.attempt.attempt.settlementAttemptIds).toEqual(ATTEMPT_IDS);
    expect(confirmed.attempt.settlementInstructionId).toBeUndefined(); // input never rewritten
  });

  it("refuses native settlement without the provider-verified confirmation (missing, foreign instance, or evidence-less)", () => {
    const { confirmed } = confirmedAttemptJourney();
    const { confirmationInput: _omitted, ...withoutConfirmation } = baseSettleInput({ attempt: confirmed });
    const missing = () => settleConfirmedAttempt(withoutConfirmation);
    expect(missing).toThrow(ValidationError); expect(missing).toThrow(/provider-verified confirmation/);
    // A confirmation from a DIFFERENT connected instance than the selected route:
    const foreign = () => settleConfirmedAttempt(baseSettleInput({
      attempt: confirmed,
      confirmationInput: probeConfirmationInput("instance.stripe.fixture.foreign", ["provider-evidence:stripe-3i-x"]),
    }));
    expect(foreign).toThrow(ValidationError); expect(foreign).toThrow(/same connected instance/);
    // A confirmation without provider evidence would be a synthetic balance effect:
    const synthetic = () => settleConfirmedAttempt(baseSettleInput({
      attempt: confirmed,
      confirmationInput: probeConfirmationInput(CONNECTED_INSTANCE.instanceId, []),
    }));
    expect(synthetic).toThrow(SyntheticStripeBalanceError);
  });

  it("settles EXTERNALLY with the protocol settlement-instruction references and NEVER a Stripe balance", () => {
    const { confirmed } = confirmedAttemptJourney();
    // A native confirmation input is FORBIDDEN on the external path (disjointness):
    const conflation = () => settleConfirmedAttempt({
      ...baseExternalSettleInput(), attempt: confirmed,
      confirmationInput: probeConfirmationInput(CONNECTED_INSTANCE.instanceId, ["provider-evidence:stripe-3i-x"]),
    });
    expect(conflation).toThrow(SettlementModeConflationError);
    const settled = settleConfirmedAttempt({ ...baseExternalSettleInput(), attempt: confirmed });
    const settlement = settled.settlement;
    expect(settlement.routeFamily).toBe("EXTERNAL_PAYSWAP_CONVERSION"); expect(settlement.settlementMode).toBe("PAYSWAP_EXTERNAL_SETTLEMENT");
    if (settlement.routeFamily !== "EXTERNAL_PAYSWAP_CONVERSION") throw new Error("external path expected");
    const externalSettlement = settlement as Extract<MerchantSettlementRecord, { readonly routeFamily: "EXTERNAL_PAYSWAP_CONVERSION" }>;
    // The protocol settlement-instruction TYPED REFERENCES (delegated money movement):
    expect(externalSettlement.instructionId).toBe(INSTRUCTION);
    expect(externalSettlement.settlementAttemptIds).toEqual(ATTEMPT_IDS);
    expect(externalSettlement.destinationId).toBe(DESTINATION.id);
    expect(externalSettlement.evidenceIds).toEqual([`instruction:${INSTRUCTION}`, `settlement-attempt:${ATTEMPT_IDS[0]}`]);
    // Structurally: the external record carries NO Stripe balance reference at all:
    const keys = Object.keys(settlement).sort();
    expect(keys).not.toContain("confirmation"); expect(keys).not.toContain("stripeBalanceTxRef");
    expect(keys).toContain("instructionId"); expect(isProviderVerifiedStripeSettlementRecord(settlement)).toBe(false);
    // The attempt still gets the settlement linkage attached:
    expect(settled.attempt.attempt.settlementInstructionId).toBe(INSTRUCTION);
    expect(settled.attempt.attempt.settlementAttemptIds).toEqual(ATTEMPT_IDS);
  });
});
