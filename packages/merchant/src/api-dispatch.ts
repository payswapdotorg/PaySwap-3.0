/**
 * @payswap/merchant — the typed API dispatch (P5-W3, lane R3-W3;
 * PORT+ADAPT of the old dispatch half @ 8a735bf): the wallet-payment
 * leg walks the INJECTION PORT — build the authorization bundle, hand
 * off through the port's ONE method, mint the lineage from the
 * evidence-bearing receipt, and ONLY then confirm the intent (a
 * REFUSED/OUTCOME_UNKNOWN handoff never confirms anything).
 */

import { ValidationError } from "./errors.ts";
import { checkoutOption } from "./checkout.ts";
import type { CustomerPaymentOption } from "./checkout.ts";
import { buildCheckoutAuthorization } from "./authorization.ts";
import { walletPaymentAuthorizationLineage } from "./authorization.ts";
import{ buildWalletPaymentHandoffRequest, handoffReceiptObservation, performWalletPaymentHandoff } from "./wallet-payment.ts";
import { asSettlementInstructionId } from "./identifiers.ts";
import{ activateCryptoAcceptance, acceptanceOfferView, deactivateCryptoAcceptance } from "./activation.ts";
import{ activateMerchant, draftMerchant, submitMerchantApplication, updateMerchantProfile, verifyMerchant } from "./onboarding.ts";
import { openCheckoutFlow } from "./checkout.ts";
import{ attachMethodToIntent, confirmIntentSubmission, observeAttemptOutcome, resolveAttemptUnknown, settleIntentOutcome, submitWalletPaymentAttempt } from "./lifecycle.ts";
import { initiateRefund, observeRefundOutcome } from "./refunds.ts";
import { selectSettlementRoute, settleConfirmedAttempt } from "./settlement-paths.ts";
import { emptyWebhookInbox, processWebhookEvent } from "./webhooks.ts";
import type{ MerchantCheckoutApiContext, MerchantCheckoutApiDispatch, MerchantCheckoutApiRequest, MerchantCheckoutApiResponse, MerchantCheckoutTrustedDeps } from "./api-contracts.ts";

function requireProfile(context: MerchantCheckoutApiContext) {
  const profile = context.profile;
  if (profile === undefined) {
    throw new ValidationError("the operation requires an onboarded merchant (no profile in context)");
  }
  return profile;
}

function requireActivation(c: MerchantCheckoutApiContext) {
  const a = c.activation;
  if (a === undefined) throw new ValidationError("the operation requires an activated crypto acceptance");
  return a;
}

function requireFlow(context: MerchantCheckoutApiContext) {
  const flow = context.flow;
  if (flow === undefined)     throw new ValidationError("the operation requires an open checkout flow");
  return flow;
}

function requireIntent(context: MerchantCheckoutApiContext) {
  const intent = context.intent;
  if (intent === undefined) {
    throw new ValidationError("the operation requires the checkout flow's intent in context");
  }
  return intent;
}

/**
 * Dispatch one typed API request over the session context. Every branch
 * composes the REAL package functions; the context evolves functionally
 * (new frozen records). Fail-closed on precondition violations.
 */
export function dispatchMerchantCheckoutApi(
  context: MerchantCheckoutApiContext,
  deps: MerchantCheckoutTrustedDeps,
  request: MerchantCheckoutApiRequest,
): MerchantCheckoutApiDispatch {
  const inbox = context.inbox ?? emptyWebhookInbox();
  const base: MerchantCheckoutApiContext = { ...context, inbox };

  switch (request.kind) {
    case "merchant/onboarding.draft": {
      const profile = draftMerchant({ ...request.input, now: request.now });
      return { context: { ...base, profile }, response: { kind: "merchant/onboarding", profile } };
    }
    case "merchant/onboarding.submit": {
      const profile = submitMerchantApplication(requireProfile(base), request.now);
      return { context: { ...base, profile }, response: { kind: "merchant/onboarding", profile } };
    }
    case "merchant/onboarding.verify": {
      const profile = verifyMerchant(requireProfile(base), {
        verificationRef: request.verificationRef,
        now: request.now,
      });
      return { context: { ...base, profile }, response: { kind: "merchant/onboarding", profile } };
    }
    case "merchant/onboarding.activate": {
      const profile = activateMerchant(requireProfile(base), {
        settlementDestination: request.settlementDestination,
        now: request.now,
      });
      return { context: { ...base, profile }, response: { kind: "merchant/onboarding", profile } };
    }
    case "merchant/onboarding.update": {
      const profile = updateMerchantProfile(requireProfile(base), {
        ...(request.businessName !== undefined ? { businessName: request.businessName } : {}),
        ...(request.supportContact !== undefined ? { supportContact: request.supportContact } : {}),
        now: request.now,
      });
      return { context: { ...base, profile }, response: { kind: "merchant/onboarding", profile } };
    }
    case "merchant/acceptance.activate": {
      const activation = activateCryptoAcceptance({
        id: `activation:${requireProfile(base).id}:${request.now}`,
        merchant: requireProfile(base),
        policyInput: request.policyInput,
        basePolicy: request.basePolicy,
        now: request.now,
      });
      return {
        context: { ...base, activation },
        response: {
          kind: "merchant/acceptance",
          activation,
          offerView: acceptanceOfferView(activation),
        },
      };
    }
    case "merchant/acceptance.deactivate": {
      const activation = deactivateCryptoAcceptance(requireActivation(base), {
        reason: request.reason,
        now: request.now,
      });
      return {
        context: { ...base, activation },
        response: {
          kind: "merchant/acceptance",
          activation,
          offerView: acceptanceOfferView(activation),
        },
      };
    }
    case "checkout/session.open": {
      const profile = requireProfile(base);
      const activation = requireActivation(base);
      const flow = openCheckoutFlow({
        id: request.flowId,
        merchantId: profile.id,
        activation,
        basePolicy: request.basePolicy,
        cart: request.cart,
        quotes: request.quotes,
        railBindings: request.railBindings,
        now: request.now,
        expiresAt: request.expiresAt,
      });
      return {
        context: { ...base, flow, intent: flow.intent },
        response: {
          kind: "checkout/session.open",
          flow,
          optionIds: Object.freeze(flow.options.map((option) => option.optionId)),
        },
      };
    }
    case "checkout/option.prepare": {
      const flow = requireFlow(base);
      const profile = requireProfile(base);
      const option = checkoutOption(flow, request.optionId);
      if (option.kind !== "CRYPTO_WALLET_PAYMENT") {
        throw new ValidationError(
          "only a CRYPTO_WALLET_PAYMENT option can be prepared for wallet payment",
          { optionId: option.optionId },
        );
      }
      const bundle = buildCheckoutAuthorization({
        flow,
        optionId: request.optionId,
        customerWalletAddress: request.customerWalletAddress,
        destinationAddress: request.destinationAddress,
        requestId: request.requestId,
        requestedBy: request.requestedBy,
        merchantName: profile.businessName,
        now: request.now,
      });
      // The DELEGATION HANDLE (protocol-owned settlement instruction).
      const settlementInstructionId = asSettlementInstructionId(request.settlementInstructionId);
      const handoffRequest = buildWalletPaymentHandoffRequest({
        handoffId: request.handoffId,
        attemptId: `attempt:${request.handoffId}`,
        optionId: option.optionId,
        quoteId: option.quote.id,
        settlementInstructionId,
        transfer: {
          asset: option.railBinding.assetIdentity,
          amount: option.quote.cryptoAmount.value,
          from: request.customerWalletAddress,
          to: request.destinationAddress,
        },
        chainRef: option.railBinding.chainRef,
        paymentSummaryDigest: bundle.summaryDigest,
        writeDigest: bundle.writeDigest,
        expiresAt: option.quote.validUntil,
      });
      // MONEY MOVEMENT IS DELEGATED: the receipt is evidence, never authority.
      const receipt = performWalletPaymentHandoff(deps.walletPort, handoffRequest);
      const observation = handoffReceiptObservation(receipt);
      if (observation.kind === "REFUSED") {
        return {
          context: { ...base, bundle },
          response: {
            kind: "checkout/option.prepare",
            status: "HANDOFF_REFUSED",
            optionId: option.optionId,
            reason: "the trusted surface refused the handoff before any external effect",
          },
        };
      }
      if (observation.kind === "OUTCOME_UNKNOWN") {
        // NEVER infer failure OR success from an ambiguous handoff.
        return {
          context: { ...base, bundle },
          response: {
            kind: "checkout/option.prepare",
            status: "HANDOFF_OUTCOME_UNKNOWN",
            optionId: option.optionId,
            evidenceIds: Object.freeze([...observation.evidenceIds]),
          },
        };
      }
      // SUBMITTED: mint the lineage; confirm the intent (handed off).
      const lineage = walletPaymentAuthorizationLineage({ bundle, handoffReceipt: receipt });
      const intent = confirmIntentSubmission(
        attachMethodToIntent(requireIntent(base), request.now),
        request.now,
      );
      return {
        context: {
          ...base,
          bundle,
          intent,
          authorization: { lineage, option, settlementInstructionId },
        },
        response: { kind: "checkout/option.prepare", status: "PREPARED", option, bundle },
      };
    }
    case "payment/attempt.submit": {
      const flow = requireFlow(base);
      const authorization = base.authorization;
      const intent = base.intent;
      if (authorization === undefined || intent === undefined) {
        throw new ValidationError(
          "an attempt submission requires an authorized wallet payment (prepare first)",
        );
      }
      const paid = authorization.option;
      if (paid.kind !== "CRYPTO_WALLET_PAYMENT") {
        throw new ValidationError("the authorized option must be a crypto wallet payment");
      }
      if (paid.quote.fiatAmount.currency !== flow.intent.amount.currency) {
        throw new ValidationError(
          "the authorized option must price the open flow's cart currency",
        );
      }
      const attempt = submitWalletPaymentAttempt({
        attemptId: request.attemptId,
        intent,
        quote: paid.quote,
        authorization: authorization.lineage,
        now: request.now,
      });
      return {
        context: { ...base, attempt },
        response: { kind: "payment/attempt", attempt, intent },
      };
    }
    case "payment/attempt.observe": {
      const attemptRecord = base.attempt;
      const intent = base.intent;
      if (attemptRecord === undefined || intent === undefined) {
        throw new ValidationError("observing an outcome requires a submitted attempt");
      }
      const attempt = observeAttemptOutcome(attemptRecord, request.observation, request.now);
      const nextIntent = settleIntentOutcome(intent, attempt, {
        evidenceIds: request.observation.evidenceIds,
        now: request.now,
      });
      return {
        context: { ...base, attempt, intent: nextIntent },
        response: { kind: "payment/attempt", attempt, intent: nextIntent },
      };
    }
    case "payment/attempt.resolve": {
      const attemptRecord = base.attempt;
      const intent = base.intent;
      if (attemptRecord === undefined || intent === undefined) {
        throw new ValidationError("resolving an ambiguity requires an attempt");
      }
      const attempt = resolveAttemptUnknown(attemptRecord, request.resolution, request.now);
      const nextIntent = settleIntentOutcome(intent, attempt, {
        evidenceIds: request.resolution.evidenceIds,
        now: request.now,
      });
      return {
        context: { ...base, attempt, intent: nextIntent },
        response: { kind: "payment/attempt", attempt, intent: nextIntent },
      };
    }
    case "webhook/event.process": {
      const result = processWebhookEvent(inbox, request.event, request.handler);
      return {
        context: { ...base, inbox: result.inbox },
        response: { kind: "webhook/event.process", result: result.result },
      };
    }
    case "refund/initiate": {
      const attemptRecord = base.attempt;
      const flow = base.flow;
      if (attemptRecord === undefined || flow === undefined) {
        throw new ValidationError("a refund requires a payment attempt in context");
      }
      const initiation = initiateRefund({
        refundId: request.refundId,
        attempt: attemptRecord,
        originalAmount: flow.intent.amount,
        amount: request.amount,
        railSupport: request.railSupport,
        destinationRef: request.destinationRef,
        recourse: request.recourse,
        now: request.now,
      });
      const nextContext: MerchantCheckoutApiContext =
        initiation.outcome === "REFUND_STARTED"
          ? { ...base, refund: initiation.refund }
          : base;
      return {
        context: nextContext,
        response: { kind: "refund/initiate", initiation },
      };
    }
    case "refund/observe": {
      const refund = base.refund;
      if (refund === undefined)         throw new ValidationError("observing a refund requires an initiated refund");
      const observed = observeRefundOutcome(refund, request.observation, request.now);
      return {
        context: { ...base, refund: observed },
        response: { kind: "refund/observe", refund: observed },
      };
    }
    case "settlement/route.select": {
      const selection = selectSettlementRoute({
        desiredMode: request.desiredMode,
        ...(request.native !== undefined ? { native: request.native } : {}),
        external: request.external,
      });
      return {
        context: { ...base },
        response: { kind: "settlement/route.select", selection },
      };
    }
    case "settlement/attempt.settle": {
      const attemptRecord = base.attempt;
      if (attemptRecord === undefined) {
        throw new ValidationError("settling requires a payment attempt in context");
      }
      const settled = settleConfirmedAttempt({
        settlementId: request.settlementId,
        attempt: attemptRecord,
        selection: request.selection,
        ...(request.confirmationInput !== undefined
          ? { confirmationInput: request.confirmationInput }
          : {}),
        protocolInstructionId: request.protocolInstructionId,
        protocolSettlementAttemptIds: request.protocolSettlementAttemptIds,
        now: request.now,
      });
      return {
        context: { ...base, attempt: settled.attempt, settlement: settled.settlement },
        response: { kind: "settlement/attempt.settle", settlement: settled.settlement },
      };
    }
    case "status/view": {
      const response: MerchantCheckoutApiResponse = {
        kind: "status/view",
        ...(base.profile !== undefined ? { profile: base.profile } : {}),
        ...(base.activation !== undefined ? { activation: base.activation } : {}),
        ...(base.flow !== undefined ? { flow: base.flow } : {}),
        ...(base.intent !== undefined ? { intent: base.intent } : {}),
        ...(base.attempt !== undefined ? { attempt: base.attempt } : {}),
        ...(base.refund !== undefined ? { refund: base.refund } : {}),
        ...(base.settlement !== undefined ? { settlement: base.settlement } : {}),
        inbox,
      };
      return { context: base, response };
    }
    default:
      throw new ValidationError("the API request kind is not declared", {
        kind: (request as { kind: string }).kind,
      });
  }
}
