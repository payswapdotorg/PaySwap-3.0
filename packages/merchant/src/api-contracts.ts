/**
 * @payswap/merchant — the typed API-surface contracts (P5-W3, lane
 * R3-W3; PORT+ADAPT of old
 * packages/merchant-checkout/src/api.ts contract half @ 8a735bf: the
 * trusted deps are now the INJECTION PORT + the customer-facing
 * authorization bundle — money movement delegated, handoff-only).
 *
 * The merchant + customer journeys modeled as typed request/response
 * contracts over ONE dispatch function (api-dispatch.ts). Every
 * handler composes the REAL package functions — there are no mocks of
 * this package's own code anywhere: the dispatch walks the same
 * functions the direct tests walk.
 *
 * Deterministic only: every request carries its own `now`; the
 * trusted-surface wallet port is an INJECTED dependency (money
 * movement executes at the host's trusted surface, never here).
 */

import type { PinnedMoney, PinnedTimestampMs } from "./pins/protocol.ts";
import type { PinnedWalletPaymentExecutionPort } from "./pins/wallet-payment.ts";
import type {
  PinnedAcceptanceRequest,
  PinnedMerchantSettlementDestination,
  PinnedPaymentAcceptancePolicy,
  PinnedPaymentMethodTranslation,
  PinnedRecoursePolicyKind,
} from "./pins/payment.ts";
import type { PinnedConnectedInstance } from "./pins/capability.ts";
import type { MerchantProfile } from "./onboarding.ts";
import type { CryptoAcceptanceActivation, AcceptanceOfferView } from "./activation.ts";
import type { CheckoutFlow, CheckoutPaymentOption } from "./checkout.ts";
import type { RailAssetBinding } from "./checkout-support.ts";
import type { CryptoQuote } from "./quotes.ts";
import type { CryptoAssetAcceptance } from "./acceptance-policy.ts";
import type {
  CheckoutAuthorizationBundle,
  WalletAuthorizationLineage,
} from "./authorization.ts";
import type {
  CheckoutPaymentAttempt,
  AttemptOutcomeObservation,
} from "./lifecycle.ts";
import type { MerchantPaymentIntent } from "./intent.ts";
import type {
  MerchantCheckoutWebhookEvent,
  WebhookInbox,
  WebhookProcessingResult,
} from "./webhooks.ts";
import type {
  RailRefundSupportObservation,
  RefundInitiationResult,
  RefundRecord,
  RefundOutcomeObservation,
} from "./refunds.ts";
import type {
  MerchantSettlementModeConfig,
  MerchantStripeSettlementMode,
} from "./settlement-config.ts";
import type {
  MerchantSettlementRecord,
  SettlementRouteSelection,
} from "./settlement-paths.ts";
import type { PinnedSettlementInstructionId } from "./pins/protocol.ts";

/** The merchant-checkout session state the API operates over. */
export interface MerchantCheckoutApiContext {
  readonly profile?: MerchantProfile;
  readonly activation?: CryptoAcceptanceActivation;
  readonly flow?: CheckoutFlow;
  /** The evolving intent record (state machine transitions return new records). */
  readonly intent?: MerchantPaymentIntent;
  readonly bundle?: CheckoutAuthorizationBundle;
  /** The wallet payment authorization minted at the trusted surface (lineage + the option paid + the settlement-instruction reference). */
  readonly authorization?: {
    readonly lineage: WalletAuthorizationLineage;
    readonly option: CheckoutPaymentOption;
    readonly settlementInstructionId: PinnedSettlementInstructionId;
  };
  readonly attempt?: CheckoutPaymentAttempt;
  readonly inbox: WebhookInbox;
  readonly refund?: RefundRecord;
  readonly settlement?: MerchantSettlementRecord;
}

/** The injected trusted-surface dependencies (never implemented here). */
export interface MerchantCheckoutTrustedDeps {
  /**
   * THE WALLET-PAYMENT INJECTION PORT: the host's trusted-surface
   * wallet layer. Money movement is DELEGATED through this port's
   * ONE method (`handoff`) — the HANDOFF-ONLY exit; this package
   * never signs, never broadcasts, never settles.
   */
  readonly walletPort: PinnedWalletPaymentExecutionPort;
}

/** The base request envelope: every request carries its own instant. */
export interface ApiRequestBase {
  readonly now: PinnedTimestampMs;
}

// ---------------------------------------------------------------------------
// Requests (the merchant + customer journeys)
// ---------------------------------------------------------------------------

export type MerchantCheckoutApiRequest =
  // --- merchant journey ---
  | (ApiRequestBase & {
      readonly kind: "merchant/onboarding.draft";
      readonly input: {
        readonly id: string;
        readonly businessName: string;
        readonly country: string;
        readonly pricingCurrency: string;
        readonly supportContact?: string;
      };
    })
  | (ApiRequestBase & {
      readonly kind: "merchant/onboarding.submit";
    })
  | (ApiRequestBase & {
      readonly kind: "merchant/onboarding.verify";
      readonly verificationRef: string;
    })
  | (ApiRequestBase & {
      readonly kind: "merchant/onboarding.activate";
      readonly settlementDestination: PinnedMerchantSettlementDestination;
    })
  | (ApiRequestBase & {
      readonly kind: "merchant/onboarding.update";
      readonly businessName?: string;
      readonly supportContact?: string;
    })
  | (ApiRequestBase & {
      readonly kind: "merchant/acceptance.activate";
      readonly policyInput: {
        readonly id: string;
        readonly merchantRef: string;
        readonly basePolicyId: string;
        readonly assets: readonly CryptoAssetAcceptance[];
        readonly quoteValidityMs: bigint;
      };
      readonly basePolicy: PinnedPaymentAcceptancePolicy;
    })
  | (ApiRequestBase & {
      readonly kind: "merchant/acceptance.deactivate";
      readonly reason: string;
    })
  // --- customer journey ---
  | (ApiRequestBase & {
      readonly kind: "checkout/session.open";
      readonly flowId: string;
      readonly basePolicy: PinnedPaymentAcceptancePolicy;
      readonly cart: { readonly amount: PinnedMoney };
      readonly quotes: readonly CryptoQuote[];
      readonly railBindings: readonly RailAssetBinding[];
      readonly expiresAt: PinnedTimestampMs;
    })
  | (ApiRequestBase & {
      readonly kind: "checkout/option.prepare";
      readonly optionId: string;
      readonly customerWalletAddress: string;
      readonly destinationAddress: string;
      readonly requestId: string;
      readonly requestedBy: string;
      /** The protocol-owned settlement instruction the settlement leg executes under. */
      readonly settlementInstructionId: string;
      readonly handoffId: string;
    })
  | (ApiRequestBase & {
      readonly kind: "payment/attempt.submit";
      readonly attemptId: string;
    })
  | (ApiRequestBase & {
      readonly kind: "payment/attempt.observe";
      readonly observation: AttemptOutcomeObservation;
    })
  | (ApiRequestBase & {
      readonly kind: "payment/attempt.resolve";
      readonly resolution: import("./pins/protocol.ts").PinnedUnknownOutcomeResolution;
    })
  | (ApiRequestBase & {
      readonly kind: "webhook/event.process";
      readonly event: MerchantCheckoutWebhookEvent;
      handler(event: MerchantCheckoutWebhookEvent): void;
    })
  | (ApiRequestBase & {
      readonly kind: "refund/initiate";
      readonly refundId: string;
      readonly amount: PinnedMoney;
      readonly railSupport: RailRefundSupportObservation;
      readonly destinationRef: string;
      readonly recourse: PinnedRecoursePolicyKind;
    })
  | (ApiRequestBase & {
      readonly kind: "refund/observe";
      readonly observation: RefundOutcomeObservation;
    })
  | (ApiRequestBase & {
      readonly kind: "settlement/route.select";
      readonly desiredMode: MerchantStripeSettlementMode;
      readonly native?: {
        readonly connectedInstance: PinnedConnectedInstance;
        readonly stripeAccountRef?: string;
        readonly settlementCurrency: string;
        readonly supportedAssets: readonly string[];
        readonly evidenceRefs: readonly string[];
      };
      readonly external: {
        readonly destinationId: string;
        readonly destinationKind: string;
        readonly destinationCurrency: string;
        readonly externalRef: string;
        readonly provenance: { readonly source: string; readonly reference: string; readonly recordedAt: bigint };
        readonly conversionChain: readonly string[];
      };
      readonly modeConfig: MerchantSettlementModeConfig;
    })
  | (ApiRequestBase & {
      readonly kind: "settlement/attempt.settle";
      readonly settlementId: string;
      readonly selection: SettlementRouteSelection;
      readonly confirmationInput?: {
        readonly confirmationId: string;
        readonly connectedInstanceId: string;
        readonly stripeBalanceTxRef: string;
        readonly amount: PinnedMoney;
        readonly providerStateEnvelopeRef: string;
        readonly evidenceIds: readonly string[];
      };
      readonly protocolInstructionId: string;
      readonly protocolSettlementAttemptIds: readonly string[];
    })
  | (ApiRequestBase & { readonly kind: "status/view" });

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

/** The response envelope: typed success payload or a fail-closed error. */
export type MerchantCheckoutApiResponse =
  | { readonly kind: "merchant/onboarding"; readonly profile: MerchantProfile }
  | { readonly kind: "merchant/acceptance"; readonly activation: CryptoAcceptanceActivation; readonly offerView: AcceptanceOfferView }
  | { readonly kind: "checkout/session.open"; readonly flow: CheckoutFlow; readonly optionIds: readonly string[] }
  | {
      readonly kind: "checkout/option.prepare";
      readonly status: "PREPARED";
      readonly option: CheckoutPaymentOption;
      readonly bundle: CheckoutAuthorizationBundle;
    }
  | {
      readonly kind: "checkout/option.prepare";
      readonly status: "HANDOFF_REFUSED";
      readonly optionId: string;
      readonly reason: string;
    }
  | {
      readonly kind: "checkout/option.prepare";
      readonly status: "HANDOFF_OUTCOME_UNKNOWN";
      readonly optionId: string;
      readonly evidenceIds: readonly string[];
    }
  | {
      readonly kind: "payment/attempt";
      readonly attempt: CheckoutPaymentAttempt;
      readonly intent: MerchantPaymentIntent;
    }
  | { readonly kind: "webhook/event.process"; readonly result: WebhookProcessingResult }
  | { readonly kind: "refund/initiate"; readonly initiation: RefundInitiationResult }
  | { readonly kind: "refund/observe"; readonly refund: RefundRecord }
  | { readonly kind: "settlement/route.select"; readonly selection: SettlementRouteSelection }
  | { readonly kind: "settlement/attempt.settle"; readonly settlement: MerchantSettlementRecord }
  | {
      readonly kind: "status/view";
      readonly profile?: MerchantProfile;
      readonly activation?: CryptoAcceptanceActivation;
      readonly flow?: CheckoutFlow;
      readonly intent?: MerchantPaymentIntent;
      readonly attempt?: CheckoutPaymentAttempt;
      readonly refund?: RefundRecord;
      readonly settlement?: MerchantSettlementRecord;
      readonly inbox: WebhookInbox;
    };

/** The dispatch result: the updated context plus the typed response. */
export interface MerchantCheckoutApiDispatch {
  readonly context: MerchantCheckoutApiContext;
  readonly response: MerchantCheckoutApiResponse;
}

/** A pinned payment-method translation attachment (the observe response payload twin). */
export type { PinnedPaymentMethodTranslation } from "./pins/payment.ts";

/** The pinned acceptance request (the customer journey's base-plane input). */
export type { PinnedAcceptanceRequest } from "./pins/payment.ts";
