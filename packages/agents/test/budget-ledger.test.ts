import { describe, expect, it } from "vitest";
import {
  BudgetError,
  BudgetExhaustedError,
  OrganizationBudgetLedger,
  releaseOrganization,
} from "../src/index.ts";
import { makeOrgDraft } from "./fixtures.ts";

/**
 * NET-NEW (P3-W1): the organization budget ledger (FROZEN §7 "budgets").
 * Exact integer minor units (INV-2), declared budgets only, participants
 * only, mono-currency ceilings, fail-closed exhaustion, append-only spend
 * trail.
 */

const T0 = 5_000_000;

function ledgerWith(budgets: readonly { budgetId: string; scope: string; amount: { currency: string; minorUnits: string } }[]) {
  return new OrganizationBudgetLedger(
    releaseOrganization(makeOrgDraft({ budgets }), 4_000_000),
  );
}

describe("budget ledger — declared budgets and participants (B1, B2)", () => {
  it("records evidenced spends by participants against declared budgets", () => {
    const ledger = ledgerWith([
      { budgetId: "budget-1", scope: "routing-proposals", amount: { currency: "EUR", minorUnits: "50000" } },
    ]);
    const record = ledger.spend({
      budgetId: "budget-1",
      spentByInstanceId: "instance-payer",
      amount: { currency: "EUR", minorUnits: "15000" },
      spentAt: T0,
      evidenceRef: "proposal:p-1",
    });
    expect(record.scope).toBe("routing-proposals");
    expect(record.evidenceRef).toBe("proposal:p-1");
    expect(ledger.records()).toHaveLength(1);
  });

  it("rejects unknown budgets, non-participants and unevidenced spends", () => {
    const ledger = ledgerWith([
      { budgetId: "budget-1", scope: "routing-proposals", amount: { currency: "EUR", minorUnits: "50000" } },
    ]);
    expect(() =>
      ledger.spend({
        budgetId: "budget-ghost",
        spentByInstanceId: "instance-payer",
        amount: { currency: "EUR", minorUnits: "1" },
        spentAt: T0,
        evidenceRef: "x",
      }),
    ).toThrow(/not declared/);
    expect(() =>
      ledger.spend({
        budgetId: "budget-1",
        spentByInstanceId: "instance-ghost",
        amount: { currency: "EUR", minorUnits: "1" },
        spentAt: T0,
        evidenceRef: "x",
      }),
    ).toThrow(/not a participating instance/);
    expect(() =>
      ledger.spend({
        budgetId: "budget-1",
        spentByInstanceId: "instance-payer",
        amount: { currency: "EUR", minorUnits: "1" },
        spentAt: T0,
        evidenceRef: "",
      }),
    ).toThrow(/evidenced/);
  });
});

describe("budget ledger — exact money laws (B3)", () => {
  it("rejects non-canonical amounts (floating point, leading zeros, bad currency)", () => {
    const ledger = ledgerWith([
      { budgetId: "budget-1", scope: "routing", amount: { currency: "EUR", minorUnits: "100" } },
    ]);
    expect(() =>
      ledger.spend({
        budgetId: "budget-1",
        spentByInstanceId: "instance-payer",
        amount: { currency: "EUR", minorUnits: "1.5" },
        spentAt: T0,
        evidenceRef: "x",
      }),
    ).toThrow(BudgetError);
    expect(() =>
      ledger.spend({
        budgetId: "budget-1",
        spentByInstanceId: "instance-payer",
        amount: { currency: "eur", minorUnits: "1" },
        spentAt: T0,
        evidenceRef: "x",
      }),
    ).toThrow(BudgetError);
  });

  it("rejects cross-currency spends: a EUR ceiling can never bound USD", () => {
    const ledger = ledgerWith([
      { budgetId: "budget-1", scope: "routing", amount: { currency: "EUR", minorUnits: "100" } },
    ]);
    expect(() =>
      ledger.spend({
        budgetId: "budget-1",
        spentByInstanceId: "instance-payer",
        amount: { currency: "USD", minorUnits: "1" },
        spentAt: T0,
        evidenceRef: "x",
      }),
    ).toThrow(/does not match budget/);
  });

  it("adds exact integer minor units across many spends (no float drift)", () => {
    const ledger = ledgerWith([
      { budgetId: "budget-1", scope: "routing", amount: { currency: "EUR", minorUnits: "10000000000000000000" } },
    ]);
    for (let index = 0; index < 10; index += 1) {
      ledger.spend({
        budgetId: "budget-1",
        spentByInstanceId: "instance-payer",
        amount: { currency: "EUR", minorUnits: "999999999999999999" },
        spentAt: T0 + index,
        evidenceRef: `proposal:p-${index}`,
      });
    }
    expect(ledger.spentSoFar("budget-1").minorUnits).toBe("9999999999999999990");
    expect(ledger.remaining("budget-1").minorUnits).toBe("10");
    expect(ledger.isExhausted("budget-1")).toBe(false);
  });
});

describe("budget ledger — ceiling enforcement (B4, B5)", () => {
  it("a spend past the remaining ceiling fails closed with BudgetExhaustedError", () => {
    const ledger = ledgerWith([
      { budgetId: "budget-1", scope: "routing", amount: { currency: "EUR", minorUnits: "100" } },
    ]);
    ledger.spend({
      budgetId: "budget-1",
      spentByInstanceId: "instance-payer",
      amount: { currency: "EUR", minorUnits: "60" },
      spentAt: T0,
      evidenceRef: "p-1",
    });
    expect(() =>
      ledger.spend({
        budgetId: "budget-1",
        spentByInstanceId: "instance-payer",
        amount: { currency: "EUR", minorUnits: "41" },
        spentAt: T0 + 1,
        evidenceRef: "p-2",
      }),
    ).toThrow(BudgetExhaustedError);
    // the rejected spend left no trace (append-only, but nothing was appended)
    expect(ledger.records()).toHaveLength(1);
    expect(ledger.remaining("budget-1").minorUnits).toBe("40");
  });

  it("spending EXACTLY to the ceiling exhausts the budget and every further spend fails", () => {
    const ledger = ledgerWith([
      { budgetId: "budget-1", scope: "routing", amount: { currency: "EUR", minorUnits: "100" } },
    ]);
    ledger.spend({
      budgetId: "budget-1",
      spentByInstanceId: "instance-payer",
      amount: { currency: "EUR", minorUnits: "100" },
      spentAt: T0,
      evidenceRef: "p-1",
    });
    expect(ledger.isExhausted("budget-1")).toBe(true);
    expect(ledger.remaining("budget-1").minorUnits).toBe("0");
    expect(() =>
      ledger.spend({
        budgetId: "budget-1",
        spentByInstanceId: "instance-reviewer",
        amount: { currency: "EUR", minorUnits: "1" },
        spentAt: T0 + 1,
        evidenceRef: "p-2",
      }),
    ).toThrow(BudgetExhaustedError);
  });

  it("the spend trail is append-only and in spend order, with per-spender evidence", () => {
    const ledger = ledgerWith([
      { budgetId: "budget-1", scope: "routing", amount: { currency: "EUR", minorUnits: "1000" } },
    ]);
    ledger.spend({
      budgetId: "budget-1",
      spentByInstanceId: "instance-payer",
      amount: { currency: "EUR", minorUnits: "10" },
      spentAt: T0,
      evidenceRef: "p-1",
    });
    ledger.spend({
      budgetId: "budget-1",
      spentByInstanceId: "instance-reviewer",
      amount: { currency: "EUR", minorUnits: "20" },
      spentAt: T0 + 5,
      evidenceRef: "p-2",
    });
    expect(
      ledger.records().map((record) => [record.spentByInstanceId, record.evidenceRef]),
    ).toEqual([
      ["instance-payer", "p-1"],
      ["instance-reviewer", "p-2"],
    ]);
  });
});
