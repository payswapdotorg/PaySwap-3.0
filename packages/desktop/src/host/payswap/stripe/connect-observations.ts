/**
 * PaySwap Desktop (P27-A) — the U3 CONNECTED-ACCOUNT OBSERVATION types and
 * the typed extraction, split from ./connect-account-lifecycle.ts at the
 * <=400-line file law (the webhook-signature.ts precedent).
 *
 * THE D10 LAW (dated evidence, never flags): every capability and
 * requirements fact below is an OBSERVATION of the account's own objects
 * (GET /v1/accounts/{account}) with an observedAt stamp and its source —
 * country/requirements eligibility is API-computed per account (live docs
 * docs.stripe.com/connect/required-verification-information.md, retrieved
 * 2026-11-03) and is never a hardcoded list. An absent field stays null —
 * an unobserved fact is never guessed.
 */

/** One capability observation (the account's own object). */
export interface StripeConnectCapabilityObservation {
  readonly capability: string;
  readonly status: string;
  readonly requirementsCurrentlyDue: readonly string[];
  readonly requirementsPastDue: readonly string[];
  readonly requirementsPendingVerification: readonly string[];
}

/** The dated connected-account observation record (never a flag). */
export interface StripeConnectedAccountObservation {
  readonly accountRef: string;
  readonly observedAt: string;
  /** The retrieval-date + source stamp (the D10 law). */
  readonly source: "GET /v1/accounts/{account} (Stripe API, observed read-back)";
  readonly payoutsEnabled: boolean | null;
  readonly chargesEnabled: boolean | null;
  readonly detailsSubmitted: boolean | null;
  readonly requirementsDisabledReason: string | null;
  readonly requirementsCurrentlyDue: readonly string[];
  readonly requirementsPastDue: readonly string[];
  readonly requirementsEventuallyDue: readonly string[];
  readonly capabilities: readonly StripeConnectCapabilityObservation[];
  /** The business profile country observed on the account, when present. */
  readonly country: string | null;
  /** The service agreement observed on the account (tos_acceptance.service_agreement), when present. */
  readonly serviceAgreement: string | null;
}

/** The connected-account identity binding (provider account <-> PaySwap seller principal). */
export interface StripeConnectIdentityBinding {
  readonly bindingId: string;
  readonly accountRef: string;
  readonly sellerPrincipalRef: string;
  readonly boundAt: string;
  /** The observation the binding was established on (evidence lineage). */
  readonly establishedByObservationAt: string;
}

/** Fail-closed extraction of a string list (never a guessed entry). */
function stringListOf(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

/**
 * Typed extraction of the account's own objects into the dated observation
 * record. Null when the body carries no account object — the caller maps
 * that to a typed UNKNOWN, never a fabricated observation.
 */
export function stripeConnectedAccountObservationOf(
  accountRef: string,
  body: unknown,
  observedAt: string,
): StripeConnectedAccountObservation | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  // An observation requires the provider's own account identity — a body
  // without an account id is not account evidence (never a fabricated
  // observation with all-null fields).
  if (typeof record.id !== "string" || record.id.length === 0) {
    return null;
  }
  const requirements =
    record.requirements !== null && typeof record.requirements === "object" && !Array.isArray(record.requirements)
      ? (record.requirements as Record<string, unknown>)
      : undefined;
  const capabilities: StripeConnectCapabilityObservation[] = [];
  const capabilitiesObject =
    record.capabilities !== null && typeof record.capabilities === "object" && !Array.isArray(record.capabilities)
      ? (record.capabilities as Record<string, unknown>)
      : undefined;
  if (capabilitiesObject !== undefined) {
    for (const [capability, value] of Object.entries(capabilitiesObject)) {
      if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
      const capabilityRecord = value as Record<string, unknown>;
      const capRequirements =
        capabilityRecord.requirements !== null &&
        typeof capabilityRecord.requirements === "object" &&
        !Array.isArray(capabilityRecord.requirements)
          ? (capabilityRecord.requirements as Record<string, unknown>)
          : undefined;
      capabilities.push(
        Object.freeze({
          capability,
          status: typeof capabilityRecord.status === "string" ? capabilityRecord.status : "unknown",
          requirementsCurrentlyDue: stringListOf(capRequirements?.currently_due),
          requirementsPastDue: stringListOf(capRequirements?.past_due),
          requirementsPendingVerification: stringListOf(capRequirements?.pending_verification),
        }),
      );
    }
  }
  const tosAcceptance =
    record.tos_acceptance !== null && typeof record.tos_acceptance === "object" && !Array.isArray(record.tos_acceptance)
      ? (record.tos_acceptance as Record<string, unknown>)
      : undefined;
  return Object.freeze({
    accountRef,
    observedAt,
    source: "GET /v1/accounts/{account} (Stripe API, observed read-back)" as const,
    payoutsEnabled: typeof record.payouts_enabled === "boolean" ? record.payouts_enabled : null,
    chargesEnabled: typeof record.charges_enabled === "boolean" ? record.charges_enabled : null,
    detailsSubmitted: typeof record.details_submitted === "boolean" ? record.details_submitted : null,
    requirementsDisabledReason:
      typeof requirements?.disabled_reason === "string" ? requirements.disabled_reason : null,
    requirementsCurrentlyDue: stringListOf(requirements?.currently_due),
    requirementsPastDue: stringListOf(requirements?.past_due),
    requirementsEventuallyDue: stringListOf(requirements?.eventually_due),
    capabilities: Object.freeze(capabilities),
    country: typeof record.country === "string" ? record.country : null,
    serviceAgreement:
      typeof tosAcceptance?.service_agreement === "string" ? tosAcceptance.service_agreement : null,
  });
}
