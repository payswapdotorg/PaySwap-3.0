/**
 * @payswap/merchant — merchant payment attempt, part 1: the machine +
 * the record + begin/submit (P5-W3, lane R3-W3; PORT of old
 * packages/merchant-crypto/src/attempt.ts @ 8a735bf).
 *
 * One attempt to pay a merchant payment intent with a specific crypto
 * asset on a specific chain under an exact quote. The attempt maps
 * onto the PINNED settlement-plane vocabulary (the canonical
 * settlement-attempt machine in pins/protocol.ts) — it never
 * re-implements it. The outcome/attach family lives in
 * attempt-outcomes.ts.
 */

import { ValidationError } from "./errors.ts";
import { defineStateMachine } from "./kernel.ts";
import type { StateMachine } from "./kernel.ts";
import { asMerchantPaymentAttemptId } from "./identifiers.ts";
import type {
  ChainId,
  CryptoAssetId,
  MerchantPaymentAttemptId,
  MerchantPaymentIntentId,
  QuoteId,
} from "./identifiers.ts";
import type {
  PinnedSettlementInstructionId,
  PinnedTimestampMs,
} from "./pins/protocol.ts";
import type { CryptoAmount } from "./assets.ts";
import type { CryptoQuote } from "./quotes.ts";
import type { MerchantPaymentIntent } from "./intent.ts";
import type { PinnedPaymentMethodTranslation } from "./pins/payment.ts";
import type { MerchantCryptoSettlementRoute } from "./settlement-routes.ts";

/** Lifecycle states of a merchant payment attempt. */
export type MerchantPaymentAttemptState =
  | "PENDING"
  | "SUBMITTED"
  | "CONFIRMED"
  | "FAILED"
  | "OUTCOME_UNKNOWN"
  | "ABANDONED";

/** Events the merchant payment attempt state machine declares. */
export type MerchantPaymentAttemptEvent =
  | "SUBMIT"
  | "CONFIRM_SUCCEEDED"
  | "CONFIRM_FAILED"
  | "REPORT_UNKNOWN"
  | "RESOLVE_SUCCEEDED"
  | "RESOLVE_FAILED"
  | "ABANDON";

/** Guard context: injected clock reading plus the quote's validity boundary. */
export interface MerchantPaymentAttemptMachineContext {
  readonly now: PinnedTimestampMs;
  readonly quoteValidUntil: PinnedTimestampMs;
}

/**
 * The deterministic merchant payment attempt lifecycle machine.
 *
 * SUBMIT is guarded to `now < quoteValidUntil` — the quote must be
 * unexpired at submission. OUTCOME_UNKNOWN is a first-class
 * NON-TERMINAL state whose ONLY exits are the reconciliation
 * resolutions RESOLVE_SUCCEEDED / RESOLVE_FAILED: no confirmation
 * event is declared from OUTCOME_UNKNOWN, so an ambiguous attempt can
 * never be silently marked FAILED. Terminal states are monotonic.
 */
export const merchantPaymentAttemptStateMachine: StateMachine<
  MerchantPaymentAttemptState,
  MerchantPaymentAttemptEvent,
  MerchantPaymentAttemptMachineContext
> = defineStateMachine<
  MerchantPaymentAttemptState,
  MerchantPaymentAttemptEvent,
  MerchantPaymentAttemptMachineContext
>({
  name: "merchant-payment-attempt",
  initial: "PENDING",
  states: ["PENDING", "SUBMITTED", "CONFIRMED", "FAILED", "OUTCOME_UNKNOWN", "ABANDONED"],
  events: [
    "SUBMIT",
    "CONFIRM_SUCCEEDED",
    "CONFIRM_FAILED",
    "REPORT_UNKNOWN",
    "RESOLVE_SUCCEEDED",
    "RESOLVE_FAILED",
    "ABANDON",
  ],
  transitions: [
    {
      from: "PENDING",
      on: "SUBMIT",
      to: "SUBMITTED",
      guard: (context) => context.now < context.quoteValidUntil,
      description: "the quote must be unexpired at submission",
    },
    {
      from: "PENDING",
      on: "ABANDON",
      to: "ABANDONED",
      description: "abandoned before submission",
    },
    {
      from: "SUBMITTED",
      on: "CONFIRM_SUCCEEDED",
      to: "CONFIRMED",
      description: "definitive success observed with evidence",
    },
    {
      from: "SUBMITTED",
      on: "CONFIRM_FAILED",
      to: "FAILED",
      description: "definitive failure observed with evidence",
    },
    {
      from: "SUBMITTED",
      on: "REPORT_UNKNOWN",
      to: "OUTCOME_UNKNOWN",
      description: "the outcome is ambiguous — UNKNOWN is first-class, never FAILED",
    },
    {
      from: "OUTCOME_UNKNOWN",
      on: "RESOLVE_SUCCEEDED",
      to: "CONFIRMED",
      description: "reconciliation resolved the ambiguity as success",
    },
    {
      from: "OUTCOME_UNKNOWN",
      on: "RESOLVE_FAILED",
      to: "FAILED",
      description: "reconciliation resolved the ambiguity as failure",
    },
  ],
  terminalStates: ["CONFIRMED", "FAILED", "ABANDONED"],
});

/** One attempt to pay an intent with a specific asset/chain under an exact quote. */
export interface MerchantPaymentAttempt {
  readonly id: MerchantPaymentAttemptId;
  readonly intentId: MerchantPaymentIntentId;
  readonly assetId: CryptoAssetId;
  readonly chainId: ChainId;
  readonly quoteId: QuoteId;
  /** Immutable snapshot of the quoted crypto amount (exact minor units). */
  readonly quotedCryptoAmount: CryptoAmount;
  readonly state: MerchantPaymentAttemptState;
  readonly externalTxRef?: string;
  readonly translation?: PinnedPaymentMethodTranslation;
  readonly settlementRoute?: MerchantCryptoSettlementRoute;
  /**
   * The DELEGATION HANDLE: the branded pinned id of the
   * protocol-owned SettlementInstruction this attempt's settlement leg
   * executes under (money movement is referenced, never owned here).
   */
  readonly settlementInstructionId?: PinnedSettlementInstructionId;
  /** Ids of the protocol-owned SettlementAttempt records executing the settlement leg. */
  readonly settlementAttemptIds: readonly string[];
  /** Linked evidence node ids (the evidence graph owns the nodes). */
  readonly evidenceIds: readonly string[];
  readonly createdAt: PinnedTimestampMs;
  readonly updatedAt: PinnedTimestampMs;
}

/** Shared precondition helper: the value must be an attempt record. */
export function requireAttempt(attempt: MerchantPaymentAttempt): void {
  if (attempt === null || typeof attempt !== "object" || typeof attempt.id !== "string" || attempt.id.length === 0) {
    throw new ValidationError("attempt must be a MerchantPaymentAttempt");
  }
}

/** Shared precondition helper: the instant must be a bigint TimestampMs. */
export function requireNow(now: PinnedTimestampMs): void {
  if (typeof now !== "bigint") {
    throw new ValidationError("now must be a bigint TimestampMs");
  }
}

/** Union of evidence ids preserving order: existing first, then new. */
export function mergeEvidence(existing: readonly string[], incoming: readonly string[]): string[] {
  const merged = [...existing];
  for (const id of incoming) {
    if (!merged.includes(id)) {
      merged.push(id);
    }
  }
  return merged;
}

/**
 * Begin a merchant payment attempt: bind an intent to one exact quote
 * (the quote must be unexpired — `now < quote.validUntil` — otherwise
 * a fresh quote is required), snapshot the quoted crypto amount
 * immutably and start in the PENDING state with empty
 * settlement/evidence linkage.
 */
export function beginMerchantPaymentAttempt(input: {
  readonly id: string;
  readonly intent: MerchantPaymentIntent;
  readonly quote: CryptoQuote;
  readonly now: PinnedTimestampMs;
}): MerchantPaymentAttempt {
  const id = asMerchantPaymentAttemptId(input.id);
  const intent = input.intent;
  if (intent === null || typeof intent !== "object" || typeof intent.id !== "string" || intent.id.length === 0) {
    throw new ValidationError("an attempt requires a MerchantPaymentIntent", { id });
  }
  const quote = input.quote;
  if (quote === null || typeof quote !== "object" || typeof quote.id !== "string" || quote.id.length === 0) {
    throw new ValidationError("an attempt requires a CryptoQuote", { id });
  }
  requireNow(input.now);
  if (input.now >= quote.validUntil) {
    throw new ValidationError("the quote is expired; a fresh quote is required", {
      id,
      quoteId: quote.id,
      validUntil: quote.validUntil,
      now: input.now,
    });
  }
  return Object.freeze({
    id,
    intentId: intent.id,
    assetId: quote.assetId,
    chainId: quote.chainId,
    quoteId: quote.id,
    quotedCryptoAmount: quote.cryptoAmount,
    state: "PENDING",
    settlementAttemptIds: Object.freeze([]),
    evidenceIds: Object.freeze([]),
    createdAt: input.now,
    updatedAt: input.now,
  });
}

/**
 * Submit a PENDING attempt: the quote must be the SAME quote the
 * attempt was begun under (id, asset and chain must match) and must be
 * unexpired at submission — the machine's SUBMIT guard enforces
 * `now < quoteValidUntil` (the attempt record deliberately carries no
 * validity boundary of its own; the quote is the authority). Returns a
 * NEW frozen record; records are never mutated in place.
 */
export function submitMerchantPaymentAttempt(
  attempt: MerchantPaymentAttempt,
  quote: CryptoQuote,
  now: PinnedTimestampMs,
): MerchantPaymentAttempt {
  requireAttempt(attempt);
  requireNow(now);
  if (quote === null || typeof quote !== "object" || typeof quote.id !== "string" || quote.id.length === 0) {
    throw new ValidationError("submitting an attempt requires a CryptoQuote", {
      attemptId: attempt.id,
    });
  }
  if (quote.id !== attempt.quoteId) {
    throw new ValidationError("the quote must be the exact quote this attempt was begun under", {
      attemptId: attempt.id,
      attemptQuoteId: attempt.quoteId,
      quoteId: quote.id,
    });
  }
  if (quote.assetId !== attempt.assetId || quote.chainId !== attempt.chainId) {
    throw new ValidationError("the quote must match the attempt asset and chain", {
      attemptId: attempt.id,
    });
  }
  const record = merchantPaymentAttemptStateMachine.transition(attempt.state, "SUBMIT", {
    now,
    quoteValidUntil: quote.validUntil,
  });
  return Object.freeze({ ...attempt, state: record.to, updatedAt: now });
}

/**
 * Attach the external transaction reference observed after submission.
 * Only legal on a SUBMITTED attempt; `externalTxRef` must be a
 * non-empty string when present. Returns a NEW frozen record.
 */
export function attachSubmission(
  attempt: MerchantPaymentAttempt,
  input: { readonly externalTxRef?: string; readonly now: PinnedTimestampMs },
): MerchantPaymentAttempt {
  requireAttempt(attempt);
  requireNow(input.now);
  if (attempt.state !== "SUBMITTED") {
    throw new ValidationError("an external tx ref can only be attached to a SUBMITTED attempt", {
      attemptId: attempt.id,
      state: attempt.state,
    });
  }
  const externalTxRef =
    input.externalTxRef !== undefined ? input.externalTxRef : attempt.externalTxRef;
  if (externalTxRef !== undefined && (typeof externalTxRef !== "string" || externalTxRef.length === 0)) {
    throw new ValidationError("externalTxRef must be a non-empty string when present", {
      attemptId: attempt.id,
    });
  }
  return Object.freeze({
    ...attempt,
    ...(externalTxRef !== undefined ? { externalTxRef } : {}),
    updatedAt: input.now,
  });
}

/**
 * The attempt's outcome on the settlement plane's `ExternalOutcome`
 * definiteness dimension: CONFIRMED maps to SUCCEEDED, FAILED to
 * FAILED, OUTCOME_UNKNOWN to OUTCOME_UNKNOWN (strictly — an ambiguous
 * attempt is never reported as FAILED), and the not-yet-definitive
 * states (PENDING, SUBMITTED, ABANDONED) map to PENDING.
 */
export function attemptOutcome(
  attempt: MerchantPaymentAttempt,
): "PENDING" | "SUCCEEDED" | "FAILED" | "OUTCOME_UNKNOWN" {
  requireAttempt(attempt);
  switch (attempt.state) {
    case "CONFIRMED":
      return "SUCCEEDED";
    case "FAILED":
      return "FAILED";
    case "OUTCOME_UNKNOWN":
      return "OUTCOME_UNKNOWN";
    default:
      return "PENDING";
  }
}
