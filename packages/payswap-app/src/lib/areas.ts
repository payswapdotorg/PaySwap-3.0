/**
 * @payswap/app — the ELEVEN-AREA navigation IA data mirror.
 *
 * STRUCTURAL MIRROR of @payswap/surface (P2-W3 ACCEPTED)
 * packages/surface/src/areas.ts UNIVERSAL_AREAS: the eleven operational
 * areas with their labels, routes, purposes, law citations and honest
 * empty-state contracts, carried field-for-field (same literals, same
 * order). Mirror-tested at test/payswap/pin-mirror.test.ts; the TL wires
 * real imports at accept-time.
 *
 * This is the P7-W1 share of the old @payswap/ux product-ia.ts (MMP-35):
 * the old package owned its own nav vocabulary; the CANONICAL navigation
 * vocabulary of PaySwap 3.0 is this pinned eleven-area IA (surface
 * contract), and the web product renders it — no second navigation
 * vocabulary is created.
 */

import type { SurfaceProvenancePin, UniversalAreaPin } from "../pins/surface-pins.js";
import { PINNED_SURFACE_API_VERSION } from "../pins/surface-pins.js";

function provenance(workOrder: string): SurfaceProvenancePin {
  return { surfaceApiVersion: PINNED_SURFACE_API_VERSION, stability: "stable", workOrder };
}

/**
 * The eleven operational areas — MIRRORED from surface areas.ts AREAS
 * (labels, routes, purposes, lawCitations and emptyState contracts
 * verbatim; same order — the versioned AREA SET).
 */
export const UNIVERSAL_AREAS_MIRROR: readonly UniversalAreaPin[] = [
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
    provenance: provenance("P2-W3"),
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
    provenance: provenance("P2-W3"),
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
    provenance: provenance("P2-W3"),
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
    provenance: provenance("P2-W3"),
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
    provenance: provenance("P2-W3"),
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
    provenance: provenance("P2-W3"),
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
    provenance: provenance("P2-W3"),
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
    provenance: provenance("P2-W3"),
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
    provenance: provenance("P2-W3"),
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
    provenance: provenance("P2-W3"),
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
    provenance: provenance("P2-W3"),
  },
] as const;
