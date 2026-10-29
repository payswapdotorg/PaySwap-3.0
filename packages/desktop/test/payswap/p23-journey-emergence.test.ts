/**
 * PaySwap Desktop (P23-D, ADR-0015 D10 — the bridge battery's emergence
 * tier) — THE JOURNEY-EMERGENCE BRIDGE BATTERY: the operator's no-route
 * journey driven through the REAL channel + the REAL engines (the
 * p21-journey-bridge world, reused) WITH the P23 opportunity-emergence
 * composition asserted END-TO-END:
 *
 *  - the honest NO-ROUTE state explains WHY (the typed exclusions) while
 *    the emergence composes the displayed REPAIR CARDS — ≥3 meaningfully
 *    different kinds (the party changes, the platform work items, the
 *    multi-hop hypotheses — ADR-0015 D8);
 *  - the VERIFIED/UNVERIFIED distinction (A.6): every card carries the
 *    honest pairing value + reason; the full no-route world verifies
 *    nothing TODAY (the party changes rest on the verbatim facts alone;
 *    the hypotheses name the remaining REAL exclusions) — the
 *    PLANNER_VERIFIED branch is pinned at the component tier (the app
 *    card battery) and the hypothesis-stage battery (the scripted re-run);
 *  - the WAIT names the CONCRETE preconditions (the conditional titles +
 *    the waiting criteria families/categories);
 *  - the RE-CHECK runs over FRESH OBSERVATIONS through the PRODUCT
 *    chains-derived observations source (the D9d boot law, LIVE: each
 *    ACTIVE connection chain → ONE honest UNKNOWN-heavy record that never
 *    matches the liquidity/FEES_KNOWN criteria) and a scripted fresh
 *    liquidity opportunity DOES match — through the REAL evaluator, with
 *    the never-dispatch literals;
 *  - the PERSISTENCE: the emergence-bearing view presents through the
 *    REAL session (validateRoutePlanningEngineView's optional-section
 *    law), the PREVIEW_PRESENTED record carries the section counts, the
 *    no-route mission preview stays honestly BLOCKED at the mission tier
 *    (NO_ROUTE_FOR_CORRIDOR — the D7 authorization-gate refusal is
 *    asserted here through the REAL channel: GATES_BLOCKED), and the
 *    DETERMINISTIC REPLAY covers the card sections byte-identically.
 *
 * The scenarios-digest list NEVER satisfies any assertion here (the
 * P21-0 D7 conflation correction — every assertion is card-shaped and
 * content-level).
 */

import { describe, expect, it } from "vitest";

import {
  createAgentComposerController,
  modelBudgetOf,
  opportunityMatchOfRecheck,
  resetSharedAgentComposerController,
  resetSharedMissionIntakePlane,
  resetSharedModelCatalog,
  resetSharedRoutePlanningEngine,
  resetSharedRoutePlanningSession,
  resetSharedWaitRecheckPlane,
  routePlanningViewDigestOf,
  type RoutePlanningEngineView,
} from "@payswap/app";
import {
  evaluateHardGates,
  movementViewOfIntent,
  PINNED_CORRIDOR_FUNDING_NOT_SERVED_CODE,
  PINNED_CORRIDOR_NOT_EXECUTABLE_CODE,
} from "@payswap/route-planning";

import { composeMissionIntakeBinding } from "../../src/renderer/src/missionIntakeComposition.js";
import { composeModelCatalogBinding } from "../../src/renderer/src/modelCatalogComposition.js";
import { composeRoutePlanningBinding } from "../../src/renderer/src/routePlanningComposition.js";
import {
  chainDerivedWaitRecheckObservations,
  composeWaitRecheckBinding,
} from "../../src/renderer/src/waitRecheckComposition.js";
import type { DesktopConsoleChannelServices } from "../../src/renderer/src/consoleWorkspaceMount.js";
import { deriveOpportunityEmergence } from "../../src/renderer/src/opportunityEmergenceAdapter.js";
import {
  compositionDefaultBestExecutionPolicy,
  emptyEvidenceBundle,
  realCompilationPort,
} from "../../src/renderer/src/routePlanningEngineAdapter.js";
import { mapMissionIntentToPin } from "../../src/renderer/src/routePlanningMissionLinkage.js";
import {
  JOURNEY_MODEL,
  JOURNEY_MODEL_SELECTION,
  composeJourneyService,
  scriptJourneyFetch,
  seedJourneyConnections,
  T2,
  T3,
  T4,
} from "./p21-journey-bridge-fixtures.js";
import { journeyCorridorQuery, planJourneyRoute } from "./p21-journey-bridge-planning.js";
import { fakeWorld } from "./connections-probe-plane-fixtures.js";
import {
  INTENT_KEYS,
  JOURNEY_AT,
  REPLIES,
  journeyConsent,
  journeyOpportunity,
  journeyStorage,
} from "./p21-journey-bridge-conversation.js";

/** The journey's observable emergence outcome (the replay comparison surface). */
interface JourneyEmergenceOutcome {
  readonly taskStore: string;
  readonly missionStore: string;
  readonly viewDigest: string;
  readonly emergenceSections: string;
}

/** Drive the no-route journey with the emergence composition asserted as it goes. */
async function driveEmergenceJourney(): Promise<JourneyEmergenceOutcome> {
  const world = fakeWorld();
  scriptJourneyFetch(world);
  const connections = await seedJourneyConnections(world);
  const { service } = await composeJourneyService(world, connections.authority, connections.evidenceStore);
  const services = { payswapDesktopService: service } as unknown as DesktopConsoleChannelServices;

  // The renderer business root (the p21 bridge's own law: every plane binds BEFORE the controller).
  resetSharedMissionIntakePlane();
  resetSharedModelCatalog();
  resetSharedAgentComposerController();
  resetSharedRoutePlanningEngine();
  resetSharedRoutePlanningSession();
  resetSharedWaitRecheckPlane();
  const intakeBinding = composeMissionIntakeBinding({ services });
  const modelBinding = composeModelCatalogBinding({ source: async () => [JOURNEY_MODEL] });
  const { storage, dump } = journeyStorage();
  const controller = createAgentComposerController({ storage, clock: () => T2, modelCatalog: modelBinding.catalog });
  const routeComposition = composeRoutePlanningBinding({ services, controller });
  // THE P23-D BOOT LAW, LIVE (ADR-0015 D9d — exactly the main.tsx wiring):
  // the wait-recheck binding boots with the PRODUCT chains-derived
  // observations source; the scripted fresh liquidity discovery rides
  // BESIDE it (a real discovery plane would supply exactly such records).
  const productObservations = chainDerivedWaitRecheckObservations(services);
  let freshDiscovery = false;
  const waitBinding = composeWaitRecheckBinding({
    observations: async () => [
      ...await productObservations(),
      ...(freshDiscovery ? [journeyOpportunity()] : []),
    ],
    consent: async () => journeyConsent(),
    clock: () => JOURNEY_AT + 1_000,
  });
  try {
    // ---- the task + the model selection (the D4 stamp the emergence's D6 law reads) ----
    await controller.loadModelCatalog();
    controller.setDraft("Pay merchant X");
    await controller.send();
    const afterSend = controller.getState();
    const taskId = afterSend.tasks[afterSend.tasks.length - 1]!.id;
    const missionId = afterSend.missionIntake.missionId!;
    await controller.selectModel(JOURNEY_MODEL_SELECTION);
    const session = controller.sessionPort();
    const task = await session.taskDetail(taskId);
    expect(task?.modelSelection).toEqual(JOURNEY_MODEL_SELECTION);

    // ---- the ask loop → the compiled intent (the REAL channel's nine-field intake) ----
    for (let round = 0; round < 12; round += 1) {
      const intake = controller.getState().missionIntake;
      if (intake.phase === "COMPLETE") break;
      controller.setDraft(REPLIES[intake.pendingAsk!.fieldId]!);
      await controller.send();
    }
    expect(controller.getState().missionIntake.phase).toBe("COMPLETE");

    // ---- the honest NO-ROUTE at the mission tier (the cards change nothing there;
    // the preview's own compose path compiles the intent — the p21 bridge's law) ----
    const initialPreview = await service.paymentMissionPresentPreview(missionId);
    expect(initialPreview?.dispatchable).toBe(false);
    expect(initialPreview?.gates.decision).toBe("BLOCK");
    expect(initialPreview?.gates.reasons.join(" ")).toContain("NO_ROUTE_FOR_CORRIDOR");
    // (D7c through the REAL channel) a blocked preview can never arm authorization.
    await expect(service.paymentMissionRequestApproval(missionId)).rejects.toThrow(
      /blocked preview can never arm authorization/,
    );
    const detail = (await service.paymentMissionDetail(missionId))!;
    expect(Object.keys(detail.intent ?? {}).sort()).toEqual(INTENT_KEYS);

    // ---- stages 0-7 over the REAL engines: the honest no-route plan ----
    const intent = mapMissionIntentToPin(detail.intent!);
    const at = intent.declaredAt;
    const corridor = { sourceCountry: "NG", destinationCountry: "US", destinationCurrency: "USD" };
    const amount = { currency: "NGN", minorUnits: "50000000" };
    const plan = planJourneyRoute({ taskRef: taskId, intentDto: detail.intent!, corridor, amount, modelSelection: task?.modelSelection });
    expect(plan.rankedCount).toBe(0);
    expect(plan.view.availableNow.ranked).toEqual([]);
    expect(plan.view.availableNow.senderEligibleRouteIds).toEqual([]);
    expect(plan.view.availableNow.recipientEligibleRouteIds).toEqual([]);
    expect(plan.view.exclusions.some((exclusion) => exclusion.code === PINNED_CORRIDOR_NOT_EXECUTABLE_CODE)).toBe(true);
    expect(plan.view.exclusions.some((exclusion) => exclusion.code === PINNED_CORRIDOR_FUNDING_NOT_SERVED_CODE)).toBe(true);

    // ---- THE EMERGENCE COMPOSITION (exactly the engine adapter's wiring) ----
    const movement = movementViewOfIntent(intent);
    const budgets = modelBudgetOf(JOURNEY_MODEL_SELECTION.reasoningLevel);
    const emergence = deriveOpportunityEmergence({
      senderSnapshot: plan.senderSnapshot,
      recipientSnapshot: plan.recipientSnapshot,
      hardGates: evaluateHardGates({ intent: movement, at, candidates: [] }),
      movement,
      query: journeyCorridorQuery({ corridor, amount, asOf: new Date(at).toISOString() }),
      at,
      evidence: emptyEvidenceBundle(),
      searchBudget: budgets.searchBudget,
      scenarioBudget: budgets.scenarioBudget,
      compilationPort: realCompilationPort(),
      policy: compositionDefaultBestExecutionPolicy() as never,
      intentPrincipalRef: movement.principalRef,
      intentExpiresAt: movement.expiresAt,
      modelSelection: JOURNEY_MODEL_SELECTION,
    });

    // ---- THE CARDS: ≥3 meaningfully different repair kinds, content-level ----
    // (i) the PARTY-CHANGE cards — the P21 three, people language, byte-anchored.
    expect(emergence.conditionalOpportunities.map((card) => card.requiredPartyChanges[0]?.change)).toEqual([
      "ENABLES_FLUTTERWAVE_RECEIVING_METHOD",
      "ADDS_STRIPE_COMPATIBLE_INSTRUMENT",
      "INTERMEDIARY_INTRODUCED",
    ]);
    const preconditionTitles = emergence.conditionalOpportunities.map((card) => card.title);
    expect(preconditionTitles).toEqual([
      "the recipient enables an eligible Flutterwave receiving method",
      "the sender adds a genuinely supported Stripe-compatible payment instrument",
      "a verified intermediary is introduced",
    ]);
    for (const card of emergence.conditionalOpportunities) {
      expect(card.requiredPartyChanges.length).toBe(1);
      expect(["SENDER", "RECIPIENT", "THIRD_PARTY"]).toContain(card.requiredPartyChanges[0]!.party);
      expect(card.assumptions.length).toBeGreaterThan(0);
      expect(card.expiresAt).toBeGreaterThan(at);
    }
    // The platform-prerequisite DISTINCT (the D8 labeling law).
    expect(emergence.conditionalOpportunities[0]!.platformPrerequisites.map((prerequisite) => prerequisite.gapId))
      .toEqual(["platform:flutterwave-send-operation"]);
    // (ii) the PLATFORM-WORK cards — what PaySwap itself would need to build, evidenced.
    expect(emergence.platformWork.map((card) => card.gapId).sort()).toEqual([
      "platform:connector-operation",
      "platform:cross-provider-route-shape",
      "platform:flutterwave-send-operation",
    ]);
    for (const work of emergence.platformWork) {
      expect(work.evidenceBasis.length).toBeGreaterThan(0);
      expect(work.evidenceBasis.every((fact) => fact.code.length > 0 && fact.message.length > 0)).toBe(true);
      expect(work.requiredByOperatorIds.length).toBeGreaterThan(0);
    }
    // (iii) the MULTI-HOP hypotheses — never executable, the assumed segment labeled.
    expect(emergence.hypotheses.length).toBe(2);
    for (const card of emergence.hypotheses) {
      expect(card.neverExecutable).toBe(true);
      expect(card.advisoryOnly).toBe(true);
      expect(card.assumedSegmentIds.length).toBe(1);
      expect(card.verifiedSegmentIds).toEqual([]);
      expect(card.blockers.length).toBeGreaterThan(0);
    }

    // ---- THE VERIFIED/UNVERIFIED DISTINCTION (A.6, the honest pairing) ----
    // The full no-route world verifies nothing TODAY: the party changes
    // without a re-run carry the no-rerun reason; the paired intermediary
    // conditional + both hypotheses name the remaining REAL exclusions.
    expect(emergence.conditionalOpportunities[0]!.verification).toBe("UNVERIFIED");
    expect(emergence.conditionalOpportunities[0]!.verificationReason).toContain("no hypothetical re-run exists");
    expect(emergence.conditionalOpportunities[1]!.verification).toBe("UNVERIFIED");
    expect(emergence.conditionalOpportunities[1]!.verificationReason).toContain("no hypothetical re-run exists");
    expect(emergence.conditionalOpportunities[2]!.verification).toBe("UNVERIFIED");
    expect(emergence.conditionalOpportunities[2]!.verificationReason).toContain("the re-run verified no rank-eligible segment");
    for (const card of emergence.hypotheses) {
      expect(card.verification).toBe("UNVERIFIED");
      expect(card.verificationReason).toContain("the re-run verified no rank-eligible segment");
    }

    // ---- stage 6's REAL facts + the derived interventions (the existing Lab kinds) ----
    expect(emergence.labFacts.rails.map((rail) => rail.railId)).toEqual([
      "inst:sender-flw-readonly",
      "inst:recipient-stripe-test",
    ]);
    expect(emergence.scenarioInterventions.length).toBe(2);
    expect(emergence.scenarioInterventions.every((intervention) => intervention.kind === "THIRD_PARTY_NODE_JOINS")).toBe(true);

    // ---- the model-proposal state (D6): a session model is selected, the
    // transport is honestly unbound (the named live-model carry-forward). ----
    expect(emergence.modelProposals).toEqual({ kind: "UNBOUND_NO_TRANSPORT" });

    // ---- THE WAIT NAMES THE CONCRETE PRECONDITIONS (D8) ----
    expect(plan.view.waiting.proposal.families).toEqual(["liquidity"]);
    expect(plan.view.waiting.proposal.categories).toEqual(["NEW_OPPORTUNITY", "FEES_KNOWN"]);

    // ---- THE PERSISTENCE: the emergence-bearing view presents through the REAL session ----
    const enrichedValue = {
      ...plan.view,
      conditionalOpportunities: emergence.conditionalOpportunities,
      platformWork: emergence.platformWork,
      hypotheses: emergence.hypotheses,
      modelProposals: emergence.modelProposals,
    };
    const enrichedView = { ...enrichedValue, viewDigest: routePlanningViewDigestOf(enrichedValue) } as RoutePlanningEngineView;
    await routeComposition.session.presentChoices(taskId, enrichedView, T2);
    const afterPresent = await session.taskDetail(taskId);
    const previewEvents = afterPresent?.events.filter((event) => event.kind === "PREVIEW_PRESENTED") ?? [];
    expect(previewEvents.length).toBe(1);
    expect(previewEvents[0]!.summary).toContain("3 conditional opportunities, 3 platform work items, 2 hypotheses");
    expect(previewEvents[0]!.summary).toContain("discovery only, nothing dispatches");

    // ---- THE RE-CHECK OVER FRESH OBSERVATIONS (the product source, live) ----
    await routeComposition.session.chooseWait(taskId, enrichedView.waiting.proposal, T2);
    const productRecords = await productObservations();
    expect(productRecords.length).toBe(2);
    expect(productRecords.every((record) => record.family === "other")).toBe(true);
    const noMatch = await waitBinding.plane.recheckWait({ taskRef: taskId, criteria: enrichedView.waiting.proposal });
    expect(noMatch.matchedOpportunityIds).toEqual([]);
    expect(noMatch.neverAutoDispatches).toBe(true);
    expect((await session.taskDetail(taskId))?.status).toBe("WAITING_FOR_OPPORTUNITIES");
    freshDiscovery = true;
    const matched = await waitBinding.plane.recheckWait({ taskRef: taskId, criteria: enrichedView.waiting.proposal });
    expect(matched.matchedOpportunityIds).toHaveLength(1);
    expect(matched.waitingNeverDispatches).toBe(false);
    expect(matched.neverAutoDispatches).toBe(true);
    await routeComposition.session.recordOpportunityMatch(taskId, opportunityMatchOfRecheck(matched), T3);
    const afterMatch = await session.taskDetail(taskId);
    expect(afterMatch?.status).toBe("WAITING_FOR_OPPORTUNITIES");
    expect(afterMatch?.events.some((event) => event.kind === "ATTEMPT_STARTED")).toBe(false);
    expect((await service.paymentMissionDetail(missionId))?.events.some((event) => event.kind === "ATTEMPT_STARTED")).toBe(false);
    await routeComposition.session.cancelWait(taskId, T4);
    expect((await session.taskDetail(taskId))?.status).toBe("ACTIVE");

    const missionStore = JSON.stringify(
      [...world.files.entries()].filter(([path]) => path.startsWith("/mem/p21d-payments")).sort(([a], [b]) => (a < b ? -1 : 1)),
    );
    return {
      taskStore: dump(),
      missionStore,
      viewDigest: enrichedView.viewDigest,
      emergenceSections: JSON.stringify({
        conditionalOpportunities: emergence.conditionalOpportunities,
        platformWork: emergence.platformWork,
        hypotheses: emergence.hypotheses,
        modelProposals: emergence.modelProposals,
      }),
    };
  } finally {
    intakeBinding.reset();
    modelBinding.reset();
    resetSharedRoutePlanningEngine();
    resetSharedRoutePlanningSession();
    waitBinding.reset();
    resetSharedAgentComposerController();
    resetSharedMissionIntakePlane();
    resetSharedModelCatalog();
  }
}

describe("the operator's no-route journey with the emergence asserted (P23-D bridge battery — REAL channel + REAL engines + the displayed cards)", () => {
  it("drives the no-route journey: the honest typed exclusions → the displayed repair cards (3 party changes + 3 platform work items + 2 hypotheses) → the verified/unverified distinction → the wait naming the concrete preconditions → the re-check over fresh observations → the persistence", async () => {
    await driveEmergenceJourney();
  });

  it("DETERMINISTIC REPLAY: the journey over a second fresh world produces byte-identical store records + view digest + card sections", async () => {
    const first = await driveEmergenceJourney();
    const second = await driveEmergenceJourney();
    expect(second.taskStore).toBe(first.taskStore);
    expect(second.missionStore).toBe(first.missionStore);
    expect(second.viewDigest).toBe(first.viewDigest);
    expect(second.emergenceSections).toBe(first.emergenceSections);
  });
});
