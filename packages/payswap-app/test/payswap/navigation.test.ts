/**
 * @payswap/app — navigation IA oracle (ADAPT of the P7-W1 share of
 * payswap.org@8a735bf packages/ux/test/product-ia.test.ts +
 * sidebar-contract.test.ts, MMP-35 behavioral oracle).
 *
 * The old suite's laws, re-asserted over the CANONICAL eleven-area IA
 * (the pinned surface registry — the old package's own nav vocabulary is
 * superseded by it): the area set is exactly the eleven contract areas in
 * contract order; every area names its money object (purpose, not a
 * feature list); every area carries an HONEST empty-state contract (a
 * reason + a real next action); routes are unique; no route segment is a
 * verb slug; and the nav fold is total and deterministic.
 */
import { describe, expect, it } from "vitest";
import { areaEmptyState, foldNavigation } from "../../src/lib/navigation.js";
import { UNIVERSAL_AREAS_MIRROR } from "../../src/lib/areas.js";
import { UNIVERSAL_AREA_IDS } from "../../src/pins/surface-pins.js";

describe("the eleven-area navigation IA (the pinned surface registry)", () => {
  it("is exactly the eleven contract areas, in contract order", () => {
    expect(UNIVERSAL_AREA_IDS).toEqual([
      "overview",
      "payments",
      "accounts",
      "activity",
      "opportunities",
      "connections",
      "capabilities",
      "security",
      "reports",
      "developers",
      "settings",
    ]);
    expect(UNIVERSAL_AREAS_MIRROR).toHaveLength(11);
  });

  it("every area names its money object (purpose, not a feature list)", () => {
    for (const area of UNIVERSAL_AREAS_MIRROR) {
      expect(area.label.length).toBeGreaterThan(0);
      expect(area.purpose.length).toBeGreaterThan(10);
      expect(area.purpose).not.toMatch(/^A page that /);
    }
    // The canonical honesty claims render in the purposes themselves.
    const accounts = UNIVERSAL_AREAS_MIRROR.find((a) => a.id === "accounts");
    expect(accounts?.purpose).toContain("never PaySwap custody");
  });

  it("every area carries an honest empty-state contract: a reason and a real next action", () => {
    for (const area of UNIVERSAL_AREAS_MIRROR) {
      expect(area.emptyState.reason.length).toBeGreaterThan(10);
      expect(area.emptyState.nextAction.kind).toMatch(/^(route|outcome)$/);
      expect(area.emptyState.nextAction.value.length).toBeGreaterThan(0);
    }
    // The empty states are HONEST: they name configured-authority facts.
    const payments = UNIVERSAL_AREAS_MIRROR.find((a) => a.id === "payments");
    expect(payments?.emptyState.reason).toContain("connected instances only");
  });

  it("every route in the registry is unique", () => {
    const routes = UNIVERSAL_AREAS_MIRROR.map((area) => area.route);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it("no route segment is a verb slug (areas name objects, not actions)", () => {
    const VERB_SLUGS = /^(pay|send|receive|convert|move|connect|report|manage|create)$/;
    for (const area of UNIVERSAL_AREAS_MIRROR) {
      for (const segment of area.route.split("/")) {
        if (segment.length > 0) {
          expect(VERB_SLUGS.test(segment)).toBe(false);
        }
      }
    }
  });

  it("every area cites auditable law documents (paths in this repository)", () => {
    for (const area of UNIVERSAL_AREAS_MIRROR) {
      expect(area.lawCitations.length).toBeGreaterThan(0);
      for (const citation of area.lawCitations) {
        expect(citation).toMatch(/^(docs|spec)\//);
      }
    }
  });
});

describe("the navigation fold", () => {
  it("is total and preserves the area set and order", () => {
    const view = foldNavigation();
    expect(view.areaIds).toEqual(UNIVERSAL_AREA_IDS);
    expect(view.areas).toHaveLength(11);
  });

  it("is deterministic: same input, same view", () => {
    expect(foldNavigation()).toEqual(foldNavigation());
  });

  it("areaEmptyState fails closed on unknown ids", () => {
    expect(() => areaEmptyState("not-an-area")).toThrow(/unknown universal area id/);
    expect(areaEmptyState("overview").nextAction.kind).toBe("route");
  });
});
