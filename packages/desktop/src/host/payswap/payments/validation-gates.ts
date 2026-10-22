/**
 * PaySwap Desktop (P13-C) — the validation gates (fail-closed, typed).
 *
 * THE GATE LAW (work order): validate ONLY against actual accounts,
 * corridor eligibility, fresh quote/fees, limits, provider scopes and
 * policy — all honestly absent in this deployment, and every absence is
 * rendered as the typed prerequisite it is (never invented facts). Each
 * gate returns a typed BLOCK/PROCEED decision with the reason carried
 * VERBATIM; the aggregate carries EVERY blocking reason (never just the
 * first — the corridor exclusion discipline) and gates the preview's
 * dispatchability and the authorization arming.
 *
 * Fail-closed means: an absent input is a BLOCK with its typed reason —
 * absence is never treated as allowance, and no gate ever fabricates an
 * account, a corridor fact, a quote, a limit, a scope or a policy
 * decision (INV-24 posture).
 */

import {
  PaymentMissionError,
  type PaymentIntakeCaptures,
  type PaymentMissionRecord,
} from "./contracts.js";
import type {
  ObservedDestination,
  ObservedFundingSource,
} from "./intent-compiler.js";
import {
  createNoObservationCorridorProjection,
  validatePaymentCorridorQuery,
  type PaymentCorridorProjectionPort,
  type PaymentCorridorQuery,
} from "./adapters/capability-corridor.js";
import type { PinnedQuoteTermsSource } from "../pins/index.js";

// ---------------------------------------------------------------------------
// The typed decision vocabulary
// ---------------------------------------------------------------------------

/** One gate's typed decision — the reason is carried verbatim. */
export interface PaymentGateDecision {
  readonly gate: PaymentGateId;
  readonly decision: "BLOCK" | "PROCEED";
  /** VERBATIM — rendered by the preview, never paraphrased away. */
  readonly reason: string;
}

export const PAYMENT_GATE_IDS = [
  "ACCOUNTS",
  "CORRIDOR",
  "QUOTE",
  "LIMITS",
  "PROVIDER_SCOPES",
  "POLICY",
] as const;
export type PaymentGateId = (typeof PAYMENT_GATE_IDS)[number];

/** The typed prerequisites for this deployment (pinned, rendered verbatim). */
export const PAYMENT_GATE_PREREQUISITES = Object.freeze({
  ACCOUNTS:
    "No observed funding source exists in this deployment — accounts are observations, and zero accounts are observed. A funding source is never assumed and an account fact is never invented.",
  CORRIDOR:
    "No connected capability instance exists in this deployment — corridor eligibility has nothing to project over. Corridor facts require connected instances with fresh observations; none are observed, so no corridor is eligible and no corridor fact is invented.",
  QUOTE:
    "No fresh quote exists for this mission — fees, rates and delivery terms are quoted facts with provenance and expiry, never invented.",
  LIMITS:
    "No declared limits exist for this corridor — minimum/maximum amounts are declared facts observed from capability restrictions, never assumed.",
  PROVIDER_SCOPES:
    "No connected provider scope exists in this deployment — execution requires a connected capability instance whose scope carries the CREATE_EXTERNAL_EFFECT operation class; zero are connected.",
  POLICY:
    "No policy plane is configured — policy decisions are recorded facts, and the absence of a policy decision is never treated as allowance.",
});

// ---------------------------------------------------------------------------
// The gate environment (typed inputs; the host supplies REAL observations)
// ---------------------------------------------------------------------------

/** Declared corridor limits (observed facts, never assumed). */
export interface DeclaredCorridorLimits {
  readonly minimum?: { readonly currency: string; readonly minorUnits: string };
  readonly maximum?: { readonly currency: string; readonly minorUnits: string };
}

/** One connected provider scope (the observed operation classes). */
export interface ConnectedProviderScope {
  readonly connectedInstanceId: string;
  readonly providerName: string;
  readonly operationClasses: readonly string[];
}

/** One recorded policy decision. */
export interface PolicyDecision {
  readonly decision: "ALLOW" | "BLOCK";
  readonly reason: string;
}

/** The gate environment — every input explicit, every absence honest. */
export interface PaymentGateEnvironment {
  readonly observedFundingSources: readonly ObservedFundingSource[];
  readonly observedDestinations: readonly ObservedDestination[];
  readonly corridorProjection: PaymentCorridorProjectionPort;
  readonly freshQuote: PinnedQuoteTermsSource | undefined;
  readonly declaredLimits: DeclaredCorridorLimits | undefined;
  readonly connectedScopes: readonly ConnectedProviderScope[];
  readonly policyDecisions: readonly PolicyDecision[];
  /** ISO-8601 UTC now (explicit input — freshness is computed, never ambient). */
  readonly now: string;
}

/** The honest empty environment (this deployment's truth). */
export function createHonestEmptyGateEnvironment(now: string): PaymentGateEnvironment {
  return {
    observedFundingSources: [],
    observedDestinations: [],
    corridorProjection: createNoObservationCorridorProjection(),
    freshQuote: undefined,
    declaredLimits: undefined,
    connectedScopes: [],
    policyDecisions: [],
    now,
  };
}

// ---------------------------------------------------------------------------
// The six gates
// ---------------------------------------------------------------------------

/** Canonical integer-string comparison (structural eligibility, not arithmetic). */
function compareCanonicalIntegers(a: string, b: string): number {
  if (a.length !== b.length) return a.length < b.length ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function accountsGate(
  captured: PaymentIntakeCaptures,
  env: PaymentGateEnvironment,
): { readonly decision: PaymentGateDecision; readonly resolved: ObservedFundingSource | undefined } {
  if (env.observedFundingSources.length === 0) {
    return {
      decision: { gate: "ACCOUNTS", decision: "BLOCK", reason: PAYMENT_GATE_PREREQUISITES.ACCOUNTS },
      resolved: undefined,
    };
  }
  const stated = captured.fundingSource.trim();
  const exact = env.observedFundingSources.find(
    (source) => source.displayName === stated,
  );
  if (exact === undefined) {
    return {
      decision: {
        gate: "ACCOUNTS",
        decision: "BLOCK",
        reason: `The stated funding source '${stated}' matches no observed funding source (observed: ${env.observedFundingSources
          .map((source) => `'${source.displayName}'`)
          .join(", ")}). A funding source is matched against observations exactly, never assumed.`,
      },
      resolved: undefined,
    };
  }
  return {
    decision: { gate: "ACCOUNTS", decision: "PROCEED", reason: `Funding source observed: '${exact.displayName}' (${exact.currency}).` },
    resolved: exact,
  };
}

function corridorGate(
  captured: PaymentIntakeCaptures,
  env: PaymentGateEnvironment,
): PaymentGateDecision {
  const query: PaymentCorridorQuery = {
    sourceCountry: captured.countryCorridor.sourceCountry,
    destinationCountry: captured.countryCorridor.destinationCountry,
    sourceCurrency: captured.amountAndCurrency.currency,
    destinationCurrency: captured.countryCorridor.destinationCurrency,
    customerType: "PERSONAL",
    sendAmount: captured.amountAndCurrency,
    asOf: env.now,
  };
  validatePaymentCorridorQuery(query);
  const view = env.corridorProjection.projectCorridor(query);
  if (view.eligibleRouteIds.length === 0) {
    const exclusions = view.exclusions
      .map((exclusion) => `${exclusion.code}: ${exclusion.message}`)
      .join(" | ");
    return {
      gate: "CORRIDOR",
      decision: "BLOCK",
      reason:
        exclusions.length > 0
          ? `Corridor eligibility: zero eligible routes. ${exclusions}`
          : "Corridor eligibility: zero eligible routes (no exclusion was surfaced — the projection observed nothing to evaluate).",
    };
  }
  return {
    gate: "CORRIDOR",
    decision: "PROCEED",
    reason: `Corridor eligibility: ${String(view.eligibleRouteIds.length)} eligible route(s): ${view.eligibleRouteIds.join(", ")}.`,
  };
}

function quoteGate(env: PaymentGateEnvironment): PaymentGateDecision {
  if (env.freshQuote === undefined) {
    return {
      gate: "QUOTE",
      decision: "BLOCK",
      reason: PAYMENT_GATE_PREREQUISITES.QUOTE,
    };
  }
  if (env.now >= env.freshQuote.expiry.at) {
    return {
      gate: "QUOTE",
      decision: "BLOCK",
      reason: `The quote expired at ${env.freshQuote.expiry.at} — the quoted terms are no longer offered. A fresh quote is required before anything moves; if the approved terms change, renewed authorization is required.`,
    };
  }
  return {
    gate: "QUOTE",
    decision: "PROCEED",
    reason: `Fresh quote ${env.freshQuote.quoteId} v${env.freshQuote.quoteVersion}, expires ${env.freshQuote.expiry.at}.`,
  };
}

function limitsGate(
  captured: PaymentIntakeCaptures,
  env: PaymentGateEnvironment,
): PaymentGateDecision {
  if (env.declaredLimits === undefined) {
    return {
      gate: "LIMITS",
      decision: "BLOCK",
      reason: PAYMENT_GATE_PREREQUISITES.LIMITS,
    };
  }
  const amount = captured.amountAndCurrency;
  const minimum = env.declaredLimits.minimum;
  const maximum = env.declaredLimits.maximum;
  if (minimum !== undefined && minimum.currency !== amount.currency) {
    return {
      gate: "LIMITS",
      decision: "BLOCK",
      reason: `The declared minimum is in ${minimum.currency} but the captured amount is in ${amount.currency} — currency mismatch is surfaced, never reconciled by invention.`,
    };
  }
  if (maximum !== undefined && maximum.currency !== amount.currency) {
    return {
      gate: "LIMITS",
      decision: "BLOCK",
      reason: `The declared maximum is in ${maximum.currency} but the captured amount is in ${amount.currency} — currency mismatch is surfaced, never reconciled by invention.`,
    };
  }
  if (minimum !== undefined && compareCanonicalIntegers(amount.minorUnits, minimum.minorUnits) < 0) {
    return {
      gate: "LIMITS",
      decision: "BLOCK",
      reason: `The captured amount is below the declared corridor minimum (${amount.minorUnits} < ${minimum.minorUnits} ${amount.currency}).`,
    };
  }
  if (maximum !== undefined && compareCanonicalIntegers(amount.minorUnits, maximum.minorUnits) > 0) {
    return {
      gate: "LIMITS",
      decision: "BLOCK",
      reason: `The captured amount is above the declared corridor maximum (${amount.minorUnits} > ${maximum.minorUnits} ${amount.currency}).`,
    };
  }
  const bounds = [
    minimum !== undefined ? `min ${minimum.minorUnits} ${minimum.currency}` : null,
    maximum !== undefined ? `max ${maximum.minorUnits} ${maximum.currency}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(", ");
  return {
    gate: "LIMITS",
    decision: "PROCEED",
    reason: `The captured amount is within the declared corridor limits${bounds.length > 0 ? ` (${bounds})` : " (no bounds declared)"}.`,
  };
}

function providerScopesGate(env: PaymentGateEnvironment): PaymentGateDecision {
  const executors = env.connectedScopes.filter((scope) =>
    scope.operationClasses.includes("CREATE_EXTERNAL_EFFECT"),
  );
  if (executors.length === 0) {
    return {
      gate: "PROVIDER_SCOPES",
      decision: "BLOCK",
      reason: PAYMENT_GATE_PREREQUISITES.PROVIDER_SCOPES,
    };
  }
  return {
    gate: "PROVIDER_SCOPES",
    decision: "PROCEED",
    reason: `Connected instances with CREATE_EXTERNAL_EFFECT in scope: ${executors
      .map((scope) => `${scope.providerName} (${scope.connectedInstanceId})`)
      .join(", ")}.`,
  };
}

function policyGate(env: PaymentGateEnvironment): PaymentGateDecision {
  if (env.policyDecisions.length === 0) {
    return {
      gate: "POLICY",
      decision: "BLOCK",
      reason: PAYMENT_GATE_PREREQUISITES.POLICY,
    };
  }
  const blocked = env.policyDecisions.filter((decision) => decision.decision === "BLOCK");
  if (blocked.length > 0) {
    return {
      gate: "POLICY",
      decision: "BLOCK",
      reason: `Policy blocked: ${blocked.map((decision) => decision.reason).join(" | ")}`,
    };
  }
  return {
    gate: "POLICY",
    decision: "PROCEED",
    reason: `Policy allowed: ${env.policyDecisions.map((decision) => decision.reason).join(" | ")}`,
  };
}

// ---------------------------------------------------------------------------
// The aggregate
// ---------------------------------------------------------------------------

/** The aggregate gate result: every decision, every reason verbatim. */
export interface PaymentGateAggregate {
  readonly decisions: readonly PaymentGateDecision[];
  readonly decision: "BLOCK" | "PROCEED";
  /** Every blocking reason, verbatim, in gate order (empty iff PROCEED). */
  readonly reasons: readonly string[];
  /** The resolved observations (present only when the accounts gate matched). */
  readonly resolvedFunding: ObservedFundingSource | undefined;
  readonly resolvedDestination: ObservedDestination | undefined;
}

/**
 * Run the six gates. The aggregate carries EVERY decision; the mission's
 * preview may render the blocked state honestly, but a BLOCKED aggregate
 * can never arm authorization (the authorization gate refuses with the
 * verbatim reasons — the D7 chain).
 */
export function runValidationGates(
  record: PaymentMissionRecord,
  env: PaymentGateEnvironment,
): PaymentGateAggregate {
  const capturedOrMissing = requireCaptured(record);
  const accounts = accountsGate(capturedOrMissing, env);
  // The destination resolves by EXACT stated-recipient match against the
  // observed destinations — the same exactness law as the funding-source
  // gate (never "the first observed destination", never a fuzzy match).
  const destination = env.observedDestinations.find(
    (observed) => observed.displayName === capturedOrMissing.recipient.trim(),
  );
  const decisions: PaymentGateDecision[] = [
    accounts.decision,
    corridorGate(capturedOrMissing, env),
    quoteGate(env),
    limitsGate(capturedOrMissing, env),
    providerScopesGate(env),
    policyGate(env),
  ];
  const reasons = decisions
    .filter((decision): decision is PaymentGateDecision & { readonly decision: "BLOCK" } => decision.decision === "BLOCK")
    .map((decision) => decision.reason);
  return {
    decisions,
    decision: reasons.length > 0 ? "BLOCK" : "PROCEED",
    reasons,
    resolvedFunding: accounts.resolved,
    resolvedDestination: destination,
  };
}

function requireCaptured(record: PaymentMissionRecord): PaymentIntakeCaptures {
  const fields = record.fields;
  const missing = (Object.keys(fields) as (keyof PaymentIntakeCaptures)[]).filter(
    (field) => fields[field].status === "MISSING",
  );
  if (missing.length > 0) {
    throw new PaymentMissionError(
      "INTAKE_INCOMPLETE",
      `The validation gates require a complete intake — missing: ${missing.join(", ")}`,
      { missionId: record.id },
    );
  }
  const captured = {} as Record<keyof PaymentIntakeCaptures, unknown>;
  for (const field of Object.keys(fields) as (keyof PaymentIntakeCaptures)[]) {
    captured[field] = (fields[field] as { readonly value: unknown }).value;
  }
  return captured as PaymentIntakeCaptures;
}
