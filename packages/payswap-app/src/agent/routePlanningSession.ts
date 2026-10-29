/**
 * @payswap/app — the ROUTE-PLANNING SESSION (P16-D part 3; gap-matrix D5;
 * ADR-0009 D8; ROUTINE-CONTRACT stages 8/9a/9b).
 *
 * The pure session projection over the composer task-session machinery
 * (./taskSessionPort.ts — the ONLY mutation surface of task records):
 * stage 8's presentation record, stage 9a's PROCEED REQUEST and stage
 * 9b's durable wait, with the route-planning laws on top.
 *
 * LAWS: ZERO FINANCIAL AUTHORITY — chooseProceed records a REQUEST; the
 * app NEVER writes AUTHORIZATION_GRANTED (that event belongs to the real
 * authority surface; pinned structurally by the session battery). The
 * closed shared vocabulary carries no PROCEED_REQUESTED kind, so the
 * request is recorded as ATTEMPT_STARTED with a summary that states
 * REQUEST-only — never an authorization claim. THE WAIT LAW (ADR-0009
 * D8) — chooseWait → WAITING_FOR_OPPORTUNITIES + WAIT_STARTED +
 * WAIT_CRITERIA_RECORDED (the criteria serialized into the event record);
 * a recorded proceed selection is NEVER erased (the fallback policy may
 * reference it — append-only by construction, projected by
 * projectRoutePlanningProceedSelection); recordOpportunityMatch records
 * OPPORTUNITY_MATCHED and the task STAYS WAITING; cancelWait/expireWait
 * return the task to ACTIVE. CLOCKS — every mutation takes an explicit
 * ISO-8601 UTC `at`; the DEFAULT when omitted is the package's ONE
 * pinned ambient site (ambientMutationClock, src/console/
 * useWorkspaceStore.ts — the P5 carve-out shared with the composer
 * controller), read once per user-initiated mutation to supply the
 * port's explicit `now` argument; never a second ambient read, never
 * displayed. DETERMINISM — identical inputs → byte-identical event
 * records (deterministic summaries; FIXED-key-order criteria
 * serialization). FAIL CLOSED — unknown tasks, terminal tasks, malformed
 * instants (the port's strict ISO law), prose criteria (a string is not
 * a criteria record), non-integer criteria instants, impure match
 * records, drifted routine pins — typed errors, never coerced.
 */

import { ambientMutationClock } from "../console/useWorkspaceStore.js";
import { isTerminalAgentTaskStatusPin, type AgentTaskPin } from "../lib/agent-task-pins.js";
import { validatePinnedModelSelection } from "../lib/agent-task-validation.js";
import { AgentTaskSessionError } from "./taskSessionPort.js";
import type { AgentTaskSessionPort } from "./taskSessionPort.js";
import {
  PINNED_ROUTE_PLANNING_ROUTINE,
  ROUTE_PLANNING_OPPORTUNITY_FAMILIES_PIN,
  ROUTE_PLANNING_WAIT_CATEGORIES_PIN,
  ROUTE_PLANNING_WAIT_FALLBACK_KINDS_PIN,
  RoutePlanningUxError,
  routePlanningViewDigestOf,
  type RoutePlanningEngineView,
  type RoutePlanningOpportunityMatchPin,
  type RoutePlanningWaitCriteriaPin,
  type RoutePlanningWaitingState,
} from "./routePlanningPins.js";
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

/* --------------------------- the validators -------------------------- */

/* Id maxima DERIVED from the REAL authority formats (never arbitrary): a
 * planId is `route-plan:<intentId>:<shapeId>` (shapeId ≤ 31); an opportunity
 * id is `opportunity:<family>:<railKey>:<venueId>:<observationId>` (the
 * realistic fixture mints 75 chars) — pinning tighter rejects REAL ids. */
const WAIT_ID_MAX = 64, REF_MAX = 96, TRADE_OFF_MAX = 16, PLAN_ID_MAX = 160, MATCH_ID_MAX = 192;
const CRITERIA_KEYS = ["waitId", "families", "categories", "maxWaitMs", "maxSettlementMs", "fallback", "tradeOffs", "declaredAt"];
const MATCH_KEYS = ["matchedOpportunityIds", "categoryAttribution", "expired", "reasons", "waitingNeverDispatches"];
/** The forbidden key shapes — a match record is STRUCTURALLY pure (ADR-0009 D8). */
const ACTION_KEY_PATTERN = /^(action|command|dispatch|execute|authorize|authorization)$/i;
const PROCEED_SUMMARY_PREFIX = "Proceed request recorded for plan '" as const;
const MATCH_SUMMARY_PREFIX = "Opportunity matched: " as const;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(code: "INVALID_CRITERIA" | "INVALID_MATCH" | "INVALID_VIEW", message: string): never {
  throw new RoutePlanningUxError(code, message);
}

function requireNonEmptyBounded(value: unknown, subject: string, max: number): string {
  if (typeof value !== "string" || value.length === 0) { fail("INVALID_CRITERIA", `${subject} must be a non-empty string`); }
  if (value.length > max) { fail("INVALID_CRITERIA", `${subject} must be at most ${max} characters`); }
  return value;
}

function requireSafeInteger(value: unknown, subject: string, minimum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    fail("INVALID_CRITERIA", `${subject} must be ${minimum === 1 ? "a positive" : "a non-negative"} integer (caller-supplied ms instant — never a clock read, never fractional)`);
  }
  return value;
}

function requireVocabulary(value: unknown, vocabulary: readonly string[], subject: string): string {
  if (typeof value !== "string" || !vocabulary.includes(value)) {
    fail("INVALID_CRITERIA", `${subject} must be one of [${vocabulary.join(", ")}] — the wait vocabulary is closed`);
  }
  return value;
}

function requireVocabularyArray(value: unknown, vocabulary: readonly string[], subject: string): string[] {
  if (!Array.isArray(value) || value.length === 0) { fail("INVALID_CRITERIA", `${subject} must be a non-empty array from the closed vocabulary`); }
  const seen = new Set<string>();
  for (const entry of value) { requireVocabulary(entry, vocabulary, subject); seen.add(entry as string); }
  if (seen.size !== value.length) { fail("INVALID_CRITERIA", `${subject} entries must be unique`); }
  return [...value] as string[];
}

function requireTradeOffs(value: unknown): string[] {
  if (!Array.isArray(value)) { fail("INVALID_CRITERIA", "criteria.tradeOffs must be an array (possibly empty — sorted, unique, non-empty, <= 16-char entries)"); }
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string" || entry.length === 0 || entry.length > TRADE_OFF_MAX) { fail("INVALID_CRITERIA", `each trade-off must be a non-empty string of at most ${TRADE_OFF_MAX} characters`); }
    seen.add(entry);
  }
  if (seen.size !== value.length) { fail("INVALID_CRITERIA", "criteria.tradeOffs must be unique"); }
  const entries = [...(value as readonly string[])];
  const sorted = [...entries].sort();
  for (let index = 0; index < entries.length; index += 1) {
    if (entries[index] !== sorted[index]) { fail("INVALID_CRITERIA", "criteria.tradeOffs must be sorted (ascending)"); }
  }
  return sorted;
}

function rejectUnknownKeys(record: Readonly<Record<string, unknown>>, allowed: readonly string[], code: "INVALID_CRITERIA" | "INVALID_MATCH", subject: string): void {
  const unknown = Object.keys(record).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) { fail(code, `${subject} key set is closed — unknown field(s) ${unknown.join(", ")} rejected`); }
}

/* ------- (P23-B, ADR-0015 D8) the opportunity-section validators ------- */

function requireNonEmptyViewString(value: unknown, subject: string): string {
  if (typeof value !== "string" || value.length === 0) { fail("INVALID_VIEW", `${subject} must be a non-empty string`); }
  return value;
}

function requireStringArray(value: unknown, subject: string): readonly string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string" && entry.length > 0)) {
    fail("INVALID_VIEW", `${subject} must be an array of non-empty strings`);
  }
  return [...(value as readonly string[])];
}

function requireVerification(value: unknown, subject: string): RoutePlanningVerificationPin {
  if (typeof value !== "string" || !(ROUTE_PLANNING_VERIFICATION_STATUSES_PIN as readonly string[]).includes(value)) {
    fail("INVALID_VIEW", `${subject} must be one of [${ROUTE_PLANNING_VERIFICATION_STATUSES_PIN.join(", ")}] — the A.6 verification pairing is closed`);
  }
  return value as RoutePlanningVerificationPin;
}

function requireGroundedFactRefs(value: unknown, subject: string): readonly RoutePlanningGroundedFactRefPin[] {
  if (!Array.isArray(value)) { fail("INVALID_VIEW", `${subject} must be an array of verbatim grounded fact refs`); }
  return (value as readonly unknown[]).map((entry, index) => {
    if (!isRecord(entry) || (entry["side"] !== "SENDER" && entry["side"] !== "RECIPIENT")) {
      fail("INVALID_VIEW", `${subject}[${index}] must carry side SENDER or RECIPIENT`);
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
function validateConditionalOpportunitySection(value: unknown): readonly RoutePlanningConditionalOpportunityPin[] {
  if (!Array.isArray(value)) { fail("INVALID_VIEW", "the conditionalOpportunities section, when composed, must be an array of the pinned card shape"); }
  return (value as readonly unknown[]).map((entry, index) => {
    if (!isRecord(entry)) { fail("INVALID_VIEW", `conditionalOpportunities[${index}] must be the pinned card record`); }
    const changes = entry["requiredPartyChanges"];
    if (!Array.isArray(changes) || changes.length === 0) { fail("INVALID_VIEW", `conditionalOpportunities[${index}].requiredPartyChanges must be a non-empty array (a conditional names WHO must change WHAT)`); }
    const validatedChanges = (changes as readonly unknown[]).map((change) => {
      if (!isRecord(change)) { fail("INVALID_VIEW", `conditionalOpportunities[${index}].requiredPartyChanges entries must be { party, change }`); }
      if (!(ROUTE_PLANNING_CONDITIONAL_PARTIES_PIN as readonly string[]).includes(String(change["party"]))) {
        fail("INVALID_VIEW", `conditionalOpportunities[${index}].requiredPartyChanges party must be one of [${ROUTE_PLANNING_CONDITIONAL_PARTIES_PIN.join(", ")}]`);
      }
      if (!(ROUTE_PLANNING_CONDITIONAL_PARTY_CHANGES_PIN as readonly string[]).includes(String(change["change"]))) {
        fail("INVALID_VIEW", `conditionalOpportunities[${index}].requiredPartyChanges change must be a member of the closed A.1 party-change vocabulary`);
      }
      return { party: change["party"] as RoutePlanningConditionalPartyPin, change: change["change"] as RoutePlanningConditionalPartyChangePin };
    });
    const prerequisites = entry["platformPrerequisites"];
    if (!Array.isArray(prerequisites)) { fail("INVALID_VIEW", `conditionalOpportunities[${index}].platformPrerequisites must be an array (possibly empty — a party change may suffice)`); }
    const validatedPrerequisites = (prerequisites as readonly unknown[]).map((prerequisite) => {
      if (!isRecord(prerequisite)) { fail("INVALID_VIEW", `conditionalOpportunities[${index}].platformPrerequisites entries must be { gapId, note }`); }
      return {
        gapId: requireNonEmptyViewString(prerequisite["gapId"], `conditionalOpportunities[${index}].platformPrerequisites.gapId`),
        note: requireNonEmptyViewString(prerequisite["note"], `conditionalOpportunities[${index}].platformPrerequisites.note`),
      };
    });
    const expiresAt = entry["expiresAt"];
    if (typeof expiresAt !== "number" || !Number.isSafeInteger(expiresAt) || expiresAt < 0) {
      fail("INVALID_VIEW", `conditionalOpportunities[${index}].expiresAt must be a non-negative integer ms instant (countdown-free honesty)`);
    }
    const assumptions = entry["assumptions"];
    if (!Array.isArray(assumptions)) { fail("INVALID_VIEW", `conditionalOpportunities[${index}].assumptions must be an array (possibly empty)`); }
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
function validatePlatformWorkSection(value: unknown): readonly RoutePlanningPlatformWorkPin[] {
  if (!Array.isArray(value)) { fail("INVALID_VIEW", "the platformWork section, when composed, must be an array of the pinned card shape"); }
  return (value as readonly unknown[]).map((entry, index) => {
    if (!isRecord(entry)) { fail("INVALID_VIEW", `platformWork[${index}] must be the pinned card record`); }
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
function validateHypothesesSection(value: unknown): readonly RoutePlanningHypothesisPin[] {
  if (!Array.isArray(value)) { fail("INVALID_VIEW", "the hypotheses section, when composed, must be an array of the pinned card shape"); }
  return (value as readonly unknown[]).map((entry, index) => {
    if (!isRecord(entry)) { fail("INVALID_VIEW", `hypotheses[${index}] must be the pinned card record`); }
    if (entry["neverExecutable"] !== true) { fail("INVALID_VIEW", `hypotheses[${index}].neverExecutable must be the literal true — a hypothesis is NEVER a route`); }
    if (entry["advisoryOnly"] !== true) { fail("INVALID_VIEW", `hypotheses[${index}].advisoryOnly must be the literal true — the hypothesis tier is advisory only`); }
    if (typeof entry["wouldCompose"] !== "boolean") { fail("INVALID_VIEW", `hypotheses[${index}].wouldCompose must be a boolean (the honest structural assessment)`); }
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
function validateModelProposalState(value: unknown): RoutePlanningModelProposalStatePin {
  if (!isRecord(value)) { fail("INVALID_VIEW", "the modelProposals state, when present, must be the typed provenance record"); }
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
  fail("INVALID_VIEW", "modelProposals.kind must be UNBOUND_NO_MODEL, UNBOUND_NO_TRANSPORT or BOUND (the closed provenance vocabulary)");
}

/** Fail-closed wait-criteria validation (prose UNCONSTRUCTIBLE — a string,
 * an array or a malformed record is rejected typed). Returns a NEW frozen
 * record with the FIXED key order (the serialization law). */
export function validateRoutePlanningWaitCriteria(candidate: unknown): RoutePlanningWaitCriteriaPin {
  if (!isRecord(candidate)) {
    fail("INVALID_CRITERIA", "a wait choice requires the criteria record — prose is never a wait criteria (the wait vocabulary is closed and typed)");
  }
  rejectUnknownKeys(candidate, CRITERIA_KEYS, "INVALID_CRITERIA", "the wait criteria");
  const fallback = candidate["fallback"];
  if (!isRecord(fallback)) { fail("INVALID_CRITERIA", "criteria.fallback must be { kind, routeRef } (the user-selected expiry fallback)"); }
  return Object.freeze({
    waitId: requireNonEmptyBounded(candidate["waitId"], "criteria.waitId", WAIT_ID_MAX),
    families: Object.freeze(requireVocabularyArray(candidate["families"], ROUTE_PLANNING_OPPORTUNITY_FAMILIES_PIN, "criteria.families")) as RoutePlanningWaitCriteriaPin["families"],
    categories: Object.freeze(requireVocabularyArray(candidate["categories"], ROUTE_PLANNING_WAIT_CATEGORIES_PIN, "criteria.categories")) as RoutePlanningWaitCriteriaPin["categories"],
    maxWaitMs: requireSafeInteger(candidate["maxWaitMs"], "criteria.maxWaitMs", 1),
    maxSettlementMs: requireSafeInteger(candidate["maxSettlementMs"], "criteria.maxSettlementMs", 1),
    fallback: Object.freeze({
      kind: requireVocabulary(fallback["kind"], ROUTE_PLANNING_WAIT_FALLBACK_KINDS_PIN, "criteria.fallback.kind") as RoutePlanningWaitCriteriaPin["fallback"]["kind"],
      routeRef: requireNonEmptyBounded(fallback["routeRef"], "criteria.fallback.routeRef", REF_MAX),
    }),
    tradeOffs: Object.freeze(requireTradeOffs(candidate["tradeOffs"])),
    declaredAt: requireSafeInteger(candidate["declaredAt"], "criteria.declaredAt", 0),
  });
}

function scanForActionKeys(value: unknown, subject: string): void {
  if (Array.isArray(value)) {
    for (const item of value) { scanForActionKeys(item, subject); }
    return;
  }
  if (!isRecord(value)) { return; }
  for (const key of Object.keys(value)) {
    if (ACTION_KEY_PATTERN.test(key)) {
      fail("INVALID_MATCH", `${subject} carries the action-shaped key '${key}' — a wait match is structurally pure (no action/command/dispatch/execute/authorize key at any name, ADR-0009 D8)`);
    }
    scanForActionKeys(value[key], subject);
  }
}

/** Fail-closed opportunity-match validation: EXACTLY the five pure fact
 * keys, and no action/command/dispatch/execute/authorize key at ANY name
 * (recursive) — a wait match is a record, never an action. */
export function validateRoutePlanningOpportunityMatch(candidate: unknown): RoutePlanningOpportunityMatchPin {
  if (!isRecord(candidate)) { fail("INVALID_MATCH", "an opportunity match requires the five-fact record — prose is never a match result"); }
  scanForActionKeys(candidate, "the opportunity match");
  rejectUnknownKeys(candidate, MATCH_KEYS, "INVALID_MATCH", "the match record (the five pure facts)");
  const ids = candidate["matchedOpportunityIds"];
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string" && id.length > 0 && id.length <= MATCH_ID_MAX)) { fail("INVALID_MATCH", "matchedOpportunityIds must be an array of non-empty matched opportunity ids"); }
  const attribution = candidate["categoryAttribution"];
  if (!isRecord(attribution) || !Object.keys(attribution).every((key) => Array.isArray(attribution[key]))) { fail("INVALID_MATCH", "categoryAttribution must be a record of id → declared wait categories"); }
  for (const key of Object.keys(attribution)) {
    for (const category of attribution[key] as unknown[]) { requireVocabulary(category, ROUTE_PLANNING_WAIT_CATEGORIES_PIN, "categoryAttribution entry"); }
  }
  if (typeof candidate["expired"] !== "boolean") { fail("INVALID_MATCH", "expired must be a boolean"); }
  const reasons = candidate["reasons"];
  if (!Array.isArray(reasons) || !reasons.every((reason) => reason === "WAIT_EXPIRED")) { fail("INVALID_MATCH", "reasons must be an array over the closed reason vocabulary (WAIT_EXPIRED)"); }
  if (candidate["waitingNeverDispatches"] !== false) { fail("INVALID_MATCH", "waitingNeverDispatches must be the literal false — a wait match never dispatches (ADR-0009 D8)"); }
  return Object.freeze({
    matchedOpportunityIds: Object.freeze([...ids]),
    categoryAttribution: Object.freeze({ ...attribution }) as RoutePlanningOpportunityMatchPin["categoryAttribution"],
    expired: candidate["expired"],
    reasons: Object.freeze([...reasons]),
    waitingNeverDispatches: false,
  });
}

/** Fail-closed engine-view validation, including ROUTINE PIN FIDELITY. */
export function validateRoutePlanningEngineView(candidate: unknown): RoutePlanningEngineView {
  if (!isRecord(candidate) || candidate["kind"] !== "PRESENTED_PLAN") { fail("INVALID_VIEW", "an engine view must carry kind PRESENTED_PLAN"); }
  const routine = candidate["routine"];
  if (!isRecord(routine) || routine["routineId"] !== PINNED_ROUTE_PLANNING_ROUTINE.routineId ||
    routine["routineVersion"] !== PINNED_ROUTE_PLANNING_ROUTINE.routineVersion ||
    routine["skillContentDigest"] !== PINNED_ROUTE_PLANNING_ROUTINE.skillContentDigest) {
    fail("INVALID_VIEW", `the engine view's routine provenance must equal the pinned routine (payment-route-planning v${PINNED_ROUTE_PLANNING_ROUTINE.routineVersion}, skill digest ${PINNED_ROUTE_PLANNING_ROUTINE.skillContentDigest}) — a drifted routine never presents`);
  }
  const view = candidate as unknown as RoutePlanningEngineView;
  if ([view.availableNow, view.truncation, view.scenarios, view.waiting].some((section) => !isRecord(section)) || !Array.isArray(view.exclusions)) { fail("INVALID_VIEW", "the engine view must carry all eight separated sections (availableNow, exclusions, truncation, scenarios, conditionalOpportunities, platformWork, hypotheses, waiting) — the five structural sections are mandatory, the three advisory opportunity sections optional (absent = not composed in this deployment)"); }
  if (!Array.isArray(view.availableNow.ranked) || !Array.isArray(view.availableNow.notScored)) { fail("INVALID_VIEW", "availableNow must carry the ranked and notScored lists"); }
  for (const route of view.availableNow.ranked) {
    if (!isRecord(route) || typeof route["planId"] !== "string" || route["planId"].length === 0) { fail("INVALID_VIEW", "every ranked route must carry a non-empty planId"); }
  }
  if (view.scenarios.advisoryOnly !== true) { fail("INVALID_VIEW", "the scenarios section must be advisory-branded (advisoryOnly: true — stage 6 is never production evidence)"); }
  // (P23-B, ADR-0015 D8) The THREE advisory opportunity sections: OPTIONAL
  // by construction — present sections are validated fail-closed against
  // the pinned card shapes (a drifted card never presents); absent sections
  // stay absent (the honest not-composed notes render, never a repair).
  if ((view as { conditionalOpportunities?: unknown }).conditionalOpportunities !== undefined) {
    validateConditionalOpportunitySection((view as { conditionalOpportunities?: unknown }).conditionalOpportunities);
  }
  if ((view as { platformWork?: unknown }).platformWork !== undefined) {
    validatePlatformWorkSection((view as { platformWork?: unknown }).platformWork);
  }
  if ((view as { hypotheses?: unknown }).hypotheses !== undefined) {
    validateHypothesesSection((view as { hypotheses?: unknown }).hypotheses);
  }
  if (typeof view.presentedAt !== "string" || view.presentedAt.length === 0) { fail("INVALID_VIEW", "presentedAt must be the engine's ISO-8601 UTC evaluation instant (DATA)"); }
  // (P21-B, D4) The optional MODEL STAMP: validated fail-closed when
  // present; deliberately OUTSIDE the digest projection (the digest pins
  // the model-independent computation — see routePlanningPins.ts).
  if ((view as { modelSelection?: unknown }).modelSelection !== undefined) {
    try {
      validatePinnedModelSelection((view as { modelSelection?: unknown }).modelSelection);
    } catch {
      fail("INVALID_VIEW", "the engine view's optional modelSelection stamp must be the valid selection record { providerId, modelId, reasoningLevel }");
    }
  }
  // (P23-B, ADR-0015 D6/D9) The optional MODEL-PROPOSAL state: validated
  // fail-closed when present; deliberately OUTSIDE the digest projection
  // (the model-independent computation digest — the modelSelection precedent).
  if ((view as { modelProposals?: unknown }).modelProposals !== undefined) {
    validateModelProposalState((view as { modelProposals?: unknown }).modelProposals);
  }
  validateRoutePlanningWaitCriteria(view.waiting.proposal);
  const expected = routePlanningViewDigestOf(view);
  if (view.viewDigest !== expected) { fail("INVALID_VIEW", `the view digest must equal the deterministic digest over the view's presentation projection (expected ${expected}) — a tampered view never presents`); }
  return view;
}

/* ------------------------ the serialization -------------------------- */

/** Serialize the validated criteria into the event record (FIXED key
 * order; identical criteria → byte-identical text). The adapter's
 * 500-character transcript bound applies: an oversized serialization is
 * sliced there and the projection below discloses the truncation. */
export function serializeRoutePlanningWaitCriteria(criteria: RoutePlanningWaitCriteriaPin): string {
  return JSON.stringify(validateRoutePlanningWaitCriteria(criteria));
}

/** The WAIT_CRITERIA_RECORDED event summary prefix (the parse anchor). */
export const WAIT_CRITERIA_SUMMARY_PREFIX = "Wait criteria recorded: " as const;

/** The serialized criteria event summary (deterministic). */
export function waitCriteriaSummary(criteria: RoutePlanningWaitCriteriaPin): string {
  return `${WAIT_CRITERIA_SUMMARY_PREFIX}${serializeRoutePlanningWaitCriteria(criteria)}`;
}

/** Parse the criteria back from a recorded event summary (the round-trip
 * projection): null when absent or truncated — never a repaired guess. */
export function parseRoutePlanningWaitCriteriaSummary(summary: string): RoutePlanningWaitCriteriaPin | null {
  if (!summary.startsWith(WAIT_CRITERIA_SUMMARY_PREFIX)) { return null; }
  try {
    return validateRoutePlanningWaitCriteria(JSON.parse(summary.slice(WAIT_CRITERIA_SUMMARY_PREFIX.length)));
  } catch {
    return null; // A truncated or malformed transcript is disclosed, never repaired.
  }
}

/* -------------------------- the projections -------------------------- */

/** The honest proceed-selection projection: the LATEST recorded proceed
 * request (planId + instant), or null — chooseWait never erases it (the
 * fallback policy may reference it; the events are append-only). */
export function projectRoutePlanningProceedSelection(
  events: readonly { readonly kind: string; readonly summary: string; readonly at: string }[],
): { readonly planId: string; readonly at: string } | null {
  let selection: { planId: string; at: string } | null = null;
  for (const event of events) {
    if (event.kind === "ATTEMPT_STARTED" && event.summary.startsWith(PROCEED_SUMMARY_PREFIX)) {
      const rest = event.summary.slice(PROCEED_SUMMARY_PREFIX.length);
      const closingQuote = rest.indexOf("'");
      const planId = closingQuote === -1 ? "" : rest.slice(0, closingQuote);
      if (planId.length > 0) { selection = { planId, at: event.at }; }
    }
  }
  return selection;
}

/** The waiting-surface projection: the current status, the LAST recorded
 * criteria (parsed back; null when not recorded), the honest truncation
 * fact, and every matched opportunity id in match order. */
export function projectRoutePlanningWaiting(
  status: AgentTaskPin["status"],
  events: readonly { readonly kind: string; readonly summary: string }[],
): RoutePlanningWaitingState {
  let criteria: RoutePlanningWaitCriteriaPin | null = null;
  let truncated = false;
  const matched: string[] = [];
  for (const event of events) {
    if (event.kind === "WAIT_CRITERIA_RECORDED") {
      const parsed = parseRoutePlanningWaitCriteriaSummary(event.summary);
      truncated = parsed === null;
      criteria = parsed;
    } else if (event.kind === "OPPORTUNITY_MATCHED") {
      const idsPart = (event.summary.slice(MATCH_SUMMARY_PREFIX.length).split(" — ")[0]) ?? "";
      matched.push(...idsPart.split(", ").filter((id) => id.length > 0));
    }
  }
  return { status, criteria, criteriaRecordTruncated: truncated, matchedOpportunityIds: Object.freeze(matched) };
}

/* --------------------------- the summaries --------------------------- */

function proceedSummary(planId: string): string {
  // No authority-surface event-kind literal in the persisted prose: any
  // text-level audit scan of the record stays a CLEAN signal.
  return `${PROCEED_SUMMARY_PREFIX}${planId}' (stage 9a requested) — a REQUEST record, never an authorization: the fresh scoped approval belongs to the real authority surface, never this composer.`;
}

function previewSummary(view: RoutePlanningEngineView, task: AgentTaskPin): string {
  const stamp = task.modelSelection !== undefined
    ? ` Model ${task.modelSelection.providerId}/${task.modelSelection.modelId} (reasoning ${task.modelSelection.reasoningLevel}) recorded with the task — provenance only; the computation is deterministic and model-independent.`
    : "";
  // (P23-B, ADR-0015 D8) The preview record grows the three advisory
  // opportunity sections' counts (additive; the existing fields unchanged).
  // An absent section counts zero (the not-composed tier's honest record).
  const conditionalCount = view.conditionalOpportunities?.length ?? 0;
  const platformWorkCount = view.platformWork?.length ?? 0;
  const hypothesisCount = view.hypotheses?.length ?? 0;
  return `Route planning preview presented (routine ${view.routine.routineId} v${view.routine.routineVersion}, view ${view.viewDigest}): ${view.availableNow.ranked.length} available-now route(s), ${view.availableNow.notScored.length} retained unscored, ${view.exclusions.length} typed exclusion(s), search coverage ${view.truncation.coverage}, ${view.scenarios.outcomes.length} advisory scenario(s), ${conditionalCount} conditional opportunit${conditionalCount === 1 ? "y" : "ies"}, ${platformWorkCount} platform work item${platformWorkCount === 1 ? "" : "s"}, ${hypothesisCount} hypothes${hypothesisCount === 1 ? "is" : "es"} — discovery only, nothing dispatches.${stamp}`;
}

function matchSummaryOf(match: RoutePlanningOpportunityMatchPin): string {
  return `${MATCH_SUMMARY_PREFIX}${match.matchedOpportunityIds.join(", ")} — the task STAYS WAITING; nothing dispatches automatically (a wait match never dispatches; only cancel, expiry or a fresh approval on the authority surface moves it).`;
}

const WAIT_STARTED_SUMMARY = "Wait started — the task waits for opportunities under explicit criteria; a match will never dispatch automatically (matchAutoDispatches is the pinned literal false)." as const;
const WAIT_CANCELLED_SUMMARY = "Wait cancelled — the task returns to ACTIVE planning. Nothing was dispatched and nothing needs unwinding; the recorded wait criteria remain in the timeline." as const;
const WAIT_EXPIRED_SUMMARY = "Wait expired — the recorded criteria deadline passed and the task returns to ACTIVE planning for a fresh decision. Nothing was dispatched; the fallback is the user's recorded choice, never an automatic payment." as const;

/* ---------------------------- the session ---------------------------- */

export interface RoutePlanningSessionOptions {
  /** The composer task-session port (the ONLY mutation surface of task records). */
  readonly session: AgentTaskSessionPort;
  /** Injectable clock — ISO-8601 UTC instants (default: the ONE pinned ambient site). */
  readonly clock?: () => string;
}

export interface RoutePlanningSession {
  /** Stage 8: record PREVIEW_PRESENTED for a validated engine view (status unchanged). */
  presentChoices(taskRef: string, engineView: RoutePlanningEngineView, at?: string): Promise<AgentTaskPin>;
  /** Stage 9a: record the PROCEED REQUEST (a REQUEST — NEVER AUTHORIZATION_GRANTED). */
  chooseProceed(taskRef: string, planId: string, at?: string): Promise<AgentTaskPin>;
  /** Stage 9b: WAITING_FOR_OPPORTUNITIES + WAIT_STARTED + WAIT_CRITERIA_RECORDED (the prior proceed selection is never erased). */
  chooseWait(taskRef: string, criteria: RoutePlanningWaitCriteriaPin, at?: string): Promise<AgentTaskPin>;
  /** Record OPPORTUNITY_MATCHED — the task STAYS WAITING (status unchanged). */
  recordOpportunityMatch(taskRef: string, match: RoutePlanningOpportunityMatchPin, at?: string): Promise<AgentTaskPin>;
  /** Cancel the wait — the task returns to ACTIVE. */
  cancelWait(taskRef: string, at?: string): Promise<AgentTaskPin>;
  /** Expire the wait — the task returns to ACTIVE + WAIT_EXPIRED. */
  expireWait(taskRef: string, at?: string): Promise<AgentTaskPin>;
}

/** Create the route-planning session over the composer task-session
 * machinery. Deterministic under explicit `at` instants; fail-closed on
 * every drift; ZERO financial authority. */
export function createRoutePlanningSession(options: RoutePlanningSessionOptions): RoutePlanningSession {
  const port = options.session;
  // The controller's own pattern: the default clock is the package's ONE
  // pinned ambient site (ambientMutationClock), read once per
  // user-initiated mutation to supply the port's explicit `now`
  // argument — never a second ambient read, never displayed.
  const clock = options.clock ?? ambientMutationClock;

  const requireTask = async (taskRef: string): Promise<AgentTaskPin> => {
    if (typeof taskRef !== "string" || taskRef.length === 0) { throw new AgentTaskSessionError("INVALID_INPUT", "taskRef must be a non-empty agent task id"); }
    const task = await port.taskDetail(taskRef);
    if (task === null) { throw new AgentTaskSessionError("UNKNOWN_TASK", `no agent task exists with id '${taskRef}'`); }
    if (isTerminalAgentTaskStatusPin(task.status)) { throw new AgentTaskSessionError("TERMINAL_TASK", `task '${taskRef}' is ${task.status} — a terminal status has no lawful route-planning mutation (the monotonic-terminal law)`); }
    return task;
  };

  const requireWaiting = (task: AgentTaskPin): void => {
    if (task.status !== "WAITING_FOR_OPPORTUNITIES") {
      throw new RoutePlanningUxError("NOT_WAITING", `task '${task.id}' is ${task.status} — only a WAITING_FOR_OPPORTUNITIES task carries wait mutations (a match, a cancellation, an expiry)`);
    }
  };

  return {
    async presentChoices(taskRef, engineView, at) {
      const view = validateRoutePlanningEngineView(engineView);
      const now = at ?? clock();
      const task = await requireTask(taskRef);
      // (P21-B, D4) The presentation record carries the task's MODEL STAMP
      // (provenance only — no model authored any fact in the view).
      return port.appendTaskEvent(taskRef, "PREVIEW_PRESENTED", now, previewSummary(view, task));
    },

    async chooseProceed(taskRef, planId, at) {
      const plan = requireNonEmptyBounded(planId, "planId", PLAN_ID_MAX);
      const now = at ?? clock();
      await requireTask(taskRef);
      return port.appendTaskEvent(taskRef, "ATTEMPT_STARTED", now, proceedSummary(plan), plan);
    },

    async chooseWait(taskRef, criteria, at) {
      const validated = validateRoutePlanningWaitCriteria(criteria);
      const now = at ?? clock();
      await requireTask(taskRef);
      await port.updateTaskStatus(taskRef, "WAITING_FOR_OPPORTUNITIES", "WAIT_STARTED", now, WAIT_STARTED_SUMMARY);
      return port.appendTaskEvent(taskRef, "WAIT_CRITERIA_RECORDED", now, waitCriteriaSummary(validated), validated.waitId);
    },

    async recordOpportunityMatch(taskRef, match, at) {
      const validated = validateRoutePlanningOpportunityMatch(match);
      const now = at ?? clock();
      const task = await requireTask(taskRef);
      requireWaiting(task);
      // The status is UNCHANGED: a match records, it never moves the task.
      return port.appendTaskEvent(taskRef, "OPPORTUNITY_MATCHED", now, matchSummaryOf(validated));
    },

    async cancelWait(taskRef, at) {
      const now = at ?? clock();
      const task = await requireTask(taskRef);
      requireWaiting(task);
      return port.updateTaskStatus(taskRef, "ACTIVE", "RESUMED", now, WAIT_CANCELLED_SUMMARY);
    },

    async expireWait(taskRef, at) {
      const now = at ?? clock();
      const task = await requireTask(taskRef);
      requireWaiting(task);
      return port.updateTaskStatus(taskRef, "ACTIVE", "WAIT_EXPIRED", now, WAIT_EXPIRED_SUMMARY);
    },
  };
}
