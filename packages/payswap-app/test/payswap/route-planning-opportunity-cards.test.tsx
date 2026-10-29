// @vitest-environment jsdom
/**
 * @payswap/app — the ROUTE-PLANNING OPPORTUNITY-CARDS battery (P23-B, lane
 * B; ADR-0015 D8 — the actionable-card laws, failing-first).
 *
 * The panel's three advisory sections, machine-checked against the REAL
 * component with FIXED validated engine views (deterministic — no engine,
 * no network, no clock):
 *
 * - THE SECTION-ORDER LAW (A.7): the three sections render between the
 *   scenarios section and the waiting surface, in the frozen order, with
 *   the advisory branding (available-now FIRST, the repairs after).
 * - THE CARD LAWS: every pinned field renders — the people-language
 *   preconditions, the assumptions, the platform prerequisites DISTINCT
 *   (a separate labeled block), the countdown-free expiry, the honest
 *   verification badge (PLANNER_VERIFIED green-branded; UNVERIFIED reason
 *   VERBATIM), the hypothesis's verified-vs-assumed segments, the cited
 *   shape provenance, the blockers, the wouldCompose assessment, the
 *   NEVER-EXECUTABLE note, the stage-6 advisory-measurement attachment.
 * - THE TESTIDS (the E2E anchors): ps-agent-conditional-<id>,
 *   ps-agent-platform-work-<gapId>, ps-agent-hypothesis-<id>.
 * - THE HONEST DEFAULTS: absent sections render the not-composed notes
 *   (never fabricated data); empty sections render the honest empty states.
 * - THE WAIT-CRITERIA GROWTH: the wait section names the CONCRETE
 *   preconditions (the conditional titles), not just trigger categories.
 * - ZERO AUTHORITY: no dispatch/execute/authorize control exists on any
 *   card; the model-proposal tier renders the honest zero-model note.
 * - THE SESSION GROWTH: validateRoutePlanningEngineView accepts the
 *   composed sections and rejects drifted ones typed; the PREVIEW_PRESENTED
 *   summary carries the three counts.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

import { RoutePlanningPanel } from "../../src/agent/RoutePlanningPanel.js";
import { createBrowserAgentTaskSessionPort, type AgentTaskSessionStorage } from "../../src/agent/taskSessionAdapter.js";
import {
  createRoutePlanningSession,
  validateRoutePlanningEngineView,
} from "../../src/agent/routePlanningSession.js";
import { routePlanningViewDigestOf, type RoutePlanningEngineView } from "../../src/agent/routePlanningPins.js";
import {
  ROUTE_PLANNING_CONDITIONAL_OPPORTUNITIES_EMPTY_NOTE,
  ROUTE_PLANNING_CONDITIONAL_OPPORTUNITIES_UNCOMPOSED_NOTE,
  ROUTE_PLANNING_HYPOTHESES_EMPTY_NOTE,
  ROUTE_PLANNING_HYPOTHESES_UNCOMPOSED_NOTE,
  ROUTE_PLANNING_HYPOTHESIS_NEVER_EXECUTABLE_NOTE,
  ROUTE_PLANNING_MODEL_PROPOSALS_UNBOUND_NO_MODEL_NOTE,
  ROUTE_PLANNING_PLATFORM_WORK_EMPTY_NOTE,
  ROUTE_PLANNING_PLATFORM_WORK_UNCOMPOSED_NOTE,
  ROUTE_PLANNING_VERIFIED_BADGE_NOTE,
  type RoutePlanningConditionalOpportunityPin,
  type RoutePlanningHypothesisPin,
  type RoutePlanningPlatformWorkPin,
} from "../../src/agent/routePlanningOpportunityPins.js";

const T0 = "2026-10-22T12:00:00Z";
const T1 = "2026-10-22T12:05:00Z";

/** The P21-corridor-shaped conditional card pins (the fixture corpus). */
function conditionalCards(): readonly RoutePlanningConditionalOpportunityPin[] {
  return [
    {
      conditionalId: "conditional:RECIPIENT:ENABLES_FLUTTERWAVE_RECEIVING_METHOD:opportunity:other:fiat:ngn-usd:venue:stripe:obs:1",
      title: "the recipient enables an eligible Flutterwave receiving method",
      description: "the corridor does not compose today: the receiving rail's restriction sets do not serve the flutterwave_wallet funding method — the conditional route exists only when the recipient enables a Flutterwave receiving method that serves this funding method",
      requiredPartyChanges: [{ party: "RECIPIENT", change: "ENABLES_FLUTTERWAVE_RECEIVING_METHOD" }],
      assumptions: [
        "the recipient enables a Flutterwave receiving method that serves this corridor's funding method",
        "the sender's Flutterwave connection remains an eligible funding rail for the corridor",
      ],
      platformPrerequisites: [
        { gapId: "platform:flutterwave-send-operation", note: "an FLW receiving method makes the corridor real only when a Flutterwave send operation exists in the capability model — the platform gap, distinct from the party prerequisite" },
      ],
      expiresAt: 1_771_616_400_000,
      verification: "UNVERIFIED",
      verificationReason: "no hypothetical re-run exists for this party change — the planner has not re-verified the party-changed view, so the conditional rests on the verbatim exclusion facts alone",
    },
    {
      conditionalId: "conditional:SENDER:ADDS_STRIPE_COMPATIBLE_INSTRUMENT:opportunity:other:fiat:ngn-usd:venue:stripe:obs:2",
      title: "the sender adds a genuinely supported Stripe-compatible payment instrument",
      description: "the corridor does not compose today: the receiving rail's restriction sets do not serve the flutterwave_wallet funding method — the conditional route exists only when the sender funds it with an instrument the receiving rail's restriction sets genuinely serve",
      requiredPartyChanges: [{ party: "SENDER", change: "ADDS_STRIPE_COMPATIBLE_INSTRUMENT" }],
      assumptions: [
        "the sender adds a payment instrument the receiving rail's restriction sets genuinely serve (a Stripe-compatible funding method)",
      ],
      platformPrerequisites: [],
      expiresAt: 1_771_616_400_000,
      verification: "PLANNER_VERIFIED",
      verificationReason: "the REAL planner re-run composed a rank-eligible route over the party-changed view",
    },
    {
      conditionalId: "conditional:THIRD_PARTY:INTERMEDIARY_INTRODUCED:opportunity:other:fiat:ngn-usd:venue:stripe:obs:3",
      title: "a verified intermediary is introduced",
      description: "no route composes across the corridor's two sides — the conditional route exists only when a verified intermediary bridges the sender's funding rail and the merchant's receiving context",
      requiredPartyChanges: [{ party: "THIRD_PARTY", change: "INTERMEDIARY_INTRODUCED" }],
      assumptions: [
        "a verified intermediary is introduced whose rails bridge the sender's funding rail and the merchant's receiving context",
      ],
      platformPrerequisites: [
        { gapId: "platform:cross-provider-route-shape", note: "a verified intermediary makes the corridor real only when a frozen route shape composes the cross-provider pair — a governance-level vocabulary change, never manufactured this wave" },
      ],
      expiresAt: 1_771_616_400_000,
      verification: "UNVERIFIED",
      verificationReason: "the re-run verified no rank-eligible segment over the real sub-views — the remaining REAL exclusions block the corridor (FUNDING_METHOD_NOT_SERVED, NOT_EXECUTABLE_CAPABILITY)",
    },
  ];
}

function platformWorkCards(): readonly RoutePlanningPlatformWorkPin[] {
  return [
    {
      workItemId: "platform-work:platform:flutterwave-send-operation",
      gapId: "platform:flutterwave-send-operation",
      title: "a Flutterwave send operation",
      requiredByOperatorIds: ["repair:recipient-enables-flw-receiving-method"],
      evidenceBasis: [
        { side: "RECIPIENT", routeId: "route:stripe:test", code: "FUNDING_METHOD_NOT_SERVED", message: "the receiving rail's restriction sets do not serve the flutterwave_wallet funding method", fundingMethod: "flutterwave_wallet" },
      ],
    },
  ];
}

function hypothesisCards(): readonly RoutePlanningHypothesisPin[] {
  return [
    {
      hypothesisId: "hypothesis:fnv1a64:abcdef0123456789:repair:intermediary-introduced",
      operatorId: "repair:intermediary-introduced",
      assumptionSummary: "a verified intermediary rail bridges the sender's funding rail and the merchant's receiving context",
      verifiedSegmentIds: ["route-plan:intent:planning:001:provider-native-bridge"],
      assumedSegmentIds: ["assumed-rail:repair:intermediary-introduced"],
      citedShapeId: "provider-native-bridge",
      blockers: [
        { side: "SENDER", routeId: "route:flw:readonly", code: "NOT_EXECUTABLE_CAPABILITY", message: "the rail's capability definition is not executable (read-only)" },
      ],
      wouldCompose: true,
      verification: "PLANNER_VERIFIED",
      verificationReason: "the REAL planner re-run composed a rank-eligible route over the real sub-views; the assumed element is the hypothetical bridge",
      neverExecutable: true,
      advisoryOnly: true,
    },
  ];
}

/** A fixed, fully-valid engine view (optionally carrying the opportunity sections). */
function fixedEngineView(options?: {
  readonly conditionalOpportunities?: readonly RoutePlanningConditionalOpportunityPin[];
  readonly platformWork?: readonly RoutePlanningPlatformWorkPin[];
  readonly hypotheses?: readonly RoutePlanningHypothesisPin[];
  readonly withRepairInterventionScenario?: boolean;
  readonly withModelProposalNote?: boolean;
}): RoutePlanningEngineView {
  const value = {
    kind: "PRESENTED_PLAN" as const,
    routine: {
      routineId: "payment-route-planning" as const,
      routineVersion: "1.0.0" as const,
      skillContentDigest: "fnv1a64:1abba70f0107d1b2" as const,
    },
    intentRef: "intent:planning:001",
    presentedAt: T0,
    availableNow: {
      ranked: [
        {
          planId: "plan:provider-native-bridge", shapeId: "provider-native-bridge", rank: 1,
          netNumeraireMinorUnits: "987654", numeraire: "USD", hopCount: 2, railCrossings: 1,
          riskClass: "LOW", estimatedSettlementMs: 90000, unknownDimensions: [],
          paretoNonDominated: true, dominatedBy: [],
        },
      ],
      notScored: [],
      senderEligibleRouteIds: ["inst:sender-psp-native"],
      recipientEligibleRouteIds: ["inst:recipient-psp-payouts"],
    },
    exclusions: [
      { subject: "shape:onchain-direct", code: "ROUTE_UNSUPPORTED", message: "no venue observation for the direct on-chain shape" },
    ],
    truncation: { receipts: [], coverage: "COMPLETE" as const },
    scenarios: {
      advisoryOnly: true as const,
      coverage: "COMPLETE" as const,
      outcomes: options?.withRepairInterventionScenario === true
        ? [
            { interventionId: "repair-intervention:repair:intermediary-introduced", kind: "THIRD_PARTY_NODE_JOINS", counterfactualId: "cf:repair:intermediary-introduced", counterfactualDigest: "fnv1a64:fedcba9876543210" },
          ]
        : [],
    },
    ...(options?.conditionalOpportunities !== undefined ? { conditionalOpportunities: options.conditionalOpportunities } : {}),
    ...(options?.platformWork !== undefined ? { platformWork: options.platformWork } : {}),
    ...(options?.hypotheses !== undefined ? { hypotheses: options.hypotheses } : {}),
    ...(options?.withModelProposalNote === true ? { modelProposals: { kind: "UNBOUND_NO_MODEL" as const } } : {}),
    waiting: {
      proposal: {
        waitId: "wait:route:001",
        families: ["liquidity" as const],
        categories: ["NEW_OPPORTUNITY" as const, "FEES_KNOWN" as const],
        maxWaitMs: 3_600_000,
        maxSettlementMs: 600_000,
        fallback: { kind: "REPLAN_FROM_FRESH_EVIDENCE" as const, routeRef: "plan:provider-native-bridge" },
        tradeOffs: [],
        declaredAt: 1_771_612_800_000,
      },
    },
  };
  return { ...value, viewDigest: routePlanningViewDigestOf(value) };
}

afterEach(() => {
  cleanup();
});

describe("the section-order law (A.7) — three advisory sections between scenarios and waiting", () => {
  it("renders the eight sections in the frozen order with the advisory branding", () => {
    const view = fixedEngineView({
      conditionalOpportunities: conditionalCards(),
      platformWork: platformWorkCards(),
      hypotheses: hypothesisCards(),
      withModelProposalNote: true,
    });
    const { container } = render(<RoutePlanningPanel view={{ kind: "PRESENTED_PLAN", view }} waiting={null} />);
    const sections = [...container.querySelectorAll(".ps-agent-route-section")].map((section) => section.id);
    expect(sections).toEqual([
      "ps-agent-route-section-available-now",
      "ps-agent-route-section-exclusions",
      "ps-agent-route-section-truncation",
      "ps-agent-route-section-scenarios",
      "ps-agent-route-section-conditional-opportunities",
      "ps-agent-route-section-platform-work",
      "ps-agent-route-section-hypotheses",
      "ps-agent-route-section-waiting",
    ]);
    // The advisory branding renders on each new section (visually distinct).
    const conditional = container.querySelector("#ps-agent-route-section-conditional-opportunities")!;
    expect(conditional.textContent).toContain("Advisory — what would need to change, never a route today");
  });
});

describe("the conditional-opportunity card laws (every pinned field renders)", () => {
  it("renders the title, description, people-language preconditions, assumptions, DISTINCT platform prerequisites, expiry and the honest badges", () => {
    const view = fixedEngineView({ conditionalOpportunities: conditionalCards(), withModelProposalNote: true });
    const { container } = render(<RoutePlanningPanel view={{ kind: "PRESENTED_PLAN", view }} waiting={null} />);
    const first = container.querySelector<HTMLElement>('[data-testid^="ps-agent-conditional-"]')!;
    expect(first.getAttribute("data-testid")).toBe(
      "ps-agent-conditional-conditional:RECIPIENT:ENABLES_FLUTTERWAVE_RECEIVING_METHOD:opportunity:other:fiat:ngn-usd:venue:stripe:obs:1",
    );
    expect(first.getAttribute("aria-label")).toContain("Conditional opportunity: the recipient enables an eligible Flutterwave receiving method");
    expect(first.textContent).toContain("the recipient enables an eligible Flutterwave receiving method");
    expect(first.textContent).toContain("the corridor does not compose today");
    // The people-language preconditions (the frozen label maps, not machine codes).
    expect(first.textContent).toContain("What would need to change: the recipient enables an eligible Flutterwave receiving method");
    // The assumptions list.
    expect(first.textContent).toContain("the sender's Flutterwave connection remains an eligible funding rail for the corridor");
    // The platform prerequisites render as a SEPARATE labeled block.
    expect(first.textContent).toContain("What PaySwap itself would need to build");
    expect(first.textContent).toContain("platform:flutterwave-send-operation");
    expect(first.textContent).toContain("distinct from the party preconditions above");
    // The countdown-free expiry.
    expect(first.textContent).toContain("expires at 1771616400000 — the conditional never outlives this instant");
    // The UNVERIFIED badge carries the honest reason VERBATIM.
    expect(first.textContent).toContain("UNVERIFIED — no hypothetical re-run exists for this party change");
  });

  it("renders the PLANNER_VERIFIED badge with the green-branded standing text — and never on the unverified card", () => {
    const view = fixedEngineView({ conditionalOpportunities: conditionalCards() });
    const { container } = render(<RoutePlanningPanel view={{ kind: "PRESENTED_PLAN", view }} waiting={null} />);
    const cards = [...container.querySelectorAll('[data-testid^="ps-agent-conditional-"]')];
    expect(cards).toHaveLength(3);
    const verified = cards[1]!;
    expect(verified.textContent).toContain(`PLANNER_VERIFIED — ${ROUTE_PLANNING_VERIFIED_BADGE_NOTE}`);
    expect(verified.querySelector(".ps-agent-opportunity-verified")).not.toBeNull();
    const unverified = cards[0]!;
    expect(unverified.querySelector(".ps-agent-opportunity-verified")).toBeNull();
    expect(unverified.querySelector(".ps-agent-opportunity-unverified")).not.toBeNull();
  });

  it("renders the honest zero-model note for the model-proposal tier (the CDP-proven truth)", () => {
    const view = fixedEngineView({ conditionalOpportunities: conditionalCards(), withModelProposalNote: true });
    const markup = renderToStaticMarkup(<RoutePlanningPanel view={{ kind: "PRESENTED_PLAN", view }} waiting={null} />);
    expect(markup).toContain(ROUTE_PLANNING_MODEL_PROPOSALS_UNBOUND_NO_MODEL_NOTE);
  });

  it("renders NO dispatch/execute/authorize control anywhere on the cards (zero authority)", () => {
    const view = fixedEngineView({
      conditionalOpportunities: conditionalCards(),
      platformWork: platformWorkCards(),
      hypotheses: hypothesisCards(),
    });
    const { container } = render(<RoutePlanningPanel view={{ kind: "PRESENTED_PLAN", view }} waiting={null} />);
    const buttons = [...container.querySelectorAll("button")];
    for (const button of buttons) {
      const label = `${button.textContent ?? ""} ${button.getAttribute("data-testid") ?? ""}`.toLowerCase();
      expect(label).not.toContain("dispatch");
      expect(label).not.toContain("execute");
      expect(label).not.toContain("authorize");
    }
  });
});

describe("the platform-work card laws (what PaySwap itself would need to build)", () => {
  it("renders the title, the evidence line (codes + messages), the required-by operators and the advisory note", () => {
    const view = fixedEngineView({ platformWork: platformWorkCards() });
    const { container } = render(<RoutePlanningPanel view={{ kind: "PRESENTED_PLAN", view }} waiting={null} />);
    const card = container.querySelector<HTMLElement>('[data-testid="ps-agent-platform-work-platform:flutterwave-send-operation"]')!;
    expect(card).not.toBeNull();
    expect(card.getAttribute("aria-label")).toContain("Platform work item: a Flutterwave send operation");
    expect(card.textContent).toContain("a Flutterwave send operation");
    expect(card.textContent).toContain("FUNDING_METHOD_NOT_SERVED");
    expect(card.textContent).toContain("the receiving rail's restriction sets do not serve the flutterwave_wallet funding method");
    expect(card.textContent).toContain("repair:recipient-enables-flw-receiving-method");
    expect(card.textContent).toContain("work PaySwap itself would need to build");
    // DISTINCT from a party prerequisite.
    expect(card.textContent).toContain("never a party prerequisite");
  });
});

describe("the hypothesis card laws (never a route)", () => {
  it("renders the assumption, the verified vs assumed segments, the cited shape, the blockers, wouldCompose, the badge, the measurement and the never-executable note", () => {
    const view = fixedEngineView({
      hypotheses: hypothesisCards(),
      withRepairInterventionScenario: true,
    });
    const { container } = render(<RoutePlanningPanel view={{ kind: "PRESENTED_PLAN", view }} waiting={null} />);
    const card = container.querySelector<HTMLElement>(
      '[data-testid="ps-agent-hypothesis-hypothesis:fnv1a64:abcdef0123456789:repair:intermediary-introduced"]',
    )!;
    expect(card).not.toBeNull();
    expect(card.textContent).toContain("a verified intermediary rail bridges the sender's funding rail and the merchant's receiving context");
    expect(card.textContent).toContain("route-plan:intent:planning:001:provider-native-bridge — verified today");
    expect(card.textContent).toContain("assumed-rail:repair:intermediary-introduced — assumed");
    expect(card.textContent).toContain("Cited shape skeleton (provenance, never a compiled plan): provider-native-bridge");
    expect(card.textContent).toContain("NOT_EXECUTABLE_CAPABILITY");
    expect(card.textContent).toContain("the rail's capability definition is not executable (read-only)");
    expect(card.textContent).toContain("Would compose: yes, structurally");
    expect(card.textContent).toContain(`PLANNER_VERIFIED — ${ROUTE_PLANNING_VERIFIED_BADGE_NOTE}`);
    // The stage-6 advisory-measurement attachment (the matching repair intervention).
    expect(card.textContent).toContain("Advisory measurement (stage-6 counterfactual): cf:repair:intermediary-introduced (fnv1a64:fedcba9876543210)");
    // The NEVER-EXECUTABLE note renders VERBATIM.
    expect(card.textContent).toContain(ROUTE_PLANNING_HYPOTHESIS_NEVER_EXECUTABLE_NOTE);
  });
});

describe("the honest defaults (absent sections render the not-composed notes; empty sections the empty states)", () => {
  it("an engine view WITHOUT the sections renders the three not-composed notes — never fabricated data", () => {
    const view = fixedEngineView();
    const markup = renderToStaticMarkup(<RoutePlanningPanel view={{ kind: "PRESENTED_PLAN", view }} waiting={null} />);
    expect(markup).toContain(ROUTE_PLANNING_CONDITIONAL_OPPORTUNITIES_UNCOMPOSED_NOTE);
    expect(markup).toContain(ROUTE_PLANNING_PLATFORM_WORK_UNCOMPOSED_NOTE);
    expect(markup).toContain(ROUTE_PLANNING_HYPOTHESES_UNCOMPOSED_NOTE);
    expect(markup).not.toContain('data-testid="ps-agent-conditional-');
    expect(markup).not.toContain('data-testid="ps-agent-platform-work-');
    expect(markup).not.toContain('data-testid="ps-agent-hypothesis-');
  });

  it("composed-but-empty sections render the honest empty states", () => {
    const view = fixedEngineView({ conditionalOpportunities: [], platformWork: [], hypotheses: [] });
    const markup = renderToStaticMarkup(<RoutePlanningPanel view={{ kind: "PRESENTED_PLAN", view }} waiting={null} />);
    expect(markup).toContain(ROUTE_PLANNING_CONDITIONAL_OPPORTUNITIES_EMPTY_NOTE);
    expect(markup).toContain(ROUTE_PLANNING_PLATFORM_WORK_EMPTY_NOTE);
    expect(markup).toContain(ROUTE_PLANNING_HYPOTHESES_EMPTY_NOTE);
  });
});

describe("the wait-criteria growth (D8 — the concrete preconditions)", () => {
  it("the wait section names the CONCRETE preconditions (the conditional titles), not just the trigger categories", () => {
    const view = fixedEngineView({ conditionalOpportunities: conditionalCards() });
    const { container } = render(<RoutePlanningPanel view={{ kind: "PRESENTED_PLAN", view }} waiting={null} />);
    const waiting = container.querySelector("#ps-agent-route-section-waiting")!;
    expect(waiting.textContent).toContain("Waiting for:");
    expect(waiting.textContent).toContain("the recipient enables an eligible Flutterwave receiving method");
    expect(waiting.textContent).toContain("the sender adds a genuinely supported Stripe-compatible payment instrument");
    expect(waiting.textContent).toContain("a verified intermediary is introduced");
    expect(waiting.textContent).toContain("not just trigger categories");
  });

  it("no conditional opportunities → no preconditions line (the criteria line stands alone, honestly)", () => {
    const view = fixedEngineView();
    const markup = renderToStaticMarkup(<RoutePlanningPanel view={{ kind: "PRESENTED_PLAN", view }} waiting={null} />);
    expect(markup).not.toContain("Waiting for: the recipient enables");
  });
});

describe("the session growth (validation + the preview summary)", () => {
  function fakeStorage(): AgentTaskSessionStorage {
    const data = new Map<string, string>();
    return { getItem: (k) => (data.get(k) ?? null), setItem: (k, v) => void data.set(k, v) };
  }

  it("validateRoutePlanningEngineView accepts the composed sections and recomputes the digest over the A.7 projection", () => {
    const view = fixedEngineView({
      conditionalOpportunities: conditionalCards(),
      platformWork: platformWorkCards(),
      hypotheses: hypothesisCards(),
      withModelProposalNote: true,
    });
    expect(() => validateRoutePlanningEngineView(view)).not.toThrow();
    // The model-proposal state rides OUTSIDE the digest: adding it never changes the digest.
    const withoutNote = fixedEngineView({
      conditionalOpportunities: conditionalCards(),
      platformWork: platformWorkCards(),
      hypotheses: hypothesisCards(),
    });
    expect(view.viewDigest).toBe(withoutNote.viewDigest);
  });

  it("a drifted section is rejected typed (a lying card never presents)", () => {
    const view = fixedEngineView({ conditionalOpportunities: conditionalCards() });
    const drifted = {
      ...view,
      conditionalOpportunities: [{ ...conditionalCards()[0]!, verification: "PROBABLY_FINE" }],
    } as unknown as RoutePlanningEngineView;
    expect(() => validateRoutePlanningEngineView(drifted)).toThrow(/verification.*PLANNER_VERIFIED.*UNVERIFIED/s);
    const driftedHypothesis = {
      ...view,
      hypotheses: [{ ...hypothesisCards()[0]!, neverExecutable: false }],
    } as unknown as RoutePlanningEngineView;
    expect(() => validateRoutePlanningEngineView(driftedHypothesis)).toThrow(/neverExecutable must be the literal true/);
  });

  it("the PREVIEW_PRESENTED summary carries the three opportunity counts (additive; the existing fields unchanged)", async () => {
    const port = createBrowserAgentTaskSessionPort({ storage: fakeStorage() });
    const session = createRoutePlanningSession({ session: port, clock: () => T1 });
    const { task } = await port.seedOrResume({
      intent: { kind: "PAYMENT_MISSION", direction: "PAY", goalStatement: "pay the supplier" },
      origin: "COMPOSER_TEXT",
      now: T0,
      originNote: "pay the supplier",
    });
    const view = fixedEngineView({
      conditionalOpportunities: conditionalCards(),
      platformWork: platformWorkCards(),
      hypotheses: hypothesisCards(),
    });
    const after = await session.presentChoices(task.id, view, T1);
    const preview = after.events.find((event) => event.kind === "PREVIEW_PRESENTED")!;
    expect(preview.summary).toContain("3 conditional opportunities");
    expect(preview.summary).toContain("1 platform work item");
    expect(preview.summary).toContain("1 hypothesis");
    expect(preview.summary).toContain("discovery only, nothing dispatches");
    // An absent section counts zero (the not-composed tier's honest record).
    const bare = fixedEngineView();
    const second = await session.presentChoices(task.id, bare, T1);
    const barePreview = [...second.events].reverse().find((event) => event.kind === "PREVIEW_PRESENTED")!;
    expect(barePreview.summary).toContain("0 conditional opportunities");
    expect(barePreview.summary).toContain("0 platform work items");
    expect(barePreview.summary).toContain("0 hypotheses");
  });
});
