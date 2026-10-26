/**
 * @payswap/opportunities — durable WAIT criteria (P16-C, lane C; gap-matrix
 * row C8; ADR-0009 D8). A WaitMatchCriteria is the durable record of a
 * user's Wait choice: WHICH opportunity families it waits for, WHICH wait
 * categories re-trigger evaluation, the wait deadline (maxWaitMs from
 * declaredAt), the user-selected fallback, the acknowledged trade-offs and
 * two OPTIONAL inclusive numeric criteria (a verified-return floor and an
 * exact-cost ceiling — absent by default, so the match is THRESHOLD-FREE).
 *
 * maxSettlementMs is VALIDATED but NEVER APPLIED: settlement timing is the
 * route-compiler's own law (the criteria records the user's bound; it never
 * enforces it here).
 *
 * THE STRUCTURAL NO-DISPATCH LAW (D8): `evaluateWaitCriteria` returns
 * EXACTLY the five pure fact keys — matchedOpportunityIds,
 * categoryAttribution, expired, reasons, waitingNeverDispatches — frozen,
 * with NO action/command/dispatch/execute/authorize key at any name, and
 * `waitingNeverDispatches === false` as a PINNED LITERAL (never derived):
 * a wait match NEVER dispatches; only fresh preview + scoped authorization
 * on the authorization lanes can. Expiry is EXACTLY `at > declaredAt +
 * maxWaitMs` (the deadline instant itself is still live), and an expired
 * wait still reports its matches TOGETHER with reasons ["WAIT_EXPIRED"].
 */

import { ValidationError } from "./errors.ts";
import { assertNoGuaranteeLanguage } from "./vocabulary.ts";
import { addRationals, compareRationals, validateExactRational } from "./rational.ts";
import { evaluateDiscoveryPolicy, isOpportunityStale } from "./eligibility.ts";
import { isOpportunityFamily } from "./model.ts";
import type { FinancialOpportunity, OpportunityFamily } from "./model.ts";
import type { ExactRational } from "./rational.ts";

/** Raised when a wait-criteria input is malformed. */
export class WaitCriteriaError extends ValidationError {
  constructor(message: string, options?: { errors: readonly string[] }) {
    super(message, options);
    this.name = "WaitCriteriaError";
  }
}

/**
 * The closed six-category wait vocabulary (runtime-frozen via Object.freeze
 * — NOT bare `as const`, which is compile-time-readonly only): the
 * deterministic, threshold-free re-evaluation triggers a wait may declare.
 * Every category is attributed from TYPED first-class fields only.
 */
export const WAIT_CATEGORIES = Object.freeze([
  "NEW_OPPORTUNITY",
  "VERIFIED_RETURN_EVIDENCE",
  "CAPITAL_REQUIREMENT_KNOWN",
  "WITHDRAWAL_LIQUIDITY_OBSERVED",
  "FEES_KNOWN",
  "MAX_LOSS_BOUNDED",
] as const);
export type WaitCategory = (typeof WAIT_CATEGORIES)[number];

export function isWaitCategory(value: unknown): value is WaitCategory {
  return typeof value === "string" && (WAIT_CATEGORIES as readonly unknown[]).includes(value);
}

/** The closed fallback vocabulary (what happens when the wait expires). */
export const WAIT_FALLBACK_KINDS = Object.freeze([
  "PROCEED_WITH_FALLBACK_ROUTE",
  "REPLAN_FROM_FRESH_EVIDENCE",
  "CANCEL_WAIT",
] as const);
export type WaitFallbackKind = (typeof WAIT_FALLBACK_KINDS)[number];

export function isWaitFallbackKind(value: unknown): value is WaitFallbackKind {
  return typeof value === "string" && (WAIT_FALLBACK_KINDS as readonly unknown[]).includes(value);
}

/** The user-selected expiry fallback (the route reference is opaque here). */
export interface WaitFallback {
  readonly kind: WaitFallbackKind;
  readonly routeRef: string;
}

/** The bounded-string law: each acknowledged trade-off is at most 16 chars. */
export const MAX_WAIT_TRADE_OFF_LENGTH = 16 as const;

/** The durable WAIT criteria (see the module law above). */
export interface WaitMatchCriteria {
  readonly waitId: string;
  /** The opportunity families this wait is scoped to (NOT `categories`). */
  readonly families: readonly OpportunityFamily[];
  /** The declared wait categories that re-trigger evaluation. */
  readonly categories: readonly WaitCategory[];
  /** Positive integer: the wait window from `declaredAt`. */
  readonly maxWaitMs: number;
  /** Positive integer: VALIDATED but NEVER APPLIED (route-compiler owns it). */
  readonly maxSettlementMs: number;
  readonly fallback: WaitFallback;
  /** Sorted, unique, non-empty, <= 16-char acknowledged trade-offs. */
  readonly tradeOffs: readonly string[];
  /** OPTIONAL inclusive floor on the verified-return lower bound. */
  readonly minimumVerifiedReturnPerYear?: ExactRational;
  /** OPTIONAL inclusive ceiling on the exact observed cost fraction. */
  readonly maximumExactCostFraction?: ExactRational;
  /** The caller-supplied declaration instant (the deadline origin). */
  readonly declaredAt: number;
}

/** The one wait-evaluation reason (an expired wait carries exactly it). */
export const WAIT_EVALUATION_REASONS = Object.freeze(["WAIT_EXPIRED"] as const);
export type WaitEvaluationReason = (typeof WAIT_EVALUATION_REASONS)[number];

/** The pure-fact evaluation result (EXACTLY five keys — the no-dispatch law). */
export interface WaitEvaluation {
  readonly matchedOpportunityIds: readonly string[];
  readonly categoryAttribution: Readonly<Record<string, readonly WaitCategory[]>>;
  readonly expired: boolean;
  readonly reasons: readonly WaitEvaluationReason[];
  /** The pinned literal (ADR-0009 D8): a wait match NEVER dispatches. */
  readonly waitingNeverDispatches: false;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function validateInstant(at: number, label: string): void {
  if (typeof at !== "number" || !Number.isSafeInteger(at) || at < 0) {
    throw new RangeError(`${label} must be a non-negative integer (ms; no ambient clock)`);
  }
}

function validatePositiveInt(value: unknown, label: string, errors: string[]): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    errors.push(`${label} must be a positive integer`);
  }
}

function validateRationalField(value: unknown, label: string, errors: string[]): void {
  try {
    validateExactRational(value as ExactRational);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : `${label} must be an ExactRational`);
  }
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

/** The wait deadline: declaredAt + maxWaitMs (exact integer arithmetic). */
export function waitDeadlineMs(criteria: WaitMatchCriteria): number {
  return criteria.declaredAt + criteria.maxWaitMs;
}

/**
 * Fail-closed wait-criteria validation: constructs a NEW deep-frozen record
 * (the caller's original is never trusted, never mutated). Every violation
 * aggregates into one typed WaitCriteriaError; the trade-offs are also
 * vocabulary-scanned (the guarantee-language law on human surfaces).
 */
export function validateWaitCriteria(candidate: unknown): WaitMatchCriteria {
  if (candidate === null || typeof candidate !== "object") {
    throw new WaitCriteriaError("a wait match criteria must be an object");
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  const errors: string[] = [];
  if (!isNonEmptyString(record.waitId)) {
    errors.push("waitId must be a non-empty string");
  }
  if (!Array.isArray(record.families) || record.families.length === 0) {
    errors.push("families must be a non-empty array of opportunity families (the wait's family scope)");
  } else {
    const seen = new Set<string>();
    for (const family of record.families) {
      if (!isOpportunityFamily(family)) {
        errors.push("families entries must be one of the six opportunity families");
        break;
      }
      seen.add(family);
    }
    if (seen.size !== record.families.length) {
      errors.push("families must be unique");
    }
  }
  if (!Array.isArray(record.categories) || record.categories.length === 0) {
    errors.push("categories must be a non-empty array of wait categories (the declared re-evaluation triggers)");
  } else {
    const seen = new Set<string>();
    for (const category of record.categories) {
      if (!isWaitCategory(category)) {
        errors.push(`category '${String(category)}' is not one of the six wait categories`);
        break;
      }
      seen.add(category);
    }
    if (seen.size !== record.categories.length) {
      errors.push("categories must be unique");
    }
  }
  validatePositiveInt(record.maxWaitMs, "maxWaitMs", errors);
  validatePositiveInt(record.maxSettlementMs, "maxSettlementMs", errors);
  const fallback = record.fallback;
  if (fallback === null || typeof fallback !== "object") {
    errors.push("fallback must be { kind, routeRef } (the user-selected expiry fallback)");
  } else {
    if (!isWaitFallbackKind((fallback as WaitFallback).kind)) {
      errors.push("fallback.kind must be one of [PROCEED_WITH_FALLBACK_ROUTE, REPLAN_FROM_FRESH_EVIDENCE, CANCEL_WAIT]");
    }
    if (!isNonEmptyString((fallback as WaitFallback).routeRef)) {
      errors.push("fallback.routeRef must be a non-empty string (the recorded fallback route reference)");
    }
  }
  if (!Array.isArray(record.tradeOffs)) {
    errors.push("tradeOffs must be an array (possibly empty — sorted, unique, non-empty, <= 16-char entries)");
  } else {
    const tradeOffs = record.tradeOffs;
    for (const tradeOff of tradeOffs) {
      if (!isNonEmptyString(tradeOff)) {
        errors.push("tradeOffs entries must be non-empty strings");
        break;
      }
      if (tradeOff.length > MAX_WAIT_TRADE_OFF_LENGTH) {
        errors.push(`tradeOff '${tradeOff}' exceeds the ${String(MAX_WAIT_TRADE_OFF_LENGTH)}-character bound`);
        break;
      }
    }
    if (new Set(tradeOffs).size !== tradeOffs.length) {
      errors.push("tradeOffs must be unique");
    }
    const sorted = [...tradeOffs].sort();
    for (let index = 0; index < tradeOffs.length; index += 1) {
      if (tradeOffs[index] !== sorted[index]) {
        errors.push("tradeOffs must be sorted (ascending)");
        break;
      }
    }
  }
  if (record.minimumVerifiedReturnPerYear !== undefined) {
    validateRationalField(record.minimumVerifiedReturnPerYear, "minimumVerifiedReturnPerYear", errors);
  }
  if (record.maximumExactCostFraction !== undefined) {
    validateRationalField(record.maximumExactCostFraction, "maximumExactCostFraction", errors);
  }
  if (typeof record.declaredAt !== "number" || !Number.isSafeInteger(record.declaredAt) || record.declaredAt < 0) {
    errors.push("declaredAt must be a non-negative integer (the caller-supplied declaration instant)");
  }
  if (errors.length > 0) {
    throw new WaitCriteriaError(`Invalid wait match criteria: ${errors.join("; ")}`, {
      errors: [...errors],
    });
  }
  const typed = candidate as WaitMatchCriteria;
  // The vocabulary law on every (bounded) human trade-off surface.
  for (const tradeOff of typed.tradeOffs) {
    assertNoGuaranteeLanguage(tradeOff, `wait '${typed.waitId}' tradeOff '${tradeOff}'`);
  }
  const built: WaitMatchCriteria = {
    waitId: typed.waitId,
    families: Object.freeze([...typed.families]),
    categories: Object.freeze([...typed.categories]),
    maxWaitMs: typed.maxWaitMs,
    maxSettlementMs: typed.maxSettlementMs,
    fallback: Object.freeze({ kind: typed.fallback.kind, routeRef: typed.fallback.routeRef }),
    tradeOffs: Object.freeze([...typed.tradeOffs]),
    ...(typed.minimumVerifiedReturnPerYear !== undefined
      ? { minimumVerifiedReturnPerYear: typed.minimumVerifiedReturnPerYear }
      : {}),
    ...(typed.maximumExactCostFraction !== undefined
      ? { maximumExactCostFraction: typed.maximumExactCostFraction }
      : {}),
    declaredAt: typed.declaredAt,
  };
  return deepFreeze(built);
}

/** Expiry law: expired EXACTLY when at > declaredAt + maxWaitMs (the deadline itself is still live). */
export function waitIsExpired(criteria: WaitMatchCriteria, at: number): boolean {
  validateInstant(at, "the wait expiry evaluation instant `at`");
  return at > waitDeadlineMs(criteria);
}

/** The verified-return lower bound (the estimate's honest floor), when knowable. */
export function verifiedReturnPerYear(opportunity: FinancialOpportunity): ExactRational | null {
  return opportunity.expectedReturn.bounds === null ? null : opportunity.expectedReturn.bounds.low;
}

/** The exact observed cost fraction (the full fee schedule), when knowable. */
export function exactCostFraction(opportunity: FinancialOpportunity): ExactRational | null {
  if (opportunity.fees.kind !== "KNOWN") {
    return null;
  }
  const { entryFeeFraction, exitFeeFraction, ongoingFeeFractionPerYear } = opportunity.fees.value;
  return addRationals(addRationals(entryFeeFraction, exitFeeFraction), ongoingFeeFractionPerYear);
}

/**
 * The threshold-free category attribution, derived deterministically from
 * the opportunity's typed first-class fields (vocabulary order): a fresh
 * eligible opportunity is always NEW; each knowability/evidence category
 * is attributed exactly when its typed field is KNOWN/observed.
 */
export function satisfiedWaitCategories(opportunity: FinancialOpportunity): readonly WaitCategory[] {
  const satisfied: WaitCategory[] = ["NEW_OPPORTUNITY"];
  if (opportunity.expectedReturn.bounds !== null) {
    satisfied.push("VERIFIED_RETURN_EVIDENCE");
  }
  if (opportunity.capitalRequired.kind === "KNOWN") {
    satisfied.push("CAPITAL_REQUIREMENT_KNOWN");
  }
  if (opportunity.liquidity.withdrawalLiquidityMinorUnits !== null) {
    satisfied.push("WITHDRAWAL_LIQUIDITY_OBSERVED");
  }
  if (opportunity.fees.kind === "KNOWN") {
    satisfied.push("FEES_KNOWN");
  }
  if (opportunity.maxLossBound.kind === "KNOWN") {
    satisfied.push("MAX_LOSS_BOUNDED");
  }
  return Object.freeze(satisfied);
}

/**
 * Evaluates the durable wait at instant `at` over the caller's opportunity
 * set: a THRESHOLD-FREE (by default) match over FRESH eligible opportunities
 * in the declared families, attributed to the DECLARED categories they
 * satisfy. STALE never matches; aged-but-fresh still matches; an empty set
 * is an honest no-match; the optional floor/ceiling are INCLUSIVE. The
 * result is the frozen five-fact record — nothing else (D8).
 */
export function evaluateWaitCriteria(
  criteria: WaitMatchCriteria,
  opportunities: readonly FinancialOpportunity[],
  at: number,
): WaitEvaluation {
  validateInstant(at, "the wait evaluation instant `at`");
  const validated = validateWaitCriteria(criteria);
  const expired = waitIsExpired(validated, at);
  const ids: string[] = [];
  const attribution: Record<string, readonly WaitCategory[]> = {};
  const declared = new Set<WaitCategory>(validated.categories);
  const families = new Set<OpportunityFamily>(validated.families);
  for (const opportunity of opportunities) {
    // The observation law: STALE evidence never matches (never attractive).
    if (isOpportunityStale(opportunity, at)) {
      continue;
    }
    if (!evaluateDiscoveryPolicy(opportunity, at).eligible) {
      continue;
    }
    if (!families.has(opportunity.family)) {
      continue;
    }
    const satisfied = satisfiedWaitCategories(opportunity).filter((category) => declared.has(category));
    if (satisfied.length === 0) {
      continue;
    }
    if (validated.minimumVerifiedReturnPerYear !== undefined) {
      const verified = verifiedReturnPerYear(opportunity);
      if (verified === null || compareRationals(verified, validated.minimumVerifiedReturnPerYear) < 0) {
        continue;
      }
    }
    if (validated.maximumExactCostFraction !== undefined) {
      const cost = exactCostFraction(opportunity);
      if (cost === null || compareRationals(cost, validated.maximumExactCostFraction) > 0) {
        continue;
      }
    }
    ids.push(opportunity.opportunityId);
    attribution[opportunity.opportunityId] = Object.freeze([...satisfied]);
  }
  ids.sort();
  return Object.freeze({
    matchedOpportunityIds: Object.freeze([...ids]),
    categoryAttribution: deepFreeze(attribution),
    expired,
    reasons: Object.freeze(expired ? ["WAIT_EXPIRED" as const] : []),
    waitingNeverDispatches: false,
  });
}
