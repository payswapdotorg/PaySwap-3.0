// @vitest-environment jsdom
/**
 * The corridor journey surfaces (P22-B, net-new): the four-leg plan
 * presentation (the CorridorPlanCard under a corridor-shaped route row),
 * the composite-act UI (the plan-scoped scope card, the leg-attributed
 * lanes, the leg-named pending-reconciliation card) and the
 * never-an-authorization law on every new surface.
 */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CorridorPlanCard } from "../../src/agent/CorridorPlanCard.js";
import { RoutePlanningPanel } from "../../src/agent/RoutePlanningPanel.js";
import { PaymentMissionsPreviewCard } from "../../src/agent/PaymentMissionsPreviewCard.js";
import { PaymentMissionsArmedCard } from "../../src/agent/PaymentMissionsArmedCard.js";
import { PaymentMissionsReconcileCard } from "../../src/agent/PaymentMissionsReconcileCard.js";
import {
  routePlanningViewDigestOf,
  type RoutePlanningEngineView,
} from "../../src/agent/routePlanningPins.js";
import {
  PAYMENT_MISSIONS_COMPOSITE_ACT_NOTE,
  PINNED_CORRIDOR_GHS_ONRAMP_FUNDING_METHOD,
  PINNED_CORRIDOR_KES_OFFRAMP_PAYOUT_METHOD,
  type CorridorPlanPresentationPin,
} from "../../src/pins/corridor-pins.js";
import type { PaymentMissionsPreview } from "../../src/agent/paymentMissionsPins.js";
import type { PaymentMissionsDispatchWiring } from "../../src/agent/paymentMissionsDispatchPins.js";

afterEach(() => {
  cleanup();
});

const ISSUER_G = "GDFQSZ5XEGJFPEYHSRTWQU3GQTL2FQZI5AZYW3EEHHIFC2T6SRDJJ7W3";
const RELAY_ASSET_REF = `stellar:testnet/asset:USDC:${ISSUER_G}`;
const T0 = "2026-10-29T12:00:00Z";

/** Render to a tag-free text projection (assertions span element boundaries). */
function textOf(node: React.ReactNode): string {
  const { container } = render(<>{node}</>);
  return container.textContent ?? "";
}

/** The canonical corridor plan presentation pin (the P22-B surface fold's view). */
function corridorPlanPin(): CorridorPlanPresentationPin {
  return {
    planId: "plan:corridor-ghs-usdc-kes",
    shapeId: "cross-provider-corridor",
    directionClass: "CONVERT",
    legCount: 4,
    legs: [
      {
        legIndex: 0,
        legKind: "FIAT_PSP_COLLECT",
        peopleLabel: "Collect the departure currency from the payer's provider account",
        lane: { kind: "PROVIDER", id: "flutterwave", label: "Flutterwave — Ghana mobile money" },
        custody: { from: "the sender's Flutterwave-collected GHS balance", to: "Flutterwave's pooled collection account" },
        prerequisites: ["the Flutterwave connection is active"],
      },
      {
        legIndex: 1,
        legKind: "PSP_STABLECOIN_ISSUANCE",
        peopleLabel: "Issue the stablecoin against the collected fiat",
        lane: { kind: "PROVIDER", id: "stripe", label: "Stripe — USDC issuance" },
        custody: { from: "Flutterwave's pooled collection account", to: "the issuance vehicle's USD settlement balance" },
        prerequisites: ["the stablecoin issuance vehicle is prepared"],
      },
      {
        legIndex: 2,
        legKind: "ONCHAIN_TRANSFER",
        peopleLabel: "Transfer the stablecoin onchain to the off-ramp's receiving address",
        lane: { kind: "ONCHAIN_CHAIN", id: "stellar:testnet", label: "Stellar testnet — USDC transfer" },
        custody: { from: "the issuance vehicle's USD settlement balance", to: "the off-ramp's Stellar receiving address" },
        assetRef: RELAY_ASSET_REF,
        prerequisites: ["the Stellar testnet keypair is sealed"],
      },
      {
        legIndex: 3,
        legKind: "OFF_RAMP_PAYOUT",
        peopleLabel: "Pay out the arrival currency to the beneficiary's bank account",
        lane: { kind: "PROVIDER", id: "paystack", label: "Paystack — Kenya bank transfer" },
        custody: { from: "the off-ramp's Stellar receiving address", to: "the beneficiary's KES bank account" },
        prerequisites: ["the Paystack connection is active"],
      },
    ],
    custodyChain: [
      "the sender's Flutterwave-collected GHS balance",
      "Flutterwave's pooled collection account",
      "the issuance vehicle's USD settlement balance",
      "the off-ramp's Stellar receiving address",
      "the beneficiary's KES bank account",
    ],
    relayAssetRef: RELAY_ASSET_REF,
    relayChainKey: "stellar:testnet",
    fundingMethod: PINNED_CORRIDOR_GHS_ONRAMP_FUNDING_METHOD,
    payoutMethod: PINNED_CORRIDOR_KES_OFFRAMP_PAYOUT_METHOD,
    outcomeLine:
      "A 4-leg cross-provider corridor plan (CONVERT): collect, issue, transfer onchain, pay out — custody passes through 5 named points and the onchain leg carries the issuer-scoped stablecoin. The leg count is disclosed, never hidden.",
  };
}

describe("the corridor plan card (the four-leg presentation)", () => {
  it("renders every leg with its people label, lane, custody hand-off and prerequisites", () => {
    const text = textOf(<CorridorPlanCard corridorPlan={corridorPlanPin()} />);
    for (const leg of corridorPlanPin().legs) {
      expect(text).toContain(leg.peopleLabel);
      expect(text).toContain(leg.lane.label);
      expect(text).toContain(`Leg ${leg.legIndex + 1} of 4 · ${leg.legKind}`);
      expect(text).toContain(`Custody: ${leg.custody.from} → ${leg.custody.to}`);
      for (const prerequisite of leg.prerequisites) {
        expect(text).toContain(prerequisite);
      }
    }
  });

  it("discloses the leg count, the custody chain, the issuer-scoped relay asset and the corridor methods", () => {
    const text = textOf(<CorridorPlanCard corridorPlan={corridorPlanPin()} />);
    expect(text).toContain("4 legs · CONVERT");
    expect(text).toContain("onchain relay stellar:testnet");
    expect(text).toContain(`funding ${PINNED_CORRIDOR_GHS_ONRAMP_FUNDING_METHOD}`);
    expect(text).toContain(`payout ${PINNED_CORRIDOR_KES_OFFRAMP_PAYOUT_METHOD}`);
    expect(text).toContain("Custody chain: " + corridorPlanPin().custodyChain.join(" → "));
    expect(text).toContain(RELAY_ASSET_REF);
    expect(text).toContain("two issuers of the same code are two assets");
  });

  it("states the never-an-authorization law (the presented plan is a presentation, not consent)", () => {
    const text = textOf(<CorridorPlanCard corridorPlan={corridorPlanPin()} />);
    expect(text).toContain("This is the presented plan, not an authorization");
    expect(text).toContain("each leg is its own dispatch with its own single-use share");
  });
});

describe("the corridor route row inside the route-planning panel", () => {
  it("renders the corridor card under a corridor-shaped ranked route, and NOT under other shapes", () => {
    const view = corridorEngineView();
    const { container } = render(
      <RoutePlanningPanel
        view={{ kind: "PRESENTED_PLAN", view }}
        waiting={null}
        onProceed={() => {}}
      />,
    );
    const items = container.querySelectorAll(".ps-agent-route-item");
    expect(items).toHaveLength(2);
    // The corridor route (rank 1) carries the corridor plan card…
    const corridorCard = container.querySelector('[data-testid="ps-agent-corridor-plan-plan:corridor-ghs-usdc-kes"]');
    expect(corridorCard).not.toBeNull();
    expect(corridorCard?.textContent).toContain("Leg 3 of 4 · ONCHAIN_TRANSFER");
    // …the ordinary shape (rank 2) does not (never fabricated).
    expect(items[1]?.querySelector(".ps-agent-corridor-plan")).toBeNull();
    // The PROCEED control stays the corridor route's only act (request only).
    expect(container.querySelector('[data-testid="ps-agent-route-proceed-plan:corridor-ghs-usdc-kes"]')).not.toBeNull();
  });
});

describe("the composite-act UI (the plan-scoped two-act approval)", () => {
  it("the scope card carries the plan facts + the composite note on a plan-scoped request", () => {
    const text = textOf(
      <PaymentMissionsPreviewCard
        missionId="task:PAYMENT_MISSION:corridor1"
        preview={corridorMissionPreview()}
        presenting={false}
        approval={{ phase: "SCOPE_CARD", request: corridorApprovalRequest() }}
      />,
    );
    expect(text).toContain("4-leg plan · digest pmt-plan-digest:1a2b3c4d");
    expect(text).toContain("this approval covers the whole presented plan, not one hop");
    expect(text).toContain(PAYMENT_MISSIONS_COMPOSITE_ACT_NOTE);
  });

  it("a plain (non-composite) request keeps the original scope-binding note — the N=1 law unchanged", () => {
    const text = textOf(
      <PaymentMissionsPreviewCard
        missionId="task:PAYMENT_MISSION:plain1"
        preview={corridorMissionPreview()}
        presenting={false}
        approval={{ phase: "SCOPE_CARD", request: plainApprovalRequest() }}
      />,
    );
    expect(text).not.toContain("4-leg plan");
    expect(text).not.toContain(PAYMENT_MISSIONS_COMPOSITE_ACT_NOTE);
    expect(text).toContain("bound to the exact compiled intent the preview was presented against");
  });

  it("the armed card names the corridor leg on each lane + the composite note on the armed scope", () => {
    const text = textOf(
      <PaymentMissionsArmedCard
        missionId="task:PAYMENT_MISSION:corridor1"
        approvalGranted={true}
        dispatch={corridorDispatchWiring()}
      />,
    );
    expect(text).toContain("corridor leg 1 of 4 (FIAT_PSP_COLLECT)");
    expect(text).toContain("corridor leg 3 of 4 (ONCHAIN_TRANSFER)");
    expect(text).toContain("corridor leg 4 of 4 (OFF_RAMP_PAYOUT)");
    expect(text).toContain("4-leg plan · digest pmt-plan-digest:1a2b3c4d");
    expect(text).toContain(PAYMENT_MISSIONS_COMPOSITE_ACT_NOTE);
  });
});

describe("the partial-failure presentation (a leg UNKNOWN shows the pending-reconciliation card)", () => {
  it("the pending card NAMES the leg and states the never-dispatched law", () => {
    const text = textOf(
      <PaymentMissionsReconcileCard
        missionId="task:PAYMENT_MISSION:corridor1"
        unresolvedAttempts={true}
        reconcile={{
          state: {
            phase: "PENDING_CARD",
            pending: {
              pending: [
                {
                  attemptId: "pmt-attempt-3",
                  startedAt: T0,
                  operation: "payment.attempt",
                  executionMode: "SANDBOX",
                  summary: "corridor leg 3 (ONCHAIN_TRANSFER) returned UNKNOWN",
                  legIndex: 2,
                  legKind: "ONCHAIN_TRANSFER",
                },
              ],
              acceptedSources: ["EXTERNAL_PROVIDER_STATEMENT", "EXTERNAL_PROVIDER_RETRIEVAL"],
              note: "the host note",
            },
          },
          onEngage: () => {},
          onChooseAttempt: () => {},
          onChooseDirection: () => {},
          onChooseSource: () => {},
          onEditRefs: () => {},
          onSubmit: () => {},
          onCancel: () => {},
        }}
      />,
    );
    expect(text).toContain("corridor leg 3 of 4 (ONCHAIN_TRANSFER)");
    expect(text).toContain("this leg returned UNKNOWN");
    expect(text).toContain("the later legs never dispatched");
  });
});

/* ------------------------------ fixtures ------------------------------ */

/** A two-route engine view whose rank-1 route is the corridor. */
function corridorEngineView(): RoutePlanningEngineView {
  const value = {
    kind: "PRESENTED_PLAN" as const,
    routine: {
      routineId: "payment-route-planning" as const,
      routineVersion: "1.0.0" as const,
      skillContentDigest: "fnv1a64:1abba70f0107d1b2" as const,
    },
    intentRef: "intent:planning:corridor",
    presentedAt: T0,
    availableNow: {
      ranked: [
        {
          planId: "plan:corridor-ghs-usdc-kes", shapeId: "cross-provider-corridor", rank: 1,
          netNumeraireMinorUnits: "168900", numeraire: "KES", hopCount: 4, railCrossings: 2,
          riskClass: "MEDIUM", estimatedSettlementMs: 1_800_000, unknownDimensions: [],
          paretoNonDominated: true, dominatedBy: [],
          corridorPlan: corridorPlanPin(),
        },
        {
          planId: "plan:provider-native-offramp", shapeId: "provider-native-offramp", rank: 2,
          netNumeraireMinorUnits: "981111", numeraire: "KES", hopCount: 1, railCrossings: 1,
          unknownDimensions: ["RISK_CLASS"], paretoNonDominated: false,
          dominatedBy: ["plan:corridor-ghs-usdc-kes"],
        },
      ],
      notScored: [],
      senderEligibleRouteIds: ["inst:sender-flw"],
      recipientEligibleRouteIds: ["inst:recipient-paystack"],
    },
    exclusions: [],
    truncation: {
      receipts: [],
      coverage: "COMPLETE" as const,
    },
    scenarios: {
      advisoryOnly: true as const,
      coverage: "NONE_OBSERVED" as const,
      outcomes: [],
    },
    waiting: {
      proposal: {
        waitId: "wait:route:corridor",
        families: ["liquidity" as const],
        categories: ["NEW_OPPORTUNITY" as const],
        maxWaitMs: 3_600_000,
        maxSettlementMs: 600_000,
        fallback: { kind: "REPLAN_FROM_FRESH_EVIDENCE" as const, routeRef: "plan:corridor-ghs-usdc-kes" },
        tradeOffs: [],
        declaredAt: 1_771_612_800_000,
      },
    },
  };
  return { ...value, viewDigest: routePlanningViewDigestOf(value) };
}

function corridorMissionPreview(): PaymentMissionsPreview {
  return {
    previewId: "preview:corridor1:1",
    missionId: "task:PAYMENT_MISSION:corridor1",
    presentedAt: T0,
    dispatchable: true,
    gates: {
      decision: "PROCEED",
      decisions: [{ gate: "the corridor gate", decision: "PROCEED", reason: "the observed corridor compiles" }],
      reasons: [],
    },
  };
}

function corridorApprovalRequest() {
  return {
    requestId: "pmt-auth-req-corridor",
    previewId: "preview:corridor1:1",
    missionId: "task:PAYMENT_MISSION:corridor1",
    createdAt: T0,
    expiresAt: "2026-10-29T12:10:00Z",
    scope: {
      missionId: "task:PAYMENT_MISSION:corridor1",
      direction: "CONVERT" as const,
      amount: { minorUnits: "2000000", currency: "GHS" },
      destinationSummary: "the beneficiary's KES bank account",
      intentDigest: "pmt-intent-digest:corridor",
      planDigest: "pmt-plan-digest:1a2b3c4d",
      planLegCount: 4,
    },
    scopeSummary: "GHS 20.00 → the beneficiary's KES bank account over the 4-leg corridor",
  };
}

function plainApprovalRequest() {
  return {
    requestId: "pmt-auth-req-plain",
    previewId: "preview:corridor1:1",
    missionId: "task:PAYMENT_MISSION:plain1",
    createdAt: T0,
    expiresAt: "2026-10-29T12:10:00Z",
    scope: {
      missionId: "task:PAYMENT_MISSION:plain1",
      direction: "PAY" as const,
      amount: { minorUnits: "2000000", currency: "GHS" },
      destinationSummary: "the supplier",
      intentDigest: "pmt-intent-digest:plain",
    },
    scopeSummary: "GHS 20.00 to the supplier",
  };
}

function corridorDispatchWiring(): PaymentMissionsDispatchWiring {
  return {
    state: {
      phase: "ARMED_CARD" as const,
      effect: {
        armed: true,
        expiresAt: "2026-10-29T12:10:00Z",
        scope: {
          missionId: "task:PAYMENT_MISSION:corridor1",
          direction: "CONVERT" as const,
          amount: { minorUnits: "2000000", currency: "GHS" },
          destinationSummary: "the beneficiary's KES bank account",
          intentDigest: "pmt-intent-digest:corridor",
          planDigest: "pmt-plan-digest:1a2b3c4d",
          planLegCount: 4,
        },
        lanes: [
          {
            connectionRef: "conn:flw:1",
            label: "Flutterwave — Ghana mobile money",
            providerId: "flutterwave",
            leg: { legIndex: 0, legKind: "FIAT_PSP_COLLECT", laneKind: "PROVIDER" },
          },
          {
            connectionRef: "conn:stellar:1",
            label: "Stellar testnet — USDC transfer",
            providerId: "stellar:testnet",
            leg: { legIndex: 2, legKind: "ONCHAIN_TRANSFER", laneKind: "ONCHAIN_CHAIN" },
          },
          {
            connectionRef: "conn:paystack:1",
            label: "Paystack — Kenya bank transfer",
            providerId: "paystack",
            leg: { legIndex: 3, legKind: "OFF_RAMP_PAYOUT", laneKind: "PROVIDER" },
          },
        ],
      },
    },
    onEngage: () => {},
    onChooseLane: () => {},
    onSend: () => {},
  };
}
