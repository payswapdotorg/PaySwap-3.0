/**
 * @payswap/opportunities — the evidence-backed offer lifecycle (P16-C, lane
 * C; gap-matrix row C5). An OFFER is a minimum-disclosure, opt-in,
 * time-bounded, revocable presentation DERIVED from one validated
 * FinancialOpportunity — never a command, never an authorization (the
 * discovery-tier discipline: the structural DISCOVERY_NEVER_AUTHORIZATION
 * brand, `offerPermitsExecution()` literal false, the always-throwing gate).
 *
 * LAWS: EVIDENCE-BACKED ONLY (`publishOffer` re-validates the source through
 * the FULL model validator); EXPLICIT OPT-IN (participantRef + optedInAt
 * at/before publication — the opt-in PRECEDES the offer); TIME-BOUNDED
 * (caller-supplied expiresAt strictly after publication; read-time expiry
 * `offerIsExpired`: at >= expiresAt); APPEND-ONLY HISTORY (decline/revoke
 * return a NEW frozen record with one appended event, deterministic
 * `offer-event:<offerId>:<index>` ids); SECRET-FREE + NO-GUARANTEE-LANGUAGE
 * on every human surface (the summary is re-scanned; the record is
 * secret-scanned).
 */

import { DiscoveryExecutionRejectedError, ValidationError } from "./errors.ts";
import { DISCOVERY_TIER, isDiscoveryTieredValue } from "./discovery-tier.ts";
import { assertNoGuaranteeLanguage } from "./vocabulary.ts";
import { assertNoSecretMaterial } from "./secret-free.ts";
import { validateFinancialOpportunity } from "./model-validation.ts";
import type { FinancialOpportunity, OpportunityFamily } from "./model.ts";

/** Raised when an offer-lifecycle input or transition is malformed. */
export class OfferLifecycleError extends ValidationError {
  constructor(message: string, options?: { errors: readonly string[] }) {
    super(message, options);
    this.name = "OfferLifecycleError";
  }
}

/** The closed offer-state vocabulary (runtime-frozen). */
export const OFFER_STATES = Object.freeze(["OPEN", "DECLINED", "REVOKED"] as const);
export type OfferState = (typeof OFFER_STATES)[number];

export function isOfferState(value: unknown): value is OfferState {
  return typeof value === "string" && (OFFER_STATES as readonly unknown[]).includes(value);
}

/** The closed offer-event vocabulary (runtime-frozen). */
export const OFFER_EVENT_KINDS = Object.freeze(["PUBLISHED", "DECLINED", "REVOKED"] as const);
export type OfferEventKind = (typeof OFFER_EVENT_KINDS)[number];

/** Nominal brand: this value is an offer presentation, never authority. */
export const OFFER_KIND = "EvidenceBackedOffer" as const;

/** The participant's explicit opt-in (precedes the offer publication). */
export interface OfferOptIn {
  readonly participantRef: string;
  /** The caller-supplied opt-in instant (at/before the publication `at`). */
  readonly optedInAt: number;
}

/** One append-only lifecycle event with a deterministic id. */
export interface OfferEvent {
  readonly eventId: string;
  readonly kind: OfferEventKind;
  readonly recordedAt: number;
}

/**
 * An evidence-backed offer (pure frozen data): derived from one validated
 * opportunity, scoped to one opted-in participant, time-bounded, carrying
 * its append-only event history and the structural discovery tier. There is
 * deliberately no method and no execution-shaped field on this type.
 */
export interface EvidenceBackedOffer {
  readonly offerKind: typeof OFFER_KIND;
  readonly offerId: string;
  readonly opportunityId: string;
  readonly family: OpportunityFamily;
  readonly railKey: string;
  /** Human-readable summary (the source opportunity's title, re-scanned). */
  readonly summary: string;
  readonly optIn: OfferOptIn;
  readonly publishedAt: number;
  readonly expiresAt: number;
  readonly state: OfferState;
  readonly events: readonly OfferEvent[];
  readonly discoveryTier: typeof DISCOVERY_TIER;
}

/** Deterministic offer-event identity (the append index is the order). */
export function offerEventId(offerId: string, index: number): string {
  return `offer-event:${offerId}:${String(index)}`;
}

/** Input to `publishOffer` (the caller supplies the ids and the expiry). */
export interface OfferPublicationInput {
  readonly offerId: string;
  readonly optIn: OfferOptIn;
  /** Strictly after the publication instant (expired-on-arrival is malformed). */
  readonly expiresAt: number;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function validateInstant(at: number, label: string): void {
  if (typeof at !== "number" || !Number.isSafeInteger(at) || at < 0) {
    throw new RangeError(`${label} must be a non-negative integer (ms; no ambient clock)`);
  }
}

function validateOptIn(optIn: OfferOptIn, at: number): OfferOptIn {
  if (optIn === null || typeof optIn !== "object") {
    throw new OfferLifecycleError("offer publication requires an explicit optIn { participantRef, optedInAt }");
  }
  const candidate = optIn as Partial<OfferOptIn>;
  if (!isNonEmptyString(candidate.participantRef)) {
    throw new OfferLifecycleError("optIn.participantRef must be a non-empty string (an offer exists only FOR an explicitly opted-in participant)");
  }
  if (typeof candidate.optedInAt !== "number" || !Number.isSafeInteger(candidate.optedInAt) || candidate.optedInAt < 0) {
    throw new OfferLifecycleError("optIn.optedInAt must be a non-negative integer (the caller-supplied opt-in instant)");
  }
  if (candidate.optedInAt > at) {
    throw new OfferLifecycleError(`optIn.optedInAt (${String(candidate.optedInAt)}) may not follow the publication instant (${String(at)}) — the explicit opt-in PRECEDES the offer`);
  }
  return Object.freeze({ participantRef: candidate.participantRef, optedInAt: candidate.optedInAt });
}

/**
 * THE offer constructor: derives one offer from a validated
 * FinancialOpportunity (the FULL model validator runs first — there is no
 * offer without evidence), scoped to the explicit opt-in, time-bounded by
 * the caller-supplied expiry. Deterministic: identical inputs and instant
 * yield byte-identical offers.
 */
export function publishOffer(
  opportunity: FinancialOpportunity,
  input: OfferPublicationInput,
  at: number,
): EvidenceBackedOffer {
  validateInstant(at, "the offer publication instant `at`");
  const validated = validateFinancialOpportunity(opportunity);
  if (input === null || typeof input !== "object") {
    throw new OfferLifecycleError("offer publication requires an input { offerId, optIn, expiresAt }");
  }
  if (!isNonEmptyString(input.offerId)) {
    throw new OfferLifecycleError("offerId must be a non-empty string");
  }
  if (typeof input.expiresAt !== "number" || !Number.isSafeInteger(input.expiresAt)) {
    throw new OfferLifecycleError("expiresAt must be an integer (the caller-supplied expiry instant)");
  }
  if (input.expiresAt <= at) {
    throw new OfferLifecycleError(
      `expiresAt (${String(input.expiresAt)}) must be strictly after the publication instant (${String(at)}) — an expired-on-arrival offer is malformed`,
    );
  }
  const optIn = validateOptIn(input.optIn, at);
  const summary = validated.title;
  // Defense in depth: the summary is a human surface (the vocabulary law is
  // structural, and the secret-free law applies to every agent-facing one).
  assertNoGuaranteeLanguage(summary, `offer '${input.offerId}' summary`);
  const offer: EvidenceBackedOffer = Object.freeze({
    offerKind: OFFER_KIND,
    offerId: input.offerId,
    opportunityId: validated.opportunityId,
    family: validated.family,
    railKey: validated.rail.railKey,
    summary,
    optIn,
    publishedAt: at,
    expiresAt: input.expiresAt,
    state: "OPEN",
    events: Object.freeze([
      Object.freeze({ eventId: offerEventId(input.offerId, 0), kind: "PUBLISHED", recordedAt: at }),
    ]),
    discoveryTier: DISCOVERY_TIER,
  });
  assertNoSecretMaterial(offer, `offer '${input.offerId}'`);
  return offer;
}

function appendEvent(offer: EvidenceBackedOffer, kind: "DECLINED" | "REVOKED", at: number): EvidenceBackedOffer {
  validateInstant(at, "the offer transition instant `at`");
  if (at < offer.publishedAt) {
    throw new OfferLifecycleError(
      `a ${kind.toLowerCase()} event may not precede the publication instant (${String(offer.publishedAt)}) — lifecycle events are causal`,
    );
  }
  const event: OfferEvent = Object.freeze({
    eventId: offerEventId(offer.offerId, offer.events.length),
    kind,
    recordedAt: at,
  });
  return Object.freeze({ ...offer, state: kind, events: Object.freeze([...offer.events, event]) });
}

/** The participant declines an OPEN offer (append-only: a NEW record). */
export function declineOffer(offer: EvidenceBackedOffer, at: number): EvidenceBackedOffer {
  const validated = validateEvidenceBackedOffer(offer);
  if (validated.state !== "OPEN") {
    throw new OfferLifecycleError(`offer '${validated.offerId}' is ${validated.state} — only an OPEN offer can be declined`);
  }
  return appendEvent(validated, "DECLINED", at);
}

/** The publisher revokes an offer (unilateral; OPEN or DECLINED). */
export function revokeOffer(offer: EvidenceBackedOffer, at: number): EvidenceBackedOffer {
  const validated = validateEvidenceBackedOffer(offer);
  if (validated.state === "REVOKED") {
    throw new OfferLifecycleError(`offer '${validated.offerId}' is already REVOKED (the terminal state)`);
  }
  return appendEvent(validated, "REVOKED", at);
}

/** Is the offer expired at instant `at`? (at >= expiresAt — the bound expires.) */
export function offerIsExpired(offer: EvidenceBackedOffer, at: number): boolean {
  validateInstant(at, "the offer expiry evaluation instant `at`");
  return at >= offer.expiresAt;
}

/** Is the offer live at instant `at`? (OPEN, published, and not expired.) */
export function offerIsLive(offer: EvidenceBackedOffer, at: number): boolean {
  validateInstant(at, "the offer liveness evaluation instant `at`");
  return offer.state === "OPEN" && at >= offer.publishedAt && at < offer.expiresAt;
}

/**
 * The offer-never-dispatches law, restated as a literal (the
 * `discoveryPermitsExecution` discipline): an offer NEVER permits
 * execution. Returns false, always.
 */
export function offerPermitsExecution(): false {
  return false;
}

/**
 * THE downstream execution gate for offers (the `rejectDiscoveryForExecution`
 * discipline): ALWAYS throws — the only route onward from an offer is the
 * authorization lanes' own decision surfaces, never this package.
 */
export function rejectOfferForExecution(value: unknown): never {
  const description = isDiscoveryTieredValue(value)
    ? `a tiered offer record (tier '${DISCOVERY_TIER}')`
    : "a non-tiered value passed where execution authority was demanded";
  throw new DiscoveryExecutionRejectedError(
    `execution rejected: ${description} carries no authority to execute — an offer is an opt-in presentation of discovery evidence, never a command or authorization (P16-C law)`,
  );
}

const FAMILY_WORDS = ["liquidity", "lending", "staking", "incentives", "arbitrage", "other"] as const;

/**
 * Runtime validation of an EvidenceBackedOffer from untyped sources (the
 * read path): fail-closed on every field, the vocabulary + secret-free laws
 * on the summary, deterministic event ids, causal non-decreasing event
 * order, PUBLISHED-first, REVOKED-terminal sequence coherence, and the
 * state/history agreement. Returns a deep-frozen record.
 */
export function validateEvidenceBackedOffer(candidate: unknown): EvidenceBackedOffer {
  if (candidate === null || typeof candidate !== "object") {
    throw new OfferLifecycleError("an evidence-backed offer must be an object");
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  const errors: string[] = [];
  if (record.offerKind !== OFFER_KIND) {
    errors.push(`offerKind must be '${OFFER_KIND}' (nominal separation from every command/authority shape)`);
  }
  for (const field of ["offerId", "opportunityId", "railKey"] as const) {
    if (!isNonEmptyString(record[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  if (typeof record.family !== "string" || !(FAMILY_WORDS as readonly string[]).includes(record.family)) {
    errors.push("family must be one of the six opportunity families");
  }
  if (!isNonEmptyString(record.summary)) {
    errors.push("summary must be a non-empty string");
  } else {
    try {
      assertNoGuaranteeLanguage(record.summary, "offer summary");
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  for (const field of ["publishedAt", "expiresAt"] as const) {
    const value = record[field];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
      errors.push(`${field} must be a non-negative integer (caller-supplied instant)`);
    }
  }
  if (
    typeof record.publishedAt === "number" && typeof record.expiresAt === "number" &&
    Number.isSafeInteger(record.publishedAt) && Number.isSafeInteger(record.expiresAt) &&
    record.expiresAt <= record.publishedAt
  ) {
    errors.push("expiresAt must be strictly after publishedAt (an expired-on-arrival offer is malformed)");
  }
  if (!isOfferState(record.state)) {
    errors.push("state must be one of [OPEN, DECLINED, REVOKED]");
  }
  if (record.discoveryTier !== DISCOVERY_TIER) {
    errors.push(`discoveryTier must be '${DISCOVERY_TIER}' (the structural never-authorization tier is mandatory on every offer)`);
  }
  const optIn = record.optIn;
  if (optIn === null || typeof optIn !== "object") {
    errors.push("optIn must be { participantRef, optedInAt }");
  } else {
    if (!isNonEmptyString((optIn as OfferOptIn).participantRef)) {
      errors.push("optIn.participantRef must be a non-empty string");
    }
    const optedInAt = (optIn as OfferOptIn).optedInAt;
    if (typeof optedInAt !== "number" || !Number.isSafeInteger(optedInAt) || optedInAt < 0) {
      errors.push("optIn.optedInAt must be a non-negative integer");
    } else if (
      typeof record.publishedAt === "number" && Number.isSafeInteger(record.publishedAt) &&
      optedInAt > record.publishedAt
    ) {
      errors.push("optIn.optedInAt may not follow publishedAt (the explicit opt-in PRECEDES the offer)");
    }
  }
  const events = record.events;
  if (!Array.isArray(events) || events.length === 0) {
    errors.push("events is MANDATORY and non-empty (the PUBLISHED event grounds the offer)");
  } else {
    let revokedSeen = false;
    let declinedSeen = false;
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index] as OfferEvent;
      if (event === null || typeof event !== "object") {
        errors.push(`events[${String(index)}] must be an OfferEvent`);
        continue;
      }
      const expectedId = isNonEmptyString(record.offerId)
        ? offerEventId(record.offerId, index)
        : `offer-event:<?>:${String(index)}`;
      if (event.eventId !== expectedId) {
        errors.push(`events[${String(index)}].eventId must be '${expectedId}' (deterministic identity)`);
      }
      const kind = event.kind;
      if (index === 0) {
        if (kind !== "PUBLISHED") {
          errors.push("events[0].kind must be 'PUBLISHED' (the first event grounds the offer)");
        }
        if (event.recordedAt !== record.publishedAt) {
          errors.push("events[0].recordedAt must equal publishedAt");
        }
      } else {
        if (kind === "PUBLISHED") {
          errors.push(`events[${String(index)}].kind 'PUBLISHED' is reserved for element zero`);
        }
        if (revokedSeen) {
          errors.push("no event may follow a REVOKED event (REVOKED is terminal)");
        }
        if (kind === "DECLINED" && declinedSeen) {
          errors.push("at most one DECLINED event may exist (decline is one transition)");
        }
        if (kind === "DECLINED") {
          declinedSeen = true;
        }
        if (kind === "REVOKED") {
          revokedSeen = true;
        }
        const prior = events[index - 1] as OfferEvent;
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
    if (record.state !== expectedState) {
      errors.push(`state must be '${expectedState}' (the event history derives the state)`);
    }
  }
  if (errors.length > 0) {
    throw new OfferLifecycleError(`Invalid evidence-backed offer: ${errors.join("; ")}`, {
      errors: [...errors],
    });
  }
  const typed = candidate as EvidenceBackedOffer;
  // A NEW record is constructed (identity is never trusted; the caller's
  // original is not returned even when already frozen).
  const built: EvidenceBackedOffer = Object.freeze({
    offerKind: OFFER_KIND,
    offerId: typed.offerId,
    opportunityId: typed.opportunityId,
    family: typed.family,
    railKey: typed.railKey,
    summary: typed.summary,
    optIn: Object.freeze({ participantRef: typed.optIn.participantRef, optedInAt: typed.optIn.optedInAt }),
    publishedAt: typed.publishedAt,
    expiresAt: typed.expiresAt,
    state: typed.state,
    events: Object.freeze(typed.events.map((event) => Object.freeze({ ...event }))),
    discoveryTier: DISCOVERY_TIER,
  });
  assertNoSecretMaterial(built, `offer '${built.offerId}'`);
  return built;
}
