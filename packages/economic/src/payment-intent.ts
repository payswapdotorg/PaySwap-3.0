/**
 * @payswap/economic — PaymentIntent: a TYPE-LEVEL specialization of
 * MoneyMovementIntent ONLY (P1-W1).
 *
 * The work-order law: "PaymentIntent (type-level specialization of
 * MoneyMovementIntent ONLY — no payment-method machinery, that is P5-W3)".
 * Accordingly this is MoneyMovementIntent plus ONE opaque commerce lineage
 * reference — nothing else. PaymentMethod / PaymentMethodOffer /
 * PaymentAttempt / fallback / translation machinery stays with the merchant
 * lane (P5-W3; old-repo packages/merchant-crypto is reference evidence).
 *
 * Type-level law: PaymentIntent extends MoneyMovementIntent (assignable to
 * it — a payment IS a money movement). Validation law: an object carrying
 * the extra `commerceRef` field is REJECTED by validateMoneyMovementIntent
 * (unknown field, fail-closed exactness) and accepted only by
 * validatePaymentIntent, which checks the full 11-field canonical shape.
 *
 * ADVISORY DEMAND ONLY: establishes no authorization and no finality.
 */

import { InvalidPaymentIntentError } from "./errors.ts";
import {
  type MoneyMovementIntent,
  MONEY_MOVEMENT_INTENT_KEYS,
  validateMoneyMovementIntent,
} from "./intent.ts";
import { LIMITS, requireBoundedString, requireExactKeys, type Fail } from "./validate.ts";

const fail: Fail = (message: string) => new InvalidPaymentIntentError(message);

/** The 11 canonical PaymentIntent fields: the 10 movement fields + commerceRef. */
export const PAYMENT_INTENT_KEYS = [...MONEY_MOVEMENT_INTENT_KEYS, "commerceRef"] as const;

/**
 * A Payment Intent: a Money Movement Intent whose purpose is value exchange
 * with a commerce counterparty (merchant checkout, invoice, order). The
 * commerce context is an OPAQUE lineage reference; this package never
 * interprets merchant/payment-method semantics.
 */
export interface PaymentIntent extends MoneyMovementIntent {
  /** Opaque commerce-context lineage reference (e.g. `checkout:<...>`). */
  readonly commerceRef: string;
}

/**
 * Fail-closed structural validation of a Payment Intent: the full
 * MoneyMovementIntent law (reused, not duplicated) plus the commerceRef
 * lineage field, with the exact 11-field canonical key set.
 */
export function validatePaymentIntent(candidate: unknown): PaymentIntent {
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new InvalidPaymentIntentError("a Payment Intent is required");
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  requireExactKeys(record, PAYMENT_INTENT_KEYS, "PaymentIntent", fail);
  const commerceRef = requireBoundedString(
    record["commerceRef"],
    "PaymentIntent.commerceRef",
    LIMITS.refMaxLength,
    fail,
  );
  // Delegate the movement law: every movement field is validated by the
  // canonical validator against the exact 10 movement fields (the
  // commerceRef key was checked above and is stripped from the sub-record
  // handed over — an object with commerceRef present must FAIL the bare
  // movement validator; that fail-closed split is covered by tests).
  const movementCandidate: Record<string, unknown> = { ...record };
  delete movementCandidate["commerceRef"];
  const movement: MoneyMovementIntent = validateMovementForPayment(movementCandidate);
  return Object.freeze({ ...movement, commerceRef });
}

function validateMovementForPayment(candidate: unknown): MoneyMovementIntent {
  try {
    return validateMoneyMovementIntent(candidate);
  } catch (error) {
    // Re-surface movement violations as PaymentIntent violations so callers
    // always see the PaymentIntent contract fail closed.
    if (error instanceof Error) {
      throw new InvalidPaymentIntentError(
        `PaymentIntent movement fields are invalid: ${error.message}`,
      );
    }
    throw error;
  }
}

/**
 * Type-level projection: a PaymentIntent IS a MoneyMovementIntent
 * (structural specialization). Returns the movement view without the
 * commerce lineage field — a pure object copy, no re-validation.
 */
export function asMoneyMovementIntent(intent: PaymentIntent): MoneyMovementIntent {
  const movement: Record<string, unknown> = { ...intent };
  delete movement["commerceRef"];
  return movement as unknown as MoneyMovementIntent;
}
