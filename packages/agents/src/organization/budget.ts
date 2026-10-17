/**
 * Organization budget contracts (P3-W1 net-new; FROZEN §7 "budgets").
 *
 * A released organization version declares its budgets as exact AmountSpec
 * ceilings. The budget ledger is a deterministic, append-only accounting of
 * spend against those ceilings: exact integer minor units (INV-2), one
 * currency per budget, fail-closed on exhaustion — an organization run can
 * never spend past a declared budget, and the spend trail is evidence.
 *
 * The ledger is the deterministic reference implementation (the budget
 * type lives in src/organization.ts).
 */

import type { AmountSpec } from "../amount.ts";
import type { OrganizationBudget, ReleasedOrganization } from "../organization.ts";

/** One append-only spend record against a declared organization budget. */
export interface BudgetSpendRecord {
  readonly budgetId: string;
  readonly scope: string;
  readonly amount: AmountSpec;
  readonly spentByInstanceId: string;
  readonly spentAt: number;
  /** Evidence reference for the spend (proposal, quote, execution trace). */
  readonly evidenceRef: string;
}

/** Raised when a budget operation fails closed. */
export class BudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetError";
  }
}

/** Raised when a spend would exceed the remaining budget ceiling. */
export class BudgetExhaustedError extends BudgetError {
  readonly budgetId: string;

  constructor(budgetId: string, message: string) {
    super(message);
    this.name = "BudgetExhaustedError";
    this.budgetId = budgetId;
  }
}

/**
 * Internal exact-integer helpers over the canonical AmountSpec wire form.
 * NOT a money API (INV-1: money semantics belong to the financial protocol
 * lane) — these are the minimal ordering/addition primitives the budget
 * ceiling needs, mirroring the trust lane's internal-helpers discipline.
 */
const CANONICAL_MINOR_UNITS = /^(0|[1-9][0-9]*)$/;
const CANONICAL_CURRENCY = /^[A-Z]{3}$/;

function requireCanonicalAmount(amount: AmountSpec, label: string): void {
  if (!CANONICAL_CURRENCY.test(amount.currency)) {
    throw new BudgetError(
      `${label} currency must be a 3-letter uppercase code, got '${amount.currency}'`,
    );
  }
  if (!CANONICAL_MINOR_UNITS.test(amount.minorUnits)) {
    throw new BudgetError(`${label} minorUnits must be exact integer minor units`);
  }
}

function compareMinorUnits(a: string, b: string): number {
  if (a.length !== b.length) {
    return a.length < b.length ? -1 : 1;
  }
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

function addMinorUnits(a: string, b: string): string {
  const digitsA = a.split("").reverse().map((digit) => digit.charCodeAt(0) - 48);
  const digitsB = b.split("").reverse().map((digit) => digit.charCodeAt(0) - 48);
  const length = Math.max(digitsA.length, digitsB.length);
  const out: number[] = [];
  let carry = 0;
  for (let index = 0; index < length; index += 1) {
    const sum = (digitsA[index] ?? 0) + (digitsB[index] ?? 0) + carry;
    out.push(sum % 10);
    carry = sum >= 10 ? 1 : 0;
  }
  if (carry > 0) {
    out.push(carry);
  }
  return out.reverse().join("");
}

/**
 * The organization budget ledger (deterministic, in-memory reference
 * implementation; the budget type lives in src/organization.ts).
 *
 * LAWS (fail closed, all of them):
 * - B1 DECLARED BUDGETS ONLY: spends apply to a budget declared by the
 *   RELEASED organization version; unknown budget ids are rejected.
 * - B2 PARTICIPANTS ONLY: only instances of this organization version may
 *   spend.
 * - B3 EXACT + MONO-CURRENCY: every amount is exact integer minor units
 *   (INV-2); a spend in a different currency than the budget ceiling is
 *   rejected (a ceiling in one currency can never bound another).
 * - B4 CEILING: total spend may never exceed the declared ceiling — a spend
 *   past the remaining budget throws BudgetExhaustedError (never negative,
 *   never best-effort).
 * - B5 APPEND-ONLY EVIDENCE: the spend trail is append-only and returned in
 *   spend order.
 */
export class OrganizationBudgetLedger {
  readonly #org: ReleasedOrganization;
  readonly #spends: BudgetSpendRecord[] = [];

  constructor(org: ReleasedOrganization) {
    this.#org = org;
  }

  #participants(): Set<string> {
    return new Set(this.#org.instances.map((instance) => instance.id));
  }

  #declaredBudget(budgetId: string): OrganizationBudget {
    const budget = this.#org.budgets.find((candidate) => candidate.budgetId === budgetId);
    if (budget === undefined) {
      throw new BudgetError(
        `budget '${budgetId}' is not declared by ${this.#org.id}@${this.#org.version}`,
      );
    }
    return budget;
  }

  /** Record one spend against a declared budget (laws B1-B4). */
  spend(params: {
    readonly budgetId: string;
    readonly spentByInstanceId: string;
    readonly amount: AmountSpec;
    readonly spentAt: number;
    readonly evidenceRef: string;
  }): BudgetSpendRecord {
    const budget = this.#declaredBudget(params.budgetId);
    requireCanonicalAmount(budget.amount, "budget ceiling");
    requireCanonicalAmount(params.amount, "spend amount");
    if (params.evidenceRef.length === 0) {
      throw new BudgetError("evidenceRef must not be empty: budget spends are evidenced");
    }
    if (!this.#participants().has(params.spentByInstanceId)) {
      throw new BudgetError(
        `spender '${params.spentByInstanceId}' is not a participating instance of ${this.#org.id}@${this.#org.version}`,
      );
    }
    if (params.amount.currency !== budget.amount.currency) {
      throw new BudgetError(
        `spend currency ${params.amount.currency} does not match budget '${budget.budgetId}' ceiling currency ${budget.amount.currency}`,
      );
    }
    const spent = this.spentSoFar(params.budgetId);
    const total = addMinorUnits(spent.minorUnits, params.amount.minorUnits);
    if (compareMinorUnits(total, budget.amount.minorUnits) > 0) {
      throw new BudgetExhaustedError(
        params.budgetId,
        `spend of ${params.amount.minorUnits} ${params.amount.currency} would exceed budget '${params.budgetId}' ceiling ${budget.amount.minorUnits} (already spent ${spent.minorUnits}): organization budgets fail closed`,
      );
    }
    const record: BudgetSpendRecord = Object.freeze({
      budgetId: budget.budgetId,
      scope: budget.scope,
      amount: params.amount,
      spentByInstanceId: params.spentByInstanceId,
      spentAt: params.spentAt,
      evidenceRef: params.evidenceRef,
    });
    this.#spends.push(record);
    return record;
  }

  /** Total spent against a budget so far (exact, same currency as ceiling). */
  spentSoFar(budgetId: string): AmountSpec {
    const budget = this.#declaredBudget(budgetId);
    let sum = "0";
    for (const spend of this.#spends) {
      if (spend.budgetId === budgetId) {
        sum = addMinorUnits(sum, spend.amount.minorUnits);
      }
    }
    return { currency: budget.amount.currency, minorUnits: sum };
  }

  /** Remaining ceiling (exact; never negative by law B4). */
  remaining(budgetId: string): AmountSpec {
    const budget = this.#declaredBudget(budgetId);
    const spent = this.spentSoFar(budgetId);
    let remaining = budget.amount.minorUnits;
    // Exact subtraction: spent <= ceiling is invariant under law B4.
    const digitsCeiling = remaining.split("").reverse().map((digit) => digit.charCodeAt(0) - 48);
    const digitsSpent = spent.minorUnits.split("").reverse().map((digit) => digit.charCodeAt(0) - 48);
    const out: number[] = [];
    let borrow = 0;
    for (let index = 0; index < digitsCeiling.length; index += 1) {
      const diff = (digitsCeiling[index] ?? 0) - (digitsSpent[index] ?? 0) - borrow;
      if (diff < 0) {
        out.push(diff + 10);
        borrow = 1;
      } else {
        out.push(diff);
        borrow = 0;
      }
    }
    const raw = out.reverse().join("");
    const trimmed = raw.replace(/^0+(?=\d)/, "");
    return { currency: budget.amount.currency, minorUnits: trimmed === "" ? "0" : trimmed };
  }

  /** True when a budget's ceiling is fully consumed. */
  isExhausted(budgetId: string): boolean {
    const budget = this.#declaredBudget(budgetId);
    return this.spentSoFar(budgetId).minorUnits === budget.amount.minorUnits;
  }

  /** The append-only spend trail, in spend order (law B5). */
  records(): readonly BudgetSpendRecord[] {
    return [...this.#spends];
  }
}
