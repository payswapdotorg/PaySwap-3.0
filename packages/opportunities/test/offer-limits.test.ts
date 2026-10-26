import { describe, expect, it } from "vitest";
import { ValidationError } from "../src/index.ts";
import {
  OFFER_LIMIT_REASONS,
  OPPORTUNITY_READ_SCOPE,
  OfferLimitsError,
  OfferPublicationGate,
  scopedOfferAccess,
  validateOfferLimitsPolicy,
} from "../src/offer-limits.ts";
import type { DeniedPublication, OfferAdmissionDecision, OfferLimitsPolicy } from "../src/offer-limits.ts";

/**
 * The offer publication rate policy (P16-C, gap-matrix row C9): fail-closed
 * policy validation, within-window admissions, the per-observer/per-venue
 * limits with the EXACT retryAfterMs, deterministic precedence, exact floor
 * window rollover (aligned + non-aligned windows), append-only counters
 * with role-split totals, admission input validation, sequence determinism,
 * and the pinned OPPORTUNITY_READ_SCOPE scoped access.
 */
describe("the offer publication rate policy", () => {
  const policy = (): OfferLimitsPolicy => ({
    maxOffers: 5,
    windowMs: 1_000,
    perObserver: 2,
    perVenue: 3,
  });
  const denied = (decision: OfferAdmissionDecision): DeniedPublication => {
    expect(decision.admitted).toBe(false);
    return decision as DeniedPublication;
  };

  it("policy validation is fail-closed (zero/negative/fractional bounds, nulls, partial limits, non-objects)", () => {
    for (const field of ["maxOffers", "windowMs", "perObserver", "perVenue"] as const) {
      for (const bad of [0, -1, 1.5, null]) {
        expect(() => validateOfferLimitsPolicy({ ...policy(), [field]: bad })).toThrow(OfferLimitsError);
      }
    }
    expect(() => validateOfferLimitsPolicy({})).toThrow(OfferLimitsError);
    expect(() => validateOfferLimitsPolicy(null)).toThrow(OfferLimitsError);
    expect(() => new OfferPublicationGate({ ...policy(), windowMs: 0 })).toThrow(OfferLimitsError);
    const validated = validateOfferLimitsPolicy(policy());
    expect(validated).not.toBe(policy());
    expect(Object.isFrozen(validated)).toBe(true);
    expect(Object.isFrozen(new OfferPublicationGate(policy()).policy())).toBe(true);
    expect(new OfferPublicationGate(policy()).policy()).toEqual(policy());
    expect([...OFFER_LIMIT_REASONS]).toEqual(["OBSERVER_RATE_LIMIT", "VENUE_RATE_LIMIT"]);
    expect(new OfferLimitsError("x")).toBeInstanceOf(ValidationError);
  });

  it("within-window admissions are admitted with the exact floor window index", () => {
    const gate = new OfferPublicationGate(policy());
    const first = gate.admit("observer:1", "venue:a", 0);
    expect(first.admitted).toBe(true);
    expect(first.windowIndex).toBe(0);
    const second = gate.admit("observer:1", "venue:a", 999);
    expect(second.admitted).toBe(true);
    expect(second.windowIndex).toBe(0);
    const denied = gate.admit("observer:1", "venue:a", 500);
    expect(denied.admitted).toBe(false);
    const rolled = gate.admit("observer:1", "venue:a", 1_000);
    expect(rolled.admitted).toBe(true);
    expect(rolled.windowIndex).toBe(1);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("per-OBSERVER limit -> OBSERVER_RATE_LIMIT with the EXACT retryAfterMs (800/1 edges; other observers untouched)", () => {
    const gate = new OfferPublicationGate({ ...policy(), perObserver: 1, perVenue: 10 });
    expect(gate.admit("observer:1", "venue:a", 0).admitted).toBe(true);
    const at800 = denied(gate.admit("observer:1", "venue:a", 800));
    expect(at800.reason).toBe("OBSERVER_RATE_LIMIT");
    expect(at800.retryAfterMs).toBe(200);
    expect(denied(gate.admit("observer:1", "venue:a", 1)).retryAfterMs).toBe(999);
    expect(denied(gate.admit("observer:1", "venue:a", 999)).retryAfterMs).toBe(1);
    expect(gate.admit("observer:2", "venue:a", 800).admitted).toBe(true);
  });

  it("per-VENUE limit -> VENUE_RATE_LIMIT (many observers one venue; other venues untouched)", () => {
    const gate = new OfferPublicationGate({ ...policy(), perObserver: 10, perVenue: 2 });
    expect(gate.admit("observer:1", "venue:a", 0).admitted).toBe(true);
    expect(gate.admit("observer:2", "venue:a", 10).admitted).toBe(true);
    const rejected = denied(gate.admit("observer:3", "venue:a", 20));
    expect(rejected.reason).toBe("VENUE_RATE_LIMIT");
    expect(rejected.retryAfterMs).toBe(980);
    expect(gate.admit("observer:3", "venue:b", 20).admitted).toBe(true);
  });

  it("deterministic precedence: both violated -> OBSERVER_RATE_LIMIT", () => {
    const gate = new OfferPublicationGate({ ...policy(), perObserver: 1, perVenue: 1 });
    expect(gate.admit("observer:1", "venue:a", 0).admitted).toBe(true);
    const both = denied(gate.admit("observer:1", "venue:a", 10));
    expect(both.reason).toBe("OBSERVER_RATE_LIMIT");
    const venueOnly = denied(gate.admit("observer:2", "venue:a", 20));
    expect(venueOnly.reason).toBe("VENUE_RATE_LIMIT");
  });

  it("window rollover via caller at with EXACT integer floor arithmetic (aligned 1000ms + non-aligned 300ms)", () => {
    const aligned = new OfferPublicationGate({ ...policy(), perObserver: 1, perVenue: 10 });
    expect(aligned.admit("observer:1", "venue:a", 999).windowIndex).toBe(0);
    expect(aligned.admit("observer:1", "venue:a", 1_000).windowIndex).toBe(1);
    expect(aligned.admit("observer:1", "venue:a", 1_999).admitted).toBe(false);
    expect(aligned.admit("observer:1", "venue:a", 2_000).windowIndex).toBe(2);
    const unaligned = new OfferPublicationGate({ ...policy(), windowMs: 300, perObserver: 1, perVenue: 10 });
    expect(unaligned.admit("observer:1", "venue:a", 299).windowIndex).toBe(0);
    expect(unaligned.admit("observer:1", "venue:a", 300).windowIndex).toBe(1);
    const mid = denied(unaligned.admit("observer:1", "venue:a", 599));
    expect(mid.windowIndex).toBe(1);
    expect(mid.retryAfterMs).toBe(1);
    expect(unaligned.admit("observer:1", "venue:a", 600).windowIndex).toBe(2);
  });

  it("append-only counters: denied admissions NOT counted; old windows stay; publications('') is a typed error", () => {
    const gate = new OfferPublicationGate({ ...policy(), perObserver: 1, perVenue: 10 });
    gate.admit("observer:1", "venue:a", 0);
    const before = gate.publications("observer:1");
    expect(before).toEqual({ observer: 1, venue: 0 });
    gate.admit("observer:1", "venue:a", 100);
    expect(gate.publications("observer:1")).toEqual(before);
    gate.admit("observer:1", "venue:a", 1_000);
    // Old windows stay: the rollover admission ADDS to the totals.
    expect(gate.publications("observer:1")).toEqual({ observer: 2, venue: 0 });
    expect(gate.publications("venue:a")).toEqual({ observer: 0, venue: 2 });
    expect(() => gate.publications("")).toThrow(OfferLimitsError);
  });

  it("venue-role and observer-role totals are split by role", () => {
    const gate = new OfferPublicationGate(policy());
    gate.admit("observer:1", "venue:a", 0);
    gate.admit("observer:1", "venue:a", 10);
    gate.admit("observer:2", "venue:a", 20);
    gate.admit("observer:2", "venue:b", 20);
    expect(gate.publications("observer:1")).toEqual({ observer: 2, venue: 0 });
    expect(gate.publications("observer:2")).toEqual({ observer: 2, venue: 0 });
    expect(gate.publications("venue:a")).toEqual({ observer: 0, venue: 3 });
    expect(gate.publications("venue:b")).toEqual({ observer: 0, venue: 1 });
  });

  it("admission input validation (empty refs, negative/fractional at, the batch ceiling)", () => {
    const gate = new OfferPublicationGate(policy());
    expect(() => gate.admit("", "venue:a", 0)).toThrow(OfferLimitsError);
    expect(() => gate.admit("observer:1", "", 0)).toThrow(OfferLimitsError);
    expect(() => gate.admit("observer:1", "venue:a", -1)).toThrow(RangeError);
    expect(() => gate.admit("observer:1", "venue:a", 0.5)).toThrow(RangeError);
    expect(() => gate.admit("observer:1", "venue:a", 0, 0)).toThrow(OfferLimitsError);
    expect(() => gate.admit("observer:1", "venue:a", 0, -2)).toThrow(OfferLimitsError);
    expect(() => gate.admit("observer:1", "venue:a", 0, 1.5)).toThrow(OfferLimitsError);
    expect(() => gate.admit("observer:1", "venue:a", 0, 6)).toThrow(OfferLimitsError);
    const wide = new OfferPublicationGate({ ...policy(), perObserver: 10, perVenue: 10 });
    const batch = wide.admit("observer:1", "venue:a", 0, 5);
    expect(batch.admitted).toBe(true);
    expect(batch.offerCount).toBe(5);
    expect(wide.publications("observer:1")).toEqual({ observer: 5, venue: 0 });
    expect(wide.publications("venue:a")).toEqual({ observer: 0, venue: 5 });
  });

  it("identical sequences -> identical decisions (a pure state machine over caller instants)", () => {
    const run = (gate: OfferPublicationGate) => {
      const decisions: unknown[] = [];
      for (const [observer, venue, at] of [
        ["observer:1", "venue:a", 0],
        ["observer:1", "venue:a", 500],
        ["observer:2", "venue:a", 500],
        ["observer:1", "venue:b", 1_200],
        ["observer:2", "venue:a", 1_400],
      ] as const) {
        decisions.push(gate.admit(observer, venue, at));
      }
      decisions.push(gate.publications("observer:1"), gate.publications("venue:a"));
      return decisions;
    };
    const first = run(new OfferPublicationGate(policy()));
    const second = run(new OfferPublicationGate(policy()));
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("scopedAccess: the pinned read scope allows (scopes returned verbatim); non-read scopes insufficient", () => {
    expect(OPPORTUNITY_READ_SCOPE).toBe("opportunities:read");
    const grants = { "principal:1": ["opportunities:read", "reports:read"] };
    const allowed = scopedOfferAccess(grants, "principal:1");
    expect(allowed.allowed).toBe(true);
    expect(allowed.principalRef).toBe("principal:1");
    expect(allowed.scopes).toEqual(["opportunities:read", "reports:read"]);
    expect(Object.isFrozen(allowed)).toBe(true);
    expect(Object.isFrozen(allowed.scopes)).toBe(true);
    const writeOnly = scopedOfferAccess({ "principal:1": ["opportunities:write"] }, "principal:1");
    expect(writeOnly.allowed).toBe(false);
    expect(writeOnly.scopes).toEqual(["opportunities:write"]);
  });

  it("scopedAccess negatives: empty grants denied; unknown principal fail-closed with NO scopes; malformed inputs typed", () => {
    expect(scopedOfferAccess({ "principal:1": [] }, "principal:1").allowed).toBe(false);
    expect(scopedOfferAccess({ "principal:1": [] }, "principal:1").scopes).toEqual([]);
    const emptyTable = scopedOfferAccess({}, "principal:unknown");
    expect(emptyTable.allowed).toBe(false);
    expect(emptyTable.scopes).toEqual([]);
    const unknown = scopedOfferAccess({ "principal:1": ["opportunities:read"] }, "principal:unknown");
    expect(unknown.allowed).toBe(false);
    expect(unknown.scopes).toEqual([]);
    expect(() => scopedOfferAccess({}, "")).toThrow(OfferLimitsError);
    expect(() =>
      scopedOfferAccess(null as unknown as Record<string, readonly string[]>, "principal:1"),
    ).toThrow(OfferLimitsError);
    expect(() =>
      scopedOfferAccess({ "principal:1": "opportunities:read" } as unknown as Record<string, readonly string[]>, "principal:1"),
    ).toThrow(OfferLimitsError);
    expect(() =>
      scopedOfferAccess({ "principal:1": [""] }, "principal:1"),
    ).toThrow(OfferLimitsError);
  });
});
