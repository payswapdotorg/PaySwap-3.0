/**
 * @payswap/economic — local error taxonomy (Work Order P1-W1).
 *
 * The old repository's intent validators threw
 * `InvalidMoneyMovementIntentError extends ValidationError` imported from
 * `@payswap/protocol` (payswap.org@8a735bf packages/route-compiler/src/intent.ts
 * line 38). This package may NOT import sibling PaySwap packages (parallel-lane
 * self-containment; the economic layer may depend on [contracts] only), so the
 * fail-closed error discipline is re-declared LOCALLY. The TL reconciles the
 * taxonomy at integration; behavior (throw on first violation, message
 * carries the field path) is ported verbatim from the old intent law.
 */

/** Base class of every fail-closed economic-model validation error. */
export class InvalidEconomicModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEconomicModelError";
  }
}

/** Raised when a pinned AmountSpec wire value is structurally invalid. */
export class InvalidAmountSpecError extends InvalidEconomicModelError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAmountSpecError";
  }
}

/** Raised when a MoneyMovementIntent violates its contract (fail closed). */
export class InvalidMoneyMovementIntentError extends InvalidEconomicModelError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMoneyMovementIntentError";
  }
}

/** Raised when a ServiceAccessIntent violates its contract (fail closed). */
export class InvalidServiceAccessIntentError extends InvalidEconomicModelError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidServiceAccessIntentError";
  }
}

/** Raised when a PaymentIntent violates its contract (fail closed). */
export class InvalidPaymentIntentError extends InvalidEconomicModelError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPaymentIntentError";
  }
}

/** Raised when an EconomicGoal violates its contract (fail closed, GAP-01 net-new). */
export class InvalidEconomicGoalError extends InvalidEconomicModelError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEconomicGoalError";
  }
}

/** Raised when an EconomicProgram violates its contract (fail closed). */
export class InvalidEconomicProgramError extends InvalidEconomicModelError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEconomicProgramError";
  }
}

/** Raised when a VersionedEconomicInput violates its contract (fail closed). */
export class InvalidEconomicInputError extends InvalidEconomicModelError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEconomicInputError";
  }
}

/**
 * Raised when a compilation request or a compiled artifact violates the
 * compilation contract (expired demand, unsafe instants, duplicate derived
 * identity) — the port of the old route-compiler's fail-closed discipline.
 */
export class InvalidEconomicCompilationError extends InvalidEconomicModelError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEconomicCompilationError";
  }
}
