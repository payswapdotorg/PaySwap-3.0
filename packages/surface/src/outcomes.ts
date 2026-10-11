/**
 * @payswap/surface — the five outcome-level actions (P2-W3).
 *
 * ADAPT of payswap.org@8a735bf packages/surface/src/outcomes.ts (306L).
 * Old-repo provenance: P4-W4-002 §3.1; the outcome-first vocabulary maps to
 * the canonical product law (docs/FINAL-TL-HANDOFF.md "Product and UI law":
 * "outcome-first financial operating system (Pay, Receive, Move, Convert,
 * Checkout)").
 *
 * The PRIMARY surface of the universal interface: Pay, Receive, Move,
 * Convert, Checkout. Each entry records WHERE its journey actually executes
 * — the REAL dispatch authority in the canonical PaySwap 3.0 topology
 * (spec/architecture/PAYSWAP-3.0.md), never a UI-side imitation — and the
 * honest dispatchability state for a deployment that has none of the
 * required authority configured. This registry is DATA: the Web app renders
 * it; a mobile app, extension, SDK or external-agent API renders the same
 * facts (INV-22).
 *
 * ADAPTATIONS vs the old repo (evidence, not authority):
 * - Old dispatch authorities named old-repo packages (payswap-api-runtime
 *   = @payswap/api, route-compiler-preview = @payswap/route-compiler,
 *   merchant-checkout-dispatch). Those packages do not exist in PaySwap 3.0.
 *   The dispatch authority now names the CANONICAL PaySwap plane the
 *   journey executes through, and `intentKind` references the accepted
 *   P1-W1 intent vocabulary BY VALUE (pinned, never imported). The old
 *   certified API commandTypes (payments.intent.create etc.) are RETIRED —
 *   the universal command surface lands with P7-W3; inventing certified
 *   commands now would be a fabricated authority.
 * - The old alias table (UX-002 command verbs + @payswap/ux sidebar
 *   anchors) is NOT ported here — @payswap/ux does not exist in PaySwap
 *   3.0. The reconciliation now maps the five actions onto the ELEVEN-AREA
 *   navigation IA (src/outcome-area-aliases.ts), which is the canonical
 *   navigation vocabulary of this program.
 */

import { surfaceProvenance, type SurfaceContractProvenance } from "./version.ts";

/** The five outcome actions — the fixed, versioned vocabulary. */
export type OutcomeActionId = "pay" | "receive" | "move" | "convert" | "checkout";

/**
 * Where an outcome action's journey REALLY executes. `authority` names the
 * canonical PaySwap plane (never the surface itself — the surface is a
 * projection and cannot dispatch anything, INV-23); `intentKind` references
 * the accepted P1-W1 closed intent vocabulary by value (pinned structurally,
 * never imported); `topologyNote` cites the canonical consequential path.
 */
export interface OutcomeDispatchAuthority {
  /** The canonical PaySwap plane the journey executes through. */
  readonly authority:
    | "economic-intent-plane" // P1-W1 (ACCEPTED): EconomicGoal + typed intent intake & compilation
    | "quote-projection-plane" // P2-W3 (THIS package): quote/terms preview fold — a preview, never execution
    | "merchant-checkout-plane"; // P5-W3 (PENDING): merchant checkout lands later
  /** The P1-W1 intent kind the action compiles to (pinned by value). */
  readonly intentKind: "MoneyMovementIntent" | "PaymentIntent" | "ServiceAccessIntent";
  /** The certified journey id within this surface contract. */
  readonly journeyId: string;
  /** Citation of the canonical consequential path (advisory projection law). */
  readonly topologyNote: string;
}

/**
 * The honest execution capability of one outcome action in ONE deployment
 * context. `dispatchable` is a FACT about configured authority, never a UI
 * mood: when false, the reason is the typed missing prerequisite and the
 * surface renders exactly that — never a dead button, never a fabricated
 * success (INV-24).
 */
export interface OutcomeCapabilityState {
  readonly dispatchable: boolean;
  /**
   * The typed reason a journey cannot dispatch yet (present iff not
   * dispatchable) — rendered verbatim in people-language surfaces.
   */
  readonly missingPrerequisite?: string;
}

/** One outcome action's full surface contract. */
export interface OutcomeAction {
  readonly id: OutcomeActionId;
  readonly label: string;
  /** One-line people-language outcome description (the simple view). */
  readonly outcomeLine: string;
  /** What the advanced (drill-down) view discloses for this action. */
  readonly advancedDisclosure: readonly string[];
  readonly dispatch: OutcomeDispatchAuthority;
  /**
   * The honest capability fold for a deployment context: given the facts a
   * deployment actually has configured, returns the typed dispatchability
   * fact.
   */
  capability(context: OutcomeDeploymentContext): OutcomeCapabilityState;
  readonly provenance: SurfaceContractProvenance;
}

/**
 * What a deployment actually has configured (facts about PaySwap authority
 * planes, not UI state). Honest inputs for the capability folds.
 */
export interface OutcomeDeploymentContext {
  /**
   * The economic intake plane is configured: goals/intents are accepted and
   * compiled by the accepted P1-W1 economic contracts.
   */
  readonly economicIntakeConfigured: boolean;
  /**
   * Fresh capability observations exist for quote projections (connected
   * instances + current provider terms). Catalogue support alone is never
   * an observation (INV-13).
   */
  readonly capabilityObservationsAvailable: boolean;
  /** A merchant checkout context is bound (merchant checkout lands P5-W3). */
  readonly merchantCheckoutContextBound: boolean;
}

const TOPOLOGY_NOTE =
  "Canonical path (advisory projection): Experience -> Economic Goal -> Intent -> Capability Discovery -> Policy + Security -> PaySwap Authorization -> Financial Protocol -> Connected Capability -> External Effect -> Observation/Finality -> Reconciliation/Evidence. The surface renders this path; it never dispatches it.";

const UNCONFIGURED_INTAKE =
  "The economic intake plane is not configured in this deployment — there is nothing to dispatch against yet. Configure the goal/intent intake (accepted P1-W1 economic contracts) to make this journey live.";

const NO_CAPABILITY_OBSERVATIONS =
  "Quote projection requires fresh capability observations (connected instances and current provider terms). None are configured in this deployment — the honest state is an unavailable preview, never an invented quote.";

const NO_MERCHANT_PLANE =
  "No merchant checkout plane exists in this deployment — merchant checkout lands with Work Order P5-W3; this surface refuses to fabricate a checkout session before it exists.";

function intakeCapability(context: OutcomeDeploymentContext): OutcomeCapabilityState {
  return context.economicIntakeConfigured
    ? { dispatchable: true }
    : { dispatchable: false, missingPrerequisite: UNCONFIGURED_INTAKE };
}

function capabilityObservationCapability(
  context: OutcomeDeploymentContext,
): OutcomeCapabilityState {
  return context.capabilityObservationsAvailable
    ? { dispatchable: true }
    : { dispatchable: false, missingPrerequisite: NO_CAPABILITY_OBSERVATIONS };
}

function merchantCapability(context: OutcomeDeploymentContext): OutcomeCapabilityState {
  return context.merchantCheckoutContextBound
    ? { dispatchable: true }
    : { dispatchable: false, missingPrerequisite: NO_MERCHANT_PLANE };
}

const OUTCOME_ACTIONS: readonly OutcomeAction[] = Object.freeze([
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
    capability: intakeCapability,
    provenance: surfaceProvenance("P2-W3"),
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
    capability: intakeCapability,
    provenance: surfaceProvenance("P2-W3"),
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
    capability: intakeCapability,
    provenance: surfaceProvenance("P2-W3"),
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
    capability: capabilityObservationCapability,
    provenance: surfaceProvenance("P2-W3"),
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
    capability: merchantCapability,
    provenance: surfaceProvenance("P2-W3"),
  },
] as const);

/** The full registry, in the work order's fixed order. */
export const OUTCOME_REGISTRY: readonly OutcomeAction[] = OUTCOME_ACTIONS;

export function outcomeActionById(id: OutcomeActionId): OutcomeAction {
  const found = OUTCOME_ACTIONS.find((action) => action.id === id);
  if (found === undefined) {
    throw new Error(`outcomeActionById: unknown outcome action id ${JSON.stringify(id)}`);
  }
  return found;
}

/** Every outcome action's honest capability fold for one deployment. */
export function outcomeCapabilityBoard(
  context: OutcomeDeploymentContext,
): ReadonlyArray<{ readonly action: OutcomeAction; readonly state: OutcomeCapabilityState }> {
  return OUTCOME_ACTIONS.map((action) => ({
    action,
    state: action.capability(context),
  }));
}
