// @vitest-environment jsdom
/**
 * @payswap/app — the ROUTE-PLANNING PANEL render laws (P16-D part 3,
 * gap-matrix D5; ADR-0009 D8; ROUTINE-CONTRACT stage 8) + the P17-B
 * NO_VALIDATED_INTENT laws (ADR-0010 D5).
 *
 * The proceed-or-wait presentation surface, machine-checked against the
 * REAL component with a FIXED validated engine view (deterministic —
 * no engine, no network, no clock):
 *
 * - The five DISTINCT sections render (available-now ranked routes with
 *   rank/net/metrics, exclusions, truncation, advisory scenarios, waiting).
 * - The four honest standing notes render VERBATIM.
 * - NO button whose label/testid mentions dispatch, execute or authorize
 *   exists anywhere in the rendered DOM (the zero-authority UI law).
 * - The unbound engine renders the honest unbound note (never fabricated
 *   data).
 * - Exclusions render with their typed reasons (code + message).
 * - The waiting section renders the never-dispatches note, and the
 *   waiting state renders the recorded criteria + matches.
 * - The NO_VALIDATED_INTENT state renders the honest no-intent note — an
 *   EMPTY state, never an error mask (no role=alert, no sections, no
 *   fabricated plans) — and a mounted engine throwing the typed
 *   RoutePlanningNoIntentError lands in that state, NOT ENGINE_ERROR.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

import { RoutePlanningPanel } from "../../src/agent/RoutePlanningPanel.js";
import { RoutePlanningMount } from "../../src/agent/RoutePlanningMount.js";
import { createAgentComposerController } from "../../src/agent/agentComposerController.js";
import type { AgentTaskSessionStorage } from "../../src/agent/taskSessionAdapter.js";
import {
  ROUTE_PLANNING_AVAILABLE_NOW_NOTE,
  ROUTE_PLANNING_ENGINE_UNBOUND_NOTE,
  ROUTE_PLANNING_EVIDENCE_FRESHNESS_NOTE,
  ROUTE_PLANNING_NO_INTENT_NOTE,
  ROUTE_PLANNING_TRUNCATION_NOTE,
  ROUTE_PLANNING_WAIT_NOTE,
  ROUTE_PLANNING_SECTION_IDS,
  RoutePlanningNoIntentError,
  routePlanningViewDigestOf,
  type RoutePlanningEnginePort,
  type RoutePlanningEngineView,
  type RoutePlanningWaitingState,
} from "../../src/agent/routePlanningPins.js";

const T0 = "2026-10-22T12:00:00Z";

/** A fixed, fully-valid engine view (the same shape the session battery pins). */
function fixedEngineView(): RoutePlanningEngineView {
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
          planId: "plan:mixed-dex-offramp", shapeId: "mixed-dex-offramp", rank: 1,
          netNumeraireMinorUnits: "987654", numeraire: "EUR", hopCount: 3, railCrossings: 2,
          riskClass: "LOW", estimatedSettlementMs: 90000, unknownDimensions: [],
          paretoNonDominated: true, dominatedBy: [],
        },
        {
          planId: "plan:provider-native-offramp", shapeId: "provider-native-offramp", rank: 2,
          netNumeraireMinorUnits: "981111", numeraire: "EUR", hopCount: 1, railCrossings: 1,
          unknownDimensions: ["RISK_CLASS", "SETTLEMENT_MS"], paretoNonDominated: false,
          dominatedBy: ["plan:mixed-dex-offramp"],
        },
      ],
      notScored: [
        { planId: "plan:onchain-direct", shapeId: "onchain-direct", reason: "no exact-money score on current quote evidence", unknownDimensions: ["SCORE"] },
      ],
      senderEligibleRouteIds: ["inst:sender-psp-native"],
      recipientEligibleRouteIds: ["inst:recipient-psp-payouts"],
    },
    exclusions: [
      { subject: "shape:onchain-direct", code: "ROUTE_UNSUPPORTED", message: "no venue observation for the direct on-chain shape" },
    ],
    truncation: {
      receipts: [{ dimension: "maxCandidates", limit: 10, actualCount: 12, disclosedAs: "TRUNCATED" as const }],
      coverage: "TRUNCATED" as const,
    },
    scenarios: {
      advisoryOnly: true as const,
      coverage: "COMPLETE" as const,
      outcomes: [
        { interventionId: "add-rail-c", kind: "RAIL_ADDED", counterfactualId: "cf:add-rail-c", counterfactualDigest: "fnv1a64:0123456789abcdef" },
      ],
    },
    waiting: {
      proposal: {
        waitId: "wait:route:001",
        families: ["liquidity" as const],
        categories: ["NEW_OPPORTUNITY" as const, "FEES_KNOWN" as const],
        maxWaitMs: 3_600_000,
        maxSettlementMs: 600_000,
        fallback: { kind: "REPLAN_FROM_FRESH_EVIDENCE" as const, routeRef: "plan:mixed-dex-offramp" },
        tradeOffs: [],
        declaredAt: 1_771_612_800_000,
      },
    },
  };
  return { ...value, viewDigest: routePlanningViewDigestOf(value) };
}

const noop = (): void => {};

/** The in-memory storage seam (deterministic; localStorage-shaped). */
function fakeStorage(): AgentTaskSessionStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => (data.has(key) ? data.get(key)! : null),
    setItem: (key, value) => void data.set(key, value),
  };
}

afterEach(() => {
  cleanup();
});

describe("the panel render laws (a fixed engine view)", () => {
  it("renders the five DISTINCT sections with the ranked routes' rank, net and metrics", () => {
    const { container } = render(
      <RoutePlanningPanel view={{ kind: "PRESENTED_PLAN", view: fixedEngineView() }} waiting={null} />,
    );
    for (const sectionId of ROUTE_PLANNING_SECTION_IDS) {
      expect(container.querySelector(`#ps-agent-route-section-${sectionId}`)).not.toBeNull();
    }
    const first = container.querySelectorAll(".ps-agent-route-item");
    expect(first).toHaveLength(2);
    expect(first[0]!.textContent).toContain("#1");
    expect(first[0]!.textContent).toContain("plan:mixed-dex-offramp");
    expect(first[0]!.textContent).toContain("net 987654 EUR");
    expect(first[0]!.textContent).toContain("3 hops");
    expect(first[0]!.textContent).toContain("2 rail crossings");
    expect(first[0]!.textContent).toContain("risk LOW");
    expect(first[0]!.textContent).toContain("settlement ~90000ms");
    expect(first[1]!.textContent).toContain("risk UNKNOWN");
    expect(first[1]!.textContent).toContain("Unknown dimensions (retained, never guessed): RISK_CLASS, SETTLEMENT_MS");
  });

  it("renders the four honest standing notes VERBATIM", () => {
    const markup = renderToStaticMarkup(
      <RoutePlanningPanel view={{ kind: "PRESENTED_PLAN", view: fixedEngineView() }} waiting={null} />,
    );
    expect(markup).toContain(ROUTE_PLANNING_AVAILABLE_NOW_NOTE);
    expect(markup).toContain(ROUTE_PLANNING_TRUNCATION_NOTE);
    expect(markup).toContain(ROUTE_PLANNING_EVIDENCE_FRESHNESS_NOTE);
    expect(markup).toContain(ROUTE_PLANNING_WAIT_NOTE);
  });

  it("renders NO button whose label or testid mentions dispatch, execute or authorize (the zero-authority UI law)", () => {
    const { container } = render(
      <RoutePlanningPanel
        view={{ kind: "PRESENTED_PLAN", view: fixedEngineView() }}
        waiting={null}
        onProceed={noop}
        onChooseWait={noop}
        onCancelWait={noop}
      />,
    );
    const buttons = [...container.querySelectorAll("button")];
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      const label = `${button.textContent ?? ""} ${button.getAttribute("data-testid") ?? ""} ${button.getAttribute("aria-label") ?? ""}`.toLowerCase();
      expect(label).not.toContain("dispatch");
      expect(label).not.toContain("execute");
      expect(label).not.toContain("authorize");
    }
    // The only choice kinds that exist are PROCEED and WAIT (the pinned pair).
    const kinds = new Set(buttons.map((button) => button.getAttribute("data-ps-route-choice")));
    for (const kind of kinds) {
      expect(["PROCEED", "WAIT", "CANCEL_WAIT"]).toContain(kind);
    }
    expect(kinds.has("PROCEED")).toBe(true);
    expect(kinds.has("WAIT")).toBe(true);
  });

  it("renders the honest UNBOUND note for the unbound engine — and no fabricated route data", () => {
    const markup = renderToStaticMarkup(<RoutePlanningPanel view={{ kind: "UNBOUND_ENGINE" }} waiting={null} />);
    expect(markup).toContain(ROUTE_PLANNING_ENGINE_UNBOUND_NOTE);
    expect(markup).not.toContain("ps-agent-route-section-available-now");
    expect(markup).not.toContain("plan:");
  });

  it("renders exclusions with their typed reasons (code + message, never silent drops)", () => {
    const { container } = render(
      <RoutePlanningPanel view={{ kind: "PRESENTED_PLAN", view: fixedEngineView() }} waiting={null} />,
    );
    const exclusions = container.querySelector("#ps-agent-route-section-exclusions")!;
    expect(exclusions.textContent).toContain("ROUTE_UNSUPPORTED");
    expect(exclusions.textContent).toContain("shape:onchain-direct");
    expect(exclusions.textContent).toContain("no venue observation for the direct on-chain shape");
    // The truncation receipt renders the TRUE pre-cut count (12, capped at 10).
    const truncation = container.querySelector("#ps-agent-route-section-truncation")!;
    expect(truncation.textContent).toContain("capped at 10 of 12 candidates (TRUNCATED)");
    expect(truncation.textContent).toContain("Coverage: TRUNCATED");
  });

  it("renders the waiting section with the never-dispatches note, the recorded criteria and the matches", () => {
    const view = fixedEngineView();
    const waiting: RoutePlanningWaitingState = {
      status: "WAITING_FOR_OPPORTUNITIES",
      criteria: view.waiting.proposal,
      criteriaRecordTruncated: false,
      matchedOpportunityIds: ["op:liq:001"],
    };
    const { container } = render(
      <RoutePlanningPanel view={{ kind: "PRESENTED_PLAN", view }} waiting={waiting} onCancelWait={noop} />,
    );
    const section = container.querySelector("#ps-agent-route-section-waiting")!;
    expect(section.textContent).toContain(ROUTE_PLANNING_WAIT_NOTE);
    expect(section.textContent).toContain("liquidity");
    expect(section.textContent).toContain("NEW_OPPORTUNITY");
    expect(section.textContent).toContain("REPLAN_FROM_FRESH_EVIDENCE");
    expect(section.textContent).toContain("op:liq:001");
    expect(section.textContent).toContain("the task stays waiting");
  });
});

describe("the NO_VALIDATED_INTENT laws (P17-B — the honest empty state, never an error mask)", () => {
  it("renders the honest no-intent note — no sections, no fabricated plans, no error alert", () => {
    const markup = renderToStaticMarkup(
      <RoutePlanningPanel view={{ kind: "NO_VALIDATED_INTENT" }} waiting={null} />,
    );
    expect(markup).toContain(ROUTE_PLANNING_NO_INTENT_NOTE);
    expect(markup).not.toContain("ps-agent-route-section-available-now");
    expect(markup).not.toContain("plan:");
    // An EMPTY state, not an engine failure: the error alert never renders.
    expect(markup).not.toContain("role=\"alert\"");
    expect(markup).not.toContain("The route-planning engine failed");
  });

  it("a mounted engine throwing the typed RoutePlanningNoIntentError lands in the honest empty state — NOT ENGINE_ERROR", async () => {
    const controller = createAgentComposerController({ storage: fakeStorage(), clock: () => T0 });
    await act(async () => {
      await controller.seedFromSurface({
        intent: { kind: "PAYMENT_MISSION", direction: "PAY", goalStatement: "pay the supplier" },
        originNote: "pay the supplier",
        area: "payments",
      });
    });
    // The engine's mission linkage: no mission carries a compiled intent →
    // the typed outcome (prose cannot construct an intent — the D1 law).
    const noIntentEngine: RoutePlanningEnginePort = {
      presentableView(request) {
        throw new RoutePlanningNoIntentError(
          `no mission carrying a compiled intent exists for task '${request.taskRef}'`,
        );
      },
    };
    const { container } = render(
      <RoutePlanningMount controller={controller} engine={noIntentEngine} />,
    );
    const section = container.querySelector(".ps-agent-route")!;
    expect(section.textContent).toContain(ROUTE_PLANNING_NO_INTENT_NOTE);
    expect(container.querySelector("[role='alert']")).toBeNull();
    expect(section.textContent).not.toContain("The route-planning engine failed");
    expect(container.querySelector("#ps-agent-route-section-available-now")).toBeNull();
  });
});
