/**
 * @payswap/route-planning — the typed routine trigger (P16-D part 1;
 * ROUTINE-CONTRACT Appendix A.1; ADR-0009 D1).
 *
 * The trigger is an ACCEPTED TYPED INTENT EVENT, never free text, never
 * an LLM guess, never a provider webhook, never the composer opening.
 * Prose is UNCONSTRUCTIBLE: `buildRoutePlanningTrigger` accepts ONLY the
 * already-validated pin — the exact-10-key MoneyMovementIntentPin or the
 * exact-11-key PaymentIntentPin (commerceRef is the one specialization
 * key; a payment intent carrying commerceRef is NOT a valid bare movement
 * record, and vice versa) — and re-validates the closed key set
 * fail-closed with the typed TriggerIntentError.
 *
 * The builder re-derives TWO value-form digests (ADR-0009 D4 — the one
 * canonical flavor of this package, never a JSON.stringify round-trip):
 * `intentDigest` over the full intent VALUE and `hardConstraintsDigest`
 * over the hard-constraint projection `{ constraints, expiresAt }`. The
 * trigger record carries the key, the kind, the intent id, the acceptance
 * instant and the two digests — no prose, no re-serialized blob.
 *
 * One idempotency/correlation key admits at most ONE routine start
 * (RoutePlanningTriggerRegistry): an IDENTICAL re-record replays
 * (`started: false`, the original `startedAt`); a DIVERGENT re-record is
 * the typed TriggerConflictError. The trigger establishes NO
 * authorization, NO execution right and NO rail eligibility — it only
 * opens the planning routine; `triggerPermitsExecution()` is the literal
 * false companion.
 */

import { RoutePlanningError } from "./errors.ts";
import {
  contentDigest,
  deepFreeze,
  isNonEmptyString,
  isRecord,
  requireBoundedString,
  requireNonNegativeSafeInteger,
  LIMITS,
} from "./canonical.ts";
import type { MoneyMovementIntentPin, PaymentIntentPin } from "./pins/economic.ts";
import { hasPinnedIntentKeySet, hasPinnedPaymentIntentKeySet } from "./pins/economic.ts";
import { validateRoutePlanningIntent } from "./hard-gates.ts";

/** The intent kinds the routine trigger admits (the closed vocabulary). */
export const ROUTINE_TRIGGER_INTENT_KINDS = Object.freeze(["MONEY_MOVEMENT", "PAYMENT"] as const);

/** One intent kind. */
export type RoutineTriggerIntentKind = (typeof ROUTINE_TRIGGER_INTENT_KINDS)[number];

/** The accepted typed intent (either validated pin shape — never prose). */
export type RoutePlanningIntentPin = MoneyMovementIntentPin | PaymentIntentPin;

/** The builder's caller-supplied envelope: one key + the acceptance instant. */
export interface RoutePlanningTriggerInput {
  readonly idempotencyKey: string;
  readonly acceptedAt: number;
}

/** The typed routine trigger (deep-frozen; the ONLY construction path). */
export interface RoutePlanningTrigger {
  readonly idempotencyKey: string;
  readonly intentKind: RoutineTriggerIntentKind;
  readonly intentId: string;
  readonly acceptedAt: number;
  readonly intentDigest: string;
  readonly hardConstraintsDigest: string;
}

/**
 * The closed key set (or the closed value shape) of a trigger record was
 * violated — the intent is not a validated pin (prose, an extra field, a
 * missing field, a malformed value), so the routine NEVER starts.
 */
export class TriggerIntentError extends RoutePlanningError {
  constructor(message: string, details?: unknown) {
    super(message, "TRIGGER_INTENT_INVALID", details);
    this.name = "TriggerIntentError";
  }
}

/**
 * A DIVERGENT re-record under an idempotency key that already started the
 * routine (same key, different digests/kind/intent id) — one key admits
 * at most one start; the conflict is surfaced, never overwritten.
 */
export class TriggerConflictError extends RoutePlanningError {
  constructor(message: string, details?: unknown) {
    super(message, "TRIGGER_CONFLICT", details);
    this.name = "TriggerConflictError";
  }
}

/** The movement view of an intent: the payment pin minus commerceRef. */
function movementViewOf(intent: RoutePlanningIntentPin): MoneyMovementIntentPin {
  const movement: Record<string, unknown> = { ...intent };
  delete movement["commerceRef"];
  return movement as unknown as MoneyMovementIntentPin;
}

/**
 * Fail-closed classification of the validated pin: the exact-11-key
 * payment shape (commerceRef present) is a PAYMENT intent; the
 * exact-10-key movement shape is a MONEY_MOVEMENT intent; anything else —
 * prose, a malformed record, an extra or missing field — is rejected
 * typed. The deep field laws (currency matches, bounded constraints,
 * expiry strictly after declaration) are re-validated through the gate
 * lane's own fail-closed validator over the movement view.
 */
function classifyValidatedIntent(intent: RoutePlanningIntentPin): {
  readonly kind: RoutineTriggerIntentKind;
  readonly intentId: string;
  readonly constraints: MoneyMovementIntentPin["constraints"];
  readonly expiresAt: number;
} {
  if (!isRecord(intent)) {
    throw new TriggerIntentError(
      "the routine trigger requires the already-validated intent pin — a non-record value never constructs a trigger",
    );
  }
  if (hasPinnedPaymentIntentKeySet(intent)) {
    try {
      validateRoutePlanningIntent(movementViewOf(intent));
    } catch (error) {
      throw new TriggerIntentError(
        error instanceof Error ? error.message : "the payment intent failed re-validation",
      );
    }
    const payment = intent as PaymentIntentPin;
    return {
      kind: "PAYMENT",
      intentId: payment.intentId,
      constraints: payment.constraints,
      expiresAt: payment.expiresAt,
    };
  }
  if (hasPinnedIntentKeySet(intent)) {
    try {
      validateRoutePlanningIntent(intent as MoneyMovementIntentPin);
    } catch (error) {
      throw new TriggerIntentError(
        error instanceof Error ? error.message : "the movement intent failed re-validation",
      );
    }
    const movement = intent as MoneyMovementIntentPin;
    return {
      kind: "MONEY_MOVEMENT",
      intentId: movement.intentId,
      constraints: movement.constraints,
      expiresAt: movement.expiresAt,
    };
  }
  throw new TriggerIntentError(
    "the intent must carry exactly the pinned 10-key movement shape or the pinned 11-key payment shape (commerceRef present) — an unknown, extra or missing field is rejected: a payment intent is NOT a bare movement record and vice versa",
  );
}

/**
 * Build the typed routine trigger from the ALREADY-VALIDATED intent pin
 * plus the caller-supplied idempotency/correlation key and acceptance
 * instant (no ambient clock — `acceptedAt` is DATA). Re-validates the
 * closed key set fail-closed, re-derives both value-form digests and
 * returns the deep-frozen trigger record.
 */
export function buildRoutePlanningTrigger(
  intent: RoutePlanningIntentPin,
  input: RoutePlanningTriggerInput,
): RoutePlanningTrigger {
  const classified = classifyValidatedIntent(intent);
  const idempotencyKey = requireBoundedString(
    isRecord(input) ? input["idempotencyKey"] : undefined,
    "the trigger idempotencyKey",
    LIMITS.refMaxLength,
  );
  const acceptedAt = requireNonNegativeSafeInteger(
    isRecord(input) ? input["acceptedAt"] : undefined,
    "the trigger acceptedAt instant",
  );
  if (!isNonEmptyString(classified.intentId)) {
    throw new TriggerIntentError("the validated intent must carry a non-empty intentId");
  }
  // ADR-0009 D4: value-form digests over the VALUE — the full intent
  // value (commerceRef included for payment intents) and the
  // hard-constraint projection { constraints, expiresAt }.
  const intentDigest = contentDigest(intent);
  const hardConstraintsDigest = contentDigest({
    constraints: classified.constraints,
    expiresAt: classified.expiresAt,
  });
  return deepFreeze({
    idempotencyKey,
    intentKind: classified.kind,
    intentId: classified.intentId,
    acceptedAt,
    intentDigest,
    hardConstraintsDigest,
  });
}

/**
 * THE TRIGGER LAW (first-class predicate): the routine trigger NEVER
 * permits execution — the literal false, never a derived value. The
 * trigger opens the planning routine only; authorization is a separate
 * authority-lane event.
 */
export function triggerPermitsExecution(): false {
  return false;
}

const TRIGGER_RECORD_KEYS = Object.freeze([
  "idempotencyKey",
  "intentKind",
  "intentId",
  "acceptedAt",
  "intentDigest",
  "hardConstraintsDigest",
] as const);

const PACKAGE_DIGEST_PATTERN = /^fnv1a64:[0-9a-f]{16}$/;

/** Fail-closed structural validation of a trigger record (the closed surface). */
function requireTriggerRecord(candidate: unknown): RoutePlanningTrigger {
  if (!isRecord(candidate)) {
    throw new TriggerIntentError("a route-planning trigger must be an object record");
  }
  const actual = Object.keys(candidate).sort();
  const expected = [...TRIGGER_RECORD_KEYS].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TriggerIntentError(
      `a route-planning trigger must carry exactly the keys [${expected.join(", ")}] — unknown or missing fields are rejected`,
    );
  }
  const idempotencyKey = requireBoundedString(
    candidate["idempotencyKey"],
    "the trigger idempotencyKey",
    LIMITS.refMaxLength,
  );
  const intentKind = candidate["intentKind"];
  if (
    typeof intentKind !== "string" ||
    !(ROUTINE_TRIGGER_INTENT_KINDS as readonly unknown[]).includes(intentKind)
  ) {
    throw new TriggerIntentError(
      `the trigger intentKind must be one of [${ROUTINE_TRIGGER_INTENT_KINDS.join(", ")}]`,
    );
  }
  if (!isNonEmptyString(candidate["intentId"])) {
    throw new TriggerIntentError("the trigger intentId must be a non-empty string");
  }
  const acceptedAt = requireNonNegativeSafeInteger(candidate["acceptedAt"], "the trigger acceptedAt instant");
  for (const field of ["intentDigest", "hardConstraintsDigest"] as const) {
    const digest = candidate[field];
    if (typeof digest !== "string" || !PACKAGE_DIGEST_PATTERN.test(digest)) {
      throw new TriggerIntentError(
        `the trigger ${field} must be a value-form digest of this package's one flavor (fnv1a64:<16-hex>)`,
      );
    }
  }
  return candidate as unknown as RoutePlanningTrigger;
}

/** One routine start outcome: first record starts; an identical re-record replays. */
export interface TriggerStartRecord {
  readonly started: boolean;
  readonly startedAt: number;
}

/** The honest lookup outcome: `startedAt` is null when the key never started. */
export interface TriggerLookupRecord {
  readonly started: boolean;
  readonly startedAt: number | null;
}

/**
 * The idempotent routine-start registry (ADR-0009 D1: one
 * idempotency/correlation key admits at most one routine start).
 * `recordStart` is idempotent by the key: the FIRST record starts the
 * routine (`started: true`, the caller-supplied acceptedAt becomes the
 * startedAt); an IDENTICAL re-record (same digests + kind + intentId)
 * REPLAYS (`started: false`, the original startedAt returned); a
 * DIVERGENT re-record under the same key is the typed
 * TriggerConflictError — the existing start is never overwritten.
 */
export class RoutePlanningTriggerRegistry {
  #starts = new Map<
    string,
    {
      readonly startedAt: number;
      readonly intentKind: RoutineTriggerIntentKind;
      readonly intentId: string;
      readonly intentDigest: string;
      readonly hardConstraintsDigest: string;
    }
  >();

  recordStart(trigger: RoutePlanningTrigger): TriggerStartRecord {
    const record = requireTriggerRecord(trigger);
    const existing = this.#starts.get(record.idempotencyKey);
    if (existing === undefined) {
      this.#starts.set(record.idempotencyKey, {
        startedAt: record.acceptedAt,
        intentKind: record.intentKind,
        intentId: record.intentId,
        intentDigest: record.intentDigest,
        hardConstraintsDigest: record.hardConstraintsDigest,
      });
      return deepFreeze({ started: true, startedAt: record.acceptedAt });
    }
    const identical =
      existing.intentKind === record.intentKind &&
      existing.intentId === record.intentId &&
      existing.intentDigest === record.intentDigest &&
      existing.hardConstraintsDigest === record.hardConstraintsDigest;
    if (!identical) {
      throw new TriggerConflictError(
        `idempotency key '${record.idempotencyKey}' already started the routine for intent '${existing.intentId}' (${existing.intentKind}) — a divergent re-record is rejected: one key admits at most one start`,
        {
          idempotencyKey: record.idempotencyKey,
          existing: Object.freeze({
            intentKind: existing.intentKind,
            intentId: existing.intentId,
            intentDigest: existing.intentDigest,
            hardConstraintsDigest: existing.hardConstraintsDigest,
            startedAt: existing.startedAt,
          }),
          attempted: Object.freeze({
            intentKind: record.intentKind,
            intentId: record.intentId,
            intentDigest: record.intentDigest,
            hardConstraintsDigest: record.hardConstraintsDigest,
          }),
        },
      );
    }
    return deepFreeze({ started: false, startedAt: existing.startedAt });
  }

  /** The honest lookup: null startedAt when the key never started (never fabricated). */
  startedFor(idempotencyKey: string): TriggerLookupRecord {
    if (!isNonEmptyString(idempotencyKey)) {
      throw new TriggerIntentError("startedFor requires a non-empty idempotency key");
    }
    const existing = this.#starts.get(idempotencyKey);
    if (existing === undefined) {
      return deepFreeze({ started: false, startedAt: null });
    }
    return deepFreeze({ started: true, startedAt: existing.startedAt });
  }
}
