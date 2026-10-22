/**
 * PaySwap Desktop (P13-C) — the payment-intake state machine (pure).
 *
 * THE INTAKE LAW (work order): the nine required fields are gathered
 * conversationally WITHOUT guessing — amount/currency, funding source,
 * recipient, country/corridor, speed/deadline, fee cap, purpose,
 * privacy/compliance constraints and the supported partial-payment
 * preference. The machine:
 *
 * - tracks the field set as typed MISSING vs CAPTURED states — a field is
 *   MISSING until an EXPLICIT capture exists; "no preference" is an
 *   explicit captured value (UNCAPPED / NONE_STATED / REQUIRE_FULL),
 *   NEVER a default the machine invented;
 * - ASKS for missing fields (MISSING_FIELD_ASKED events, one deterministic
 *   ask order) — it never fills, infers or fabricates amount, currency,
 *   recipient or corridor facts;
 * - validates every capture fail-closed (typed INVALID_FIELD_VALUE; never
 *   coerced, never silently repaired);
 * - records each capture as an append-only FIELD_CAPTURED event;
 * - MATERIAL-CHANGE LAW (P3-W2): once the intent is compiled, a re-capture
 *   REVOKES the compiled intent and the presented preview on the record —
 *   authorization bound to the old terms no longer matches (the
 *   authorization artifact binds the intent digest; dispatch then refuses
 *   with the typed mismatch reason). History keeps every event.
 */

import {
  PAYMENT_INTAKE_FIELD_IDS,
  PaymentMissionError,
  type PaymentIntakeCaptures,
  type PaymentIntakeFieldId,
  type PaymentIntakeFieldStates,
  type PaymentMissionEvent,
  type PaymentMissionRecord,
} from "./contracts.js";

// ---------------------------------------------------------------------------
// The ask vocabulary (pinned, people-language; one question per field)
// ---------------------------------------------------------------------------

/** The deterministic ask order (canonical field order, missing-first). */
export const INTAKE_ASK_ORDER: readonly PaymentIntakeFieldId[] = PAYMENT_INTAKE_FIELD_IDS;

/** The pinned question per field (rendered verbatim by the ask surface). */
export const INTAKE_FIELD_QUESTIONS: Readonly<Record<PaymentIntakeFieldId, string>> = Object.freeze({
  amountAndCurrency:
    "How much should move, and in which currency? (exact amount — PaySwap works in exact money, never approximations)",
  fundingSource:
    "Which funding source should the payment leave from? (name it as you know it — it will be matched against actually observed accounts, never assumed)",
  recipient:
    "Who is the recipient? (name or reference as you know it — recipient details are verified against observations, never assumed)",
  countryCorridor:
    "Which corridor — source country, destination country and destination currency? (all three; the corridor is validated against real eligibility, never guessed)",
  speedDeadline:
    "By when must it arrive? (a deadline — used to derive the settlement window; no deadline is ever invented)",
  feeCap:
    "What is your fee cap — the most you will pay in fees? (an explicit cap with amount and currency, or an explicit statement that you accept uncapped fees)",
  purpose: "What is the purpose of this payment? (required for compliance records)",
  privacyCompliance:
    "Any privacy or compliance constraints? (state them, or explicitly say none)",
  partialPaymentPreference:
    "Can this payment be settled partially if full settlement is not possible, or must it be full? (an explicit preference either way)",
});

// ---------------------------------------------------------------------------
// Field-state helpers
// ---------------------------------------------------------------------------

/** The initial all-MISSING field state. */
export function initialIntakeFieldStates(): PaymentIntakeFieldStates {
  const states = {} as Record<PaymentIntakeFieldId, { status: "MISSING" }>;
  for (const field of PAYMENT_INTAKE_FIELD_IDS) {
    states[field] = { status: "MISSING" };
  }
  return Object.freeze(states);
}

/** The MISSING field ids in canonical order (the ask candidates). */
export function missingIntakeFields(fields: PaymentIntakeFieldStates): PaymentIntakeFieldId[] {
  return INTAKE_ASK_ORDER.filter((field) => fields[field].status === "MISSING");
}

/** True iff every required field has an explicit capture (compile-ready). */
export function intakeComplete(fields: PaymentIntakeFieldStates): boolean {
  return missingIntakeFields(fields).length === 0;
}

/** The next ask (deterministic): the first MISSING field in canonical order. */
export function nextIntakeAsk(
  fields: PaymentIntakeFieldStates,
): { readonly fieldId: PaymentIntakeFieldId; readonly question: string } | null {
  const next = missingIntakeFields(fields)[0];
  if (next === undefined) return null;
  return { fieldId: next, question: INTAKE_FIELD_QUESTIONS[next] };
}

// ---------------------------------------------------------------------------
// Fail-closed per-field capture validation
// ---------------------------------------------------------------------------

const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const MINOR_UNITS_PATTERN = /^(0|[1-9][0-9]*)$/;

function requireAmount(value: PaymentAmountLike, field: string, positive: boolean): void {
  if (value === null || typeof value !== "object") {
    throw new PaymentMissionError("INVALID_FIELD_VALUE", `${field} must be an amount object`);
  }
  if (typeof value.currency !== "string" || !CURRENCY_PATTERN.test(value.currency)) {
    throw new PaymentMissionError(
      "INVALID_FIELD_VALUE",
      `${field}.currency must match /^[A-Z]{3}$/ — never guessed or defaulted`,
    );
  }
  if (typeof value.minorUnits !== "string" || !MINOR_UNITS_PATTERN.test(value.minorUnits)) {
    throw new PaymentMissionError(
      "INVALID_FIELD_VALUE",
      `${field}.minorUnits must be a canonical non-negative decimal integer string (exact minor units)`,
    );
  }
  if (positive && value.minorUnits === "0") {
    throw new PaymentMissionError(
      "INVALID_FIELD_VALUE",
      `${field}.minorUnits must be POSITIVE — a zero-amount payment is not a payment`,
    );
  }
}

interface PaymentAmountLike {
  readonly currency?: unknown;
  readonly minorUnits?: unknown;
}

function requireBoundedText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new PaymentMissionError("INVALID_FIELD_VALUE", `${field} must be a non-empty string`);
  }
  if (value.length > maxLength) {
    throw new PaymentMissionError(
      "INVALID_FIELD_VALUE",
      `${field} must be at most ${String(maxLength)} characters`,
    );
  }
  return value;
}

/**
 * Fail-closed validation of one capture. `missionCreatedAt` grounds the
 * deadline rule (strictly after creation). Throws INVALID_FIELD_VALUE —
 * never coerces, never repairs, never defaults.
 */
export function validateIntakeCapture(
  fieldId: PaymentIntakeFieldId,
  value: unknown,
  missionCreatedAt: string,
): void {
  switch (fieldId) {
    case "amountAndCurrency":
      requireAmount(value as PaymentAmountLike, "amountAndCurrency", true);
      return;
    case "fundingSource":
      requireBoundedText(value, "fundingSource", 200);
      return;
    case "recipient":
      requireBoundedText(value, "recipient", 200);
      return;
    case "countryCorridor": {
      const corridor = value as {
        sourceCountry?: unknown;
        destinationCountry?: unknown;
        destinationCurrency?: unknown;
      };
      if (corridor === null || typeof corridor !== "object") {
        throw new PaymentMissionError("INVALID_FIELD_VALUE", "countryCorridor must be an object");
      }
      if (
        typeof corridor.sourceCountry !== "string" ||
        !COUNTRY_PATTERN.test(corridor.sourceCountry)
      ) {
        throw new PaymentMissionError(
          "INVALID_FIELD_VALUE",
          "countryCorridor.sourceCountry must be an ISO 3166-1 alpha-2 code — never guessed",
        );
      }
      if (
        typeof corridor.destinationCountry !== "string" ||
        !COUNTRY_PATTERN.test(corridor.destinationCountry)
      ) {
        throw new PaymentMissionError(
          "INVALID_FIELD_VALUE",
          "countryCorridor.destinationCountry must be an ISO 3166-1 alpha-2 code — never guessed",
        );
      }
      if (
        typeof corridor.destinationCurrency !== "string" ||
        !CURRENCY_PATTERN.test(corridor.destinationCurrency)
      ) {
        throw new PaymentMissionError(
          "INVALID_FIELD_VALUE",
          "countryCorridor.destinationCurrency must match /^[A-Z]{3}$/ — never defaulted to the source currency",
        );
      }
      return;
    }
    case "speedDeadline": {
      const deadline = value as { deadlineAt?: unknown };
      if (deadline === null || typeof deadline !== "object") {
        throw new PaymentMissionError("INVALID_FIELD_VALUE", "speedDeadline must be an object");
      }
      if (typeof deadline.deadlineAt !== "string" || !ISO_UTC_PATTERN.test(deadline.deadlineAt)) {
        throw new PaymentMissionError(
          "INVALID_FIELD_VALUE",
          "speedDeadline.deadlineAt must be an ISO-8601 UTC instant",
        );
      }
      if (deadline.deadlineAt <= missionCreatedAt) {
        throw new PaymentMissionError(
          "INVALID_FIELD_VALUE",
          "speedDeadline.deadlineAt must be strictly after the mission creation — a deadline in the past compiles nothing",
        );
      }
      return;
    }
    case "feeCap": {
      const cap = value as { kind?: unknown; amount?: PaymentAmountLike };
      if (cap === null || typeof cap !== "object") {
        throw new PaymentMissionError("INVALID_FIELD_VALUE", "feeCap must be an object");
      }
      if (cap.kind === "CAPPED") {
        if (cap.amount === null || typeof cap.amount !== "object") {
          throw new PaymentMissionError(
            "INVALID_FIELD_VALUE",
            "feeCap.amount is required for a CAPPED capture (amount + currency)",
          );
        }
        requireAmount(cap.amount, "feeCap.amount", false);
      } else if (cap.kind !== "UNCAPPED") {
        throw new PaymentMissionError(
          "INVALID_FIELD_VALUE",
          "feeCap.kind must be CAPPED (with an amount) or UNCAPPED — an explicit statement either way, never a default",
        );
      }
      return;
    }
    case "purpose":
      requireBoundedText(value, "purpose", 500);
      return;
    case "privacyCompliance": {
      const privacy = value as { kind?: unknown; notes?: unknown };
      if (privacy === null || typeof privacy !== "object") {
        throw new PaymentMissionError("INVALID_FIELD_VALUE", "privacyCompliance must be an object");
      }
      if (privacy.kind === "CONSTRAINED") {
        requireBoundedText(privacy.notes, "privacyCompliance.notes", 500);
      } else if (privacy.kind !== "NONE_STATED") {
        throw new PaymentMissionError(
          "INVALID_FIELD_VALUE",
          "privacyCompliance.kind must be CONSTRAINED (with notes) or NONE_STATED — never silently defaulted",
        );
      }
      return;
    }
    case "partialPaymentPreference": {
      const preference = value as { kind?: unknown };
      if (preference === null || typeof preference !== "object") {
        throw new PaymentMissionError(
          "INVALID_FIELD_VALUE",
          "partialPaymentPreference must be an object",
        );
      }
      if (preference.kind !== "REQUIRE_FULL" && preference.kind !== "ALLOW_PARTIAL") {
        throw new PaymentMissionError(
          "INVALID_FIELD_VALUE",
          "partialPaymentPreference.kind must be REQUIRE_FULL or ALLOW_PARTIAL — an explicit preference, never a default",
        );
      }
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// The capture transition (append-only event + material-change revocation)
// ---------------------------------------------------------------------------

function appendEvent(
  record: PaymentMissionRecord,
  kind: PaymentMissionEvent["kind"],
  summary: string,
  at: string,
  correlationRef?: string,
): PaymentMissionRecord {
  const event: PaymentMissionEvent = {
    id: `${record.id}-ev-${String(record.events.length + 1)}`,
    at,
    kind,
    summary,
    ...(correlationRef !== undefined ? { correlationRef } : {}),
  };
  return { ...record, events: [event, ...record.events], updatedAt: at };
}

/**
 * Capture one field: validates fail-closed, appends FIELD_CAPTURED, and —
 * the MATERIAL-CHANGE LAW — revokes a previously compiled intent and
 * presented preview (the terms changed; anything authorized against the
 * old terms no longer matches). A capture on a terminal mission fails
 * closed (monotonic terminals).
 */
export function captureIntakeField(
  record: PaymentMissionRecord,
  fieldId: PaymentIntakeFieldId,
  value: PaymentIntakeCaptures[PaymentIntakeFieldId],
  now: string,
): PaymentMissionRecord {
  if (record.status === "COMPLETED" || record.status === "FAILED" || record.status === "CANCELLED" || record.status === "EXPIRED") {
    throw new PaymentMissionError(
      "MISSION_TERMINAL",
      `Mission ${JSON.stringify(record.id)} is terminal (${record.status}) — no field can be captured`,
      { missionId: record.id },
    );
  }
  validateIntakeCapture(fieldId, value, record.createdAt);
  const prior = record.fields[fieldId];
  const revokedIntent = record.intent !== undefined;
  let next: PaymentMissionRecord = appendEvent(
    record,
    "FIELD_CAPTURED",
    revokedIntent
      ? `Field ${fieldId} captured — the previously compiled intent and presented preview are revoked (material change; authorization bound to the old terms no longer matches).`
      : prior.status === "CAPTURED"
        ? `Field ${fieldId} re-captured (revision) — the latest capture is the demand of record.`
        : `Field ${fieldId} captured.`,
    now,
  );
  const fields = { ...next.fields, [fieldId]: { status: "CAPTURED", value } } as PaymentIntakeFieldStates;
  next = {
    ...next,
    fields: Object.freeze(fields),
    ...(revokedIntent
      ? { intent: undefined, previewId: undefined }
      : {}),
  };
  return next;
}

/**
 * Record one MISSING_FIELD_ASKED event (the machine ASKS; the ask surface
 * renders the pinned question verbatim). Asking is honest orchestration —
 * never a fill.
 */
export function recordIntakeAsk(
  record: PaymentMissionRecord,
  now: string,
): { readonly record: PaymentMissionRecord; readonly ask: { readonly fieldId: PaymentIntakeFieldId; readonly question: string } | null } {
  const ask = nextIntakeAsk(record.fields);
  if (ask === null) {
    return { record, ask: null };
  }
  const next = appendEvent(
    record,
    "MISSING_FIELD_ASKED",
    `Asked for ${ask.fieldId}: ${ask.question}`,
    now,
  );
  return { record: next, ask };
}
