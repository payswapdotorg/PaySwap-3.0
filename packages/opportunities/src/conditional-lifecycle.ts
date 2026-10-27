/**
 * @payswap/opportunities — the conditional-opportunity lifecycle (P21-C,
 * lane C; ADR-0014 D9): the APPEND-ONLY transitions and the fail-closed
 * read path, split from ./conditional.ts under the 400-line file law
 * (the ./offer-lifecycle.ts discipline, mirrored: decline/revoke return
 * a NEW frozen record with one appended event; the validator re-derives
 * the state from the event history; expiry is read-time `at >= expiresAt`).
 */

import { ConditionalOpportunityError } from "./conditional.ts";
import {
  CONDITIONAL_EVENT_KINDS,
  CONDITIONAL_KIND,
  CONDITIONAL_PARTIES,
  CONDITIONAL_PARTY_CHANGES,
  CONDITIONAL_STATES,
  conditionalEventId,
  MAX_CONDITIONAL_ASSUMPTION_LENGTH,
} from "./conditional.ts";
import type {
  ConditionalEvent,
  ConditionalOpportunity,
  ConditionalState,
  PlatformPrerequisite,
  RequiredPartyChange,
} from "./conditional.ts";
import { DISCOVERY_TIER } from "./discovery-tier.ts";
import { isOpportunityFamily } from "./model.ts";
import { validateConsentScope } from "./consent.ts";
import { validateSupportingObservation } from "./model-fields.ts";
import { assertNoGuaranteeLanguage } from "./vocabulary.ts";
import { assertNoSecretMaterial } from "./secret-free.ts";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function validateInstant(at: number, label: string): void {
  if (typeof at !== "number" || !Number.isSafeInteger(at) || at < 0) {
    throw new RangeError(`${label} must be a non-negative integer (ms; no ambient clock)`);
  }
}

function isConditionalStateValue(value: unknown): value is ConditionalState {
  return typeof value === "string" && (CONDITIONAL_STATES as readonly unknown[]).includes(value);
}

function appendEvent(
  conditional: ConditionalOpportunity,
  kind: "DECLINED" | "REVOKED",
  at: number,
): ConditionalOpportunity {
  validateInstant(at, "the conditional transition instant `at`");
  if (at < conditional.publishedAt) {
    throw new ConditionalOpportunityError(
      `a ${kind.toLowerCase()} event may not precede the publication instant (${String(conditional.publishedAt)}) — lifecycle events are causal`,
    );
  }
  const event: ConditionalEvent = Object.freeze({
    eventId: conditionalEventId(conditional.conditionalId, conditional.events.length),
    kind,
    recordedAt: at,
  });
  return Object.freeze({ ...conditional, state: kind, events: Object.freeze([...conditional.events, event]) });
}

/** The participant declines an OPEN conditional (append-only: a NEW record). */
export function declineConditional(conditional: ConditionalOpportunity, at: number): ConditionalOpportunity {
  const validated = validateConditionalOpportunity(conditional);
  if (validated.state !== "OPEN") {
    throw new ConditionalOpportunityError(`conditional '${validated.conditionalId}' is ${validated.state} — only an OPEN conditional can be declined`);
  }
  return appendEvent(validated, "DECLINED", at);
}

/** The publisher revokes a conditional (unilateral; OPEN or DECLINED). */
export function revokeConditional(conditional: ConditionalOpportunity, at: number): ConditionalOpportunity {
  const validated = validateConditionalOpportunity(conditional);
  if (validated.state === "REVOKED") {
    throw new ConditionalOpportunityError(`conditional '${validated.conditionalId}' is already REVOKED (the terminal state)`);
  }
  return appendEvent(validated, "REVOKED", at);
}

/** Is the conditional expired at instant `at`? (at >= expiresAt — the bound expires.) */
export function conditionalIsExpired(conditional: ConditionalOpportunity, at: number): boolean {
  validateInstant(at, "the conditional expiry evaluation instant `at`");
  return at >= conditional.expiresAt;
}

/** Is the conditional live at instant `at`? (OPEN, published, and not expired.) */
export function conditionalIsLive(conditional: ConditionalOpportunity, at: number): boolean {
  validateInstant(at, "the conditional liveness evaluation instant `at`");
  return conditional.state === "OPEN" && at >= conditional.publishedAt && at < conditional.expiresAt;
}

/**
 * Runtime validation of a ConditionalOpportunity from untyped sources
 * (the read path): fail-closed on every field — the nominal brand, the
 * closed party/change vocabulary, the bounded assumptions (also
 * vocabulary-scanned), the honest platform-prerequisite notes (scanned),
 * the non-empty versioned grounding-evidence chain (the lineage law),
 * the disclosure scope (the consent law), the opt-in-before-publication
 * and expiry-after-publication bounds, deterministic event ids, causal
 * non-decreasing event order, PUBLISHED-first, REVOKED-terminal
 * sequence coherence, and the state/history agreement. Returns a
 * deep-frozen record.
 */
export function validateConditionalOpportunity(candidate: unknown): ConditionalOpportunity {
  if (candidate === null || typeof candidate !== "object") {
    throw new ConditionalOpportunityError("a conditional opportunity must be an object");
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  const errors: string[] = [];
  if (record["conditionalKind"] !== CONDITIONAL_KIND) {
    errors.push(`conditionalKind must be '${CONDITIONAL_KIND}' (nominal separation from every command/authority shape)`);
  }
  for (const field of ["conditionalId", "opportunityId", "railKey", "summary"] as const) {
    if (!isNonEmptyString(record[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  if (typeof record["family"] !== "string" || !isOpportunityFamily(record["family"])) {
    errors.push("family must be one of the six opportunity families");
  }
  const changes = record["requiredPartyChanges"];
  if (!Array.isArray(changes) || changes.length === 0) {
    errors.push("requiredPartyChanges is MANDATORY and non-empty (the closed party-change vocabulary)");
  } else {
    const seen = new Set<string>();
    for (const entry of changes) {
      const change = entry as Partial<RequiredPartyChange>;
      const partyOk = typeof change.party === "string" && (CONDITIONAL_PARTIES as readonly unknown[]).includes(change.party);
      const changeOk = typeof change.change === "string" && (CONDITIONAL_PARTY_CHANGES as readonly unknown[]).includes(change.change);
      if (!partyOk || !changeOk) {
        errors.push("requiredPartyChanges entries must name a closed-vocabulary party and change");
        break;
      }
      const key = `${String(change.party)}:${String(change.change)}`;
      if (seen.has(key)) {
        errors.push(`requiredPartyChanges carries duplicate '${key}'`);
        break;
      }
      seen.add(key);
    }
  }
  const assumptions = record["assumptions"];
  if (!Array.isArray(assumptions) || assumptions.length === 0) {
    errors.push("assumptions is MANDATORY and non-empty");
  } else {
    const seen = new Set<string>();
    for (const assumption of assumptions) {
      if (!isNonEmptyString(assumption)) {
        errors.push("assumptions entries must be non-empty strings");
        break;
      }
      if (assumption.length > MAX_CONDITIONAL_ASSUMPTION_LENGTH) {
        errors.push(`assumption exceeds the ${String(MAX_CONDITIONAL_ASSUMPTION_LENGTH)}-character bound`);
        break;
      }
      if (seen.has(assumption)) {
        errors.push("assumptions must be unique");
        break;
      }
      seen.add(assumption);
      try {
        assertNoGuaranteeLanguage(assumption, "conditional assumption");
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }
  const prerequisites = record["platformPrerequisites"];
  if (prerequisites !== undefined && !Array.isArray(prerequisites)) {
    errors.push("platformPrerequisites, when present, must be an array");
  } else if (Array.isArray(prerequisites)) {
    for (const entry of prerequisites) {
      const prerequisite = entry as Partial<PlatformPrerequisite>;
      if (!isNonEmptyString(prerequisite.gapId) || !isNonEmptyString(prerequisite.note)) {
        errors.push("every platform prerequisite carries a non-empty gapId and note");
        break;
      }
      try {
        assertNoGuaranteeLanguage(prerequisite.note, `platform prerequisite '${prerequisite.gapId}' note`);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }
  const evidence = record["evidence"];
  if (!Array.isArray(evidence) || evidence.length === 0) {
    errors.push("evidence is MANDATORY and non-empty (there is no evidence-free conditional)");
  } else {
    const seen = new Set<string>();
    for (let index = 0; index < evidence.length; index += 1) {
      const observation = evidence[index];
      try {
        validateSupportingObservation(observation, `evidence[${String(index)}]`);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
      const key = `${String((observation as { observationId?: unknown }).observationId)}:v${String((observation as { version?: unknown }).version)}`;
      if (seen.has(key)) {
        errors.push(`evidence carries duplicate observation '${key}'`);
      }
      seen.add(key);
    }
  }
  try {
    validateConsentScope(record["disclosureScope"]);
  } catch (error) {
    if (error instanceof Error && error.name === "GuaranteeLanguageError") {
      throw error;
    }
    errors.push(error instanceof Error ? error.message : String(error));
  }
  const optIn = record["optIn"];
  if (optIn === null || typeof optIn !== "object") {
    errors.push("optIn must be { participantRef, optedInAt }");
  } else {
    const typedOptIn = optIn as { participantRef?: unknown; optedInAt?: unknown };
    if (!isNonEmptyString(typedOptIn.participantRef)) {
      errors.push("optIn.participantRef must be a non-empty string");
    }
    if (typeof typedOptIn.optedInAt !== "number" || !Number.isSafeInteger(typedOptIn.optedInAt) || typedOptIn.optedInAt < 0) {
      errors.push("optIn.optedInAt must be a non-negative integer");
    } else if (
      typeof record["publishedAt"] === "number" && Number.isSafeInteger(record["publishedAt"]) &&
      typedOptIn.optedInAt > record["publishedAt"]
    ) {
      errors.push("optIn.optedInAt may not follow publishedAt (the explicit opt-in PRECEDES the conditional)");
    }
  }
  for (const field of ["publishedAt", "expiresAt"] as const) {
    const value = record[field];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
      errors.push(`${field} must be a non-negative integer (caller-supplied instant)`);
    }
  }
  if (
    typeof record["publishedAt"] === "number" && typeof record["expiresAt"] === "number" &&
    Number.isSafeInteger(record["publishedAt"]) && Number.isSafeInteger(record["expiresAt"]) &&
    record["expiresAt"] <= record["publishedAt"]
  ) {
    errors.push("expiresAt must be strictly after publishedAt (an expired-on-arrival conditional is malformed)");
  }
  if (!isConditionalStateValue(record["state"])) {
    errors.push("state must be one of [OPEN, DECLINED, REVOKED]");
  }
  if (record["discoveryTier"] !== DISCOVERY_TIER) {
    errors.push(`discoveryTier must be '${DISCOVERY_TIER}' (the structural never-authorization tier is mandatory on every conditional)`);
  }
  const events = record["events"];
  if (!Array.isArray(events) || events.length === 0) {
    errors.push("events is MANDATORY and non-empty (the PUBLISHED event grounds the conditional)");
  } else {
    let revokedSeen = false;
    let declinedSeen = false;
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index] as ConditionalEvent;
      if (event === null || typeof event !== "object") {
        errors.push(`events[${String(index)}] must be a ConditionalEvent`);
        continue;
      }
      const expectedId = isNonEmptyString(record["conditionalId"])
        ? conditionalEventId(record["conditionalId"], index)
        : `conditional-event:<?>:${String(index)}`;
      if (event.eventId !== expectedId) {
        errors.push(`events[${String(index)}].eventId must be '${expectedId}' (deterministic identity)`);
      }
      if (!(CONDITIONAL_EVENT_KINDS as readonly unknown[]).includes(event.kind)) {
        errors.push(`events[${String(index)}].kind must be one of [PUBLISHED, DECLINED, REVOKED]`);
      }
      if (index === 0) {
        if (event.kind !== "PUBLISHED") {
          errors.push("events[0].kind must be 'PUBLISHED' (the first event grounds the conditional)");
        }
        if (event.recordedAt !== record["publishedAt"]) {
          errors.push("events[0].recordedAt must equal publishedAt");
        }
      } else {
        if (event.kind === "PUBLISHED") {
          errors.push(`events[${String(index)}].kind 'PUBLISHED' is reserved for element zero`);
        }
        if (revokedSeen) {
          errors.push("no event may follow a REVOKED event (REVOKED is terminal)");
        }
        if (event.kind === "DECLINED" && declinedSeen) {
          errors.push("at most one DECLINED event may exist (decline is one transition)");
        }
        if (event.kind === "DECLINED") {
          declinedSeen = true;
        }
        if (event.kind === "REVOKED") {
          revokedSeen = true;
        }
        const prior = events[index - 1] as ConditionalEvent;
        if (
          prior !== null && typeof prior === "object" &&
          typeof event.recordedAt === "number" && typeof prior.recordedAt === "number" &&
          event.recordedAt < prior.recordedAt
        ) {
          errors.push(`events[${String(index)}].recordedAt may not precede the prior event (causal order)`);
        }
      }
    }
    const expectedState = revokedSeen ? "REVOKED" : declinedSeen ? "DECLINED" : "OPEN";
    if (record["state"] !== expectedState) {
      errors.push(`state must be '${expectedState}' (the event history derives the state)`);
    }
  }
  if (errors.length > 0) {
    throw new ConditionalOpportunityError(`Invalid conditional opportunity: ${errors.join("; ")}`, {
      errors: [...errors],
    });
  }
  const typed = candidate as ConditionalOpportunity;
  // A NEW record is constructed (identity is never trusted; the caller's
  // original is not returned even when already frozen).
  const built: ConditionalOpportunity = Object.freeze({
    conditionalKind: CONDITIONAL_KIND,
    conditionalId: typed.conditionalId,
    opportunityId: typed.opportunityId,
    family: typed.family,
    railKey: typed.railKey,
    summary: typed.summary,
    requiredPartyChanges: Object.freeze(typed.requiredPartyChanges.map((change) => Object.freeze({ ...change }))),
    assumptions: Object.freeze([...typed.assumptions]),
    platformPrerequisites: Object.freeze(typed.platformPrerequisites.map((entry) => Object.freeze({ ...entry }))),
    evidence: Object.freeze(typed.evidence.map((observation) => Object.freeze({ ...observation }))),
    evidenceFreshness: typed.evidenceFreshness,
    disclosureScope: Object.freeze({
      fields: Object.freeze([...typed.disclosureScope.fields]),
      purpose: typed.disclosureScope.purpose,
    }),
    optIn: Object.freeze({ participantRef: typed.optIn.participantRef, optedInAt: typed.optIn.optedInAt }),
    publishedAt: typed.publishedAt,
    expiresAt: typed.expiresAt,
    state: typed.state,
    events: Object.freeze(typed.events.map((event) => Object.freeze({ ...event }))),
    discoveryTier: DISCOVERY_TIER,
  });
  assertNoSecretMaterial(built, `conditional '${built.conditionalId}'`);
  return built;
}
