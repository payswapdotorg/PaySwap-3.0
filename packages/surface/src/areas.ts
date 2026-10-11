/**
 * @payswap/surface — the eleven operational areas (P2-W3).
 *
 * ADAPT of payswap.org@8a735bf packages/surface/src/areas.ts (211L).
 * Old-repo provenance: P4-W4-002 §3.2; the area set maps EXACTLY to the
 * canonical product law (docs/FINAL-TL-HANDOFF.md "Product and UI law":
 * "operational areas for Payments, Accounts, Activity, Opportunities,
 * Connections, Capabilities, Security, Reports, Developers and Settings",
 * plus the overview home view = eleven areas total).
 *
 * This registry is DATA for any renderer: the Web sidebar (P7-W1), a mobile
 * tab bar, an extension popup, an SDK. `route` is the canonical web route
 * id; host apps may map ids to their own navigation, but the AREA SET and
 * ORDER are the versioned contract (INV-22).
 *
 * ADAPTATION vs the old repo: the old `researchCitations` cited the old
 * repository's Stripe UX research corpus (docs/ux-research/stripe/**),
 * which does not exist in PaySwap 3.0. Each area now cites the CANONICAL
 * PaySwap 3.0 law documents its placement and honesty rules derive from
 * (`lawCitations`, auditable paths into this repository — the sole source
 * of truth). Empty-state contracts are PORTED with canonical law language.
 */

import { surfaceProvenance, type SurfaceContractProvenance } from "./version.ts";

/** The eleven operational areas — the fixed, versioned vocabulary. */
export type UniversalAreaId =
  | "overview"
  | "payments"
  | "accounts"
  | "activity"
  | "opportunities"
  | "connections"
  | "capabilities"
  | "security"
  | "reports"
  | "developers"
  | "settings";

/**
 * What an area renders when the backend provides nothing yet — the designed
 * empty state: it names the object, explains why it is empty, and offers the
 * next action. The surface records the honest fact; the renderer phrases it.
 */
export interface AreaEmptyStateContract {
  /** Why the area is empty (a fact about configured authority). */
  readonly reason: string;
  /** The real next action offered (route or outcome action id). */
  readonly nextAction: { readonly kind: "route" | "outcome"; readonly value: string };
}

export interface UniversalArea {
  readonly id: UniversalAreaId;
  readonly label: string;
  readonly route: string;
  /** One-line people-language purpose. */
  readonly purpose: string;
  /**
   * The canonical law documents this area's placement and honesty rules
   * derive from (auditable citations — file paths in THIS repository,
   * optionally with #anchors).
   */
  readonly lawCitations: readonly string[];
  /** The honest empty-state contract when no backend data exists. */
  readonly emptyState: AreaEmptyStateContract;
  readonly provenance: SurfaceContractProvenance;
}

const AREAS: readonly UniversalArea[] = Object.freeze([
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
      reason: "No session-scoped observations yet — the overview renders only what the authoritative planes provide.",
      nextAction: { kind: "route", value: "/app/payments" },
    },
    provenance: surfaceProvenance("P2-W3"),
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
      reason: "No connected payment capability yet — journeys start from connected instances only.",
      nextAction: { kind: "route", value: "/app/connections" },
    },
    provenance: surfaceProvenance("P2-W3"),
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
      reason: "No provider balance observations exist — external provider balances are observations, and none have been observed in this deployment.",
      nextAction: { kind: "route", value: "/app/connections" },
    },
    provenance: surfaceProvenance("P2-W3"),
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
    provenance: surfaceProvenance("P2-W3"),
  },
  {
    id: "opportunities",
    label: "Opportunities",
    route: "/app/opportunities",
    purpose: "Discovered opportunities with honest risk and eligibility — never guaranteed returns.",
    lawCitations: [
      "spec/architecture/INVARIANTS.md#10",
      "spec/architecture/PAYSWAP-3.0.md#lab",
    ],
    emptyState: {
      reason: "No opportunity observations yet — discovery runs on real capability observations only.",
      nextAction: { kind: "route", value: "/app/capabilities" },
    },
    provenance: surfaceProvenance("P2-W3"),
  },
  {
    id: "connections",
    label: "Connections",
    route: "/app/connections",
    purpose:
      "The connected-instance model: a provider catalogue capability is never a connection — execution is scoped to actual account authorization.",
    lawCitations: [
      "spec/architecture/INVARIANTS.md#13",
      "spec/architecture/CAPABILITY-MODEL.md",
    ],
    emptyState: {
      reason: "No connected instances yet — the catalogue is browsable, but nothing is authorized until you connect.",
      nextAction: { kind: "route", value: "/connect" },
    },
    provenance: surfaceProvenance("P2-W3"),
  },
  {
    id: "capabilities",
    label: "Capabilities",
    route: "/app/capabilities",
    purpose: "The honest capability and coverage explorer over recorded provider-probe evidence.",
    lawCitations: [
      "spec/architecture/CAPABILITY-MODEL.md",
      "spec/architecture/INVARIANTS.md#13",
    ],
    emptyState: {
      reason: "Capability coverage renders from recorded probe evidence — the explorer carries the same honesty.",
      nextAction: { kind: "route", value: "/capabilities" },
    },
    provenance: surfaceProvenance("P2-W3"),
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
      reason: "No gate records yet — security findings appear here as they occur in real journeys.",
      nextAction: { kind: "route", value: "/security" },
    },
    provenance: surfaceProvenance("P2-W3"),
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
      reason: "No reportable records yet — reports generate from the same evidence the activity ledger records.",
      nextAction: { kind: "route", value: "/app/activity" },
    },
    provenance: surfaceProvenance("P2-W3"),
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
    provenance: surfaceProvenance("P2-W3"),
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
      reason: "Settings render from the session's own authority — nothing is configurable without one.",
      nextAction: { kind: "route", value: "/app/settings" },
    },
    provenance: surfaceProvenance("P2-W3"),
  },
] as const);

export const UNIVERSAL_AREAS: readonly UniversalArea[] = AREAS;

export const UNIVERSAL_AREA_IDS: readonly UniversalAreaId[] = AREAS.map((area) => area.id);

export function universalAreaById(id: UniversalAreaId): UniversalArea {
  const found = AREAS.find((area) => area.id === id);
  if (found === undefined) {
    throw new Error(`universalAreaById: unknown universal area id ${JSON.stringify(id)}`);
  }
  return found;
}
