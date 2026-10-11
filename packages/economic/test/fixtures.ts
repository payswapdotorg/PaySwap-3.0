/**
 * Shared deterministic fixtures for the @payswap/economic test suite
 * (Work Order P1-W1). Discipline ported from payswap.org@8a735bf
 * packages/route-compiler/test/fixtures.ts (953 lines): every identifier,
 * timestamp and amount is a FIXED CONSTANT — no clock, no randomness. The
 * old fixtures' rail-specific machinery (venue packs, pools, PSP
 * activations, Stripe evidence — the route-1-* material) is deliberately
 * NOT ported: it is P5-W1/P5-W3 material and this package's contract is
 * rail/provider-neutral. These fixtures exercise the neutral shapes only.
 */

import type { AmountSpec } from "../src/amount-spec.ts";
import type { EconomicGoal } from "../src/goal.ts";
import type { MoneyMovementIntent } from "../src/intent.ts";
import type { PaymentIntent } from "../src/payment-intent.ts";
import type { ServiceAccessIntent } from "../src/service-intent.ts";
import type { EconomicProgram } from "../src/program.ts";
import type { VersionedEconomicInput } from "../src/versioned-input.ts";

// ---------------------------------------------------------------------------
// Deterministic constants (the old fixtures' NOW discipline, kept verbatim
// in spirit: a fixed parse of a fixed ISO instant — never Date.now())
// ---------------------------------------------------------------------------

export const NOW_ISO = "2026-10-03T00:00:00Z" as const;
export const NOW = Date.parse(NOW_ISO);
export const HOUR_MS = 3_600_000 as const;

export const PRINCIPAL = "user:merchant-ops-001" as const;
export const GOAL_ID = "goal:payroll-eu-001" as const;
export const AUTHORIZATION_REF = "authz:demand:payroll-eu-001" as const;

/** A principal-controlled wallet holding ETH (opaque location ref; rail meaning lives in the observation plane). */
export const ORIGIN_WALLET = {
  locationRef: "fundsloc:wallet:0x1111111111111111111111111111111111111111",
  currency: "ETH",
  observationRef: "obs:wallet-eth:1",
} as const;

/** A merchant bank payout location in EUR. */
export const DESTINATION_BANK = {
  locationRef: "fundsloc:bank:iban:DE89370400440532013000",
  currency: "EUR",
  observationRef: "obs:bank-eur:1",
} as const;

/** An onchain recipient location in USC (same neutral shape — no rail fields). */
export const DESTINATION_CHAIN = {
  locationRef: "fundsloc:chain:recipient-7f3a",
  currency: "USC",
  observationRef: "obs:chain-usc:1",
} as const;

/** 0.01 ETH at an 18-digit scale (the old fixtures' ORIGIN_ETH_MINOR constant). */
export const ORIGIN_ETH_MINOR = "10000000000000000" as const;
/** 100.00 EUR at a 2-digit scale. */
export const ORIGIN_EUR_MINOR = "10000" as const;

export const BASE_CONSTRAINTS = { maxSettlementMs: 600_000, maxRouteHops: 6 } as const;

// ---------------------------------------------------------------------------
// AmountSpec fixtures
// ---------------------------------------------------------------------------

export function ethAmount(): AmountSpec {
  return { currency: "ETH", minorUnits: ORIGIN_ETH_MINOR };
}

export function eurAmount(): AmountSpec {
  return { currency: "EUR", minorUnits: ORIGIN_EUR_MINOR };
}

// ---------------------------------------------------------------------------
// Versioned economic input fixtures (canonical JSON content)
// ---------------------------------------------------------------------------

export function quoteInput(): VersionedEconomicInput {
  return {
    kind: "QUOTE",
    version: 1,
    sourceRef: "obs:quote:eth-eur:1",
    content: '{"arrivesIn":"EUR","leaves":"ETH","rate":{"den":"1000","num":"3"}}',
  };
}

export function corridorInput(): VersionedEconomicInput {
  return {
    kind: "CORRIDOR",
    version: 2,
    sourceRef: "obs:corridor:wallet-to-bank:1",
    content: '{"deliveryEstimate":"SAME_DAY","jurisdiction":"DE"}',
  };
}

// ---------------------------------------------------------------------------
// Intent fixtures (the rail-neutral ADAPT of the old route-1..4 intents)
// ---------------------------------------------------------------------------

export function movementIntent(): MoneyMovementIntent {
  return {
    intentId: "intent:payroll-eu-001:0",
    principalRef: PRINCIPAL,
    origin: ORIGIN_WALLET,
    destination: DESTINATION_BANK,
    originAmount: ethAmount(),
    arrivalCurrency: "EUR",
    constraints: BASE_CONSTRAINTS,
    intentAuthorizationRef: AUTHORIZATION_REF,
    declaredAt: NOW - HOUR_MS,
    expiresAt: NOW + HOUR_MS,
  };
}

export function paymentIntent(): PaymentIntent {
  return {
    ...movementIntent(),
    intentId: "intent:checkout-merchant-001:0",
    commerceRef: "checkout:merchant-001:cart-9",
  };
}

export function serviceIntent(): ServiceAccessIntent {
  return {
    intentId: "intent:service-video-001:0",
    principalRef: PRINCIPAL,
    serviceRef: "service:video:standard-plan",
    beneficiaryRef: "user:payer-001",
    maxCost: { currency: "USD", minorUnits: "1599" },
    constraints: BASE_CONSTRAINTS,
    authorizationRef: AUTHORIZATION_REF,
    declaredAt: NOW - HOUR_MS,
    expiresAt: NOW + HOUR_MS,
  };
}

// ---------------------------------------------------------------------------
// Goal fixtures (net-new per GAP-01)
// ---------------------------------------------------------------------------

export function movementGoal(): EconomicGoal {
  return {
    goalId: GOAL_ID,
    principalRef: PRINCIPAL,
    objective: "Settle the EU payroll from treasury ETH by Friday",
    allowedArchetypes: ["MONEY_MOVEMENT"],
    outcomes: [
      {
        kind: "MONEY_MOVEMENT",
        demand: {
          origin: ORIGIN_WALLET,
          destination: DESTINATION_BANK,
          originAmount: ethAmount(),
        },
      },
    ],
    constraints: BASE_CONSTRAINTS,
    timeBounds: { declaredAt: NOW - HOUR_MS, deadlineAt: NOW + HOUR_MS },
    recourse: {
      requiresReversibility: false,
      minDisputeWindowMs: 0,
      policyStatement: "Standard payout recourse policy P-2026-11.",
    },
    proofs: [{ kind: "SETTLEMENT_FINALITY", description: "Bank payout finality record" }],
    nonGoals: ["Do not touch the cold-storage treasury wallet"],
    economicInputs: [quoteInput(), corridorInput()],
    authorizationRef: AUTHORIZATION_REF,
  };
}

export function paymentGoal(): EconomicGoal {
  return {
    ...movementGoal(),
    goalId: "goal:checkout-merchant-001",
    objective: "Pay merchant-001 for cart-9 in EUR",
    allowedArchetypes: ["PAYMENT"],
    outcomes: [
      {
        kind: "PAYMENT",
        demand: {
          origin: ORIGIN_WALLET,
          destination: DESTINATION_BANK,
          originAmount: ethAmount(),
        },
        commerceRef: "checkout:merchant-001:cart-9",
      },
    ],
  };
}

export function serviceGoal(): EconomicGoal {
  return {
    ...movementGoal(),
    goalId: "goal:service-video-001",
    objective: "Keep the standard video plan active for user:payer-001",
    allowedArchetypes: ["SERVICE_ACCESS"],
    outcomes: [
      {
        kind: "SERVICE_ACCESS",
        demand: {
          serviceRef: "service:video:standard-plan",
          beneficiaryRef: "user:payer-001",
          maxCost: { currency: "USD", minorUnits: "1599" },
        },
      },
    ],
  };
}

export function multiOutcomeGoal(): EconomicGoal {
  return {
    ...movementGoal(),
    goalId: "goal:payroll-and-tools-001",
    objective: "Payroll plus the tooling subscription",
    allowedArchetypes: ["MONEY_MOVEMENT", "SERVICE_ACCESS"],
    outcomes: [
      {
        kind: "MONEY_MOVEMENT",
        demand: {
          origin: ORIGIN_WALLET,
          destination: DESTINATION_BANK,
          originAmount: ethAmount(),
        },
      },
      {
        kind: "SERVICE_ACCESS",
        demand: {
          serviceRef: "service:video:standard-plan",
          beneficiaryRef: "user:payer-001",
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Program fixtures
// ---------------------------------------------------------------------------

export function recurringProgram(): EconomicProgram {
  return {
    programId: "program:monthly-payroll-001",
    goalTemplate: movementGoal(),
    recurrence: {
      anchorAt: NOW,
      intervalMs: 30 * 24 * HOUR_MS,
      occurrences: 3,
      occurrenceWindowMs: 24 * HOUR_MS,
    },
    parameters: [],
  };
}

export function parameterizedProgram(): EconomicProgram {
  return {
    programId: "program:payroll-params-001",
    goalTemplate: {
      ...movementGoal(),
      objective: "Settle ${region} payroll from treasury ETH by Friday",
      nonGoals: ["Do not touch the ${region} cold-storage wallet"],
    },
    parameters: [
      { name: "region", value: "EU" },
      { name: "tier", value: "standard" },
    ],
  };
}
