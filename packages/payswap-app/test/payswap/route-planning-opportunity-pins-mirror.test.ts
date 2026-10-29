/**
 * @payswap/app — the ROUTE-PLANNING OPPORTUNITY-PINS MIRROR battery (P23-B,
 * lane B; ADR-0015 D8/D11 — the pin-mirror fidelity law).
 *
 * The three advisory engine-view sections are pinned STRUCTURALLY in the
 * app (src/agent/routePlanningOpportunityPins.ts — zero @payswap imports,
 * product law P2); this battery verifies the mirror against the REAL
 * lane-C authorities through test-only relative imports (the established
 * route-planning-acceptance.test.ts pattern):
 *
 * (a) VOCABULARY FIDELITY — the party-change vocabulary, the parties, the
 *     A.6 verification statuses and the repair-intervention id prefix are
 *     byte-identical to route-planning's own pinned vocabularies (which
 *     themselves pin the ADR-0015 appendix values).
 * (b) STRUCTURAL MIRRORING — the app's card pins are field-for-field
 *     assignable from the REAL derivation shapes (PinnedConditionalOpportunity
 *     + the construction request's presentation payload + the A.6 pairing;
 *     PinnedPlatformWorkRequest; PinnedRouteHypothesis projected onto the
 *     card pin) — mutual assignability, the mirror discipline.
 * (c) THE LABEL LAWS — every party-change member has a frozen people-language
 *     label; every label reads as a verb phrase anchored to the catalogue
 *     corpus (the P21 labels byte-anchored to the P21 hardcode titles).
 */
import { describe, expect, it } from "vitest";

// The REAL lane-C authorities (test-tier relative imports — the pins-fidelity law).
import { PINNED_CONDITIONAL_PARTY_CHANGES, PINNED_CONDITIONAL_PARTIES, PINNED_CONDITIONAL_KIND } from "../../../route-planning/src/pins/opportunities.ts";
import { PINNED_REPAIR_PARTY_CHANGES } from "../../../route-planning/src/pins/repairs.ts";
import { PINNED_HYPOTHESIS_VERIFICATION_STATUSES } from "../../../route-planning/src/pins/hypotheses.ts";
import type { PinnedPlatformWorkRequest, PinnedGroundedFactRef, PinnedRepairPartyChange } from "../../../route-planning/src/pins/repairs.ts";
import type { PinnedRouteHypothesis, PinnedHypothesisSegment } from "../../../route-planning/src/pins/hypotheses.ts";
import type { PinnedConditionalOpportunity, PinnedRequiredPartyChange } from "../../../route-planning/src/pins/opportunities.ts";

// The app's own pins (the mirror under test).
import {
  ROUTE_PLANNING_CONDITIONAL_PARTIES_PIN,
  ROUTE_PLANNING_CONDITIONAL_PARTY_CHANGES_PIN,
  ROUTE_PLANNING_PARTY_CHANGE_LABELS,
  ROUTE_PLANNING_PARTY_LABELS,
  ROUTE_PLANNING_REPAIR_INTERVENTION_ID_PREFIX,
  ROUTE_PLANNING_VERIFICATION_STATUSES_PIN,
  type RoutePlanningConditionalOpportunityPin,
  type RoutePlanningGroundedFactRefPin,
  type RoutePlanningHypothesisPin,
  type RoutePlanningPartyChangePin,
  type RoutePlanningPlatformPrerequisitePin,
  type RoutePlanningPlatformWorkPin,
} from "../../src/agent/routePlanningOpportunityPins.js";
import { ROUTE_PLANNING_SECTION_IDS, type RoutePlanningSectionId } from "../../src/agent/routePlanningPins.js";

describe("(a) VOCABULARY FIDELITY — the app pins equal the REAL lane-C vocabularies", () => {
  it("the party-change vocabulary mirrors the REAL A.1 growth (canonical order, byte-identical)", () => {
    expect([...ROUTE_PLANNING_CONDITIONAL_PARTY_CHANGES_PIN]).toEqual([...PINNED_REPAIR_PARTY_CHANGES]);
    expect([...ROUTE_PLANNING_CONDITIONAL_PARTY_CHANGES_PIN]).toEqual([...PINNED_CONDITIONAL_PARTY_CHANGES]);
    // The three P21 members preserved FIRST (byte-compat with the P21 vocabulary).
    expect([...ROUTE_PLANNING_CONDITIONAL_PARTY_CHANGES_PIN].slice(0, 3)).toEqual([
      "ENABLES_FLUTTERWAVE_RECEIVING_METHOD",
      "ADDS_STRIPE_COMPATIBLE_INSTRUMENT",
      "INTERMEDIARY_INTRODUCED",
    ]);
  });

  it("the parties + the A.6 verification statuses mirror the REAL pins byte-identically", () => {
    expect([...ROUTE_PLANNING_CONDITIONAL_PARTIES_PIN]).toEqual([...PINNED_CONDITIONAL_PARTIES]);
    expect([...ROUTE_PLANNING_VERIFICATION_STATUSES_PIN]).toEqual([...PINNED_HYPOTHESIS_VERIFICATION_STATUSES]);
  });

  it("the A.7 section-id order grows to the eight sections in the frozen order", () => {
    expect([...ROUTE_PLANNING_SECTION_IDS]).toEqual([
      "available-now", "exclusions", "truncation", "scenarios",
      "conditional-opportunities", "platform-work", "hypotheses", "waiting",
    ]);
    const ids: readonly RoutePlanningSectionId[] = [...ROUTE_PLANNING_SECTION_IDS];
    expect(ids.length).toBe(8);
  });

  it("the repair-intervention id prefix mirrors the lane-C intervention identity law", () => {
    expect(ROUTE_PLANNING_REPAIR_INTERVENTION_ID_PREFIX).toBe("repair-intervention:");
  });
});

describe("(b) STRUCTURAL MIRRORING — the app card pins field-for-field mirror the REAL shapes", () => {
  it("a REAL grounded fact ref assigns onto the app pin (and back)", () => {
    const real: PinnedGroundedFactRef = {
      side: "RECIPIENT", routeId: "route:stripe:test", code: "FUNDING_METHOD_NOT_SERVED",
      message: "the receiving rail does not serve this funding method", fundingMethod: "flutterwave_wallet",
    };
    const app: RoutePlanningGroundedFactRefPin = real;
    const back: PinnedGroundedFactRef = app;
    expect(back.code).toBe("FUNDING_METHOD_NOT_SERVED");
  });

  it("a REAL platform-work request maps onto the app pin field-for-field (workItemId, gapId, title, requiredByOperatorIds, evidenceBasis)", () => {
    const real: PinnedPlatformWorkRequest = {
      workItemId: "platform-work:platform:flutterwave-send-operation",
      gapId: "platform:flutterwave-send-operation",
      title: "a Flutterwave send operation",
      requiredByOperatorIds: ["repair:recipient-enables-flw-receiving-method"],
      evidenceBasis: [{ side: "RECIPIENT", routeId: "route:stripe:test", code: "FUNDING_METHOD_NOT_SERVED", message: "verbatim" }],
      status: "OPEN",
      advisoryOnly: true,
    };
    const app: RoutePlanningPlatformWorkPin = {
      workItemId: real.workItemId,
      gapId: real.gapId,
      title: real.title,
      requiredByOperatorIds: [...real.requiredByOperatorIds],
      evidenceBasis: [...real.evidenceBasis],
    };
    expect(app.gapId).toBe(real.gapId);
    expect(app.evidenceBasis[0]!.code).toBe("FUNDING_METHOD_NOT_SERVED");
  });

  it("a REAL required party change + platform prerequisite assign onto the app pins", () => {
    const realChange: PinnedRequiredPartyChange = { party: "RECIPIENT", change: "ENABLES_FLUTTERWAVE_RECEIVING_METHOD" };
    const appChange: RoutePlanningPartyChangePin = realChange;
    expect(appChange.change satisfies PinnedRepairPartyChange).toBe("ENABLES_FLUTTERWAVE_RECEIVING_METHOD");
    const appPrerequisite: RoutePlanningPlatformPrerequisitePin = { gapId: "platform:flutterwave-send-operation", note: "the honest note" };
    expect(appPrerequisite.gapId).toContain("platform:");
  });

  it("a REAL route hypothesis projects onto the app card pin with the never-executable literals pinned", () => {
    const segments: readonly PinnedHypothesisSegment[] = [
      { segmentId: "route-plan:intent-1:provider-native-bridge", label: "VERIFIED" },
      { segmentId: "assumed-rail:repair:intermediary-introduced", label: "ASSUMED" },
    ];
    const real: PinnedRouteHypothesis = {
      hypothesisId: "hypothesis:fnv1a64:abcdef0123456789:repair:intermediary-introduced",
      operatorId: "repair:intermediary-introduced",
      assumption: {
        kind: "ADD_ASSUMED_RAIL",
        rail: { assumed: true, assumedRailId: "assumed-rail:repair:intermediary-introduced", providerName: "assumed:repair:intermediary-introduced", railKind: "FIAT", sourceCurrency: "NGN", destinationCurrency: "USD", summary: "a verified intermediary rail bridges the sender's funding rail and the merchant's receiving context" },
      },
      verifiedSegments: [segments[0]!],
      hypotheticalSegments: [segments[1]!],
      citedShapeSkeleton: { shapeId: "provider-native-bridge", legKindSequence: ["ONCHAIN_BRIDGE"] },
      blockers: [{ side: "SENDER", routeId: "route:flw:readonly", code: "NOT_EXECUTABLE_CAPABILITY", message: "the rail is read-only" }],
      wouldCompose: true,
      verification: "PLANNER_VERIFIED",
      verificationReason: "the REAL planner re-run composed a rank-eligible route over the real sub-views",
      neverExecutable: true,
      advisoryOnly: true,
      derivedAt: 1_771_612_800_000,
      hypothesisDigest: "fnv1a64:0123456789abcdef",
    };
    const app: RoutePlanningHypothesisPin = {
      hypothesisId: real.hypothesisId,
      operatorId: real.operatorId,
      assumptionSummary: real.assumption.rail.summary,
      verifiedSegmentIds: real.verifiedSegments.map((segment) => segment.segmentId),
      assumedSegmentIds: real.hypotheticalSegments.map((segment) => segment.segmentId),
      citedShapeId: real.citedShapeSkeleton.shapeId,
      blockers: [...real.blockers],
      wouldCompose: real.wouldCompose,
      verification: real.verification,
      verificationReason: real.verificationReason,
      neverExecutable: real.neverExecutable,
      advisoryOnly: real.advisoryOnly,
    };
    expect(app.assumptionSummary).toContain("intermediary rail");
    expect(app.verifiedSegmentIds[0]).toContain("route-plan:");
    expect(app.assumedSegmentIds[0]).toContain("assumed-rail:");
    expect(app.neverExecutable).toBe(true);
    expect(app.advisoryOnly).toBe(true);
  });

  it("a REAL published conditional projects onto the app card pin with the A.6 pairing", () => {
    const real: PinnedConditionalOpportunity = {
      conditionalKind: PINNED_CONDITIONAL_KIND,
      conditionalId: "conditional:RECIPIENT:ENABLES_FLUTTERWAVE_RECEIVING_METHOD:opportunity:other:fiat:ngn-usd:venue:obs",
      opportunityId: "opportunity:other:fiat:ngn-usd:venue:obs",
      family: "other",
      railKey: "fiat:ngn-usd",
      summary: "the recipient enables an eligible Flutterwave receiving method",
      requiredPartyChanges: [{ party: "RECIPIENT", change: "ENABLES_FLUTTERWAVE_RECEIVING_METHOD" }],
      assumptions: ["the recipient enables a Flutterwave receiving method that serves this corridor's funding method"],
      platformPrerequisites: [{ gapId: "platform:flutterwave-send-operation", note: "the honest platform-gap note" }],
      evidence: [],
      disclosureScope: { fields: ["conditional_id"], purpose: "the panel" },
      optIn: { participantRef: "principal:operator-1", optedInAt: 1 },
      publishedAt: 2,
      expiresAt: 3,
      state: "OPEN",
      discoveryTier: "DISCOVERY_NEVER_AUTHORIZATION",
    };
    const app: RoutePlanningConditionalOpportunityPin = {
      conditionalId: real.conditionalId,
      title: real.summary,
      description: "the corridor does not compose today — the conditional route exists only when the recipient enables a Flutterwave receiving method",
      requiredPartyChanges: [...real.requiredPartyChanges],
      assumptions: [...real.assumptions],
      platformPrerequisites: [...real.platformPrerequisites],
      expiresAt: real.expiresAt,
      verification: "UNVERIFIED",
      verificationReason: "the honest remaining reason",
    };
    expect(app.title).toBe(real.summary);
    expect(app.verification).toBe("UNVERIFIED");
  });
});

describe("(c) THE LABEL LAWS — the frozen people-language maps", () => {
  it("every party-change member carries a frozen people-language label", () => {
    for (const change of ROUTE_PLANNING_CONDITIONAL_PARTY_CHANGES_PIN) {
      expect(typeof ROUTE_PLANNING_PARTY_CHANGE_LABELS[change]).toBe("string");
      expect(ROUTE_PLANNING_PARTY_CHANGE_LABELS[change].length).toBeGreaterThan(0);
    }
    expect(Object.keys(ROUTE_PLANNING_PARTY_CHANGE_LABELS).sort()).toEqual([...ROUTE_PLANNING_CONDITIONAL_PARTY_CHANGES_PIN].sort());
  });

  it("every party carries a frozen people-language label", () => {
    for (const party of ROUTE_PLANNING_CONDITIONAL_PARTIES_PIN) {
      expect(typeof ROUTE_PLANNING_PARTY_LABELS[party]).toBe("string");
    }
    expect(Object.keys(ROUTE_PLANNING_PARTY_LABELS).sort()).toEqual([...ROUTE_PLANNING_CONDITIONAL_PARTIES_PIN].sort());
  });

  it("the P21 labels are byte-anchored to the P21 hardcode titles' phrasing", () => {
    // The P21 hardcode titles (conditional-stage.ts): the labels read as the
    // verb phrase following the party label, reproducing the same words.
    expect(ROUTE_PLANNING_PARTY_CHANGE_LABELS.ENABLES_FLUTTERWAVE_RECEIVING_METHOD).toBe("enables an eligible Flutterwave receiving method");
    expect(ROUTE_PLANNING_PARTY_CHANGE_LABELS.ADDS_STRIPE_COMPATIBLE_INSTRUMENT).toBe("adds a genuinely supported Stripe-compatible payment instrument");
    expect(ROUTE_PLANNING_PARTY_LABELS.RECIPIENT).toBe("the recipient");
    expect(ROUTE_PLANNING_PARTY_LABELS.SENDER).toBe("the sender");
    expect(ROUTE_PLANNING_PARTY_LABELS.THIRD_PARTY).toBe("a third party");
  });
});
