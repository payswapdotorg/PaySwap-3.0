import { describe, expect, it } from "vitest";
import { validateCustodyTransfer, assertCustodyContinuity, validateCustodyParty, describeCustodyParty } from "../src/custody.ts";
import { InvalidRouteLegContractError } from "../src/errors.ts";
import { compileBase } from "./compiler-fixtures.ts";
import type { CustodyParty } from "../src/custody.ts";
import { railCrossingMetric } from "../src/rail-family.ts";
import { route1Intent, route2Intent, route3Intent, route4Intent } from "./fixtures.ts";

/**
 * Custody continuity (PORT of the old custody-continuity suite): the
 * closed 5-kind party vocabulary, evidenced transfers with exact
 * amounts, the continuity law and the walk agreement.
 */
function transfer(from: CustodyParty, to: CustodyParty, evidenceRefs: readonly string[] = ["evidence:1"]) {
  return {
    from,
    to,
    assetRef: "ethereum:mainnet/asset:ETH",
    amount: { currency: "ETH", minorUnits: "10000000000000000" },
    evidenceRefs,
  };
}

const WALLET: CustodyParty = { kind: "ONCHAIN_WALLET", accountRef: "0x1111111111111111111111111111111111111111", chainKey: "ethereum:mainnet" };
const PROVIDER: CustodyParty = { kind: "EXTERNAL_PROVIDER", providerName: "psp-fixture" };
const BANK: CustodyParty = { kind: "EXTERNAL_BANK_INSTRUMENT", externalRef: "iban:DE89370400440532013000" };
const PROTOCOL: CustodyParty = { kind: "ONCHAIN_PROTOCOL", protocolKey: "fixture-dex-router", chainKey: "ethereum:mainnet" };
const MERCHANT: CustodyParty = { kind: "MERCHANT_BALANCE", merchantAccountRef: "acct-merchant-001", providerName: "merchant-psp-fixture" };

describe("custody continuity (positive laws)", () => {
  it("every plan of all four routes passes assertCustodyContinuity", () => {
    for (const intent of [route1Intent(), route2Intent(), route3Intent(), route4Intent()]) {
      const result = compileBase(intent);
      expect(result.plans.length).toBeGreaterThanOrEqual(2);
      for (const plan of result.plans) {
        expect(() => assertCustodyContinuity(plan.legs.map((leg) => leg.custody))).not.toThrow();
      }
    }
  });

  it("every custody transfer is evidenced, exact-integer and re-accepts validation verbatim", () => {
    const result = compileBase(route1Intent());
    for (const plan of result.plans) {
      for (const leg of plan.legs) {
        const revalidated = validateCustodyTransfer(leg.custody);
        expect(revalidated.assetRef).toBe(leg.custody.assetRef);
        expect(revalidated.amount.minorUnits).toMatch(/^(0|[1-9][0-9]*)$/);
        expect(revalidated.evidenceRefs.length).toBeGreaterThan(0);
        expect(Object.isFrozen(revalidated)).toBe(true);
      }
    }
  });

  it("the walk's custodyAtStop agrees with the chain's last hop (no hidden custody at the stop)", async () => {
    const { walkRoutePlan } = await import("../src/route-walk.ts");
    const { NOW } = await import("./fixtures.ts");
    const result = compileBase(route1Intent());
    for (const plan of result.plans) {
      const walk = walkRoutePlan({ plan, at: NOW, observedAtIso: "2026-10-03T00:00:01Z" });
      const lastLeg = plan.legs[plan.legs.length - 1];
      expect(walk.custodyAtStop?.party.kind).toBe(lastLeg?.custody.to.kind);
      expect(walk.custodyAtStop?.assetRef).toBe(lastLeg?.custody.assetRef);
    }
  });

  it("the rail-crossing metric is deterministic and advisory (per-leg family pairs in hop order)", () => {
    const result = compileBase(route1Intent());
    const plan = result.plans.find((candidate) => candidate.shapeId === "mixed-dex-offramp");
    if (plan === undefined) {
      throw new Error("the mixed plan must compile");
    }
    const metric = railCrossingMetric(plan.legs.map((leg) => leg.custody));
    expect(metric.legs.length).toBe(4);
    expect(metric.crossings).toBe(2);
    expect(metric.legs.map((leg) => leg.hopIndex)).toEqual([0, 1, 2, 3]);
  });
});

describe("custody continuity (adversarial laws)", () => {
  it("a gap at hop 0 or hop 1 throws INV-C09 naming both parties", () => {
    const walletToBank = transfer(WALLET, BANK);
    const providerToBank = transfer(PROVIDER, BANK);
    expect(() => assertCustodyContinuity([walletToBank, providerToBank])).toThrowError(/INV-C09/);
    expect(() => assertCustodyContinuity([walletToBank, providerToBank])).toThrowError(/bank:/);
    expect(() => assertCustodyContinuity([walletToBank, providerToBank])).toThrowError(/provider:/);
    const protocolToBank = transfer(PROTOCOL, BANK);
    expect(() => assertCustodyContinuity([walletToBank, protocolToBank])).toThrowError(/protocol:/);
  });

  it("empty, blank or missing evidenceRefs throw (INV-E02)", () => {
    expect(() => validateCustodyTransfer(transfer(WALLET, BANK, []))).toThrowError(/non-empty/);
    expect(() => validateCustodyTransfer(transfer(WALLET, BANK, [""]))).toThrowError(/non-empty/);
  });

  it("unknown party kinds throw — hidden custody is structurally unrepresentable", () => {
    for (const kind of ["SOMEWHERE_UNNAMED", "IMPLICIT_HOLDER", "CUSTODY_TRUST"]) {
      expect(() => validateCustodyParty({ kind }, "probe")).toThrowError(/closed custody vocabulary/);
    }
  });

  it("non-integer amounts and lowercase currencies throw (INV-F01)", () => {
    expect(() =>
      validateCustodyTransfer({ ...transfer(WALLET, BANK), amount: { currency: "ETH", minorUnits: "1.5" } }),
    ).toThrowError(InvalidRouteLegContractError);
    expect(() =>
      validateCustodyTransfer({ ...transfer(WALLET, BANK), amount: { currency: "eth", minorUnits: "10" } }),
    ).toThrowError(InvalidRouteLegContractError);
    expect(() =>
      validateCustodyTransfer({ ...transfer(WALLET, BANK), amount: { currency: "ETH", minorUnits: "-10" } }),
    ).toThrowError(InvalidRouteLegContractError);
  });

  it("the closed party vocabulary validates all five kinds with per-kind identity", () => {
    for (const party of [WALLET, PROVIDER, BANK, PROTOCOL, MERCHANT]) {
      expect(validateCustodyParty(party, "probe").kind).toBe(party.kind);
    }
    expect(describeCustodyParty(WALLET)).toContain("wallet:");
    expect(describeCustodyParty(PROVIDER)).toContain("provider:");
    expect(describeCustodyParty(BANK)).toContain("bank:");
    expect(describeCustodyParty(PROTOCOL)).toContain("protocol:");
    expect(describeCustodyParty(MERCHANT)).toContain("merchant-balance:");
  });

  it("continuity identity: providers compare by NAME (the account is the provider's internal concern)", () => {
    const providerPool: CustodyParty = { kind: "EXTERNAL_PROVIDER", providerName: "psp-fixture", accountRef: "acct-a" };
    const providerIssuer: CustodyParty = { kind: "EXTERNAL_PROVIDER", providerName: "psp-fixture", accountRef: "acct-b" };
    expect(() =>
      assertCustodyContinuity([transfer(providerPool, providerIssuer), transfer(providerIssuer, BANK)]),
    ).not.toThrow();
  });
});
