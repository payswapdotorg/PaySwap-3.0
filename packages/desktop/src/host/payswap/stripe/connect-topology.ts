/**
 * PaySwap Desktop (P27-A, ADR-0020 D1/D2/D4) — the U3 CHARGE/TRANSFER/
 * PAYOUT TOPOLOGY: the typed structures binding Connect money movement to
 * the operator's §B.2 decisions (charge model, platform country,
 * merchant-of-record, dispute/refund liability), the prepared-action
 * references for each topology leg, and the INV-30 PURPOSE GATE.
 *
 * THE THREE-PLANE LAW (D1): provider operations are facts about MECHANISM,
 * never facts about PERMISSION. The topology below names the census
 * operations each charge model composes (per the live-doc re-verification
 * 2026-11-03: direct charges carry the Stripe-Account header — data scoped
 * to the connected account; destination charges bind
 * payment_intent_data[transfer_data][destination]; separate charges and
 * transfers charge the platform then POST /v1/transfers) — eligibility
 * always flows through the PURPOSE GATE + the account's own capability
 * observations, never from the mechanism's existence.
 *
 * THE INV-30 PURPOSE GATE (D2 + the P27-0 matrix §5, verbatim): Connect is
 * NOT unrestricted P2P. Regulated remittance/P2P needs the typed
 * provider-product + legal approval — an ordinary Payment Link or Connect
 * badge never supplies it. Route decomposition or relabeling changes
 * nothing: the most restrictive applicable classification governs.
 *
 * THE OPERATOR-GATE LAW: the topology structures bind to the operator's
 * RECORDED decisions; the absent decision is a typed OPERATOR_GATED
 * verdict — never a default charge model, never a guessed liability
 * assignment (a wrong MoR/liability default is a legal error, not a
 * convenience).
 *
 * PREPARED ACTIONS ONLY: this module PREPARES typed action references; it
 * never dispatches (the prepared-action executor owns dispatch + the
 * approval tiers; the connection plane holds ZERO financial authority).
 */

import type { StripeOperationCensusPort } from "./action-seams.js";
import type { StripeConnectTopologyDecision } from "./connect-platform-gates.js";

/** The charge-model vocabulary (§B.2 — the operator's decision, never a default). */
export type StripeConnectChargeModel = StripeConnectTopologyDecision["chargeModel"];

/** The transaction-purpose classes the gate admits (the P27-0 matrix §5 rows, verbatim mapping). */
export type StripeConnectPurposeClass =
  | "GENUINE_COMMERCE"
  | "MARKETPLACE_SELLER_SETTLEMENT"
  | "CONTRACTOR_SUPPLIER_PAYMENT"
  | "REIMBURSEMENT_OR_REFUND"
  | "REGULATED_REMITTANCE_OR_P2P"
  | "OTHER_UNCLEAR";

/** The typed purpose-eligibility verdict. */
export type StripeConnectPurposeEligibility =
  | { readonly eligible: true; readonly basis: string }
  | {
      readonly eligible: false;
      readonly reason: string;
      /** True when eligibility could return with the named typed provider/legal approvals (never silently). */
      readonly requiresProviderProductAndLegalApproval: boolean;
    };

/**
 * THE INV-30 PURPOSE GATE — the P27-0 capability matrix §5 Connect column,
 * encoded exactly:
 * - genuine commerce / marketplace seller settlement / contractor-supplier
 *   payment / reimbursement-refund: eligible through the DECIDED charge
 *   model (the operator's §B.2 record), evidence-bound;
 * - regulated remittance / P2P: NEVER eligible through Connect alone —
 *   Connect is not unrestricted P2P; the typed provider-product + legal
 *   approval path is the only return (ADR-0020 D8);
 * - other/unclear: the facts are asked for — the classification is never
 *   model-chosen (D3).
 */
export function classifyStripeConnectPurposeEligibility(input: {
  readonly purposeClass: StripeConnectPurposeClass;
  readonly topologyDecision?: StripeConnectTopologyDecision;
}): StripeConnectPurposeEligibility {
  const decisionBasis =
    input.topologyDecision !== undefined
      ? `the operator's decided charge model (${input.topologyDecision.chargeModel})`
      : "the operator's charge-model decision (§B.2 — currently UNDECIDED; every topology action stays gated)";
  switch (input.purposeClass) {
    case "GENUINE_COMMERCE":
      return { eligible: true, basis: `genuine commerce through ${decisionBasis}` };
    case "MARKETPLACE_SELLER_SETTLEMENT":
      return { eligible: true, basis: `marketplace seller settlement — the designed Connect pattern, through ${decisionBasis}` };
    case "CONTRACTOR_SUPPLIER_PAYMENT":
      return { eligible: true, basis: `contractor/supplier payment where the platform model covers it — through ${decisionBasis}` };
    case "REIMBURSEMENT_OR_REFUND":
      return { eligible: true, basis: `provider-supported refund/reimbursement mechanisms only, through ${decisionBasis}` };
    case "REGULATED_REMITTANCE_OR_P2P":
      return {
        eligible: false,
        reason:
          "Connect is not unrestricted P2P: regulated remittance/personal-transfer purposes are excluded from the Connect product's permission (P27-0 matrix §5; INV-30 — relabeling or decomposing the transfer changes nothing)",
        requiresProviderProductAndLegalApproval: true,
      };
    case "OTHER_UNCLEAR":
      return {
        eligible: false,
        reason:
          "the transaction class is unclear: the real facts (purpose, principals, beneficiary, country) are asked for before any route is admitted — the classification is reviewable and never model-chosen (ADR-0020 D3)",
        requiresProviderProductAndLegalApproval: false,
      };
  }
}

/** One prepared-action reference (the census operation + tier + read-back; never a dispatch). */
export interface StripeConnectPreparedActionRef {
  readonly leg: "CHARGE" | "TRANSFER_TO_CONNECTED_ACCOUNT" | "PAYOUT_TO_CONNECTED_ACCOUNT" | "REFUND" | "DISPUTE_EVIDENCE";
  readonly operationId: string;
  /** The mechanism note (the D1 provider-operations plane — mechanism, never permission). */
  readonly mechanism: string;
  /** The census read-back operation for the leg's reconciliation (INV-04). */
  readonly readBackOperationId: string | null;
}

/** The typed charge/transfer/payout topology bound to the operator's decisions. */
export interface StripeConnectTopology {
  readonly chargeModel: StripeConnectChargeModel;
  readonly merchantOfRecord: "PLATFORM" | "CONNECTED_ACCOUNT";
  readonly disputeAndRefundLiability: "PLATFORM" | "CONNECTED_ACCOUNT";
  readonly platformCountry: string;
  /** The prepared-action references per leg (census-bound; dispatch stays with the executor). */
  readonly preparedActionRefs: readonly StripeConnectPreparedActionRef[];
  /** The liability record (the §B.2 decision's machine-readable binding). */
  readonly liabilityRecord: {
    readonly merchantOfRecord: "PLATFORM" | "CONNECTED_ACCOUNT";
    readonly disputeLiability: "PLATFORM" | "CONNECTED_ACCOUNT";
    readonly refundLiability: "PLATFORM" | "CONNECTED_ACCOUNT";
    readonly decisionRecordRef: string;
  };
}

/** The typed topology result. */
export type StripeConnectTopologyResult =
  | { readonly kind: "OK"; readonly topology: StripeConnectTopology }
  | { readonly kind: "OPERATOR_GATED"; readonly missingDecision: string }
  | { readonly kind: "UNPINNED_API_SURFACE"; readonly operationId: string };

/** The census operation ids the topologies compose (fail-closed against the pin). */
const TOPOLOGY_OPERATIONS = Object.freeze({
  createPaymentIntent: "PostPaymentIntents",
  readPaymentIntent: "GetPaymentIntentsIntent",
  createTransfer: "PostTransfers",
  readTransfer: "GetTransfersTransfer",
  createPayout: "PostPayouts",
  readPayout: "GetPayoutsPayout",
  createRefund: "PostRefunds",
  readApplicationFee: "GetApplicationFeesId",
} as const);

/** Resolve one leg's prepared-action reference against the census (fail-closed). */
function actionRefOf(
  census: StripeOperationCensusPort,
  leg: StripeConnectPreparedActionRef["leg"],
  operationId: string,
  mechanism: string,
  readBackOperationId: string | null,
): StripeConnectPreparedActionRef | { readonly kind: "UNPINNED" } {
  const operation = census.resolve(operationId);
  if (operation === undefined || !census.dispatchAllowed(operationId)) {
    return { kind: "UNPINNED" };
  }
  const readBack =
    readBackOperationId !== null && census.resolve(readBackOperationId) !== undefined
      ? readBackOperationId
      : null;
  return { leg, operationId, mechanism, readBackOperationId: readBack };
}

/**
 * Resolve the charge/transfer/payout topology for the operator's recorded
 * decision. Every leg is a PREPARED-ACTION reference only — this module
 * never dispatches and holds zero financial authority.
 */
export function resolveStripeConnectTopology(input: {
  readonly census: StripeOperationCensusPort;
  readonly topologyDecision?: StripeConnectTopologyDecision;
}): StripeConnectTopologyResult {
  if (input.topologyDecision === undefined) {
    return {
      kind: "OPERATOR_GATED",
      missingDecision:
        "The operator-decided charge model (direct / destination / separate charges and transfers), platform country, and merchant-of-record + dispute/refund liability assignment (run card §B.2)",
    };
  }
  const decision = input.topologyDecision;
  const refs: StripeConnectPreparedActionRef[] = [];
  const push = (leg: StripeConnectPreparedActionRef["leg"], operationId: string, mechanism: string, readBack: string | null): StripeConnectTopologyResult | null => {
    const ref = actionRefOf(input.census, leg, operationId, mechanism, readBack);
    if ("kind" in ref && ref.kind === "UNPINNED") {
      return { kind: "UNPINNED_API_SURFACE", operationId };
    }
    refs.push(ref as StripeConnectPreparedActionRef);
    return null;
  };

  // The charge leg per the DECIDED model (mechanism notes per the
  // 2026-11-03 live-doc re-verification):
  let chargeMechanism: string;
  switch (decision.chargeModel) {
    case "DIRECT":
      chargeMechanism =
        "direct charge: the payment is created on the connected account (the Stripe-Account header carries the acct_ id; data is scoped to the connected account)";
      break;
    case "DESTINATION":
      chargeMechanism =
        "destination charge: the platform's payment carries transfer_data[destination] = the connected account (optionally on_behalf_of + application_fee_amount)";
      break;
    case "SEPARATE_CHARGES_AND_TRANSFERS":
      chargeMechanism =
        "separate charges and transfers: the charge lands on the platform account; PostTransfers moves the seller's portion to the connected account";
      break;
  }
  const chargeFailure = push("CHARGE", TOPOLOGY_OPERATIONS.createPaymentIntent, chargeMechanism, TOPOLOGY_OPERATIONS.readPaymentIntent);
  if (chargeFailure !== null) return chargeFailure;

  if (decision.chargeModel === "SEPARATE_CHARGES_AND_TRANSFERS") {
    const transferFailure = push(
      "TRANSFER_TO_CONNECTED_ACCOUNT",
      TOPOLOGY_OPERATIONS.createTransfer,
      "platform-to-connected-account transfer after the platform charge (the separate-charges-and-transfers model)",
      TOPOLOGY_OPERATIONS.readTransfer,
    );
    if (transferFailure !== null) return transferFailure;
  }

  const payoutFailure = push(
    "PAYOUT_TO_CONNECTED_ACCOUNT",
    TOPOLOGY_OPERATIONS.createPayout,
    "payout from the connected account's own balance (the connected account's payouts_enabled observation gates it — never assumed)",
    TOPOLOGY_OPERATIONS.readPayout,
  );
  if (payoutFailure !== null) return payoutFailure;

  const refundFailure = push(
    "REFUND",
    TOPOLOGY_OPERATIONS.createRefund,
    "provider-supported refund mechanism only (liability per the operator's §B.2 record)",
    null,
  );
  if (refundFailure !== null) return refundFailure;

  return {
    kind: "OK",
    topology: Object.freeze({
      chargeModel: decision.chargeModel,
      merchantOfRecord: decision.merchantOfRecord,
      disputeAndRefundLiability: decision.disputeAndRefundLiability,
      platformCountry: decision.platformCountry,
      preparedActionRefs: Object.freeze(refs),
      liabilityRecord: Object.freeze({
        merchantOfRecord: decision.merchantOfRecord,
        disputeLiability: decision.disputeAndRefundLiability,
        refundLiability: decision.disputeAndRefundLiability,
        decisionRecordRef: decision.decisionRecordRef,
      }),
    }),
  };
}
