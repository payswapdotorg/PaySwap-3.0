/**
 * The P23-C test-tier repair-operator catalogue: the 15 A.3 operators +
 * the 10 A.4 non-operator rows, frozen verbatim from the AMENDED
 * ADR-0015 appendix, with the P21 operators carrying the SAME party-change
 * proposal payloads as the P21 hardcode (conditional-stage.ts's own
 * constructions) so the byte-identity compat gate is provable.
 *
 * The REAL @payswap/opportunities catalogue (lane P23-A's
 * repair-operators.ts) carries the catalogue ROWS (ids, kinds, applicable
 * codes, party-change members, gap ids, shadowedBy); the presentation
 * payloads (titles/descriptions/assumptions) are composed at the binding
 * — the P23-B/P23-D composition adapter maps the REAL rows onto this port
 * shape, and the bridge battery proves that binding. This fixture is the
 * CONTRACT-FAITHFUL stand-in the lane's own laws are proven over (the
 * P21-lane fixture precedent).
 */

import type { RepairOperatorCataloguePort } from "../src/exclusion-repair.ts";
import type { PinnedNonOperatorClassification, PinnedRepairOperator } from "../src/pins/repairs.ts";
import { PINNED_NO_ROUTE_STATE_KEY } from "../src/pins/repairs.ts";

/** The P21 byte-compat platform-prerequisite notes (verbatim from the P21 hardcode). */
const FLW_SEND_GAP_NOTE =
  "an FLW receiving method makes the corridor real only when PaySwap implements a Flutterwave send operation and proves its exact read-back — the platform gap, distinct from the party prerequisite and from the provider's documented transfer capability (the six facts stay separate; PaySwap implements no FLW send today)";
const CROSS_PROVIDER_SHAPE_NOTE =
  "a verified intermediary makes the corridor real only when a frozen route shape composes the cross-provider pair — the cross-provider-corridor shape is DELIVERED (P22-C/P22-D, ADR-0016 D5/D12) and composes over the OBSERVED onchain middle; the residual gap is the unobserved middle, never a missing vocabulary";

/** The 15 frozen operators (A.3, amended) with full proposal payloads. */
export const FIXTURE_REPAIR_OPERATORS = ([
  Object.freeze({
    operatorId: "repair:recipient-enables-flw-receiving-method",
    kind: "PARTY_CHANGE",
    applicableExclusionCodes: Object.freeze(["FUNDING_METHOD_NOT_SERVED"]),
    sideConditions: Object.freeze([{ kind: "P21_FLW_WALLET_FUNDING_PATTERN" }]),
    partyChangeProposal: Object.freeze({
      party: "RECIPIENT",
      change: "ENABLES_FLUTTERWAVE_RECEIVING_METHOD",
      title: "the recipient enables an eligible Flutterwave receiving method",
      description: "the corridor does not compose today: {facts} — the conditional route exists only when the recipient enables a Flutterwave receiving method that serves this funding method",
      assumptions: Object.freeze([
        "the recipient enables a Flutterwave receiving method that serves this corridor's funding method",
        "the sender's Flutterwave connection remains an eligible funding rail for the corridor",
      ]),
      platformPrerequisites: Object.freeze([{ gapId: "platform:flutterwave-send-operation", note: FLW_SEND_GAP_NOTE }]),
    }),
    platformWorkProposal: Object.freeze({ gapId: "platform:flutterwave-send-operation", title: "a Flutterwave send operation" }),
  }),
  Object.freeze({
    operatorId: "repair:sender-adds-stripe-compatible-instrument",
    kind: "PARTY_CHANGE",
    applicableExclusionCodes: Object.freeze(["FUNDING_METHOD_NOT_SERVED"]),
    sideConditions: Object.freeze([{ kind: "P21_FLW_WALLET_FUNDING_PATTERN" }, { kind: "STRIPE_RECEIVING_RAIL" }]),
    partyChangeProposal: Object.freeze({
      party: "SENDER",
      change: "ADDS_STRIPE_COMPATIBLE_INSTRUMENT",
      title: "the sender adds a genuinely supported Stripe-compatible payment instrument",
      description: "the corridor does not compose today: {facts} — the conditional route exists only when the sender funds it with an instrument the receiving rail's restriction sets genuinely serve",
      assumptions: Object.freeze([
        "the sender adds a payment instrument the receiving rail's restriction sets genuinely serve (a Stripe-compatible funding method)",
        "the receiving rail's restriction sets continue to serve the corridor's destination and payout dimensions",
      ]),
      platformPrerequisites: Object.freeze([]),
    }),
  }),
  Object.freeze({
    operatorId: "repair:recipient-enables-served-funding-method",
    kind: "PARTY_CHANGE",
    applicableExclusionCodes: Object.freeze(["FUNDING_METHOD_NOT_SERVED"]),
    sideConditions: Object.freeze([{ kind: "ANY_RECEIVING_RAIL" }]),
    shadowedBy: Object.freeze(["repair:recipient-enables-flw-receiving-method"]),
    partyChangeProposal: Object.freeze({
      party: "RECIPIENT",
      change: "ENABLES_COMPATIBLE_RECEIVING_METHOD",
      title: "the recipient enables a receiving method the corridor already serves",
      description: "the corridor does not compose today: {facts} — the conditional route exists only when the recipient enables a receiving method inside the served set",
      assumptions: Object.freeze(["the recipient enables a receiving method the corridor's served set already names"]),
      platformPrerequisites: Object.freeze([]),
    }),
  }),
  Object.freeze({
    operatorId: "repair:sender-adds-served-funding-instrument",
    kind: "PARTY_CHANGE",
    applicableExclusionCodes: Object.freeze(["FUNDING_METHOD_NOT_SERVED"]),
    sideConditions: Object.freeze([{ kind: "ANY_RECEIVING_RAIL" }]),
    shadowedBy: Object.freeze(["repair:sender-adds-stripe-compatible-instrument"]),
    partyChangeProposal: Object.freeze({
      party: "SENDER",
      change: "ADDS_COMPATIBLE_FUNDING_INSTRUMENT",
      title: "the sender adds a funding instrument the receiving rail serves",
      description: "the corridor does not compose today: {facts} — the conditional route exists only when the sender funds it with an instrument the receiving rail's served set names",
      assumptions: Object.freeze(["the sender adds a funding instrument the receiving rail's served set already names"]),
      platformPrerequisites: Object.freeze([]),
    }),
  }),
  Object.freeze({
    operatorId: "repair:recipient-enables-served-payout-method",
    kind: "PARTY_CHANGE",
    applicableExclusionCodes: Object.freeze(["PAYOUT_METHOD_NOT_SERVED"]),
    partyChangeProposal: Object.freeze({
      party: "RECIPIENT",
      change: "ENABLES_COMPATIBLE_RECEIVING_METHOD",
      title: "the recipient enables a payout method the corridor already serves",
      description: "the corridor does not compose today: {facts} — the conditional route exists only when the recipient enables a payout method inside the served set",
      assumptions: Object.freeze(["the recipient enables a payout method the corridor's served set already names"]),
      platformPrerequisites: Object.freeze([]),
    }),
  }),
  Object.freeze({
    operatorId: "repair:sender-completes-provider-permissions",
    kind: "PARTY_CHANGE",
    applicableExclusionCodes: Object.freeze(["AUTHORIZATION_NOT_ACTIVE", "MISSING_PERMISSIONS"]),
    partyChangeProposal: Object.freeze({
      party: "SENDER",
      change: "COMPLETES_PROVIDER_PERMISSIONS",
      title: "the sender completes the provider permissions",
      description: "the corridor does not compose today: {facts} — the conditional route exists only when the credential's permission state serves the operation",
      assumptions: Object.freeze(["the sender's credential gains the permissions the exclusion names"]),
      platformPrerequisites: Object.freeze([]),
    }),
  }),
  Object.freeze({
    operatorId: "repair:intermediary-introduced",
    kind: "MULTI_HOP",
    applicableExclusionCodes: Object.freeze([]),
    sideConditions: Object.freeze([{ kind: "NO_ROUTE_STATE" }]),
    partyChangeProposal: Object.freeze({
      party: "THIRD_PARTY",
      change: "INTERMEDIARY_INTRODUCED",
      title: "a verified intermediary is introduced",
      description: "no route composes across the corridor's two sides — the conditional route exists only when a verified intermediary bridges the sender's funding rail and the merchant's receiving context",
      assumptions: Object.freeze([
        "a verified intermediary is introduced whose rails bridge the sender's funding rail and the merchant's receiving context",
        "the intermediary's participation is evidenced (a connected instance with observations), never assumed",
      ]),
      platformPrerequisites: Object.freeze([{ gapId: "platform:cross-provider-route-shape", note: CROSS_PROVIDER_SHAPE_NOTE }]),
    }),
    hypothesisProposal: Object.freeze({
      augmentationKind: "ADD_ASSUMED_RAIL",
      assumptionSummary: "a verified intermediary rail bridges the sender's funding rail and the merchant's receiving context",
    }),
  }),
  Object.freeze({
    operatorId: "repair:convert-through-supported-asset",
    kind: "MULTI_HOP",
    applicableExclusionCodes: Object.freeze(["DESTINATION_CURRENCY_NOT_SUPPORTED", "SOURCE_CURRENCY_NOT_SUPPORTED"]),
    hypothesisProposal: Object.freeze({
      augmentationKind: "ADD_ASSUMED_CONVERSION_ASSET",
      assumptionSummary: "the corridor converts through an asset the served sets already support",
    }),
  }),
  Object.freeze({
    operatorId: "repair:bridge-via-intermediary-rail",
    kind: "MULTI_HOP",
    applicableExclusionCodes: Object.freeze(["DESTINATION_COUNTRY_NOT_SERVED", "SOURCE_COUNTRY_NOT_SERVED"]),
    sideConditions: Object.freeze([{ kind: "NO_ROUTE_STATE" }]),
    hypothesisProposal: Object.freeze({
      augmentationKind: "ADD_ASSUMED_RAIL",
      assumptionSummary: "an intermediary rail bridges the unserved country pair",
    }),
  }),
  Object.freeze({
    operatorId: "repair:split-below-maximum",
    kind: "MULTI_HOP",
    applicableExclusionCodes: Object.freeze(["AMOUNT_ABOVE_MAXIMUM"]),
    hypothesisProposal: Object.freeze({
      augmentationKind: "ADD_ASSUMED_CONNECTOR_OPERATION",
      assumptionSummary: "the payment splits below the rail's declared maximum",
      operationKind: "split-transfer",
    }),
  }),
  Object.freeze({
    operatorId: "platform:connector-operation",
    kind: "PLATFORM_WORK",
    applicableExclusionCodes: Object.freeze(["IMPLEMENTATION_SCOPE_NOT_SERVED", "INSTANCE_INELIGIBLE", "NOT_EXECUTABLE_CAPABILITY"]),
    platformWorkProposal: Object.freeze({ gapId: "platform:connector-operation", title: "a connector operation the corridor's rails require" }),
  }),
  Object.freeze({
    operatorId: "platform:provider-integration",
    kind: "PLATFORM_WORK",
    applicableExclusionCodes: Object.freeze([
      "CUSTOMER_TYPE_NOT_SERVED",
      "DESTINATION_COUNTRY_NOT_SERVED",
      "DESTINATION_CURRENCY_NOT_SUPPORTED",
      "INSTANCE_CURRENCY_NOT_SUPPORTED",
      "INSTANCE_GEOGRAPHY_NOT_SERVED",
      "RECIPIENT_TYPE_NOT_SERVED",
      "SOURCE_COUNTRY_NOT_SERVED",
      "SOURCE_CURRENCY_NOT_SUPPORTED",
    ]),
    platformWorkProposal: Object.freeze({ gapId: "platform:provider-integration", title: "a provider integration serving the corridor's served-set gaps" }),
  }),
  Object.freeze({
    operatorId: "platform:permission-model",
    kind: "PLATFORM_WORK",
    applicableExclusionCodes: Object.freeze(["MISSING_PERMISSIONS"]),
    platformWorkProposal: Object.freeze({ gapId: "platform:permission-model", title: "a credential permission model that can express the required grant" }),
  }),
  Object.freeze({
    operatorId: "platform:cross-provider-route-shape",
    kind: "PLATFORM_WORK",
    applicableExclusionCodes: Object.freeze([]),
    sideConditions: Object.freeze([{ kind: "NO_ROUTE_STATE" }]),
    platformWorkProposal: Object.freeze({ gapId: "platform:cross-provider-route-shape", title: "a frozen route shape composing the cross-provider pair" }),
  }),
  Object.freeze({
    operatorId: "platform:flutterwave-send-operation",
    kind: "PLATFORM_WORK",
    applicableExclusionCodes: Object.freeze([]),
    sideConditions: Object.freeze([{ kind: "NO_ROUTE_STATE" }, { kind: "FLW_PROVIDER_RAIL" }]),
    platformWorkProposal: Object.freeze({ gapId: "platform:flutterwave-send-operation", title: "a Flutterwave send operation" }),
  }),
] as unknown as readonly PinnedRepairOperator[]);

/** The 10 frozen non-operator rows (A.4, amended): code -> classification. */
const NON_OPERATOR_ROWS: Readonly<Record<string, PinnedNonOperatorClassification>> = Object.freeze({
  STALE_OBSERVATION: { classification: "RECHECK", reason: "a stale observation is a recheck trigger — fresh observations first, never a repair card" },
  AVAILABILITY_UNKNOWN: { classification: "RECHECK", reason: "an unknown availability is a recheck trigger — the observation plane answers it, never a repair" },
  OBSERVATION_ELIGIBILITY_UNKNOWN: { classification: "RECHECK", reason: "an unknown observation eligibility is a recheck trigger" },
  OBSERVATION_NOT_ELIGIBLE: { classification: "RECHECK", reason: "an ineligible observation is a recheck trigger — the observation must be re-derived" },
  AVAILABILITY_UNAVAILABLE: { classification: "WAIT", reason: "a temporarily unavailable rail is a wait trigger — bounded in time, never a repair card" },
  QUOTA_EXHAUSTED: { classification: "WAIT", reason: "an exhausted quota is a wait trigger — bounded in time" },
  CUTOFF_PASSED: { classification: "WAIT", reason: "a passed scheme cutoff is a wait trigger — the next window" },
  AMOUNT_BELOW_MINIMUM: { classification: "WAIT", reason: "an amount below the rail's minimum is a wait trigger — the user revises the amount" },
  MISSING_REQUIRED_FIELDS: { classification: "INTAKE_ASK_LOOP", reason: "missing recipient fields belong to the deterministic intake ask loop, never a repair" },
  AMOUNT_CURRENCY_MISMATCH: { classification: "REVISE_PATH", reason: "a currency mismatch belongs to the revise path, never a repair" },
});

/** The full test-tier catalogue port (the A.3/A.4 semantics). */
export function fixtureRepairCatalogue(): RepairOperatorCataloguePort {
  return {
    operatorsFor(code: string): readonly PinnedRepairOperator[] {
      if (code === PINNED_NO_ROUTE_STATE_KEY) {
        return FIXTURE_REPAIR_OPERATORS.filter(
          (operator) => operator.sideConditions?.some((condition) => condition.kind === "NO_ROUTE_STATE") === true,
        );
      }
      return FIXTURE_REPAIR_OPERATORS.filter(
        (operator) => (operator.applicableExclusionCodes as readonly string[]).includes(code),
      );
    },
    classificationOf(code: string): PinnedNonOperatorClassification | null {
      return NON_OPERATOR_ROWS[code] ?? null;
    },
  };
}
