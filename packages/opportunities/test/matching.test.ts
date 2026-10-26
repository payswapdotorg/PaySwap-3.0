import { describe, expect, it } from "vitest";
import { ValidationError, discoverOpportunity } from "../src/index.ts";
import { ConsentLedger, DisclosureConsentError, consentIsValid } from "../src/consent.ts";
import type { ConsentSnapshot } from "../src/consent.ts";
import { WaitCriteriaError } from "../src/wait-criteria.ts";
import type { WaitMatchCriteria } from "../src/wait-criteria.ts";
import {
  MATCH_PRIVACY_AUDIT_FIELDS,
  MatchError,
  corridorCountriesOf,
  currencyOfCapitalRequirement,
  matchOpportunities,
  matchResultIsStructurallyPure,
  privacyAuditOf,
  validateOpportunityMatchCriteria,
} from "../src/matching.ts";
import type { OpportunityMatchCriteria } from "../src/matching.ts";
import {
  NOW,
  capitalOn,
  evidenceAged,
  healthyFxArbitrageObservation,
  healthyLendingObservation,
  healthyLiquidityObservation,
  manipulatedApyObservation,
  staleQuoteObservation,
} from "./fixtures-catalog.ts";

/**
 * Criteria→offer matching with the six-field privacy audit (P16-C,
 * gap-matrix row C7): fresh-eligible projection, the currency extraction
 * BY PREFIX LENGTH (the USCD regression probe), the FX-only corridor
 * derivation, the consent composition (caller-side consentIsValid gate +
 * the ledger's REVOKED record throwing in the projection), the fail-closed
 * scope law, deterministic ordering and structural purity.
 */
describe("criteria-to-offer matching with privacy audit", () => {
  const PURPOSE = "opportunity match disclosure for the waiting mission";
  const fullFields = (): readonly string[] => [...MATCH_PRIVACY_AUDIT_FIELDS];
  const liveSnapshot = (fields?: readonly string[]): ConsentSnapshot => {
    const ledger = new ConsentLedger();
    ledger.grant("observer:match:001", { fields: fields ?? fullFields(), purpose: PURPOSE }, NOW - 1_000);
    return ledger.snapshot("observer:match:001");
  };
  const criteria = (currencies?: readonly string[]): OpportunityMatchCriteria => ({
    waitId: "wait:match:001",
    families: ["liquidity", "lending", "arbitrage"],
    categories: ["NEW_OPPORTUNITY"],
    maxWaitMs: 60_000,
    maxSettlementMs: 3_600_000,
    fallback: { kind: "REPLAN_FROM_FRESH_EVIDENCE", routeRef: "route:baseline:001" },
    tradeOffs: ["cost", "speed"],
    declaredAt: NOW,
    ...(currencies !== undefined ? { currencies } : {}),
  });
  const liquidity = () => discoverOpportunity(healthyLiquidityObservation(), NOW);
  const lending = () => discoverOpportunity(healthyLendingObservation(), NOW);
  const fxArbitrage = () => discoverOpportunity(healthyFxArbitrageObservation(), NOW);

  it("matches fresh eligible opportunities in the declared families (deterministic order)", () => {
    const result = matchOpportunities(
      { criteria: criteria(), opportunities: [lending(), liquidity(), fxArbitrage()], consent: liveSnapshot() },
      NOW,
    );
    expect(result.matched).toHaveLength(3);
    const ids = result.matched.map((entry) => entry.opportunityId);
    expect(ids).toEqual([...ids].sort());
    expect(result.evaluatedAt).toBe(NOW);
    expect(result.matched[0]?.opportunityId).toBe(fxArbitrage().opportunityId);
  });

  it("the currency extraction law: the asset symbol is sliced by PREFIX LENGTH (USCD, never SCD)", () => {
    expect(currencyOfCapitalRequirement(liquidity())).toBe("USCD");
    expect(currencyOfCapitalRequirement(fxArbitrage())).toBe("USCD");
    const { capitalRequired: _omitted, ...input } = healthyLiquidityObservation();
    const unknownCapital = discoverOpportunity(input, NOW);
    expect(currencyOfCapitalRequirement(unknownCapital)).toBeNull();
    expect(privacyAuditOf(unknownCapital).asset_symbol).toBeNull();
  });

  it("the currency criterion filters by the extracted symbol (the USCD regression probe)", () => {
    const opportunities = [liquidity()];
    const uscd = matchOpportunities(
      { criteria: criteria(["USCD"]), opportunities, consent: liveSnapshot() },
      NOW,
    );
    expect(uscd.matched).toHaveLength(1);
    // The lost wave's +8 off-by-one extracted "SCD": a "SCD" scope never matches.
    const scd = matchOpportunities(
      { criteria: criteria(["SCD"]), opportunities, consent: liveSnapshot() },
      NOW,
    );
    expect(scd.matched).toHaveLength(0);
    const unscoped = matchOpportunities(
      { criteria: criteria(), opportunities, consent: liveSnapshot() },
      NOW,
    );
    expect(unscoped.matched).toHaveLength(1);
  });

  it("STALE opportunities never match (the observation law)", () => {
    const stale = discoverOpportunity(staleQuoteObservation(), NOW);
    const result = matchOpportunities(
      { criteria: criteria(), opportunities: [stale], consent: liveSnapshot() },
      NOW,
    );
    expect(result.matched).toHaveLength(0);
  });

  it("ineligible opportunities never match (fresh but policy-ineligible)", () => {
    const manipulated = discoverOpportunity(manipulatedApyObservation(), NOW);
    const result = matchOpportunities(
      { criteria: criteria(), opportunities: [manipulated], consent: liveSnapshot() },
      NOW,
    );
    expect(result.matched).toHaveLength(0);
  });

  it("aged-but-fresh opportunities still match (the inclusive staleness bound)", () => {
    const aged = discoverOpportunity({ ...healthyLiquidityObservation(), freshness: evidenceAged(20_000) }, NOW);
    const result = matchOpportunities(
      { criteria: criteria(), opportunities: [aged], consent: liveSnapshot() },
      NOW,
    );
    expect(result.matched).toHaveLength(1);
  });

  it("the six-field privacy audit: the FX fixture flows ALL SIX fields (full consent)", () => {
    const fx = fxArbitrage();
    const result = matchOpportunities(
      { criteria: criteria(), opportunities: [fx], consent: liveSnapshot() },
      NOW,
    );
    expect(result.matched[0]?.audit).toEqual({
      opportunity_id: fx.opportunityId,
      family: "arbitrage",
      rail_kind: "FX",
      asset_symbol: "USCD",
      corridor_countries: ["EUR", "USD"],
      evidence_version: 7,
    });
    expect(Object.keys(result.matched[0]?.audit ?? {})).toEqual([...MATCH_PRIVACY_AUDIT_FIELDS]);
  });

  it("the FX-ONLY corridor law: an ONCHAIN opportunity can structurally never populate corridor_countries", () => {
    expect(corridorCountriesOf(liquidity())).toEqual([]);
    expect(privacyAuditOf(liquidity()).corridor_countries).toEqual([]);
    expect(corridorCountriesOf(fxArbitrage())).toEqual(["EUR", "USD"]);
    const malformedPair = discoverOpportunity(
      { ...healthyFxArbitrageObservation(), railKey: "fx:eur-usd-x", capitalRequired: capitalOn("fx:eur-usd-x", "50000000") },
      NOW,
    );
    expect(corridorCountriesOf(malformedPair)).toEqual([]);
  });

  it("consent gating: no live consent fails closed (MatchError)", () => {
    const neverGranted: ConsentSnapshot = { subject: "observer:x", granted: null, revocation: null };
    expect(() =>
      matchOpportunities({ criteria: criteria(), opportunities: [liquidity()], consent: neverGranted }, NOW),
    ).toThrow(MatchError);
    const malformed = { subject: "observer:x", granted: "garbage", revocation: null } as unknown as ConsentSnapshot;
    expect(() =>
      matchOpportunities({ criteria: criteria(), opportunities: [liquidity()], consent: malformed }, NOW),
    ).toThrow(MatchError);
  });

  it("the ledger's REVOKED record throws in the projection (DisclosureConsentError from its declaring module)", () => {
    const ledger = new ConsentLedger();
    ledger.grant("observer:match:001", { fields: fullFields(), purpose: PURPOSE }, NOW - 1_000);
    ledger.revoke("observer:match:001", NOW - 1);
    const revokedSnapshot = ledger.snapshot("observer:match:001");
    expect(() =>
      matchOpportunities({ criteria: criteria(), opportunities: [liquidity()], consent: revokedSnapshot }, NOW),
    ).toThrow(DisclosureConsentError);
    expect(() =>
      matchOpportunities({ criteria: criteria(), opportunities: [liquidity()], consent: revokedSnapshot }, NOW),
    ).toThrow(/REVOKED/);
    expect(new DisclosureConsentError("x")).toBeInstanceOf(ValidationError);
  });

  it("the honest composition: consentIsValid is the caller-side gate (a stale pre-revocation GRANTED snapshot)", () => {
    const ledger = new ConsentLedger();
    ledger.grant("observer:match:001", { fields: fullFields(), purpose: PURPOSE }, NOW - 1_000);
    ledger.revoke("observer:match:001", NOW - 1);
    const stale = ledger.snapshot("observer:match:001");
    // The caller-side gate: the pre-revocation GRANT is superseded — false, never a throw.
    expect(consentIsValid(stale)).toBe(false);
    expect(stale.granted?.state).toBe("GRANTED");
    // A LIVE snapshot passes the gate AND the projection.
    const live = liveSnapshot();
    expect(consentIsValid(live)).toBe(true);
    expect(
      matchOpportunities({ criteria: criteria(), opportunities: [liquidity()], consent: live }, NOW).matched,
    ).toHaveLength(1);
  });

  it("the fail-closed scope law: the consented scope must cover all six audit fields", () => {
    const partial = liveSnapshot(fullFields().filter((field) => field !== "corridor_countries"));
    expect(() =>
      matchOpportunities({ criteria: criteria(), opportunities: [liquidity()], consent: partial }, NOW),
    ).toThrow(MatchError);
    expect(() =>
      matchOpportunities({ criteria: criteria(), opportunities: [liquidity()], consent: partial }, NOW),
    ).toThrow(/corridor_countries/);
    expect(
      matchOpportunities({ criteria: criteria(), opportunities: [liquidity()], consent: liveSnapshot() }, NOW)
        .matched,
    ).toHaveLength(1);
  });

  it("validateOpportunityMatchCriteria: the wait core delegates (WaitCriteriaError); the extension throws MatchError", () => {
    const valid = criteria(["USCD"]);
    const validated = validateOpportunityMatchCriteria(valid);
    expect(validated).not.toBe(valid);
    expect(validated.currencies).toEqual(["USCD"]);
    expect(Object.isFrozen(validated)).toBe(true);
    expect(validateOpportunityMatchCriteria(criteria()).currencies).toBeUndefined();
    expect(() => validateOpportunityMatchCriteria({ ...criteria(), families: ["nope"] })).toThrow(WaitCriteriaError);
    expect(() => validateOpportunityMatchCriteria({ ...criteria(), currencies: [] })).toThrow(MatchError);
    expect(() => validateOpportunityMatchCriteria({ ...criteria(), currencies: ["uscd"] })).toThrow(MatchError);
    expect(() => validateOpportunityMatchCriteria({ ...criteria(), currencies: ["USCD", "USCD"] })).toThrow(MatchError);
  });

  it("the wait vocabulary IS the match vocabulary (a plain WaitMatchCriteria is a valid match criteria)", () => {
    const shared: WaitMatchCriteria = {
      waitId: "wait:shared:001",
      families: ["liquidity"],
      categories: ["NEW_OPPORTUNITY"],
      maxWaitMs: 60_000,
      maxSettlementMs: 3_600_000,
      fallback: { kind: "CANCEL_WAIT", routeRef: "route:baseline:001" },
      tradeOffs: [],
      declaredAt: NOW,
    };
    const result = matchOpportunities(
      { criteria: shared, opportunities: [liquidity(), lending()], consent: liveSnapshot() },
      NOW,
    );
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]?.opportunityId).toBe(liquidity().opportunityId);
  });

  it("deterministic ordering by opportunityId regardless of input order", () => {
    const forward = [liquidity(), lending(), fxArbitrage()];
    const backward = [fxArbitrage(), lending(), liquidity()];
    const first = matchOpportunities({ criteria: criteria(), opportunities: forward, consent: liveSnapshot() }, NOW);
    const second = matchOpportunities({ criteria: criteria(), opportunities: backward, consent: liveSnapshot() }, NOW);
    expect(second.matched.map((entry) => entry.opportunityId)).toEqual(
      first.matched.map((entry) => entry.opportunityId),
    );
  });

  it("byte-identical determinism (same inputs, same instant -> identical results)", () => {
    const input = {
      criteria: criteria(["USCD"]),
      opportunities: [liquidity(), fxArbitrage()],
      consent: liveSnapshot(),
    };
    const first = matchOpportunities(input, NOW);
    const second = matchOpportunities(input, NOW);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.matched)).toBe(true);
    expect(Object.isFrozen(first.matched[0])).toBe(true);
  });

  it("the match result is structurally pure (no dispatch-shaped key at any name) and carries exactly its facts", () => {
    const result = matchOpportunities(
      { criteria: criteria(), opportunities: [liquidity()], consent: liveSnapshot() },
      NOW,
    );
    expect(Object.keys(result).sort()).toEqual(["evaluatedAt", "matched"]);
    expect(matchResultIsStructurallyPure(result)).toBe(true);
    expect(matchResultIsStructurallyPure({ action: "dispatch" })).toBe(false);
    expect(matchResultIsStructurallyPure({ nested: { commandId: "x" } })).toBe(false);
    expect(matchResultIsStructurallyPure({ deep: [{ authorize: true }] })).toBe(false);
  });

  it("the evaluation instant is caller-supplied (RangeError); an empty set is an honest no-match", () => {
    expect(() =>
      matchOpportunities({ criteria: criteria(), opportunities: [], consent: liveSnapshot() }, -1),
    ).toThrow(RangeError);
    expect(() =>
      matchOpportunities({ criteria: criteria(), opportunities: [], consent: liveSnapshot() }, 0.5),
    ).toThrow(RangeError);
    const empty = matchOpportunities(
      { criteria: criteria(), opportunities: [], consent: liveSnapshot() },
      NOW,
    );
    expect(empty.matched).toEqual([]);
    expect(empty.evaluatedAt).toBe(NOW);
    expect(() =>
      matchOpportunities(null as unknown as Parameters<typeof matchOpportunities>[0], NOW),
    ).toThrow(MatchError);
  });
});
