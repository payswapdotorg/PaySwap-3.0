/**
 * @payswap/app — the ROUTE-PLANNING opportunity-section VALIDATORS
 * (P23-B, ADR-0015 D8; split from ./routePlanningSession.ts at P24-3
 * for the ≤400-line file law — a pure mechanical move, no behavior
 * change: the validators keep their exact signatures and messages).
 *
 * Fail-closed validation of the engine view's THREE advisory
 * opportunity sections (conditionalOpportunities, platformWork,
 * hypotheses) and the optional model-proposal provenance state: a
 * present section is validated against its pinned card shape (a
 * drifted card never presents); an absent section stays absent (the
 * honest not-composed notes render, never a repair).
 */
import {
  ROUTE_PLANNING_CONDITIONAL_PARTIES_PIN,
  ROUTE_PLANNING_CONDITIONAL_PARTY_CHANGES_PIN,
  ROUTE_PLANNING_VERIFICATION_STATUSES_PIN,
  type RoutePlanningConditionalOpportunityPin,
  type RoutePlanningConditionalPartyChangePin,
  type RoutePlanningConditionalPartyPin,
  type RoutePlanningGroundedFactRefPin,
  type RoutePlanningHypothesisPin,
  type RoutePlanningModelProposalStatePin,
  type RoutePlanningPlatformWorkPin,
  type RoutePlanningVerificationPin,
} from "./routePlanningOpportunityPins.js";
import { RoutePlanningUxError } from "./routePlanningPins.js";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new RoutePlanningUxError("INVALID_VIEW", message);
}

function requireNonEmptyViewString(value: unknown, subject: string): string {
  if (typeof value !== "string" || value.length === 0) { fail(`${subject} must be a non-empty string`); }
  return value;
}

function requireStringArray(value: unknown, subject: string): readonly string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string" && entry.length > 0)) {
    fail(`${subject} must be an array of non-empty strings`);
  }
  return [...(value as readonly string[])];
}

function requireVerification(value: unknown, subject: string): RoutePlanningVerificationPin {
  if (typeof value !== "string" || !(ROUTE_PLANNING_VERIFICATION_STATUSES_PIN as readonly string[]).includes(value)) {
    fail(`${subject} must be one of [${ROUTE_PLANNING_VERIFICATION_STATUSES_PIN.join(", ")}] — the A.6 verification pairing is closed`);
  }
  return value as RoutePlanningVerificationPin;
}

function requireGroundedFactRefs(value: unknown, subject: string): readonly RoutePlanningGroundedFactRefPin[] {
  if (!Array.isArray(value)) { fail(`${subject} must be an array of verbatim grounded fact refs`); }
  return (value as readonly unknown[]).map((entry, index) => {
    if (!isRecord(entry) || (entry["side"] !== "SENDER" && entry["side"] !== "RECIPIENT")) {
      fail(`${subject}[${index}] must carry side SENDER or RECIPIENT`);
    }
    return {
      side: entry["side"] as "SENDER" | "RECIPIENT",
      routeId: requireNonEmptyViewString(entry["routeId"], `${subject}[${index}].routeId`),
      code: requireNonEmptyViewString(entry["code"], `${subject}[${index}].code`),
      message: requireNonEmptyViewString(entry["message"], `${subject}[${index}].message`),
      ...(typeof entry["fundingMethod"] === "string" ? { fundingMethod: entry["fundingMethod"] } : {}),
    };
  });
}

/** Fail-closed validation of the optional conditional-opportunities section (the pinned card shape). */
export function validateConditionalOpportunitySection(value: unknown): readonly RoutePlanningConditionalOpportunityPin[] {
  if (!Array.isArray(value)) { fail("the conditionalOpportunities section, when composed, must be an array of the pinned card shape"); }
  return (value as readonly unknown[]).map((entry, index) => {
    if (!isRecord(entry)) { fail(`conditionalOpportunities[${index}] must be the pinned card record`); }
    const changes = entry["requiredPartyChanges"];
    if (!Array.isArray(changes) || changes.length === 0) { fail(`conditionalOpportunities[${index}].requiredPartyChanges must be a non-empty array (a conditional names WHO must change WHAT)`); }
    const validatedChanges = (changes as readonly unknown[]).map((change) => {
      if (!isRecord(change)) { fail(`conditionalOpportunities[${index}].requiredPartyChanges entries must be { party, change }`); }
      if (!(ROUTE_PLANNING_CONDITIONAL_PARTIES_PIN as readonly string[]).includes(String(change["party"]))) {
        fail(`conditionalOpportunities[${index}].requiredPartyChanges party must be one of [${ROUTE_PLANNING_CONDITIONAL_PARTIES_PIN.join(", ")}]`);
      }
      if (!(ROUTE_PLANNING_CONDITIONAL_PARTY_CHANGES_PIN as readonly string[]).includes(String(change["change"]))) {
        fail(`conditionalOpportunities[${index}].requiredPartyChanges change must be a member of the closed A.1 party-change vocabulary`);
      }
      return { party: change["party"] as RoutePlanningConditionalPartyPin, change: change["change"] as RoutePlanningConditionalPartyChangePin };
    });
    const prerequisites = entry["platformPrerequisites"];
    if (!Array.isArray(prerequisites)) { fail(`conditionalOpportunities[${index}].platformPrerequisites must be an array (possibly empty — a party change may suffice)`); }
    const validatedPrerequisites = (prerequisites as readonly unknown[]).map((prerequisite) => {
      if (!isRecord(prerequisite)) { fail(`conditionalOpportunities[${index}].platformPrerequisites entries must be { gapId, note }`); }
      return {
        gapId: requireNonEmptyViewString(prerequisite["gapId"], `conditionalOpportunities[${index}].platformPrerequisites.gapId`),
        note: requireNonEmptyViewString(prerequisite["note"], `conditionalOpportunities[${index}].platformPrerequisites.note`),
      };
    });
    const expiresAt = entry["expiresAt"];
    if (typeof expiresAt !== "number" || !Number.isSafeInteger(expiresAt) || expiresAt < 0) {
      fail(`conditionalOpportunities[${index}].expiresAt must be a non-negative integer ms instant (countdown-free honesty)`);
    }
    const assumptions = entry["assumptions"];
    if (!Array.isArray(assumptions)) { fail(`conditionalOpportunities[${index}].assumptions must be an array (possibly empty)`); }
    return {
      conditionalId: requireNonEmptyViewString(entry["conditionalId"], `conditionalOpportunities[${index}].conditionalId`),
      title: requireNonEmptyViewString(entry["title"], `conditionalOpportunities[${index}].title`),
      description: requireNonEmptyViewString(entry["description"], `conditionalOpportunities[${index}].description`),
      requiredPartyChanges: Object.freeze(validatedChanges),
      assumptions: requireStringArray(assumptions, `conditionalOpportunities[${index}].assumptions`),
      platformPrerequisites: Object.freeze(validatedPrerequisites),
      expiresAt,
      verification: requireVerification(entry["verification"], `conditionalOpportunities[${index}].verification`),
      verificationReason: requireNonEmptyViewString(entry["verificationReason"], `conditionalOpportunities[${index}].verificationReason`),
    };
  });
}

/** Fail-closed validation of the optional platform-work section (the pinned card shape). */
export function validatePlatformWorkSection(value: unknown): readonly RoutePlanningPlatformWorkPin[] {
  if (!Array.isArray(value)) { fail("the platformWork section, when composed, must be an array of the pinned card shape"); }
  return (value as readonly unknown[]).map((entry, index) => {
    if (!isRecord(entry)) { fail(`platformWork[${index}] must be the pinned card record`); }
    return {
      workItemId: requireNonEmptyViewString(entry["workItemId"], `platformWork[${index}].workItemId`),
      gapId: requireNonEmptyViewString(entry["gapId"], `platformWork[${index}].gapId`),
      title: requireNonEmptyViewString(entry["title"], `platformWork[${index}].title`),
      requiredByOperatorIds: requireStringArray(entry["requiredByOperatorIds"], `platformWork[${index}].requiredByOperatorIds`),
      evidenceBasis: requireGroundedFactRefs(entry["evidenceBasis"], `platformWork[${index}].evidenceBasis`),
    };
  });
}

/** Fail-closed validation of the optional hypotheses section (the pinned card shape — never a route). */
export function validateHypothesesSection(value: unknown): readonly RoutePlanningHypothesisPin[] {
  if (!Array.isArray(value)) { fail("the hypotheses section, when composed, must be an array of the pinned card shape"); }
  return (value as readonly unknown[]).map((entry, index) => {
    if (!isRecord(entry)) { fail(`hypotheses[${index}] must be the pinned card record`); }
    if (entry["neverExecutable"] !== true) { fail(`hypotheses[${index}].neverExecutable must be the literal true — a hypothesis is NEVER a route`); }
    if (entry["advisoryOnly"] !== true) { fail(`hypotheses[${index}].advisoryOnly must be the literal true — the hypothesis tier is advisory only`); }
    if (typeof entry["wouldCompose"] !== "boolean") { fail(`hypotheses[${index}].wouldCompose must be a boolean (the honest structural assessment)`); }
    return {
      hypothesisId: requireNonEmptyViewString(entry["hypothesisId"], `hypotheses[${index}].hypothesisId`),
      operatorId: requireNonEmptyViewString(entry["operatorId"], `hypotheses[${index}].operatorId`),
      assumptionSummary: requireNonEmptyViewString(entry["assumptionSummary"], `hypotheses[${index}].assumptionSummary`),
      verifiedSegmentIds: requireStringArray(entry["verifiedSegmentIds"], `hypotheses[${index}].verifiedSegmentIds`),
      assumedSegmentIds: requireStringArray(entry["assumedSegmentIds"], `hypotheses[${index}].assumedSegmentIds`),
      citedShapeId: requireNonEmptyViewString(entry["citedShapeId"], `hypotheses[${index}].citedShapeId`),
      blockers: requireGroundedFactRefs(entry["blockers"], `hypotheses[${index}].blockers`),
      wouldCompose: entry["wouldCompose"] as boolean,
      verification: requireVerification(entry["verification"], `hypotheses[${index}].verification`),
      verificationReason: requireNonEmptyViewString(entry["verificationReason"], `hypotheses[${index}].verificationReason`),
      neverExecutable: true,
      advisoryOnly: true,
    };
  });
}

/** Fail-closed validation of the optional model-proposal state (provenance only — never a proposal payload). */
export function validateModelProposalState(value: unknown): RoutePlanningModelProposalStatePin {
  if (!isRecord(value)) { fail("the modelProposals state, when present, must be the typed provenance record"); }
  const kind = value["kind"];
  if (kind === "UNBOUND_NO_MODEL" || kind === "UNBOUND_NO_TRANSPORT") { return { kind } as RoutePlanningModelProposalStatePin; }
  if (kind === "BOUND") {
    return {
      kind,
      modelId: requireNonEmptyViewString(value["modelId"], "modelProposals.modelId"),
      foldedOperatorIds: requireStringArray(value["foldedOperatorIds"], "modelProposals.foldedOperatorIds"),
      novelProposalIds: requireStringArray(value["novelProposalIds"], "modelProposals.novelProposalIds"),
    };
  }
  fail("modelProposals.kind must be UNBOUND_NO_MODEL, UNBOUND_NO_TRANSPORT or BOUND (the closed provenance vocabulary)");
}
