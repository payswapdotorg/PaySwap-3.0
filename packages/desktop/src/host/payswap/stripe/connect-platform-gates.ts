/**
 * PaySwap Desktop (P27-A, ADR-0020 D4/D11) — the Stripe Connect PLATFORM
 * GATES: the typed operator-decision and operator-configuration surface
 * the U2 (delegated OAuth) and U3 (Connect platform) flows compose over.
 *
 * THE OPERATOR-GATE LAW (run card §B, mapped 1:1):
 * - §B.1/§B.4 the platform application + its secret-channel delivery
 *   (STRIPE_PLATFORM_CLIENT_ID / STRIPE_PLATFORM_CLIENT_SECRET);
 * - §B.2 the operator's WRITTEN account-model, charge-model,
 *   platform-country and liability decisions — a typed gate, NEVER a
 *   default guess (the absent decision is a typed UNDECIDED verdict);
 * - §B.3 the registered redirect/callback URL + the publicly reachable
 *   connected-account webhook endpoint and its STRIPE_CONNECT_WEBHOOK_SECRET;
 * - §B.5 Stripe's approval of the disclosed actual business model.
 *
 * DATED RE-VERIFICATION (2026-11-03, live docs — the P27-0 matrix §6 duty;
 * the operator's actual platform account is NOT verifiable: no platform
 * credentials exist in this deployment, recorded honestly):
 * - docs.stripe.com/connect/standard-accounts, /express-accounts,
 *   /custom-accounts: the legacy Standard/Express/Custom account types are
 *   each marked "Deprecated feature — applies only to platforms that
 *   already use legacy connected account types".
 * - docs.stripe.com/connect/service-agreement-types: the CURRENT model —
 *   account creation via controller properties (controller[stripe_dashboard]
 *   [type], controller[fees][payer], controller[losses][payments],
 *   controller[requirement_collection]) + capabilities[...][requested] +
 *   tos_acceptance[service_agreement] = 'full' | 'recipient'. full: card
 *   payments possible, Stripe holds the service relationship; recipient:
 *   transfers only (no card_payments), +24h transfer availability, select
 *   countries, the platform holds the relationship. The agreement type
 *   cannot change after acceptance.
 * - docs.stripe.com/connect/required-verification-information.md: country
 *   and requirements eligibility is API-computed per account — never a
 *   hardcoded country list (D10: the account's own requirements/capabilities
 *   objects are the evidence).
 *
 * INV-25: a live-shaped platform secret is refused at THIS edge as well.
 * NOTHING here performs network I/O — these are typed gates only.
 */

import { assertNoStripeSecretShapes } from "./stripe-pins.js";

/** The platform credentials as the secret channel delivers them (all optional — absent = the typed gate). */
export interface StripeConnectPlatformCredentialsInput {
  readonly platformClientId?: string;
  readonly platformClientSecret?: string;
  readonly connectWebhookSecret?: string;
  /** The redirect/callback URL registered with the platform application (run card §B.3). */
  readonly registeredRedirectUri?: string;
  /** The publicly reachable connected-account webhook endpoint URL registered with Stripe (run card §B.3). */
  readonly registeredWebhookEndpointUrl?: string;
}

/** One typed operator gate verdict (never a flag — D10/D11). */
export type StripeConnectGateVerdict =
  | { readonly kind: "SATISFIED"; readonly detail: string }
  | {
      readonly kind: "UNCONFIGURED";
      /** The exact missing operator configuration, verbatim (run-card §B mapped). */
      readonly missingItems: readonly string[];
    }
  | { readonly kind: "LIVE_REFUSED"; readonly detail: string };

/** The §B.2 account-model decision (the CURRENT controller-properties vocabulary). */
export interface StripeConnectAccountModelDecision {
  /** The creation model: CONTROLLER_PROPERTIES (current, recommended) or LEGACY_TYPE (deprecated per live docs 2026-11-03). */
  readonly creationModel: "CONTROLLER_PROPERTIES" | "LEGACY_TYPE";
  /** tos_acceptance[service_agreement]: 'full' (card payments possible) or 'recipient' (transfers only). */
  readonly serviceAgreement: "full" | "recipient";
  /** controller[stripe_dashboard][type]: none | express | full. */
  readonly stripeDashboardType: "none" | "express" | "full";
  /** controller[fees][payer]: 'application' (the platform pays fees) or 'account'. */
  readonly feesPayer: "application" | "account";
  /** controller[losses][payments]: 'application' (the platform is liable for negative balances) or 'account'. */
  readonly lossesPayer: "application" | "account";
  /** controller[requirement_collection]: 'stripe' (Stripe-hosted onboarding) or 'application' (API onboarding). */
  readonly requirementCollection: "stripe" | "application";
  /** The platform's default requested-capability set (the account's own capabilities object is the evidence at dispatch — D10). */
  readonly requestedCapabilities: readonly ("transfers" | "card_payments")[];
  /** The operator's written record reference (the §B.2 approval trail). */
  readonly decisionRecordRef: string;
}

/** The §B.2 charge-model + liability decision. */
export interface StripeConnectTopologyDecision {
  readonly chargeModel: "DIRECT" | "DESTINATION" | "SEPARATE_CHARGES_AND_TRANSFERS";
  /** The platform's country (ISO-3166 alpha-2) — decides the platform-side corridor facts. */
  readonly platformCountry: string;
  readonly merchantOfRecord: "PLATFORM" | "CONNECTED_ACCOUNT";
  readonly disputeAndRefundLiability: "PLATFORM" | "CONNECTED_ACCOUNT";
  /** The operator's written record reference (the §B.2 approval trail). */
  readonly decisionRecordRef: string;
}

/** The operator's written Connect decisions (absent fields = typed UNDECIDED gates). */
export interface StripeConnectOperatorDecisions {
  readonly accountModel?: StripeConnectAccountModelDecision;
  readonly topology?: StripeConnectTopologyDecision;
}

/** The full gate evaluation (typed record, one verdict per run-card §B item). */
export interface StripeConnectPlatformGateRecord {
  /** §B.1/§B.4 — the platform application credentials. */
  readonly platformCredentials: StripeConnectGateVerdict;
  /** §B.3 — the registered redirect/callback URL (U2). */
  readonly registeredRedirectUri: StripeConnectGateVerdict;
  /** §B.3/§B.4 — the connected-account webhook endpoint + signing secret (U3). */
  readonly connectWebhookEndpoint: StripeConnectGateVerdict;
  /** §B.2 — the account-model decision (U3). */
  readonly accountModelDecision: StripeConnectGateVerdict;
  /** §B.2 — the charge-model + liability decision (U3). */
  readonly topologyDecision: StripeConnectGateVerdict;
  /** §B.5 — Stripe's approval of the disclosed actual business model. */
  readonly businessModelApproval: StripeConnectGateVerdict;
}

/** The §B.5 statement (never satisfiable by code — the operator's written approval). */
export const STRIPE_CONNECT_BUSINESS_MODEL_APPROVAL_ITEM =
  "Stripe's written approval of PaySwap's disclosed actual business model (run card §B.5)" as const;

/**
 * Evaluate every platform gate against the delivered credentials and the
 * operator's recorded decisions. PURE; no ambient state, no I/O. Every
 * missing item is carried verbatim — a typed UNCONFIGURED verdict is a
 * deliverable, never a silent default.
 */
export function evaluateStripeConnectPlatformGates(input: {
  readonly credentials: StripeConnectPlatformCredentialsInput;
  readonly decisions: StripeConnectOperatorDecisions;
}): StripeConnectPlatformGateRecord {
  const credentials = input.credentials ?? {};
  const decisions = input.decisions ?? {};

  const platformCredentials: StripeConnectGateVerdict = (() => {
    const missing: string[] = [];
    if (typeof credentials.platformClientId !== "string" || credentials.platformClientId.trim().length === 0) {
      missing.push("STRIPE_PLATFORM_CLIENT_ID — the OAuth client_id of a Stripe platform application registered by the operator (run card §B.1)");
    }
    if (typeof credentials.platformClientSecret !== "string" || credentials.platformClientSecret.trim().length === 0) {
      missing.push("STRIPE_PLATFORM_CLIENT_SECRET — the platform secret key (the OAuth client_secret), delivered to the host through the operator secret channel, never chat (run card §B.1 and §B.4)");
    }
    if (missing.length > 0) {
      return { kind: "UNCONFIGURED", missingItems: Object.freeze(missing) };
    }
    if (credentials.platformClientSecret!.startsWith("sk_live_") || credentials.platformClientSecret!.startsWith("rk_live_")) {
      return {
        kind: "LIVE_REFUSED",
        detail: "INV-25: a live-mode platform secret cannot drive the SANDBOX-only Connect flows — refused",
      };
    }
    return {
      kind: "SATISFIED",
      detail: "the platform application credentials are present (Sandbox-shaped; verified only by the real provider answers)",
    };
  })();

  const registeredRedirectUri: StripeConnectGateVerdict =
    typeof credentials.registeredRedirectUri === "string" && credentials.registeredRedirectUri.length > 0
      ? { kind: "SATISFIED", detail: `the registered redirect URL is recorded (${credentials.registeredRedirectUri})` }
      : {
          kind: "UNCONFIGURED",
          missingItems: Object.freeze([
            "The exact redirect/callback URL registered with the Stripe platform application (run card §B.3)",
          ]),
        };

  const connectWebhookEndpoint: StripeConnectGateVerdict = (() => {
    const missing: string[] = [];
    if (typeof credentials.registeredWebhookEndpointUrl !== "string" || credentials.registeredWebhookEndpointUrl.length === 0) {
      missing.push("A publicly reachable webhook endpoint URL registered with Stripe for connected-account events (run card §B.3)");
    }
    if (typeof credentials.connectWebhookSecret !== "string" || credentials.connectWebhookSecret.trim().length === 0) {
      missing.push("STRIPE_CONNECT_WEBHOOK_SECRET — the signing secret of the connected-account webhook endpoint (run card §B.4)");
    }
    if (missing.length > 0) {
      return { kind: "UNCONFIGURED", missingItems: Object.freeze(missing) };
    }
    if (!credentials.connectWebhookSecret!.startsWith("whsec_")) {
      return {
        kind: "UNCONFIGURED",
        missingItems: Object.freeze([
          "STRIPE_CONNECT_WEBHOOK_SECRET — the delivered value does not carry the whsec_ signing-secret shape (run card §B.4)",
        ]),
      };
    }
    return { kind: "SATISFIED", detail: "the connected-account webhook endpoint + signing secret are present" };
  })();

  const accountModelDecision: StripeConnectGateVerdict = isAccountModelDecision(decisions.accountModel)
    ? {
        kind: "SATISFIED",
        detail: `the account-model decision is recorded (${decisions.accountModel.creationModel}, service agreement ${decisions.accountModel.serviceAgreement}; record ${decisions.accountModel.decisionRecordRef})`,
      }
    : {
        kind: "UNCONFIGURED",
        missingItems: Object.freeze([
          "The operator-decided Connect account model — the onboarding configuration, service agreement (full or recipient) and controller settings, approved with Stripe for the actual business model (run card §B.2)",
        ]),
      };

  const topologyDecision: StripeConnectGateVerdict = isTopologyDecision(decisions.topology)
    ? {
        kind: "SATISFIED",
        detail: `the charge-model + liability decision is recorded (${decisions.topology.chargeModel}, MoR ${decisions.topology.merchantOfRecord}, disputes ${decisions.topology.disputeAndRefundLiability}; record ${decisions.topology.decisionRecordRef})`,
      }
    : {
        kind: "UNCONFIGURED",
        missingItems: Object.freeze([
          "The operator-decided charge model (direct / destination / separate charges and transfers), platform country, and merchant-of-record + dispute/refund liability assignment (run card §B.2)",
        ]),
      };

  const record: StripeConnectPlatformGateRecord = {
    platformCredentials,
    registeredRedirectUri,
    connectWebhookEndpoint,
    accountModelDecision,
    topologyDecision,
    businessModelApproval: {
      kind: "UNCONFIGURED",
      missingItems: Object.freeze([STRIPE_CONNECT_BUSINESS_MODEL_APPROVAL_ITEM]),
    },
  };
  // The escape law: a gate record may never carry secret-shaped material
  // (the client secret / whsec are read, never retained).
  assertNoStripeSecretShapes(JSON.stringify(record), "stripe-connect-platform-gates");
  return Object.freeze(record);
}

/** Structural validation of the account-model decision (fail-closed; no guessed defaults). */
export function isAccountModelDecision(value: unknown): value is StripeConnectAccountModelDecision {
  if (value === null || typeof value !== "object") return false;
  const d = value as Partial<StripeConnectAccountModelDecision>;
  return (
    (d.creationModel === "CONTROLLER_PROPERTIES" || d.creationModel === "LEGACY_TYPE") &&
    (d.serviceAgreement === "full" || d.serviceAgreement === "recipient") &&
    (d.stripeDashboardType === "none" || d.stripeDashboardType === "express" || d.stripeDashboardType === "full") &&
    (d.feesPayer === "application" || d.feesPayer === "account") &&
    (d.lossesPayer === "application" || d.lossesPayer === "account") &&
    (d.requirementCollection === "stripe" || d.requirementCollection === "application") &&
    Array.isArray(d.requestedCapabilities) &&
    d.requestedCapabilities.every((c) => c === "transfers" || c === "card_payments") &&
    typeof d.decisionRecordRef === "string" &&
    d.decisionRecordRef.length > 0
  );
}

/** Structural validation of the topology decision (fail-closed; no guessed defaults). */
export function isTopologyDecision(value: unknown): value is StripeConnectTopologyDecision {
  if (value === null || typeof value !== "object") return false;
  const d = value as Partial<StripeConnectTopologyDecision>;
  return (
    (d.chargeModel === "DIRECT" || d.chargeModel === "DESTINATION" || d.chargeModel === "SEPARATE_CHARGES_AND_TRANSFERS") &&
    typeof d.platformCountry === "string" &&
    /^[A-Z]{2}$/.test(d.platformCountry) &&
    (d.merchantOfRecord === "PLATFORM" || d.merchantOfRecord === "CONNECTED_ACCOUNT") &&
    (d.disputeAndRefundLiability === "PLATFORM" || d.disputeAndRefundLiability === "CONNECTED_ACCOUNT") &&
    typeof d.decisionRecordRef === "string" &&
    d.decisionRecordRef.length > 0
  );
}

/**
 * The account-model decision's capability-consistency law (typed from the
 * live-doc re-verification): the recipient service agreement carries
 * transfers only — card_payments is not requestable under it. An
 * inconsistent decision is refused with the exact reason (never silently
 * narrowed).
 */
export function validateAccountModelCapabilityConsistency(
  decision: StripeConnectAccountModelDecision,
): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  if (decision.serviceAgreement === "recipient" && decision.requestedCapabilities.includes("card_payments")) {
    return {
      ok: false,
      reason:
        "the recipient service agreement cannot request the card_payments capability (docs.stripe.com/connect/service-agreement-types, retrieved 2026-11-03) — record a consistent decision",
    };
  }
  if (decision.serviceAgreement === "full" && !decision.requestedCapabilities.includes("card_payments")) {
    // Not an error: a full-agreement account may request transfers only.
    return { ok: true };
  }
  return { ok: true };
}
