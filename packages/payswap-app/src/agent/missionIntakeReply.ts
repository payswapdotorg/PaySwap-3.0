/**
 * @payswap/app — the MISSION-INTAKE REPLY PARSER (P21-B, ADR-0014 D2).
 *
 * The STRICT, DETERMINISTIC surface grammar that turns the user's text
 * reply into the typed intake value the channel's capture member
 * accepts. FAIL-CLOSED: an ambiguous or malformed reply is REFUSED with
 * the accepted format named — never coerced, never repaired, never
 * guessed (the intake law: "never invented inputs").
 *
 * GRAMMAR FIDELITY: every accepted form maps 1:1 onto the host's own
 * capture validators (packages/desktop payments/intake-machine.ts):
 * amounts are CANONICAL MINOR-UNIT INTEGER STRINGS with an uppercase
 * ISO-4217-style code (a decimal is refused — the minor-unit exponent
 * is the currency's own law, never guessed app-side); the corridor is
 * all three parts (the destination currency is never defaulted to the
 * source); the deadline is a strict ISO-8601 UTC instant; the fee cap /
 * privacy / partial-payment preferences are EXPLICIT statements either
 * way. The host re-validates everything — this parser only refuses
 * early with a teachable message.
 */

import type { AgentTaskPin, AgentTaskEventKindPin } from "../lib/agent-task-pins.js";

/** The parser's outcome: a typed value, or the honest refusal message. */
export type MissionIntakeReplyResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly message: string };

/* ----------------------------- the patterns -------------------------- */

const AMOUNT_RE = /^([0-9]+) ([A-Z]{3})$|^([A-Z]{3}) ([0-9]+)$/;
const CORRIDOR_RE = /^([A-Z]{2}) ([A-Z]{2}) ([A-Z]{3})$/;
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const CAPPED_RE = /^capped ([0-9]+) ([A-Z]{3})$|^capped ([A-Z]{3}) ([0-9]+)$/i;

/** The accepted format per field (the refusal teaches the format). */
export const MISSION_INTAKE_REPLY_FORMATS: Readonly<Record<string, string>> = Object.freeze({
  amountAndCurrency:
    "an exact minor-unit integer with the currency code — for example \"1250 USD\" (1250 minor units; a decimal like \"12.50\" is refused because minor units are the currency's own law, never converted here)",
  fundingSource: "the funding source in your own words",
  recipient: "the recipient in your own words",
  countryCorridor:
    "the source country, destination country and destination currency — for example \"US KE KES\" (all three; the destination currency is never defaulted)",
  speedDeadline:
    "the arrival deadline as an ISO-8601 UTC instant — for example \"2026-10-28T12:00:00Z\"",
  feeCap:
    "either \"uncapped\", or \"capped\" with an exact minor-unit amount — for example \"capped 100 USD\"",
  purpose: "the purpose in your own words (required for compliance records)",
  privacyCompliance:
    "either \"none\" (the explicit no-constraints statement), or the constraints in your own words",
  partialPaymentPreference: "either \"full\" or \"partial\" — an explicit preference either way",
});

/* ------------------------------ the parser --------------------------- */

/**
 * Parse one conversational reply for one intake field. PURE and total:
 * same text + field, same outcome, forever. An unknown field id fails
 * closed (never a passthrough).
 */
export function parseMissionIntakeReply(fieldId: string, text: string): MissionIntakeReplyResult {
  const reply = typeof text === "string" ? text.trim() : "";
  if (reply.length === 0) {
    return { ok: false, message: "an empty reply captures nothing — please answer the question" };
  }
  const format = MISSION_INTAKE_REPLY_FORMATS[fieldId];
  if (format === undefined) {
    return { ok: false, message: `field '${String(fieldId)}' is not one of the nine intake fields` };
  }
  switch (fieldId) {
    case "amountAndCurrency": {
      const match = AMOUNT_RE.exec(reply);
      if (match === null) {
        return amountRefusal(reply);
      }
      const minorUnits = match[1] ?? match[4];
      const currency = match[2] ?? match[3];
      return { ok: true, value: { minorUnits, currency } };
    }
    case "fundingSource":
    case "recipient":
    case "purpose":
      return { ok: true, value: reply };
    case "countryCorridor": {
      const match = CORRIDOR_RE.exec(reply);
      if (match === null) {
        return {
          ok: false,
          message: `the corridor needs all three parts — the source country, the destination country and the destination currency, for example "US KE KES" (${format})`,
        };
      }
      return {
        ok: true,
        value: {
          sourceCountry: match[1],
          destinationCountry: match[2],
          destinationCurrency: match[3],
        },
      };
    }
    case "speedDeadline": {
      if (!ISO_UTC_RE.test(reply)) {
        return {
          ok: false,
          message: `the deadline must be an ISO-8601 UTC instant, for example "2026-10-28T12:00:00Z" — a date alone or an offset form is refused, never normalized here (${format})`,
        };
      }
      return { ok: true, value: { deadlineAt: reply } };
    }
    case "feeCap": {
      if (/^uncapped$/i.test(reply)) {
        return { ok: true, value: { kind: "UNCAPPED" } };
      }
      const match = CAPPED_RE.exec(reply);
      if (match === null) {
        return {
          ok: false,
          message: `the fee cap is an explicit statement either way — "uncapped", or "capped" with an exact minor-unit amount like "capped 100 USD" (${format})`,
        };
      }
      const minorUnits = match[1] ?? match[3];
      const currency = match[2] ?? match[4];
      return { ok: true, value: { kind: "CAPPED", amount: { minorUnits, currency } } };
    }
    case "privacyCompliance": {
      if (/^none$/i.test(reply)) {
        return { ok: true, value: { kind: "NONE_STATED" } };
      }
      return { ok: true, value: { kind: "CONSTRAINED", notes: reply } };
    }
    case "partialPaymentPreference": {
      if (/^full$/i.test(reply)) {
        return { ok: true, value: { kind: "REQUIRE_FULL" } };
      }
      if (/^partial$/i.test(reply)) {
        return { ok: true, value: { kind: "ALLOW_PARTIAL" } };
      }
      return {
        ok: false,
        message: `the partial-payment preference is explicit — reply "full" or "partial" (${format})`,
      };
    }
    default:
      return { ok: false, message: `field '${String(fieldId)}' is not one of the nine intake fields` };
  }
}

/** The amount refusal (the exact-money teaching message). */
function amountRefusal(reply: string): MissionIntakeReplyResult {
  const decimal = /^([0-9]+)\.([0-9]+) ([A-Z]{3})$|^([A-Z]{3}) ([0-9]+)\.([0-9]+)$/.exec(reply);
  if (decimal !== null) {
    const whole = decimal[1] ?? decimal[5];
    const fraction = decimal[2] ?? decimal[6];
    const currency = decimal[3] ?? decimal[4];
    const padded = (fraction ?? "").padEnd(2, "0").slice(0, 2);
    const example = `${whole}${padded} ${currency}`;
    return {
      ok: false,
      message: `amounts are exact minor units — a decimal is never converted here (the minor-unit exponent is the currency's own law, never guessed). Reply with the integer minor-unit amount, for example "${example}" for ${whole}.${fraction} ${currency}`,
    };
  }
  return {
    ok: false,
    message: `the amount needs an exact minor-unit integer with the currency code, for example "1250 USD" (${MISSION_INTAKE_REPLY_FORMATS.amountAndCurrency})`,
  };
}

/* ------------------------ the link projection ------------------------ */

/** The event kinds that carry the task↔mission link on the task timeline. */
const LINK_EVENT_KINDS: readonly AgentTaskEventKindPin[] = ["MISSING_FIELD_ASKED", "FIELD_CAPTURED"];

/**
 * The link projection (the resumable fact): the mission the task's
 * persisted events name — the LATEST link-bearing event's
 * correlationRef, or null when the task never linked a mission. PURE
 * over the task record (the reload path re-derives it).
 */
export function projectMissionLink(task: AgentTaskPin): string | null {
  let missionId: string | null = null;
  for (const event of task.events) {
    if (LINK_EVENT_KINDS.includes(event.kind) && event.correlationRef !== undefined) {
      missionId = event.correlationRef;
    }
  }
  return missionId;
}
