/**
 * Corridor-coverage tests (P2-W3, net-new): a corridor is a discovery
 * projection over capabilities — never an authority and never just a
 * currency pair. The view must reference its underlying capability
 * identities + versions (Wise §4.1), show why it is eligible or excluded,
 * and never offer a catalogue-only corridor as executable (INV-13).
 */

import { describe, expect, it } from "vitest";

import {
  type CorridorSource,
  foldCorridorCoverage,
} from "../src/index.ts";

const openCorridor: CorridorSource = {
  corridorId: "eu/eur->gb/gbp",
  sourceCountry: "EU",
  targetCountry: "GB",
  sourceCurrency: "EUR",
  targetCurrency: "GBP",
  capabilityRefs: [
    { capabilityId: "capability:payout.send", version: "def:12" },
    { capabilityId: "capability:fx.convert", version: "def:9" },
  ],
  connectedInstanceRefs: ["connected:instance-1"],
  eligible: true,
  reasons: ["corridor open with fresh observation v7"],
};

const excludedCorridor: CorridorSource = {
  corridorId: "us/usd->ng/NGN",
  sourceCountry: "US",
  targetCountry: "NG",
  sourceCurrency: "USD",
  targetCurrency: "NGN",
  capabilityRefs: [{ capabilityId: "capability:payout.send", version: "def:12" }],
  connectedInstanceRefs: [],
  eligible: false,
  reasons: ["no connected instance for this corridor (catalogue support only)"],
};

describe("corridor coverage projection", () => {
  const view = foldCorridorCoverage([openCorridor, excludedCorridor]);

  it("counts eligible/excluded/catalogue-only honestly", () => {
    expect(view.counts).toEqual({ total: 2, eligible: 1, excluded: 1, catalogueOnly: 1 });
    expect(view.outcomeLine).toContain("1 eligible corridor");
    expect(view.outcomeLine).toContain("1 excluded");
  });

  it("the eligible corridor references its underlying capabilities with versions (never just a currency pair)", () => {
    const row = view.rows.find((r) => r.corridorId === "eu/eur->gb/gbp");
    expect(row?.capabilityRefs).toHaveLength(2);
    expect(row?.capabilityRefs.map((c) => c.version).join(" ")).toContain("def:12");
    expect(row?.connectedInstanceRefs).toEqual(["connected:instance-1"]);
  });

  it("the excluded corridor carries its reasons verbatim", () => {
    const row = view.rows.find((r) => r.corridorId === "us/usd->ng/NGN");
    expect(row?.eligible).toBe(false);
    expect(row?.reasons.join(" ")).toContain("catalogue support only");
  });

  it("the advisory disclaimer says a corridor is a projection, not an authority", () => {
    expect(view.advisoryDisclaimer).toContain("not an authority");
    expect(view.advisoryDisclaimer).toContain("not a currency pair alone");
  });

  it("an all-excluded coverage leads with the honest fact", () => {
    const empty = foldCorridorCoverage([excludedCorridor]);
    expect(empty.nothingEligible).toBe(true);
    expect(empty.outcomeLine).toContain("No eligible corridor right now");
    expect(empty.outcomeLine).toContain("nothing was silently dropped");
  });
});

describe("corridor fail-closed guards", () => {
  it("a corridor without capability references is refused (never just a currency pair)", () => {
    const bare: CorridorSource = { ...openCorridor, capabilityRefs: [] };
    expect(() => foldCorridorCoverage([bare])).toThrow(/never just a currency pair/);
  });

  it("a capability reference without a version is refused", () => {
    const unversioned: CorridorSource = {
      ...openCorridor,
      capabilityRefs: [{ capabilityId: "capability:payout.send", version: "" }],
    };
    expect(() => foldCorridorCoverage([unversioned])).toThrow(/version/);
  });

  it("an eligible corridor without connected instances is refused (INV-13)", () => {
    const catalogueEligible: CorridorSource = {
      ...openCorridor,
      connectedInstanceRefs: [],
      eligible: true,
    };
    expect(() => foldCorridorCoverage([catalogueEligible])).toThrow(/INV-13/);
  });

  it("an empty corridorId is refused", () => {
    const unnamed: CorridorSource = { ...openCorridor, corridorId: "" };
    expect(() => foldCorridorCoverage([unnamed])).toThrow(/corridorId/);
  });
});
