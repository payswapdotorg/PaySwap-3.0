/**
 * @payswap/app — the OUTCOME REGISTRY data mirror.
 *
 * STRUCTURAL MIRROR of @payswap/surface (P2-W3 ACCEPTED)
 * packages/surface/src/outcomes.ts OUTCOME_ACTIONS: the five outcome
 * actions with their labels, outcome lines, advanced disclosures and
 * dispatch authorities, carried field-for-field (same literals, same
 * order). The capability FOLD logic is re-implemented locally with the
 * same typed reasons (the surface's fold is a function; mirrors carry
 * data + law, and the mirror test asserts data equality + fold agreement
 * against the source). The TL wires real imports at accept-time.
 *
 * LAW (INV-24 posture): `dispatchable` is a FACT about configured
 * authority, never a UI mood — when false, the typed missing
 * prerequisite renders verbatim; never a dead button, never a fabricated
 * success.
 */

import type {
  OutcomeActionIdPin,
  OutcomeActionPin,
  OutcomeCapabilityStatePin,
  OutcomeDeploymentContextPin,
  SurfaceProvenancePin,
} from "../pins/surface-pins.js";
import { PINNED_SURFACE_API_VERSION } from "../pins/surface-pins.js";

const TOPOLOGY_NOTE =
  "Canonical path (advisory projection): Experience -> Economic Goal -> Intent -> Capability Discovery -> Policy + Security -> PaySwap Authorization -> Financial Protocol -> Connected Capability -> External Effect -> Observation/Finality -> Reconciliation/Evidence. The surface renders this path; it never dispatches it.";

const UNCONFIGURED_INTAKE =
  "The economic intake plane is not configured in this deployment — there is nothing to dispatch against yet. Configure the goal/intent intake (accepted P1-W1 economic contracts) to make this journey live.";

const NO_CAPABILITY_OBSERVATIONS =
  "Quote projection requires fresh capability observations (connected instances and current provider terms). None are configured in this deployment — the honest state is an unavailable preview, never an invented quote.";

const NO_MERCHANT_PLANE =
  "No merchant checkout plane exists in this deployment — the merchant package landed with Work Order P5-W3; wiring its checkout plane into this surface is still pending, and this surface refuses to fabricate a checkout session before it exists.";

function provenance(workOrder: string): SurfaceProvenancePin {
  return { surfaceApiVersion: PINNED_SURFACE_API_VERSION, stability: "stable", workOrder };
}

/** Mirrors surface outcomes.ts intakeCapability (same reason strings). */
export function intakeCapability(
  context: OutcomeDeploymentContextPin,
): OutcomeCapabilityStatePin {
  return context.economicIntakeConfigured
    ? { dispatchable: true }
    : { dispatchable: false, missingPrerequisite: UNCONFIGURED_INTAKE };
}

/** Mirrors surface outcomes.ts capabilityObservationCapability. */
export function capabilityObservationCapability(
  context: OutcomeDeploymentContextPin,
): OutcomeCapabilityStatePin {
  return context.capabilityObservationsAvailable
    ? { dispatchable: true }
    : { dispatchable: false, missingPrerequisite: NO_CAPABILITY_OBSERVATIONS };
}

/** Mirrors surface outcomes.ts merchantCapability. */
export function merchantCapability(
  context: OutcomeDeploymentContextPin,
): OutcomeCapabilityStatePin {
  return context.merchantCheckoutContextBound
    ? { dispatchable: true }
    : { dispatchable: false, missingPrerequisite: NO_MERCHANT_PLANE };
}

/**
 * The five outcome actions — MIRRORED from surface outcomes.ts
 * OUTCOME_ACTIONS (labels, outcome lines, disclosures and dispatch
 * authorities verbatim; mirror-tested at test/payswap/pin-mirror.test.ts).
 */
export const OUTCOME_REGISTRY_MIRROR: readonly OutcomeActionPin[] = [
  {
    id: "pay",
    label: "Pay",
    outcomeLine: "Send money to a recipient through your connected providers.",
    advancedDisclosure: [
      "Route candidates with legs, fees and rails before any submission",
      "Quote terms with fees, rate provenance, expiry and estimate-vs-guarantee labels",
      "Security gates and UNKNOWN/risk disclosures per candidate",
      "Before/after balances as typed observations",
      "Evidence for every definitive outcome",
    ],
    dispatch: {
      authority: "economic-intent-plane",
      intentKind: "PaymentIntent",
      journeyId: "pay",
      topologyNote: TOPOLOGY_NOTE,
    },
    provenance: provenance("P2-W3"),
  },
  {
    id: "receive",
    label: "Receive",
    outcomeLine: "Request money from a payer — a collect request they can fulfill.",
    advancedDisclosure: [
      "The collect request contract and its payer-visible summary",
      "Fulfillment attempts with UNKNOWN rendered as reconciliation",
      "Evidence lineage for the received payment",
    ],
    dispatch: {
      authority: "economic-intent-plane",
      intentKind: "PaymentIntent",
      journeyId: "collect",
      topologyNote: TOPOLOGY_NOTE,
    },
    provenance: provenance("P2-W3"),
  },
  {
    id: "move",
    label: "Move",
    outcomeLine:
      "Move money to another account you control through the payout journey to a registered settlement destination.",
    advancedDisclosure: [
      "Settlement destination selection (registered destinations only)",
      "The payout gate report and its authorization lineage",
      "Custody chain of the movement, leg by leg",
      "A payout sent is not beneficiary credit — stated on the surface",
    ],
    dispatch: {
      authority: "economic-intent-plane",
      intentKind: "MoneyMovementIntent",
      journeyId: "payout",
      topologyNote: TOPOLOGY_NOTE,
    },
    provenance: provenance("P2-W3"),
  },
  {
    id: "convert",
    label: "Convert",
    outcomeLine:
      "Convert between currencies and assets — the quoted terms, their fees and honest exclusions, before anything moves.",
    advancedDisclosure: [
      "Every fee line item disclosed verbatim — never a hidden fee",
      "Rate value, provenance and as-of time",
      "Expiry and material-change revalidation rules",
      "Delivery estimate labeled estimate or guarantee — never conflated",
      "Ineligible candidates with their typed reasons — never silently dropped",
    ],
    dispatch: {
      authority: "quote-projection-plane",
      intentKind: "MoneyMovementIntent",
      journeyId: "convert",
      topologyNote: TOPOLOGY_NOTE,
    },
    provenance: provenance("P2-W3"),
  },
  {
    id: "checkout",
    label: "Checkout",
    outcomeLine:
      "The merchant checkout journey: fiat-first pricing with the explicit crypto acceptance layer and customer explicit-signing.",
    advancedDisclosure: [
      "Merchant onboarding state (DRAFT → SUBMITTED → VERIFIED → ACTIVE)",
      "Crypto acceptance policy activation and quote observations with expiry",
      "The customer payment summary and the typed authorization diff",
      "Settlement route selection: native provider acceptance vs external PaySwap conversion",
    ],
    dispatch: {
      authority: "merchant-checkout-plane",
      intentKind: "PaymentIntent",
      journeyId: "checkout",
      topologyNote: TOPOLOGY_NOTE,
    },
    provenance: provenance("P2-W3"),
  },
] as const;

/** Mirrors surface outcomes.ts outcomeActionById (fail-closed). */
export function outcomeActionByIdMirror(id: OutcomeActionIdPin): OutcomeActionPin {
  const found = OUTCOME_REGISTRY_MIRROR.find((action) => action.id === id);
  if (found === undefined) {
    throw new Error(`outcomeActionById: unknown outcome action id ${JSON.stringify(id)}`);
  }
  return found;
}
