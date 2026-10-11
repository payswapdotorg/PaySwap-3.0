/**
 * Operation-discovery tests (P2-W3, net-new): what the user can do next +
 * why (eligibility reasons, required fields, limits) — with the honest
 * disclosure law (ineligible never silently dropped), the advisory
 * disclaimer (INV-10) and the catalogue-vs-connection law (INV-13).
 */

import { describe, expect, it } from "vitest";

import {
  type CapabilityOperationSource,
  type MoneyDisplayInput,
  foldOperationDiscovery,
} from "../src/index.ts";

const DISPLAY: MoneyDisplayInput = {
  currencyDigits: new Map([
    ["EUR", 2],
    ["GBP", 2],
  ]),
};

/** Overrides may explicitly set undefined to strip an optional key (exactOptionalPropertyTypes-safe helper). */
type OpOverrides = {
  [K in keyof CapabilityOperationSource]?: CapabilityOperationSource[K] | undefined;
};

function operation(operationId: string, overrides: OpOverrides = {}): CapabilityOperationSource {
  const source: Record<string, unknown> = {
    operationId,
    capabilityId: `capability:${operationId}`,
    connectedInstanceId: `connected:${operationId}`,
    operationLabel: `Do ${operationId}`,
    eligible: true,
    eligibilityReasons: [
      { code: "corridor_open", dimension: "corridor", detail: "the corridor is open with a fresh observation" },
    ],
    requiredFields: [
      {
        fieldId: "recipient.name",
        label: "Recipient full name",
        state: "MISSING",
        requiredWhen: "for every payout in this corridor",
      },
    ],
    limits: {
      minAmount: { currency: "EUR", minorUnits: "100" },
      maxAmount: { currency: "EUR", minorUnits: "1000000" },
      note: "per-transaction bounds declared by the capability authority",
    },
    freshness: { observedAt: "2026-10-11T12:00:00Z", version: "obs:7" },
    ...overrides,
  };
  for (const key of Object.keys(source)) {
    if (source[key] === undefined) delete source[key];
  }
  return source as unknown as CapabilityOperationSource;
}

describe("operation discovery (what the user can do next + why)", () => {
  const view = foldOperationDiscovery(
    [
      operation("payout.send"),
      operation("convert.preview", { eligible: false, eligibilityReasons: [
        { code: "stale_observation", dimension: "freshness", detail: "no fresh provider observation for this corridor" },
      ] }),
    ],
    { display: DISPLAY },
  );

  it("counts eligible/ineligible honestly and carries the advisory disclaimer (INV-10)", () => {
    expect(view.counts).toEqual({ total: 2, eligible: 1, ineligible: 1, catalogueOnly: 0 });
    expect(view.advisoryDisclaimer).toContain("cannot directly authorize execution");
    expect(view.outcomeLine).toContain("1 operation available");
    expect(view.outcomeLine).toContain("1 unavailable");
  });

  it("the eligible row shows WHY it is available, its required fields and its declared limits", () => {
    const row = view.available[0];
    expect(row?.operationId).toBe("payout.send");
    expect(row?.reasons.join(" ")).toContain("corridor_open");
    expect(row?.requiredFields[0]?.state).toBe("MISSING");
    expect(row?.requiredFields[0]?.requiredWhen).toContain("every payout");
    expect(row?.limits?.kind).toBe("DECLARED");
    expect(row?.limits?.note).toContain("at least 1.00 EUR");
    expect(row?.limits?.note).toContain("at most 10,000.00 EUR");
    expect(row?.freshness?.version).toBe("obs:7");
  });

  it("the ineligible row is disclosed with its typed reasons — never silently dropped", () => {
    const row = view.unavailable[0];
    expect(row?.operationId).toBe("convert.preview");
    expect(row?.reasons.join(" ")).toContain("stale_observation");
    expect(row?.reasons.join(" ")).toContain("no fresh provider observation");
  });

  it("an all-ineligible discovery leads with the honest fact (not a failure tone)", () => {
    const empty = foldOperationDiscovery(
      [operation("payout.send", { eligible: false })],
      { display: DISPLAY },
    );
    expect(empty.nothingAvailable).toBe(true);
    expect(empty.outcomeLine).toContain("Nothing available right now");
    expect(empty.outcomeLine).toContain("nothing was silently dropped");
  });

  it("limits honesty: no declared limits are never invented", () => {
    const none = foldOperationDiscovery(
      [operation("payout.send", { limits: undefined })],
      { display: DISPLAY },
    );
    expect(none.available[0]?.limits?.kind).toBe("NONE_DECLARED");
    expect(none.available[0]?.limits?.note).toContain("never invents them");
  });
});

describe("catalogue vs connection (INV-13 at the surface)", () => {
  it("a catalogue-only row is listed as unavailable with its reasons, and marked catalogueOnly", () => {
    const view = foldOperationDiscovery(
      [
        operation("payout.send", {
          connectedInstanceId: undefined,
          eligible: false,
          eligibilityReasons: [
            { code: "not_connected", dimension: "connection", detail: "catalogue support exists but nothing is connected" },
          ],
        }),
      ],
      { display: DISPLAY },
    );
    expect(view.counts.catalogueOnly).toBe(1);
    expect(view.available).toHaveLength(0);
    expect(view.unavailable[0]?.catalogueOnly).toBe(true);
    expect(view.unavailable[0]?.reasons.join(" ")).toContain("not_connected");
  });

  it("a catalogue-only row claiming eligibility is REFUSED (catalogue support alone can never be executable)", () => {
    expect(() =>
      foldOperationDiscovery(
        [operation("payout.send", { connectedInstanceId: undefined, eligible: true })],
        { display: DISPLAY },
      ),
    ).toThrow(/INV-13/);
  });

  it("malformed limit wire amounts are refused through the pin", () => {
    expect(() =>
      foldOperationDiscovery(
        [operation("payout.send", { limits: { minAmount: { currency: "EUR", minorUnits: "007" } } })],
        { display: DISPLAY },
      ),
    ).toThrow(/limits.minAmount/);
  });
});
