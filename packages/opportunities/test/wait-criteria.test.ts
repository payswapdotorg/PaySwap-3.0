import { describe, expect, it } from "vitest";
import { GuaranteeLanguageError, ValidationError, discoverOpportunity } from "../src/index.ts";
import {
  MAX_WAIT_TRADE_OFF_LENGTH,
  WAIT_CATEGORIES,
  WaitCriteriaError,
  evaluateWaitCriteria,
  exactCostFraction,
  isWaitCategory,
  satisfiedWaitCategories,
  validateWaitCriteria,
  verifiedReturnPerYear,
  waitDeadlineMs,
  waitIsExpired,
} from "../src/wait-criteria.ts";
import type { WaitMatchCriteria } from "../src/wait-criteria.ts";
import {
  NOW,
  evidenceAged,
  healthyLendingObservation,
  healthyLiquidityObservation,
  staleQuoteObservation,
} from "./fixtures-catalog.ts";

/**
 * Durable WAIT criteria (P16-C, gap-matrix row C8; ADR-0009 D8): the frozen
 * six-category vocabulary, fail-closed validation into a NEW deep-frozen
 * record, the threshold-free match with declared-category attribution, the
 * INCLUSIVE verified-return floor and exact-cost ceiling, the expiry law
 * (EXACTLY at > declaredAt + maxWaitMs), maxSettlementMs never applied, and
 * the STRUCTURAL no-dispatch result (five pure fact keys,
 * waitingNeverDispatches === false).
 */
describe("durable WAIT criteria", () => {
  const waitCriteria = (overrides?: Partial<WaitMatchCriteria>): WaitMatchCriteria => ({
    waitId: "wait:mission:001",
    families: ["liquidity"],
    categories: [...WAIT_CATEGORIES],
    maxWaitMs: 60_000,
    maxSettlementMs: 86_400_000,
    fallback: { kind: "PROCEED_WITH_FALLBACK_ROUTE", routeRef: "route:baseline:001" },
    tradeOffs: ["cost", "speed"],
    declaredAt: NOW,
    ...overrides,
  });
  const liquidity = () => discoverOpportunity(healthyLiquidityObservation(), NOW);
  /** Deep no-dispatch key scan (any name, any depth; the pinned anti-dispatch literal itself is the exemption). */
  const noDispatchKeys = (value: unknown, seen: Set<unknown> = new Set()): boolean => {
    if (value === null || typeof value !== "object" || seen.has(value)) {
      return true;
    }
    seen.add(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (key !== "waitingNeverDispatches") {
        const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
        if (["action", "command", "dispatch", "execute", "authorize"].some((word) => normalized.includes(word))) {
          return false;
        }
      }
      if (!noDispatchKeys((value as Record<string, unknown>)[key], seen)) {
        return false;
      }
    }
    return true;
  };

  it("the closed six-category vocabulary is runtime-frozen, with the type guard", () => {
    expect(WAIT_CATEGORIES).toHaveLength(6);
    expect([...WAIT_CATEGORIES]).toEqual([
      "NEW_OPPORTUNITY",
      "VERIFIED_RETURN_EVIDENCE",
      "CAPITAL_REQUIREMENT_KNOWN",
      "WITHDRAWAL_LIQUIDITY_OBSERVED",
      "FEES_KNOWN",
      "MAX_LOSS_BOUNDED",
    ]);
    expect(Object.isFrozen(WAIT_CATEGORIES)).toBe(true);
    expect(isWaitCategory("NEW_OPPORTUNITY")).toBe(true);
    expect(isWaitCategory("NOPE")).toBe(false);
    expect(isWaitCategory(42)).toBe(false);
  });

  it("validateWaitCriteria constructs a NEW deep-frozen record (the input is never trusted)", () => {
    const input = waitCriteria();
    const validated = validateWaitCriteria(input);
    expect(validated).not.toBe(input);
    expect(validated.families).not.toBe(input.families);
    expect(Object.isFrozen(validated)).toBe(true);
    expect(Object.isFrozen(validated.families)).toBe(true);
    expect(Object.isFrozen(validated.categories)).toBe(true);
    expect(Object.isFrozen(validated.fallback)).toBe(true);
    expect(Object.isFrozen(validated.tradeOffs)).toBe(true);
    // Mutating the caller's original afterwards cannot affect the record.
    (input.families as string[]).push("lending");
    expect(validated.families).toEqual(["liquidity"]);
  });

  it("fail-closed: identity, family and category vocabularies (aggregated)", () => {
    expect(() => validateWaitCriteria(null)).toThrow(WaitCriteriaError);
    expect(() => validateWaitCriteria(42)).toThrow(WaitCriteriaError);
    try {
      validateWaitCriteria({});
      expect.unreachable("a malformed criteria must fail closed");
    } catch (error) {
      expect(error).toBeInstanceOf(WaitCriteriaError);
      expect((error as WaitCriteriaError).errors?.length).toBeGreaterThanOrEqual(6);
    }
    expect(() => validateWaitCriteria(waitCriteria({ waitId: "" }))).toThrow(/waitId/);
    expect(() => validateWaitCriteria(waitCriteria({ families: [] }))).toThrow(/families/);
    expect(() => validateWaitCriteria(waitCriteria({ families: ["liquidity", "nope"] as unknown as WaitMatchCriteria["families"] }))).toThrow(/six opportunity families/);
    expect(() => validateWaitCriteria(waitCriteria({ families: ["liquidity", "liquidity"] }))).toThrow(/unique/);
    expect(() => validateWaitCriteria(waitCriteria({ categories: [] }))).toThrow(/categories/);
    expect(() => validateWaitCriteria(waitCriteria({ categories: ["NEW_OPPORTUNITY", "NOPE"] as unknown as WaitMatchCriteria["categories"] }))).toThrow(/six wait categories/);
    expect(() => validateWaitCriteria(waitCriteria({ categories: ["NEW_OPPORTUNITY", "NEW_OPPORTUNITY"] }))).toThrow(/unique/);
  });

  it("fail-closed: positive-integer windows (maxWaitMs, maxSettlementMs)", () => {
    for (const maxWaitMs of [0, -1, 1.5]) {
      expect(() => validateWaitCriteria(waitCriteria({ maxWaitMs }))).toThrow(/maxWaitMs/);
    }
    for (const maxSettlementMs of [0, -5, 2.5]) {
      expect(() => validateWaitCriteria(waitCriteria({ maxSettlementMs }))).toThrow(/maxSettlementMs/);
    }
    expect(validateWaitCriteria(waitCriteria({ maxWaitMs: 1, maxSettlementMs: 1 })).maxWaitMs).toBe(1);
  });

  it("fail-closed: the fallback (kinds + routeRef) and the bounded sorted trade-offs", () => {
    expect(() => validateWaitCriteria(waitCriteria({ fallback: { kind: "PROCEED", routeRef: "route:1" } as unknown as WaitMatchCriteria["fallback"] }))).toThrow(/fallback\.kind/);
    expect(() => validateWaitCriteria(waitCriteria({ fallback: { kind: "CANCEL_WAIT", routeRef: "" } }))).toThrow(/routeRef/);
    expect(() => validateWaitCriteria(waitCriteria({ fallback: null as unknown as WaitMatchCriteria["fallback"] }))).toThrow(/fallback/);
    expect(() => validateWaitCriteria(waitCriteria({ tradeOffs: ["speed", "cost"] }))).toThrow(/sorted/);
    expect(() => validateWaitCriteria(waitCriteria({ tradeOffs: ["cost", "cost"] }))).toThrow(/unique/);
    expect(() => validateWaitCriteria(waitCriteria({ tradeOffs: [""] }))).toThrow(/non-empty/);
    expect(() => validateWaitCriteria(waitCriteria({ tradeOffs: ["a".repeat(MAX_WAIT_TRADE_OFF_LENGTH + 1)] }))).toThrow(/16-character bound/);
    expect(validateWaitCriteria(waitCriteria({ tradeOffs: ["a".repeat(MAX_WAIT_TRADE_OFF_LENGTH)] })).tradeOffs).toEqual([
      "a".repeat(MAX_WAIT_TRADE_OFF_LENGTH),
    ]);
    expect(validateWaitCriteria(waitCriteria({ tradeOffs: [] })).tradeOffs).toEqual([]);
  });

  it("fail-closed: rationals, instants, the typed hierarchy and the vocabulary law on trade-offs", () => {
    expect(() =>
      validateWaitCriteria(waitCriteria({ minimumVerifiedReturnPerYear: { numerator: "-1", denominator: "1" } })),
    ).toThrow(WaitCriteriaError);
    expect(() =>
      validateWaitCriteria(waitCriteria({ maximumExactCostFraction: { numerator: "1", denominator: "0" } })),
    ).toThrow(WaitCriteriaError);
    expect(() => validateWaitCriteria(waitCriteria({ declaredAt: -1 }))).toThrow(/declaredAt/);
    expect(() => validateWaitCriteria(waitCriteria({ declaredAt: 0.5 }))).toThrow(/declaredAt/);
    expect(new WaitCriteriaError("x")).toBeInstanceOf(ValidationError);
    expect(() => validateWaitCriteria(waitCriteria({ tradeOffs: ["risk free"] }))).toThrow(GuaranteeLanguageError);
  });

  it("threshold-free match over fresh eligible opportunities: ids + declared-category attribution", () => {
    const opportunity = liquidity();
    const evaluation = evaluateWaitCriteria(waitCriteria(), [opportunity], NOW);
    expect(evaluation.matchedOpportunityIds).toEqual([opportunity.opportunityId]);
    expect(evaluation.categoryAttribution[opportunity.opportunityId]).toEqual([...WAIT_CATEGORIES]);
    // The honest derived bounds: verified return 431/10000; exact cost 0 + 3/1000 + 1/10000 (unreduced).
    expect(verifiedReturnPerYear(opportunity)).toEqual({ numerator: "431", denominator: "10000" });
    expect(exactCostFraction(opportunity)).toEqual({ numerator: "31000", denominator: "10000000" });
    const unboundedLoss = discoverOpportunity(
      healthyLiquidityObservation({ observationId: "obs:liq:unbounded", maxLossKnown: false }),
      NOW,
    );
    expect(satisfiedWaitCategories(unboundedLoss)).toEqual([...WAIT_CATEGORIES].filter((c) => c !== "MAX_LOSS_BOUNDED"));
    const partial = evaluateWaitCriteria(waitCriteria({ categories: ["NEW_OPPORTUNITY", "FEES_KNOWN"] }), [unboundedLoss], NOW);
    expect(partial.categoryAttribution[unboundedLoss.opportunityId]).toEqual(["NEW_OPPORTUNITY", "FEES_KNOWN"]);
  });

  it("the verified-return floor is INCLUSIVE (431/10000 matches; 432/10000 does not)", () => {
    const at = evaluateWaitCriteria(
      waitCriteria({ minimumVerifiedReturnPerYear: { numerator: "431", denominator: "10000" } }),
      [liquidity()],
      NOW,
    );
    expect(at.matchedOpportunityIds).toHaveLength(1);
    const above = evaluateWaitCriteria(
      waitCriteria({ minimumVerifiedReturnPerYear: { numerator: "432", denominator: "10000" } }),
      [liquidity()],
      NOW,
    );
    expect(above.matchedOpportunityIds).toEqual([]);
  });

  it("the exact-cost ceiling is INCLUSIVE (31/10000 matches; 30/10000 does not)", () => {
    const at = evaluateWaitCriteria(
      waitCriteria({ maximumExactCostFraction: { numerator: "31", denominator: "10000" } }),
      [liquidity()],
      NOW,
    );
    expect(at.matchedOpportunityIds).toHaveLength(1);
    const below = evaluateWaitCriteria(
      waitCriteria({ maximumExactCostFraction: { numerator: "30", denominator: "10000" } }),
      [liquidity()],
      NOW,
    );
    expect(below.matchedOpportunityIds).toEqual([]);
  });

  it("STALE never matches; aged-but-fresh still matches; the family scope applies", () => {
    const stale = discoverOpportunity(staleQuoteObservation(), NOW);
    expect(evaluateWaitCriteria(waitCriteria(), [stale], NOW).matchedOpportunityIds).toEqual([]);
    const aged = discoverOpportunity({ ...healthyLiquidityObservation(), freshness: evidenceAged(20_000) }, NOW);
    expect(evaluateWaitCriteria(waitCriteria(), [aged], NOW).matchedOpportunityIds).toHaveLength(1);
    const lending = discoverOpportunity(healthyLendingObservation(), NOW);
    expect(evaluateWaitCriteria(waitCriteria(), [lending], NOW).matchedOpportunityIds).toEqual([]);
    expect(
      evaluateWaitCriteria(waitCriteria({ families: ["liquidity", "lending"] }), [lending], NOW)
        .matchedOpportunityIds,
    ).toHaveLength(1);
  });

  it("an empty set is an honest no-match; RangeError on negative/fractional at", () => {
    const evaluation = evaluateWaitCriteria(waitCriteria(), [], NOW);
    expect(evaluation.matchedOpportunityIds).toEqual([]);
    expect(evaluation.categoryAttribution).toEqual({});
    expect(evaluation.expired).toBe(false);
    expect(evaluation.reasons).toEqual([]);
    expect(() => evaluateWaitCriteria(waitCriteria(), [liquidity()], -1)).toThrow(RangeError);
    expect(() => evaluateWaitCriteria(waitCriteria(), [liquidity()], 0.5)).toThrow(RangeError);
  });

  it("expiry EXACTLY when at > declaredAt + maxWaitMs (the deadline itself still live; expired+matched together)", () => {
    // The deadline stays INSIDE the evidence window (30s) so expired+matched coexist honestly.
    const criteria = waitCriteria({ maxWaitMs: 20_000 });
    expect(waitDeadlineMs(criteria)).toBe(NOW + 20_000);
    expect(waitIsExpired(criteria, NOW + 20_000)).toBe(false);
    expect(waitIsExpired(criteria, NOW + 20_001)).toBe(true);
    const atDeadline = evaluateWaitCriteria(criteria, [liquidity()], NOW + 20_000);
    expect(atDeadline.expired).toBe(false);
    expect(atDeadline.reasons).toEqual([]);
    expect(atDeadline.matchedOpportunityIds).toHaveLength(1);
    const pastDeadline = evaluateWaitCriteria(criteria, [liquidity()], NOW + 20_001);
    expect(pastDeadline.expired).toBe(true);
    expect(pastDeadline.reasons).toEqual(["WAIT_EXPIRED"]);
    // Expired AND matched are reported TOGETHER (the caller decides).
    expect(pastDeadline.matchedOpportunityIds).toHaveLength(1);
  });

  it("maxSettlementMs is validated but NEVER applied; the result is the frozen five-fact no-dispatch record", () => {
    const first = evaluateWaitCriteria(waitCriteria({ maxSettlementMs: 1_000 }), [liquidity()], NOW + 10);
    const second = evaluateWaitCriteria(waitCriteria({ maxSettlementMs: 999_999 }), [liquidity()], NOW + 10);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(Object.keys(first).sort()).toEqual([
      "categoryAttribution",
      "expired",
      "matchedOpportunityIds",
      "reasons",
      "waitingNeverDispatches",
    ]);
    expect(first.waitingNeverDispatches).toBe(false);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.matchedOpportunityIds)).toBe(true);
    expect(noDispatchKeys(first)).toBe(true);
    expect(noDispatchKeys({ dispatch: {} })).toBe(false);
    expect(noDispatchKeys({ nested: { deepAction: 1 } })).toBe(false);
  });
});
