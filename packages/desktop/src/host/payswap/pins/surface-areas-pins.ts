/**
 * PaySwap Desktop (P7-W2) — structural pins of the @payswap/surface
 * eleven-area navigation IA and the five outcome-action DATA records
 * (mirrors packages/surface/src/{areas,outcomes}.ts at the base commit
 * recorded in pin-registry.ts; pins surface.areas + surface.outcomes data).
 *
 * The area set and order ARE the versioned contract (INV-22): the desktop
 * renders this registry as data; a web app, extension or SDK renders the
 * same facts. The outcome-action records carry the honest dispatchability
 * law inputs — where each journey REALLY executes, never a UI-side
 * imitation (INV-23).
 */

import type {
  PinnedOutcomeActionId,
  PinnedOutcomeActionRecord,
  PinnedSurfaceProvenance,
} from "./surface-pins.js";
import { PINNED_SURFACE_API_VERSION } from "./surface-pins.js";

/** Mirrors UniversalAreaId — the eleven operational areas, fixed and versioned. */
export const PINNED_UNIVERSAL_AREA_IDS = [
  "overview",
  "payments",
  "accounts",
  "activity",
  "opportunities",
  "connections",
  "capabilities",
  "security",
  "reports",
  "developers",
  "settings",
] as const;

export type PinnedUniversalAreaId = (typeof PINNED_UNIVERSAL_AREA_IDS)[number];

/** Mirrors AreaEmptyStateContract — the designed, honest empty state. */
export interface PinnedAreaEmptyStateContract {
  readonly reason: string;
  readonly nextAction: { readonly kind: "route" | "outcome"; readonly value: string };
}

/** Mirrors UniversalArea (the full area record; law citations auditable). */
export interface PinnedUniversalArea {
  readonly id: PinnedUniversalAreaId;
  readonly label: string;
  readonly route: string;
  readonly purpose: string;
  readonly lawCitations: readonly string[];
  readonly emptyState: PinnedAreaEmptyStateContract;
  readonly provenance: PinnedSurfaceProvenance;
}

const AREA_PROVENANCE: PinnedSurfaceProvenance = {
  surfaceApiVersion: PINNED_SURFACE_API_VERSION,
  stability: "stable",
  workOrder: "P2-W3",
};

const OUTCOME_PROVENANCE: PinnedSurfaceProvenance = {
  surfaceApiVersion: PINNED_SURFACE_API_VERSION,
  stability: "stable",
  workOrder: "P2-W3",
};

const TOPOLOGY_NOTE =
  "Canonical path (advisory projection): Experience -> Economic Goal -> Intent -> Capability Discovery -> Policy + Security -> PaySwap Authorization -> Financial Protocol -> Connected Capability -> External Effect -> Observation/Finality -> Reconciliation/Evidence. The surface renders this path; it never dispatches it.";

/** Mirrors UNIVERSAL_AREAS — the full registry, in the work order's fixed order. */
export const PINNED_UNIVERSAL_AREAS: readonly PinnedUniversalArea[] = Object.freeze([
  {
    id: "overview",
    label: "Overview",
    route: "/app",
    purpose: "The home view: what needs attention, recent activity, quick outcomes.",
    lawCitations: [
      "docs/FINAL-TL-HANDOFF.md#product-and-ui-law",
      "spec/architecture/PAYSWAP-3.0.md#ux-benchmark",
    ],
    emptyState: {
      reason:
        "No session-scoped observations yet — the overview renders only what the authoritative planes provide.",
      nextAction: { kind: "route", value: "/app/payments" },
    },
    provenance: AREA_PROVENANCE,
  },
  {
    id: "payments",
    label: "Payments",
    route: "/app/payments",
    purpose: "Money in and money out: pay, receive, move — plus the payment object spine.",
    lawCitations: [
      "docs/FINAL-TL-HANDOFF.md#product-and-ui-law",
      "spec/architecture/PAYSWAP-3.0.md#economic-model",
      "spec/research/WISE-OPERATING-MODEL.md#4.3-one-truthful-financial-lifecycle",
    ],
    emptyState: {
      reason:
        "No connected payment capability yet — journeys start from connected instances only.",
      nextAction: { kind: "route", value: "/app/connections" },
    },
    provenance: AREA_PROVENANCE,
  },
  {
    id: "accounts",
    label: "Accounts",
    route: "/app/accounts",
    purpose:
      "Balances and positions across providers — every number an OBSERVATION of an external provider, never PaySwap custody.",
    lawCitations: [
      "spec/architecture/INVARIANTS.md#7",
      "spec/research/WISE-OPERATING-MODEL.md#4.5-custody-safeguarding-and-liquidity-boundary",
    ],
    emptyState: {
      reason:
        "No provider balance observations exist — external provider balances are observations, and none have been observed in this deployment.",
      nextAction: { kind: "route", value: "/app/connections" },
    },
    provenance: AREA_PROVENANCE,
  },
  {
    id: "activity",
    label: "Activity",
    route: "/app/activity",
    purpose: "The chronological ledger of actions with their honest states and evidence links.",
    lawCitations: [
      "docs/FINAL-TL-HANDOFF.md#product-and-ui-law",
      "spec/research/WISE-OPERATING-MODEL.md#4.3-one-truthful-financial-lifecycle",
    ],
    emptyState: {
      reason: "No recorded activity yet — activity rows come from authoritative records, never from the UI.",
      nextAction: { kind: "route", value: "/app/payments" },
    },
    provenance: AREA_PROVENANCE,
  },
  {
    id: "opportunities",
    label: "Opportunities",
    route: "/app/opportunities",
    purpose: "Discovered opportunities with honest risk and eligibility — never guaranteed returns.",
    lawCitations: ["spec/architecture/INVARIANTS.md#10", "spec/architecture/PAYSWAP-3.0.md#lab"],
    emptyState: {
      reason:
        "No opportunity observations yet — discovery runs on real capability observations only.",
      nextAction: { kind: "route", value: "/app/capabilities" },
    },
    provenance: AREA_PROVENANCE,
  },
  {
    id: "connections",
    label: "Connections",
    route: "/app/connections",
    purpose:
      "The connected-instance model: a provider catalogue capability is never a connection — execution is scoped to actual account authorization.",
    lawCitations: ["spec/architecture/INVARIANTS.md#13", "spec/architecture/CAPABILITY-MODEL.md"],
    emptyState: {
      reason:
        "No connected instances yet — the catalogue is browsable, but nothing is authorized until you connect.",
      nextAction: { kind: "route", value: "/connect" },
    },
    provenance: AREA_PROVENANCE,
  },
  {
    id: "capabilities",
    label: "Capabilities",
    route: "/app/capabilities",
    purpose:
      "The honest capability and coverage explorer over recorded provider-probe evidence.",
    lawCitations: ["spec/architecture/CAPABILITY-MODEL.md", "spec/architecture/INVARIANTS.md#13"],
    emptyState: {
      reason:
        "Capability coverage renders from recorded probe evidence — the explorer carries the same honesty.",
      nextAction: { kind: "route", value: "/capabilities" },
    },
    provenance: AREA_PROVENANCE,
  },
  {
    id: "security",
    label: "Security",
    route: "/app/security",
    purpose:
      "Human-readable warnings and blocks — the BLOCK/ALLOW/UNKNOWN gate vocabulary in people language with typed drill-down.",
    lawCitations: [
      "spec/architecture/INVARIANTS.md#4",
      "spec/architecture/INVARIANTS.md#21",
      "spec/research/WISE-OPERATING-MODEL.md#3",
    ],
    emptyState: {
      reason:
        "No gate records yet — security findings appear here as they occur in real journeys.",
      nextAction: { kind: "route", value: "/security" },
    },
    provenance: AREA_PROVENANCE,
  },
  {
    id: "reports",
    label: "Reports",
    route: "/app/reports",
    purpose: "Reporting over evidence-backed records — every figure traceable to its evidence.",
    lawCitations: [
      "spec/architecture/INVARIANTS.md#5",
      "spec/research/WISE-OPERATING-MODEL.md#4.3-one-truthful-financial-lifecycle",
    ],
    emptyState: {
      reason:
        "No reportable records yet — reports generate from the same evidence the activity ledger records.",
      nextAction: { kind: "route", value: "/app/activity" },
    },
    provenance: AREA_PROVENANCE,
  },
  {
    id: "developers",
    label: "Developers",
    route: "/app/developers",
    purpose: "The developer surface: API surface, webhooks, keys — test/live visibly distinct.",
    lawCitations: [
      "spec/architecture/INVARIANTS.md#25",
      "spec/architecture/PAYSWAP-3.0.md#product-surfaces",
    ],
    emptyState: {
      reason: "The developer surface renders the same contracts the programmatic clients consume.",
      nextAction: { kind: "route", value: "/app/developers" },
    },
    provenance: AREA_PROVENANCE,
  },
  {
    id: "settings",
    label: "Settings",
    route: "/app/settings",
    purpose: "Account, role and session preferences — mode switches visible and honest.",
    lawCitations: [
      "spec/architecture/INVARIANTS.md#25",
      "docs/FINAL-TL-HANDOFF.md#product-and-ui-law",
    ],
    emptyState: {
      reason:
        "Settings render from the session's own authority — nothing is configurable without one.",
      nextAction: { kind: "route", value: "/app/settings" },
    },
    provenance: AREA_PROVENANCE,
  },
] as const);

/** Mirrors OUTCOME_REGISTRY — the five outcome actions, in the fixed order. */
export const PINNED_OUTCOME_ACTIONS: readonly PinnedOutcomeActionRecord[] = Object.freeze([
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
    provenance: OUTCOME_PROVENANCE,
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
    provenance: OUTCOME_PROVENANCE,
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
    provenance: OUTCOME_PROVENANCE,
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
    provenance: OUTCOME_PROVENANCE,
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
    provenance: OUTCOME_PROVENANCE,
  },
] as const);

/** Look up one pinned area by id (fail-closed on unknown ids). */
export function pinnedUniversalAreaById(id: PinnedUniversalAreaId): PinnedUniversalArea {
  const found = PINNED_UNIVERSAL_AREAS.find((area) => area.id === id);
  if (found === undefined) {
    throw new Error(
      `pinnedUniversalAreaById: unknown universal area id ${JSON.stringify(id)} — the area vocabulary is closed`,
    );
  }
  return found;
}

/** Look up one pinned outcome action record by id (fail-closed). */
export function pinnedOutcomeActionById(
  id: PinnedOutcomeActionId,
): PinnedOutcomeActionRecord {
  const found = PINNED_OUTCOME_ACTIONS.find((action) => action.id === id);
  if (found === undefined) {
    throw new Error(
      `pinnedOutcomeActionById: unknown outcome action id ${JSON.stringify(id)} — the outcome vocabulary is closed`,
    );
  }
  return found;
}

/** Guard: a value is one of the pinned universal area ids. */
export function isPinnedUniversalAreaId(value: unknown): value is PinnedUniversalAreaId {
  return (
    typeof value === "string" &&
    (PINNED_UNIVERSAL_AREA_IDS as readonly unknown[]).includes(value)
  );
}
