/**
 * Bridge implementation: session events (P3-W3).
 *
 * Validators for the pinned session event envelope (with the ISO-8601 UTC
 * timestamp-as-data serialization pin — the strict canonical parser of the
 * accepted capability lane, reproduced) and the event-family projection.
 */

import { IssueCollector } from "../errors.ts";
import {
  cloneAndFreeze,
  isNonEmptyString,
  isPositiveInteger,
  isRecord,
} from "../shared.ts";
import {
  SESSION_EVENT_FAMILIES,
  SESSION_EVENT_FAMILY_NAMES,
  SESSION_EVENT_TYPES,
} from "../wire/session-events.ts";
import type { SessionEventWire, SessionEventTypeWire } from "../wire/session-events.ts";

/** Strict ISO-8601 UTC pattern: YYYY-MM-DDTHH:MM:SS(.fff)?Z — the only accepted timestamp form. */
const ISO_UTC_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?Z$/;

/** Structural guard: strict ISO-8601 UTC timestamp string. */
export function isIsoUtcTimestamp(candidate: unknown): candidate is string {
  if (!isNonEmptyString(candidate)) return false;
  if (!ISO_UTC_PATTERN.test(candidate)) return false;
  const parts = ISO_UTC_PATTERN.exec(candidate);
  if (parts === null) return false;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const hour = Number(parts[4]);
  const minute = Number(parts[5]);
  const second = Number(parts[6]);
  if (year < 1 || month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;
  return true;
}

/** Structural guard: session event type from the pinned 79-name vocabulary. */
export function isSessionEventType(candidate: unknown): candidate is SessionEventTypeWire {
  return (
    typeof candidate === "string" &&
    SESSION_EVENT_TYPES.includes(candidate as SessionEventTypeWire)
  );
}

/**
 * Construct and freeze a validated SessionEventWire: non-empty id/sessionId/
 * traceId, optional turnId, a pinned event type, a STRICT ISO-8601 UTC
 * timestamp (the serialization pin — the substrate's Date becomes
 * timestamp-as-data at the bridge boundary), a positive integer sequence
 * number, and an arbitrary JSON payload (cloned and frozen).
 */
export function sessionEvent(input: unknown): SessionEventWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid session event: must be an object");
  }
  issues.requireNonEmptyString("id", input.id);
  issues.requireNonEmptyString("sessionId", input.sessionId);
  if (input.turnId !== undefined) {
    issues.requireNonEmptyString("turnId", input.turnId, "must be a non-empty string when present");
  }
  if (!isSessionEventType(input.type)) {
    issues.add("type", "must be a pinned session event type (see SESSION_EVENT_TYPES)");
  }
  if (!isIsoUtcTimestamp(input.timestamp)) {
    issues.add(
      "timestamp",
      "must be a strict ISO-8601 UTC string matching YYYY-MM-DDTHH:MM:SS(.fff)?Z exactly (UTC 'Z' suffix required — the bridge's timestamp-as-data serialization pin)",
    );
  }
  issues.requireNonEmptyString("traceId", input.traceId);
  issues.requirePositiveInteger("sequenceNumber", input.sequenceNumber);
  issues.throwIfAny("session event");
  const record = input as unknown as SessionEventWire;
  return Object.freeze({
    id: record.id,
    sessionId: record.sessionId,
    ...(record.turnId !== undefined ? { turnId: record.turnId } : {}),
    type: record.type,
    timestamp: record.timestamp,
    traceId: record.traceId,
    sequenceNumber: record.sequenceNumber,
    payload: cloneAndFreeze(record.payload),
  });
}

/**
 * Project an event type onto its family (the ten-family projection).
 * Returns undefined for unknown event types.
 */
export function sessionEventFamilyOf(
  candidate: string,
): string | undefined {
  for (const family of SESSION_EVENT_FAMILY_NAMES) {
    const members = SESSION_EVENT_FAMILIES[family] ?? [];
    if (members.includes(candidate as SessionEventTypeWire)) {
      return family;
    }
  }
  return undefined;
}

/**
 * Verify the family projection law: every pinned event type belongs to
 * exactly one family, and no family is empty. Returns the count of pinned
 * event types (79) — used by the boundary tests.
 */
export function sessionEventFamilyCoverage(): number {
  const seen = new Set<string>();
  for (const family of SESSION_EVENT_FAMILY_NAMES) {
    const members = SESSION_EVENT_FAMILIES[family] ?? [];
    if (members.length === 0) {
      throw new Error(`session event family '${family}' is empty`);
    }
    for (const member of members) {
      if (seen.has(member)) {
        throw new Error(
          `session event type '${member}' appears in more than one family`,
        );
      }
      seen.add(member);
    }
  }
  if (seen.size !== SESSION_EVENT_TYPES.length) {
    throw new Error(
      `family projection covers ${seen.size} event types but the vocabulary pins ${SESSION_EVENT_TYPES.length}`,
    );
  }
  return seen.size;
}
