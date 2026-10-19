/**
 * @payswap/merchant — merchant checkout session (P5-W3, lane R3-W3;
 * PORT of old packages/merchant-crypto/src/checkout.ts @ 8a735bf,
 * renamed session.ts in the unified package).
 *
 * A hosted-checkout binding of one intent + one acceptance policy
 * pair, snapshotting the offered assets at open (historical facts are
 * immutable — later policy edits never rewrite an open session's
 * offer). A session cannot outlive its intent; completion requires the
 * intent to have SUCCEEDED.
 */

import { ValidationError } from "./errors.ts";
import { defineStateMachine } from "./kernel.ts";
import type { StateMachine } from "./kernel.ts";
import { asMerchantCheckoutSessionId } from "./identifiers.ts";
import type {
  MerchantCheckoutSessionId,
  MerchantCryptoAcceptancePolicyId,
  MerchantPaymentIntentId,
} from "./identifiers.ts";
import type { PinnedTimestampMs } from "./pins/protocol.ts";
import { offeredAssets } from "./acceptance-policy.ts";
import type { CryptoAssetAcceptance, MerchantCryptoAcceptancePolicy } from "./acceptance-policy.ts";
import type { MerchantPaymentIntent } from "./intent.ts";

/** Lifecycle states of a merchant checkout session. */
export type MerchantCheckoutSessionState = "OPEN" | "COMPLETED" | "EXPIRED" | "CANCELLED";

/** Events the merchant checkout session state machine declares. */
export type MerchantCheckoutSessionEvent = "COMPLETE" | "EXPIRE" | "CANCEL";

/** Guard context: injected clock reading plus the session's expiry. */
export interface MerchantCheckoutSessionMachineContext {
  readonly now: PinnedTimestampMs;
  readonly expiresAt: PinnedTimestampMs;
}

/**
 * The deterministic merchant checkout session lifecycle machine.
 * EXPIRE is declarative and guarded to `now >= expiresAt`; all three
 * non-OPEN states are terminal and monotonic — no recovery rules.
 */
export const merchantCheckoutSessionStateMachine: StateMachine<
  MerchantCheckoutSessionState,
  MerchantCheckoutSessionEvent,
  MerchantCheckoutSessionMachineContext
> = defineStateMachine<
  MerchantCheckoutSessionState,
  MerchantCheckoutSessionEvent,
  MerchantCheckoutSessionMachineContext
>({
  name: "merchant-checkout-session",
  initial: "OPEN",
  states: ["OPEN", "COMPLETED", "EXPIRED", "CANCELLED"],
  events: ["COMPLETE", "EXPIRE", "CANCEL"],
  transitions: [
    {
      from: "OPEN",
      on: "COMPLETE",
      to: "COMPLETED",
      description: "the bound intent has SUCCEEDED; the session closes complete",
    },
    { from: "OPEN", on: "CANCEL", to: "CANCELLED", description: "cancelled while open" },
    {
      from: "OPEN",
      on: "EXPIRE",
      to: "EXPIRED",
      guard: (context) => context.now >= context.expiresAt,
      description: "expiry is declarative: only at/after expiresAt",
    },
  ],
  terminalStates: ["COMPLETED", "EXPIRED", "CANCELLED"],
});

/** One hosted-checkout binding of an intent and an acceptance policy pair. */
export interface MerchantCheckoutSession {
  readonly id: MerchantCheckoutSessionId;
  readonly intentId: MerchantPaymentIntentId;
  readonly acceptancePolicyId: string;
  readonly cryptoAcceptancePolicyId: MerchantCryptoAcceptancePolicyId;
  /** Immutable snapshot of the offered assets at open time. */
  readonly offeredAssets: readonly CryptoAssetAcceptance[];
  readonly state: MerchantCheckoutSessionState;
  readonly createdAt: PinnedTimestampMs;
  readonly expiresAt: PinnedTimestampMs;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Open a merchant checkout session. The intent must be awaiting
 * payment (REQUIRES_PAYMENT_METHOD or REQUIRES_CONFIRMATION); the
 * offered assets are snapshotted from the crypto policy at open — a
 * frozen historical fact later policy edits can never rewrite. The
 * session's expiry IS the intent's expiry: a session can never
 * outlive its intent. Returns a NEW frozen record in the OPEN state.
 */
export function openMerchantCheckoutSession(input: {
  readonly id: string;
  readonly intent: MerchantPaymentIntent;
  readonly cryptoPolicy: MerchantCryptoAcceptancePolicy;
  readonly now: PinnedTimestampMs;
}): MerchantCheckoutSession {
  const id = asMerchantCheckoutSessionId(input.id);
  const intent = input.intent;
  if (intent === null || typeof intent !== "object" || !isNonEmptyString(intent.id)) {
    throw new ValidationError("a checkout session requires a MerchantPaymentIntent", { id });
  }
  if (intent.state !== "REQUIRES_PAYMENT_METHOD" && intent.state !== "REQUIRES_CONFIRMATION") {
    throw new ValidationError("a checkout session opens only on an intent awaiting payment", {
      id,
      intentId: intent.id,
      intentState: intent.state,
    });
  }
  const cryptoPolicy = input.cryptoPolicy;
  if (
    cryptoPolicy === null ||
    typeof cryptoPolicy !== "object" ||
    !isNonEmptyString(cryptoPolicy.id)
  ) {
    throw new ValidationError("a checkout session requires a MerchantCryptoAcceptancePolicy", {
      id,
    });
  }
  if (typeof input.now !== "bigint") {
    throw new ValidationError("now must be a bigint TimestampMs", { id });
  }
  return Object.freeze({
    id,
    intentId: intent.id,
    acceptancePolicyId: intent.acceptancePolicyId,
    cryptoAcceptancePolicyId: cryptoPolicy.id,
    offeredAssets: offeredAssets(cryptoPolicy),
    state: "OPEN",
    createdAt: input.now,
    // A session never outlives its intent: the session's expiry IS the
    // intent's expiry.
    expiresAt: intent.expiresAt,
  });
}

/**
 * Complete an OPEN session. The bound intent must be the SAME intent
 * (`intent.id === session.intentId`) and must have SUCCEEDED — a
 * checkout session completes only on a paid intent. The machine's
 * COMPLETE transition (declared only from OPEN) enforces session-side
 * legality. Returns a NEW frozen record.
 */
export function completeMerchantCheckoutSession(
  session: MerchantCheckoutSession,
  intent: MerchantPaymentIntent,
  now: PinnedTimestampMs,
): MerchantCheckoutSession {
  if (session === null || typeof session !== "object" || !isNonEmptyString(session.id)) {
    throw new ValidationError("session must be a MerchantCheckoutSession");
  }
  if (intent === null || typeof intent !== "object" || !isNonEmptyString(intent.id)) {
    throw new ValidationError("completing a session requires a MerchantPaymentIntent", {
      sessionId: session.id,
    });
  }
  if (typeof now !== "bigint") {
    throw new ValidationError("now must be a bigint TimestampMs", { sessionId: session.id });
  }
  if (intent.id !== session.intentId) {
    throw new ValidationError("a checkout session completes only on its own intent", {
      sessionId: session.id,
      sessionIntentId: session.intentId,
      intentId: intent.id,
    });
  }
  if (intent.state !== "SUCCEEDED") {
    throw new ValidationError("a checkout session completes only when its intent has SUCCEEDED", {
      sessionId: session.id,
      intentId: intent.id,
      intentState: intent.state,
    });
  }
  const record = merchantCheckoutSessionStateMachine.transition(session.state, "COMPLETE");
  return Object.freeze({ ...session, state: record.to });
}

/** Cancel an OPEN session. Returns a NEW frozen record in the CANCELLED state. */
export function cancelMerchantCheckoutSession(
  session: MerchantCheckoutSession,
  now: PinnedTimestampMs,
): MerchantCheckoutSession {
  if (session === null || typeof session !== "object" || !isNonEmptyString(session.id)) {
    throw new ValidationError("session must be a MerchantCheckoutSession");
  }
  if (typeof now !== "bigint") {
    throw new ValidationError("now must be a bigint TimestampMs", { sessionId: session.id });
  }
  const record = merchantCheckoutSessionStateMachine.transition(session.state, "CANCEL");
  return Object.freeze({ ...session, state: record.to });
}

/**
 * Expire an OPEN session. EXPIRE is declarative: the machine's guard
 * enforces `now >= expiresAt` (the session's expiry is its intent's
 * expiry). Returns a NEW frozen record in the EXPIRED state.
 */
export function expireMerchantCheckoutSession(
  session: MerchantCheckoutSession,
  now: PinnedTimestampMs,
): MerchantCheckoutSession {
  if (session === null || typeof session !== "object" || !isNonEmptyString(session.id)) {
    throw new ValidationError("session must be a MerchantCheckoutSession");
  }
  if (typeof now !== "bigint") {
    throw new ValidationError("now must be a bigint TimestampMs", { sessionId: session.id });
  }
  const record = merchantCheckoutSessionStateMachine.transition(session.state, "EXPIRE", {
    now,
    expiresAt: session.expiresAt,
  });
  return Object.freeze({ ...session, state: record.to });
}
