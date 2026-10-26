/**
 * @payswap/opportunities — the offer publication rate policy (P16-C, lane
 * C; gap-matrix row C9). An OfferLimitsPolicy fixes four positive-integer
 * bounds — maxOffers (the per-admission batch ceiling), windowMs (the
 * count-based window), perObserver (admissions per OBSERVER per window)
 * and perVenue (admissions per VENUE per window) — validated fail-closed
 * and deep-frozen. The OfferPublicationGate admits offer publications into
 * CALLER-`at` ALIGNED windows with EXACT integer floor arithmetic
 * (windowIndex = floor(at / windowMs); aligned 1000ms windows [0,999] and
 * [1000,1999]; non-aligned 300ms windows roll identically).
 *
 * DENIALS: per-observer -> OBSERVER_RATE_LIMIT with the EXACT
 * retryAfterMs = windowMs - (at % windowMs); per-venue -> VENUE_RATE_LIMIT
 * (many observers one venue; other venues untouched); deterministic
 * precedence — BOTH violated -> OBSERVER_RATE_LIMIT. COUNTERS are
 * append-only: denied admissions are NOT counted, old windows stay, and
 * `publications(ref)` reports the venue-role and observer-role totals
 * (publications("") is a typed error). Identical call sequences yield
 * identical decisions (pure state machine over the caller's instants).
 *
 * SCOPED READ ACCESS: the pinned OPPORTUNITY_READ_SCOPE
 * "opportunities:read" — allowed with the scope (scopes returned
 * verbatim); non-read scopes are insufficient; empty grants are denied; an
 * UNKNOWN principal fails closed with NO scopes; an empty principalRef is
 * a typed error.
 */

import { ValidationError } from "./errors.ts";

/** Raised when a rate-policy input, admission or scoped-access request is malformed. */
export class OfferLimitsError extends ValidationError {
  constructor(message: string, options?: { errors: readonly string[] }) {
    super(message, options);
    this.name = "OfferLimitsError";
  }
}

/** The pinned read scope for opportunity surfaces (the scoped-access law). */
export const OPPORTUNITY_READ_SCOPE = "opportunities:read" as const;

/** The closed denial-reason vocabulary (runtime-frozen). */
export const OFFER_LIMIT_REASONS = Object.freeze(["OBSERVER_RATE_LIMIT", "VENUE_RATE_LIMIT"] as const);
export type OfferLimitReason = (typeof OFFER_LIMIT_REASONS)[number];

/** The publication rate policy (four positive-integer bounds). */
export interface OfferLimitsPolicy {
  /** The per-admission batch ceiling (a single admit() may carry at most this many offers). */
  readonly maxOffers: number;
  /** The count-based window length (ms). */
  readonly windowMs: number;
  /** Max admissions per OBSERVER per window. */
  readonly perObserver: number;
  /** Max admissions per VENUE per window. */
  readonly perVenue: number;
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    if (!Object.isFrozen(value)) {
      Object.freeze(value);
    }
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

/**
 * Fail-closed policy validation: all four bounds must be positive integers
 * (zero, negative and fractional values are malformed; so are nulls,
 * partial limits and non-objects). Returns a NEW deep-frozen policy.
 */
export function validateOfferLimitsPolicy(candidate: unknown): OfferLimitsPolicy {
  if (candidate === null || typeof candidate !== "object") {
    throw new OfferLimitsError("an offer limits policy must be an object { maxOffers, windowMs, perObserver, perVenue }");
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  const errors: string[] = [];
  for (const field of ["maxOffers", "windowMs", "perObserver", "perVenue"] as const) {
    if (!isPositiveInt(record[field])) {
      errors.push(`${field} must be a positive integer (a zero, negative or fractional bound is not a limit)`);
    }
  }
  if (errors.length > 0) {
    throw new OfferLimitsError(`Invalid offer limits policy: ${errors.join("; ")}`, {
      errors: [...errors],
    });
  }
  const policy = candidate as OfferLimitsPolicy;
  return deepFreeze({
    maxOffers: policy.maxOffers,
    windowMs: policy.windowMs,
    perObserver: policy.perObserver,
    perVenue: policy.perVenue,
  });
}

/** One append-only admitted-publication fact (the counter store). */
interface AdmissionFact {
  readonly observerRef: string;
  readonly venueRef: string;
  readonly windowIndex: number;
  readonly offerCount: number;
  readonly admittedAt: number;
}

/** An admitted publication (within every window limit). */
export interface AdmittedPublication {
  readonly admitted: true;
  readonly windowIndex: number;
  readonly offerCount: number;
  readonly observerRef: string;
  readonly venueRef: string;
  readonly admittedAt: number;
}

/** A denied publication (the typed reason + the exact retry hint). */
export interface DeniedPublication {
  readonly admitted: false;
  readonly reason: OfferLimitReason;
  /** EXACT: windowMs - (at % windowMs). */
  readonly retryAfterMs: number;
  readonly windowIndex: number;
  readonly offerCount: number;
  readonly observerRef: string;
  readonly venueRef: string;
  readonly deniedAt: number;
}

export type OfferAdmissionDecision = AdmittedPublication | DeniedPublication;

/** The role-split append-only publication totals for one reference. */
export interface PublicationTotals {
  readonly observer: number;
  readonly venue: number;
}

/**
 * The publication rate gate: a pure deterministic state machine over the
 * caller-supplied instants. Admissions are stored append-only (a denied
 * admission stores nothing); the window counters are derived per
 * (reference, role, windowIndex) so old windows always stay.
 */
export class OfferPublicationGate {
  readonly #policy: OfferLimitsPolicy;
  readonly #admissions: AdmissionFact[] = [];

  constructor(policy: OfferLimitsPolicy) {
    this.#policy = validateOfferLimitsPolicy(policy);
  }

  /** The validated, deep-frozen policy in force. */
  policy(): OfferLimitsPolicy {
    return this.#policy;
  }

  #windowCount(ref: string, role: "observer" | "venue", windowIndex: number): number {
    let total = 0;
    for (const fact of this.#admissions) {
      const factRef = role === "observer" ? fact.observerRef : fact.venueRef;
      if (factRef === ref && fact.windowIndex === windowIndex) {
        total += fact.offerCount;
      }
    }
    return total;
  }

  /**
   * Requests one publication admission at instant `at` (caller-supplied):
   * EXACT integer floor window arithmetic, deterministic precedence
   * (observer first — both violated -> OBSERVER_RATE_LIMIT), the EXACT
   * retryAfterMs on denial, and append-only counting on admission only.
   */
  admit(observerRef: string, venueRef: string, at: number, offerCount?: number): OfferAdmissionDecision {
    if (!isNonEmptyString(observerRef)) {
      throw new OfferLimitsError("admission requires a non-empty observerRef");
    }
    if (!isNonEmptyString(venueRef)) {
      throw new OfferLimitsError("admission requires a non-empty venueRef");
    }
    if (typeof at !== "number" || !Number.isSafeInteger(at) || at < 0) {
      throw new RangeError("the admission instant `at` must be a non-negative integer (ms; no ambient clock)");
    }
    const count = offerCount === undefined ? 1 : offerCount;
    if (!isPositiveInt(count) || count > this.#policy.maxOffers) {
      throw new OfferLimitsError(
        `offerCount must be a positive integer no greater than the policy maxOffers (${String(this.#policy.maxOffers)})`,
      );
    }
    // EXACT integer floor arithmetic: the count-based window alignment.
    const windowIndex = Math.floor(at / this.#policy.windowMs);
    const retryAfterMs = this.#policy.windowMs - (at % this.#policy.windowMs);
    if (this.#windowCount(observerRef, "observer", windowIndex) + count > this.#policy.perObserver) {
      return Object.freeze({
        admitted: false,
        reason: "OBSERVER_RATE_LIMIT",
        retryAfterMs,
        windowIndex,
        offerCount: count,
        observerRef,
        venueRef,
        deniedAt: at,
      });
    }
    if (this.#windowCount(venueRef, "venue", windowIndex) + count > this.#policy.perVenue) {
      return Object.freeze({
        admitted: false,
        reason: "VENUE_RATE_LIMIT",
        retryAfterMs,
        windowIndex,
        offerCount: count,
        observerRef,
        venueRef,
        deniedAt: at,
      });
    }
    this.#admissions.push({ observerRef, venueRef, windowIndex, offerCount: count, admittedAt: at });
    return Object.freeze({
      admitted: true,
      windowIndex,
      offerCount: count,
      observerRef,
      venueRef,
      admittedAt: at,
    });
  }

  /**
   * The append-only publication totals for one reference, split by role and
   * summed across ALL windows (old windows stay). An empty reference is a
   * typed error.
   */
  publications(ref: string): PublicationTotals {
    if (!isNonEmptyString(ref)) {
      throw new OfferLimitsError("publications requires a non-empty reference");
    }
    let observer = 0;
    let venue = 0;
    for (const fact of this.#admissions) {
      if (fact.observerRef === ref) {
        observer += fact.offerCount;
      }
      if (fact.venueRef === ref) {
        venue += fact.offerCount;
      }
    }
    return Object.freeze({ observer, venue });
  }
}

/** The scoped read-access decision for one principal. */
export interface ScopedAccessDecision {
  readonly allowed: boolean;
  readonly principalRef: string;
  /** The granted scopes verbatim (empty for an unknown principal — fail closed). */
  readonly scopes: readonly string[];
}

/**
 * THE scoped read-access gate: a principal is allowed exactly when its
 * granted scopes include the pinned OPPORTUNITY_READ_SCOPE. The granted
 * list is returned verbatim; NON-read scopes are insufficient; empty
 * grants are denied; an UNKNOWN principal fails closed with NO scopes; an
 * empty principalRef (or a malformed grants table) is a typed error.
 */
export function scopedOfferAccess(
  grants: Readonly<Record<string, readonly string[]>>,
  principalRef: string,
): ScopedAccessDecision {
  if (!isNonEmptyString(principalRef)) {
    throw new OfferLimitsError("scoped access requires a non-empty principalRef");
  }
  if (grants === null || typeof grants !== "object" || Array.isArray(grants)) {
    throw new OfferLimitsError("grants must be a record of principalRef -> granted scopes");
  }
  for (const scopes of Object.values(grants)) {
    if (!Array.isArray(scopes) || scopes.some((scope) => !isNonEmptyString(scope))) {
      throw new OfferLimitsError("every grants entry must be an array of non-empty scope strings");
    }
  }
  if (!Object.prototype.hasOwnProperty.call(grants, principalRef)) {
    // Unknown principal: fail closed with NO scopes (never guessed).
    return Object.freeze({ allowed: false, principalRef, scopes: Object.freeze([]) });
  }
  const scopes = grants[principalRef] as readonly string[];
  return Object.freeze({
    allowed: scopes.includes(OPPORTUNITY_READ_SCOPE),
    principalRef,
    scopes: Object.freeze([...scopes]),
  });
}
