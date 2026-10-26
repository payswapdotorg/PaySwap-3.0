/**
 * @payswap/app — the payment-missions FAKE PORT harness (P18-B; the
 * jsdom battery's in-memory mission plane).
 *
 * A small deterministic fake implementing the pinned PaymentMissionsPort
 * HONESTLY: two seeded missions (the newest-first sort is the MOUNT's to
 * prove — the fake deliberately returns them oldest-first), the canonical
 * ask order over the nine fields, capture-as-recorded (the raw text
 * answer is the captured value — the per-field typed shapes stay
 * host-side), the honest-empty-environment BLOCKED preview (the six REAL
 * gate reasons verbatim, mirrored from the desktop validation gates),
 * the fixed approval request and the granted/declined resolutions with
 * people-language timeline events. Every call is recorded in `calls`
 * (the two-act call-order law); resolveApproval is a vi.fn spy so the
 * battery can assert EXACT call arguments.
 */
import { vi } from "vitest";
import type {
  PaymentMissionsApprovalResolution,
  PaymentMissionsAttemptState,
  PaymentMissionsBoardItem,
  PaymentMissionsCompiledIntent,
  PaymentMissionsDetail,
  PaymentMissionsDirection,
  PaymentMissionsEvent,
  PaymentMissionsIntakeFields,
  PaymentMissionsPlanSelection,
  PaymentMissionsPort,
  PaymentMissionsPreview,
  PaymentMissionsStatus,
} from "../../src/agent/paymentMissionsPins.js";

/* --------------------------- the deterministic facts --------------------------- */

export const M1 = "task:PAYMENT_MISSION:a1b2c3d4";
export const M2 = "task:PAYMENT_MISSION:e5f6a7b8";

export const T0 = "2026-10-26T09:00:00Z";
export const T1 = "2026-10-26T10:00:00Z";
export const T2 = "2026-10-26T11:00:00Z";
export const T3 = "2026-10-26T12:00:00Z";
export const T4 = "2026-10-26T12:01:00Z";
export const T5 = "2026-10-26T12:06:00Z";

export const M1_PREVIEW_ID = "preview:a1b2c3d4:1";
export const M1_REQUEST_ID = "pmt-auth-req-1";
export const M1_SCOPE_DIGEST = "pmt-auth-digest:1a2b3c4d";
export const M1_SCOPE_SUMMARY =
  "Pay 2500 EUR (exact minor units) to the supplier's bank account ending ••33";

/** The six REAL honest-empty-environment gate reasons (mirrored VERBATIM from the desktop validation gates). */
export const SIX_BLOCK_REASONS = [
  "No observed funding source exists in this deployment — accounts are observations, and zero accounts are observed. A funding source is never assumed and an account fact is never invented.",
  "No connected capability instance exists in this deployment — corridor eligibility has nothing to project over. Corridor facts require connected instances with fresh observations; none are observed, so no corridor is eligible and no corridor fact is invented.",
  "No fresh quote exists for this mission — fees, rates and delivery terms are quoted facts with provenance and expiry, never invented.",
  "No declared limits exist for this corridor — minimum/maximum amounts are declared facts observed from capability restrictions, never assumed.",
  "No connected provider scope exists in this deployment — execution requires a connected capability instance whose scope carries the CREATE_EXTERNAL_EFFECT operation class; zero are connected.",
  "No policy plane is configured — policy decisions are recorded facts, and the absence of a policy decision is never treated as allowance.",
] as const;

/** The canonical ask questions (the first mirrors the REAL intake machine verbatim). */
const QUESTIONS: Readonly<Record<string, string>> = Object.freeze({
  amountAndCurrency:
    "How much should move, and in which currency? (exact amount — PaySwap works in exact money, never approximations)",
  fundingSource:
    "Which funding source should the payment leave from? (name it as you know it — it will be matched against actually observed accounts, never assumed)",
  recipient:
    "Who is the recipient? (name or reference as you know it — recipient details are verified against observations, never assumed)",
  countryCorridor:
    "Which corridor — source country, destination country and destination currency? (all three; the corridor is validated against real eligibility, never guessed)",
  speedDeadline: "By when must it arrive? (a deadline — used to derive the settlement window; no deadline is ever invented)",
  feeCap:
    "What is your fee cap — the most you will pay in fees? (an explicit cap with amount and currency, or an explicit statement that you accept uncapped fees)",
  purpose: "What is the purpose of this payment? (required for compliance records)",
  privacyCompliance: "Any privacy or compliance constraints? (state them, or explicitly say none)",
  partialPaymentPreference:
    "Can this payment be settled partially if full settlement is not possible, or must it be full? (an explicit preference either way)",
});

const FIELD_ORDER = [
  "amountAndCurrency", "fundingSource", "recipient", "countryCorridor",
  "speedDeadline", "feeCap", "purpose", "privacyCompliance", "partialPaymentPreference",
] as const;

const M2_INTENT: PaymentMissionsCompiledIntent = {
  intentId: "pmt-intent:e5f6a7b8:1",
  principalRef: "principal:operator",
  origin: { locationRef: "acct:checking:de-01", currency: "EUR", observationRef: "obs:acct:0042" },
  destination: { locationRef: "acct:savings:fr-01", currency: "EUR", observationRef: "obs:acct:0043" },
  originAmount: { currency: "EUR", minorUnits: "90000" },
  arrivalCurrency: "EUR",
  constraints: { maxSettlementMs: 86_400_000, maxRouteHops: 3 },
  intentAuthorizationRef: "intent-auth:e5f6a7b8:1",
  declaredAt: 1_771_612_800_000,
  expiresAt: 1_771_699_200_000,
  commerceRef: "savings-consolidation-2026-10",
};

const M2_PLAN: PaymentMissionsPlanSelection = {
  planId: "plan:mixed-dex-offramp",
  viewDigest: "fnv1a64:1a2b3c4d5e6f7a8b",
  routineId: "payment-route-planning",
  routineVersion: "1.0.0",
  selectedAt: T2,
};

const M2_ATTEMPTS: readonly PaymentMissionsAttemptState[] = [
  {
    attemptId: "attempt:e5f6a7b8:1",
    startedAt: T2,
    operation: "CREATE_EXTERNAL_EFFECT",
    executionMode: "SANDBOX",
    outcome: "OUTCOME_UNKNOWN",
    summary: "The sandbox attempt was started and the outcome is not yet known; reconciliation evidence will close it.",
  },
];

const M2_FIELDS: PaymentMissionsIntakeFields = Object.freeze({
  amountAndCurrency: { status: "CAPTURED", value: { currency: "EUR", minorUnits: "90000" } },
  fundingSource: { status: "CAPTURED", value: "Checking account at the local bank" },
  recipient: { status: "CAPTURED", value: "The savings wallet at the destination provider" },
  countryCorridor: {
    status: "CAPTURED",
    value: { sourceCountry: "DE", destinationCountry: "FR", destinationCurrency: "EUR" },
  },
  speedDeadline: { status: "CAPTURED", value: { deadlineAt: "2026-11-01T12:00:00Z" } },
  feeCap: { status: "CAPTURED", value: { kind: "CAPPED", amount: { currency: "EUR", minorUnits: "2500" } } },
  purpose: { status: "CAPTURED", value: "Consolidate savings" },
  privacyCompliance: { status: "CAPTURED", value: { kind: "NONE_STATED" } },
  partialPaymentPreference: { status: "CAPTURED", value: { kind: "REQUIRE_FULL" } },
} as PaymentMissionsIntakeFields);

interface FakeMission {
  readonly id: string;
  readonly direction: PaymentMissionsDirection;
  readonly goalStatement: string;
  readonly status: PaymentMissionsStatus;
  readonly createdAt: string;
  updatedAt: string;
  events: PaymentMissionsEvent[];
  fields: PaymentMissionsIntakeFields;
  intent?: PaymentMissionsCompiledIntent;
  previewId?: string;
  planSelection?: PaymentMissionsPlanSelection;
  attempts?: readonly PaymentMissionsAttemptState[];
}

function missingFields(): PaymentMissionsIntakeFields {
  const fields = {} as Record<string, { status: "MISSING" }>;
  for (const field of FIELD_ORDER) {
    fields[field] = { status: "MISSING" };
  }
  return fields as unknown as PaymentMissionsIntakeFields;
}

function event(id: string, at: string, summary: string): PaymentMissionsEvent {
  return { id, at, kind: "OPAQUE_HOST_KIND", summary };
}

/** Build the fake port (deterministic; every call recorded; resolveApproval spied). */
export function makeFakeMissionsPort() {
  const missions = new Map<string, FakeMission>();
  missions.set(M1, {
    id: M1,
    direction: "PAY",
    goalStatement: "Pay the supplier invoice INV-42",
    status: "ACTIVE",
    createdAt: T1,
    updatedAt: T2,
    events: [event("evt:a1:1", T1, "Mission created from the composer text — the guided intake starts here.")],
    fields: missingFields(),
  });
  missions.set(M2, {
    id: M2,
    direction: "MOVE",
    goalStatement: "Move funds to the savings wallet",
    status: "ACTIVE",
    createdAt: T0,
    updatedAt: T0,
    events: [event("evt:e5:1", T0, "Mission created from an entry action — the guided intake starts here.")],
    fields: M2_FIELDS,
    intent: M2_INTENT,
    previewId: "preview:e5f6a7b8:1",
    planSelection: M2_PLAN,
    attempts: M2_ATTEMPTS,
  });
  const calls: string[] = [];

  const toDetail = (mission: FakeMission): PaymentMissionsDetail => ({
    id: mission.id,
    direction: mission.direction,
    goalStatement: mission.goalStatement,
    origin: "COMPOSER_TEXT",
    status: mission.status,
    createdAt: mission.createdAt,
    updatedAt: mission.updatedAt,
    events: [...mission.events],
    fields: { ...mission.fields },
    ...(mission.intent !== undefined ? { intent: mission.intent } : {}),
    ...(mission.previewId !== undefined ? { previewId: mission.previewId } : {}),
    ...(mission.planSelection !== undefined ? { planSelection: mission.planSelection } : {}),
    ...(mission.attempts !== undefined ? { attempts: mission.attempts } : {}),
  });

  const toBoardItem = (mission: FakeMission): PaymentMissionsBoardItem => ({
    missionId: mission.id,
    direction: mission.direction,
    goalStatement: mission.goalStatement,
    status: mission.status,
    hasCompiledIntent: mission.intent !== undefined,
    hasPreview: mission.previewId !== undefined,
    ...(mission.planSelection !== undefined ? { planSelection: mission.planSelection } : {}),
    updatedAt: mission.updatedAt,
  });

  const requireMission = (missionId: string): FakeMission => {
    const mission = missions.get(missionId);
    if (mission === undefined) {
      throw new Error(`no mission '${missionId}' exists on the fake plane`);
    }
    return mission;
  };

  const resolveApproval = vi.fn(
    async (requestId: string, decision: "APPROVE" | "DECLINE"): Promise<PaymentMissionsApprovalResolution> => {
      calls.push(`resolveApproval:${requestId}:${decision}`);
      const mission = requireMission(M1);
      if (decision === "APPROVE") {
        mission.events.push(
          event("evt:a1:5", T5, "Scoped approval granted — the mission is armed; the dispatch happens host-side."),
        );
        mission.updatedAt = T5;
        return {
          outcome: "GRANTED",
          scope: {
            missionId: M1,
            direction: "PAY",
            amount: { currency: "EUR", minorUnits: "2500" },
            destinationSummary: "the supplier's bank account ending ••33",
            intentDigest: M1_SCOPE_DIGEST,
          },
          expiresAt: T5,
        };
      }
      mission.events.push(
        event("evt:a1:5", T5, "Scoped approval declined — nothing was approved and nothing moved."),
      );
      mission.updatedAt = T5;
      return {
        outcome: "DECLINED",
        reason:
          "The user declined on the preview's approval control — no approval is recorded and nothing is dispatched.",
      };
    },
  );

  const port: PaymentMissionsPort = {
    async board() {
      calls.push("board");
      // Deliberately OLDEST-first: the mount's newest-updated-first law is under test.
      return [M2, M1].map((id) => toBoardItem(requireMission(id)));
    },
    async detail(missionId) {
      calls.push(`detail:${missionId}`);
      const mission = missions.get(missionId);
      return mission === undefined ? null : toDetail(mission);
    },
    async askNextField(missionId) {
      calls.push(`askNextField:${missionId}`);
      const mission = requireMission(missionId);
      const next = FIELD_ORDER.find((field) => mission.fields[field].status === "MISSING");
      return next === undefined ? null : { fieldId: next, question: QUESTIONS[next] };
    },
    async capture(missionId, fieldId, value) {
      calls.push(`capture:${missionId}:${fieldId}`);
      const mission = requireMission(missionId);
      mission.fields = { ...mission.fields, [fieldId]: { status: "CAPTURED", value } };
      mission.events.push(event(`evt:${missionId}:cap`, T3, `Answer for ${fieldId} recorded.`));
      mission.updatedAt = T3;
      return toDetail(mission);
    },
    async presentPreview(missionId) {
      calls.push(`presentPreview:${missionId}`);
      const mission = requireMission(missionId);
      mission.previewId = M1_PREVIEW_ID;
      mission.events.push(
        event(`evt:${missionId}:preview`, T3, "Structured preview presented over the honest empty environment — the gates blocked it with every reason shown verbatim."),
      );
      mission.updatedAt = T3;
      const preview: PaymentMissionsPreview = {
        previewId: M1_PREVIEW_ID,
        missionId,
        gates: {
          decision: "BLOCK",
          decisions: SIX_BLOCK_REASONS.map((reason, index) => ({
            gate: ["ACCOUNTS", "CORRIDOR", "QUOTE", "LIMITS", "PROVIDER_SCOPES", "POLICY"][index]!,
            decision: "BLOCK" as const,
            reason,
          })),
          reasons: [...SIX_BLOCK_REASONS],
        },
        dispatchable: false,
        presentedAt: T3,
      };
      return preview;
    },
    async requestApproval(missionId) {
      calls.push(`requestApproval:${missionId}`);
      requireMission(missionId);
      return {
        requestId: M1_REQUEST_ID,
        previewId: M1_PREVIEW_ID,
        missionId,
        createdAt: T4,
        expiresAt: T5,
        scope: {
          missionId,
          direction: "PAY",
          amount: { currency: "EUR", minorUnits: "2500" },
          destinationSummary: "the supplier's bank account ending ••33",
          intentDigest: M1_SCOPE_DIGEST,
        },
        scopeSummary: M1_SCOPE_SUMMARY,
      };
    },
    resolveApproval,
  };

  return { port, calls, resolveApproval };
}
