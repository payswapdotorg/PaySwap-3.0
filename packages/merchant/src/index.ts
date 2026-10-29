/**
 * @payswap/merchant — the public barrel (P5-W3, lane R3-W3).
 *
 * Merchant checkout + crypto acceptance in ONE deterministic,
 * zero-dependency package: onboarding (fiat-denominated by default),
 * crypto acceptance activation (a narrowing statement, never
 * authority), checkout flows with quotes-as-observations and exact
 * bigint cross-multiplication, the wallet-payment path as a TYPED
 * INJECTION PORT with a HANDOFF-ONLY exit (money movement DELEGATED
 * through the pinned SettlementInstructionId typed reference — no
 * parallel engine), local work-item state machines ONLY (UNKNOWN
 * first-class, reconciliation the only ambiguity exit, evidence-
 * mandatory definitive outcomes), typed webhooks (evidence, never
 * authority), refunds only where the typed rail observation supports
 * them, settlement configuration as typed data, and the two
 * provider-verified Stripe paths (never conflated; a synthetic Stripe
 * balance effect is unconstructible).
 *
 * The barrel is the package's PUBLIC CONTRACT SURFACE (curated; the
 * internal helpers stay module-scoped and are importable from their
 * modules by the package's own tests — never by siblings). Zero
 * runtime dependencies; every cross-lane contract shape is a LOCAL
 * STRUCTURAL PIN (the leaf-in-flight law — the TL wires the types at
 * integration; never a value import).
 */

export const PACKAGE_NAME = "@payswap/merchant" as const;

/** The package's semantic version (mirrors package.json). */
export const PACKAGE_VERSION = "0.1.0" as const;

/** The work order + lane this rebuild delivers. */
export const WORK_ORDER_ID = "P5-W3" as const;
export const REBUILD_LANE = "R3-W3" as const;

// --- The pinned wire shapes (every external seam) -------------------------
export * from "./pins/index.ts";

// --- The deterministic backbone -------------------------------------------
export {
  stableStringify,
  canonicalJsonStringify,
  fnv1a64,
  canonicalDigest,
  deepFreeze,
  canonicallyEqual,
  LIMITS,
} from "./kernel.ts";
export { defineStateMachine } from "./kernel.ts";
export type { StateMachine, StateMachineDefinition, MachineTransition, MachineTransitionRecord } from "./kernel.ts";
export { ERROR_CLASSES, isMerchantError } from "./errors.ts";
export type { MerchantError, MerchantErrorShape, ErrorCategory, ErrorDetails, SecretViolation } from "./errors.ts";
export {
  asMerchantId,
  asMerchantPaymentIntentId,
  asMerchantPaymentAttemptId,
  asMerchantCheckoutSessionId,
  asCheckoutFlowId,
  asQuoteId,
  asCryptoAssetId,
  asChainId,
  asMerchantCryptoAcceptancePolicyId,
  asCryptoAcceptanceActivationId,
  asRefundId,
  asWebhookEventId,
  asSettlementInstructionId,
} from "./identifiers.ts";
export type { MerchantId, MerchantPaymentIntentId, MerchantPaymentAttemptId, MerchantCheckoutSessionId, CheckoutFlowId, QuoteId, CryptoAssetId, ChainId, MerchantCryptoAcceptancePolicyId, CryptoAcceptanceActivationId, RefundId, WebhookEventId } from "./identifiers.ts";

// --- The secret-boundary law (INV-19) --------------------------------------
export {
  FORBIDDEN_SECRET_KEY_SUBSTRINGS,
  FORBIDDEN_SECRET_KEY_EXACT,
  DERIVED_IDENTIFIER_KEY_FRAGMENTS,
  isRawKeyShape,
  isMnemonicShape,
  isProviderSecretKeyShape,
  isForbiddenKeyName,
  isDerivedIdentifierKey,
  scanForSecretMaterial,
  assertNoSecretMaterial,
  redactSecretShapedValues,
  REDACTION_MARKERS,
} from "./secrets.ts";
export type { NormalizeKeyName, FindForbiddenSecretKeys, SecretFree } from "./secrets.ts";

// --- The crypto family (assets, quotes, acceptance) ------------------------
export {
  defineCryptoAsset,
  defineCryptoAmount,
  addCryptoAmounts,
  subCryptoAmounts,
  compareCryptoAmounts,
  equalsCryptoAmount,
  isCryptoAmountPositive,
} from "./assets.ts";
export type { CryptoAsset, CryptoAmount, CryptoAssetKind } from "./assets.ts";
export {
  defineCryptoQuote,
  isQuoteExpired,
  canonicalCryptoQuote,
  cryptoQuoteHash,
  quoteValidityWindow,
  materialTermsFromQuote,
} from "./quotes.ts";
export type { CryptoQuote, ExactRatio } from "./quotes.ts";
export {
  defineCryptoAssetAcceptance,
  defineMerchantCryptoAcceptancePolicy,
  offeredAssets,
} from "./acceptance-policy.ts";
export type { CryptoAssetAcceptance, MerchantCryptoAcceptancePolicy, CryptoAcceptanceRequest, CryptoAcceptanceDecision, CryptoAcceptanceRejectionReason, ConfirmationPolicy } from "./acceptance-policy.ts";
export {
  matchesBaseAcceptance,
  matchesCryptoAcceptance,
  evaluateCryptoAcceptance,
  METHOD_KIND_VOCABULARY,
} from "./acceptance-evaluate.ts";

// --- The work-item machines (intent, attempt, session) ---------------------
export {
  merchantPaymentIntentStateMachine,
  defineMerchantPaymentIntent,
} from "./intent.ts";
export type { MerchantPaymentIntent, MerchantPaymentIntentState, MerchantPaymentIntentEvent, MerchantPaymentIntentMachineContext } from "./intent.ts";
export {
  merchantPaymentAttemptStateMachine,
  beginMerchantPaymentAttempt,
  submitMerchantPaymentAttempt,
  attachSubmission,
  attemptOutcome,
} from "./attempt.ts";
export {
  confirmMerchantPaymentAttemptSucceeded,
  confirmMerchantPaymentAttemptFailed,
  reportMerchantPaymentAttemptUnknown,
  resolveMerchantPaymentAttemptUnknown,
  abandonMerchantPaymentAttempt,
  attachSettlement,
  attachSettlementRoute,
  attachTranslation,
} from "./attempt-outcomes.ts";
export type { MerchantPaymentAttempt, MerchantPaymentAttemptState, MerchantPaymentAttemptEvent, MerchantPaymentAttemptMachineContext } from "./attempt.ts";
export {
  merchantCheckoutSessionStateMachine,
  openMerchantCheckoutSession,
  completeMerchantCheckoutSession,
  cancelMerchantCheckoutSession,
  expireMerchantCheckoutSession,
} from "./session.ts";
export type { MerchantCheckoutSession, MerchantCheckoutSessionState, MerchantCheckoutSessionEvent, MerchantCheckoutSessionMachineContext } from "./session.ts";

// --- Settlement routes + capabilities --------------------------------------
export {
  STRIPE_NATIVE_CRYPTO_SETTLEMENT_CAPABILITY_ID,
  PAYSWAP_EXTERNAL_CONVERSION_SETTLEMENT_CAPABILITY_ID,
  SETTLEMENT_ROUTE_FAMILIES,
  defineNativeStripeCryptoSettlementRoute,
  nativeStripeCryptoEligibility,
  defineExternalConversionSettlementRoute,
  isNativeStripeCryptoRoute,
  isExternalConversionRoute,
  assertRouteFamilyDiscriminated,
  recordStripeSettlementConfirmation,
  isProviderVerifiedStripeSettlement,
} from "./settlement-routes.ts";
export type { MerchantCryptoSettlementRoute, MerchantCryptoSettlementRouteFamily, NativeStripeCryptoSettlementRoute, ExternalConversionSettlementRoute, StripeSettlementConfirmation } from "./settlement-routes.ts";
export {
  PINNED_CORRIDOR_KES_RECEIVING_KIND,
  PINNED_CORRIDOR_KES_RECEIVING_CURRENCY,
  PINNED_CORRIDOR_KES_OFFRAMP_PAYOUT_METHOD,
  defineCorridorKesReceivingContext,
} from "./kes-receiving.ts";
export type { CorridorKesReceivingContext } from "./kes-receiving.ts";
export {
  validateMerchantCapabilityDescriptor,
  stripeNativeCryptoSettlementCapabilityDefinition,
  payswapExternalConversionSettlementCapabilityDefinition,
  nativeStripeCryptoEligibilityForRoute,
  settlementRouteCapabilityId,
  MERCHANT_CAPABILITY_KINDS,
} from "./capabilities.ts";
export type { MerchantCapabilityDescriptor, NativeStripeCryptoEligibilityView } from "./capabilities.ts";
export {
  assertConnectedInstance,
  connectedInstanceEligibilityReasons,
} from "./connectivity.ts";

// --- The merchant journey (onboarding, activation, checkout) ---------------
export {
  merchantOnboardingStateMachine,
  assertOnboardingNeverImpliesRailConnectivity,
  draftMerchant,
  submitMerchantApplication,
  verifyMerchant,
  activateMerchant,
  updateMerchantProfile,
  mayChangeCountry,
  merchantMayActivateCryptoAcceptance,
  CONNECTIVITY_IMPLYING_KEY_FRAGMENTS,
} from "./onboarding.ts";
export type { MerchantProfile, MerchantOnboardingState, MerchantOnboardingEvent, MerchantOnboardingMachineContext } from "./onboarding.ts";
export {
  activateCryptoAcceptance,
  deactivateCryptoAcceptance,
  acceptanceOfferView,
  activationMatches,
  activationEvaluate,
} from "./activation.ts";
export type { CryptoAcceptanceActivation, CryptoAcceptanceActivationState, AcceptanceActivationRejectionReason, AcceptanceOfferView } from "./activation.ts";
export {
  defineRailAssetBinding,
  findRailBinding,
} from "./checkout-support.ts";
export type { RailAssetBinding } from "./checkout-support.ts";
export {
  openCheckoutFlow,
  checkoutOption,
  isOptionExpired,
  deriveDisplayedCryptoAmount,
} from "./checkout.ts";
export type { CheckoutFlow, CheckoutPaymentOption, CustomerPaymentOption, FiatPaymentOption } from "./checkout.ts";
export { renderPaymentSummary, paymentSummaryDigest } from "./checkout-support.ts";
export type { PaymentSummaryInput } from "./checkout-support.ts";

// --- The wallet-payment path (the injection port, handoff-only) ------------
export {
  prepareCheckoutAuthorizationRequest,
  checkoutAuthorizationRequestHash,
  checkoutWriteDigest,
  buildCheckoutAuthorization,
  walletPaymentAuthorizationLineage,
} from "./authorization.ts";
export type { CheckoutAuthorizationRequest, CheckoutAuthorizationBundle, WalletAuthorizationLineage } from "./authorization.ts";
export {
  assertWalletPaymentPort,
  buildWalletPaymentHandoffRequest,
  performWalletPaymentHandoff,
  handoffReceiptObservation,
  WALLET_PAYMENT_PORT_METHODS,
  WALLET_PAYMENT_HANDOFF_STATES,
} from "./wallet-payment.ts";
export type { HandoffReceiptObservation } from "./wallet-payment.ts";

// --- The lifecycle, webhooks, refunds --------------------------------------
export {
  attachMethodToIntent,
  confirmIntentSubmission,
  submitWalletPaymentAttempt,
  abandonCheckoutAttempt,
  attachAttemptSettlementRoute,
  attachAttemptTranslation,
  attachAttemptSettlement,
  observeAttemptOutcome,
  recordAmbiguityEvidence,
  resolveAttemptUnknown,
  settleIntentOutcome,
  resolveIntentUnknown,
  attemptStatusView,
  attemptMayObserveOutcome,
} from "./lifecycle.ts";
export type { CheckoutPaymentAttempt, AttemptOutcomeObservation } from "./lifecycle.ts";
export {
  defineWebhookEvent,
  emptyWebhookInbox,
  processWebhookEvent,
  checkoutStatusView,
} from "./webhooks.ts";
export type { MerchantCheckoutWebhookEvent, MerchantCheckoutWebhookEventType, MerchantCheckoutWebhookPayload, WebhookInbox, WebhookProcessingResult, WebhookApplicationHandler, CheckoutStatusView } from "./webhooks.ts";
export {
  refundStateMachine,
  observeNativeStripeRefundSupport,
  observeExternalConversionRefundSupport,
  initiateRefund,
  submitRefund,
  observeRefundOutcome,
  resolveRefundUnknown,
  refundStatusView,
} from "./refunds.ts";
export type { RefundState, RefundEvent, RailRefundSupportObservation, RefundRecord, RefundInitiationResult, RefundOutcomeObservation } from "./refunds.ts";

// --- Settlement configuration + the two Stripe paths -----------------------
export {
  defineSettlementPolicy,
  recordStripeConnectionObservation,
  STRIPE_CONNECTION_LIFECYCLE_STEPS,
  settlementModeRouteFamily,
  routeFamilySettlementMode,
  settlementModeRouteCompilerMode,
  assertSettlementModeDiscriminated,
  MERCHANT_STRIPE_SETTLEMENT_MODES,
  ROUTE_COMPILER_SEAM_MODES,
} from "./settlement-config.ts";
export type { MerchantSettlementPolicy, MerchantSettlementSchedule, StripeConnectionLifecycleStep, MerchantStripeSettlementMode, LandedSettlementRouteFamily, MerchantSettlementModeConfig, NativeStripeModeConfig, PayswapExternalModeConfig, NativeModeInstanceBinding } from "./settlement-config.ts";
export {
  NATIVE_SETTLEMENT_UNAVAILABLE_NOTICE,
  observeStripeCryptoSettlementEligibility,
  selectSettlementRoute,
  settleConfirmedAttempt,
  isProviderVerifiedStripeSettlementRecord,
} from "./settlement-paths.ts";
export type { NativeUnavailableReason, NativeSettlementUnavailableNotice, SettlementRouteSelection, MerchantSettlementRecord, StripeCryptoSettlementEligibilityObservation } from "./settlement-paths.ts";

// --- The Stripe paths (typed, byte-verified, NO network) -------------------
export {
  STRIPE_API_BASE,
  STRIPE_API_VERSION,
  STRIPE_PROVIDER,
  STRIPE_CREDENTIAL_REF_KEY,
  STRIPE_RESOURCE_PATHS,
  STRIPE_TERMINAL_PAYMENT_INTENT_STATES,
  STRIPE_PAYMENT_INTENT_STATUS_MAPPING,
  stripeIdempotencyKey,
  buildStripeRequestDescriptor,
  assertStripeRequestDescriptor,
  stripeRequestIdentity,
  classifyStripePaymentIntentState,
  stripePaymentIntentIsTerminal,
} from "./stripe-paths.ts";

// --- The typed API surface -------------------------------------------------
export {
  dispatchMerchantCheckoutApi,
} from "./api-dispatch.ts";
export type { MerchantCheckoutApiContext, MerchantCheckoutApiRequest, MerchantCheckoutApiResponse, MerchantCheckoutApiDispatch, MerchantCheckoutTrustedDeps, ApiRequestBase } from "./api-contracts.ts";

// --- The journey evidence records -------------------------------------------
export {
  MERCHANT_EVIDENCE_LAW,
  MERCHANT_JOURNEY_STAGES,
  journeyRecordDigest,
  buildJourneyEvidence,
  journeyStagesFromState,
  buildJourneyEvidenceFile,
  verifyJourneyEvidenceFile,
} from "./evidence.ts";
export type { MerchantJourneyStage, MerchantJourneyRecord, MerchantJourneyEvidenceFile, JourneyStageRefs, JourneyEvidenceInputs, PortHandoffEvidenceEntry } from "./evidence.ts";
