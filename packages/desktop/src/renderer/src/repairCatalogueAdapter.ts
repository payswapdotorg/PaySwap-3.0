/**
 * PaySwap Desktop renderer (P23-B, lane B; ADR-0015 D2/D9a) — the REPAIR
 * CATALOGUE + CONDITIONAL CONSTRUCTION adapter: the composition module
 * that binds the REAL @payswap/opportunities repair-operator catalogue
 * (lane P23-A's REPAIR_OPERATORS + the A.4 non-operator rows) onto
 * route-planning's pinned RepairOperatorCataloguePort, and the REAL
 * conditional-opportunity construction machinery (discoverOpportunity +
 * publishConditionalOpportunity) onto the pinned
 * ConditionalOpportunityConstructionPort.
 *
 * IMPORT TIER (the established alias-triplet law): this module imports the
 * REAL @payswap/opportunities and @payswap/route-planning sources through
 * the three-site aliases (tsconfig.renderer.json paths + vite resolve.alias
 * + vitest resolve.alias) — the routePlanningEngineAdapter.ts /
 * waitRecheckComposition.ts precedents, extended by ADR-0015 D9 ("the
 * @payswap/opportunities machinery via the established alias triplet").
 * NO other renderer file may follow.
 *
 * THE PRESENTATION-PAYLOAD LAW (ADR-0015 D2 + the P23-C precedent): the
 * REAL catalogue rows carry ids/kinds/codes/party-change members/gap ids/
 * shadowedBy/evidenceLaw but NOT the presentation payloads — this adapter
 * enriches each row following route-planning's test/repair-catalogue
 * -fixture.ts EXACTLY: the P21 operators' titles/descriptions/assumptions/
 * platformPrerequisites match the P21 hardcode (conditional-stage.ts)
 * BYTE-FOR-BYTE (the D3 compat gate), and every description's literal
 * `{facts}` token is substituted by the derivation with the cited facts'
 * verbatim messages (never invented text). The non-operator
 * classifications map from the lane-A rows (RECHECK_TRIGGER → RECHECK,
 * WAIT_TRIGGER → WAIT, INTAKE_ASK → INTAKE_ASK_LOOP, REVISE_PATH →
 * REVISE_PATH — the lane-C pin vocabulary).
 *
 * ZERO AUTHORITY: everything here is advisory data mapping — a repair
 * operator is a typed repair candidate, never a command, never an
 * authorization (permitsExecution is the literal false on every row).
 */

import {
  NON_OPERATOR_CLASSIFICATIONS,
  REPAIR_OPERATORS,
  discoverOpportunity,
  publishConditionalOpportunity,
  repairOperatorById,
  type ConditionalPublicationInput,
  type FinancialOpportunity,
  type OpportunityObservationInput,
  type RepairOperator,
} from "@payswap/opportunities";
import {
  PINNED_NO_ROUTE_STATE_KEY,
  type ConditionalConstructionRequest,
  type ConditionalOpportunityConstructionPort,
  type RepairOperatorCataloguePort,
} from "@payswap/route-planning";
import type {
  PinnedConditionalOpportunity,
  PinnedNonOperatorClassification,
  PinnedRepairOperator,
  PinnedRepairSideCondition,
} from "@payswap/route-planning";

/* ---------------- the frozen presentation payloads (the fixture precedent) ---------------- */

/** The P21 byte-compat platform-prerequisite notes (verbatim from the P21 hardcode, conditional-stage.ts). */
const FLW_SEND_GAP_NOTE =
  "an FLW receiving method makes the corridor real only when a Flutterwave send operation exists in the capability model — the platform gap, distinct from the party prerequisite (P21 implements no FLW send; ADR-0014 D7)";
const CROSS_PROVIDER_SHAPE_NOTE =
  "a verified intermediary makes the corridor real only when a frozen route shape composes the cross-provider pair — a governance-level vocabulary change, never manufactured this wave (ADR-0014 D7)";
/**
 * THE CROSS-KIND PRECEDENT (frozen, ADR-0015 D3): the P21 intermediary
 * operator — kind MULTI_HOP with no row-level partyChange — also carries
 * the P21 party-change conditional (the P21 hardcode's third conditional).
 * No other operator may carry a proposal its REAL row does not declare.
 */
const CROSS_KIND_PARTY_CHANGE_OPERATORS: readonly string[] = Object.freeze(["repair:intermediary-introduced"]);

/** The per-operator presentation payloads + side conditions (the repair-catalogue-fixture.ts precedent, byte-for-byte). */
interface OperatorPresentation {
  readonly sideConditions?: readonly PinnedRepairSideCondition[];
  readonly partyChangeProposal?: {
    readonly party: "SENDER" | "RECIPIENT" | "THIRD_PARTY";
    readonly change: string;
    readonly title: string;
    readonly description: string;
    readonly assumptions: readonly string[];
    readonly platformPrerequisites: readonly { readonly gapId: string; readonly note: string }[];
  };
  readonly platformWorkProposal?: { readonly gapId: string; readonly title: string };
  readonly hypothesisProposal?: {
    readonly augmentationKind: "ADD_ASSUMED_RAIL" | "ADD_ASSUMED_CONVERSION_ASSET" | "ADD_ASSUMED_CONNECTOR_OPERATION";
    readonly assumptionSummary: string;
    readonly operationKind?: string;
  };
}

const OPERATOR_PRESENTATIONS: Readonly<Record<string, OperatorPresentation>> = Object.freeze({
  "repair:recipient-enables-flw-receiving-method": Object.freeze({
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
    // NO platformWorkProposal here: the REAL lane-A row is a PARTY_CHANGE
    // operator with no platformGap — the flutterwave-send-operation GAP is
    // carried by its own state-keyed platform operator below (the cross-check
    // law: the payload never invents a platform gap the catalogue row does not
    // declare; the party-change card keeps the prerequisite NOTE, the P21
    // hardcode semantics).
  }),
  "repair:sender-adds-stripe-compatible-instrument": Object.freeze({
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
  "repair:recipient-enables-served-funding-method": Object.freeze({
    sideConditions: Object.freeze([{ kind: "ANY_RECEIVING_RAIL" }]),
    partyChangeProposal: Object.freeze({
      party: "RECIPIENT",
      change: "ENABLES_COMPATIBLE_RECEIVING_METHOD",
      title: "the recipient enables a receiving method the corridor already serves",
      description: "the corridor does not compose today: {facts} — the conditional route exists only when the recipient enables a receiving method inside the served set",
      assumptions: Object.freeze(["the recipient enables a receiving method the corridor's served set already names"]),
      platformPrerequisites: Object.freeze([]),
    }),
  }),
  "repair:sender-adds-served-funding-instrument": Object.freeze({
    sideConditions: Object.freeze([{ kind: "ANY_RECEIVING_RAIL" }]),
    partyChangeProposal: Object.freeze({
      party: "SENDER",
      change: "ADDS_COMPATIBLE_FUNDING_INSTRUMENT",
      title: "the sender adds a funding instrument the receiving rail serves",
      description: "the corridor does not compose today: {facts} — the conditional route exists only when the sender funds it with an instrument the receiving rail's served set names",
      assumptions: Object.freeze(["the sender adds a funding instrument the receiving rail's served set already names"]),
      platformPrerequisites: Object.freeze([]),
    }),
  }),
  "repair:recipient-enables-served-payout-method": Object.freeze({
    partyChangeProposal: Object.freeze({
      party: "RECIPIENT",
      change: "ENABLES_COMPATIBLE_RECEIVING_METHOD",
      title: "the recipient enables a payout method the corridor already serves",
      description: "the corridor does not compose today: {facts} — the conditional route exists only when the recipient enables a payout method inside the served set",
      assumptions: Object.freeze(["the recipient enables a payout method the corridor's served set already names"]),
      platformPrerequisites: Object.freeze([]),
    }),
  }),
  "repair:sender-completes-provider-permissions": Object.freeze({
    partyChangeProposal: Object.freeze({
      party: "SENDER",
      change: "COMPLETES_PROVIDER_PERMISSIONS",
      title: "the sender completes the provider permissions",
      description: "the corridor does not compose today: {facts} — the conditional route exists only when the credential's permission state serves the operation",
      assumptions: Object.freeze(["the sender's credential gains the permissions the exclusion names"]),
      platformPrerequisites: Object.freeze([]),
    }),
  }),
  "repair:intermediary-introduced": Object.freeze({
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
  "repair:convert-through-supported-asset": Object.freeze({
    hypothesisProposal: Object.freeze({
      augmentationKind: "ADD_ASSUMED_CONVERSION_ASSET",
      assumptionSummary: "the corridor converts through an asset the served sets already support",
    }),
  }),
  "repair:bridge-via-intermediary-rail": Object.freeze({
    sideConditions: Object.freeze([{ kind: "NO_ROUTE_STATE" }]),
    hypothesisProposal: Object.freeze({
      augmentationKind: "ADD_ASSUMED_RAIL",
      assumptionSummary: "an intermediary rail bridges the unserved country pair",
    }),
  }),
  "repair:split-below-maximum": Object.freeze({
    hypothesisProposal: Object.freeze({
      augmentationKind: "ADD_ASSUMED_CONNECTOR_OPERATION",
      assumptionSummary: "the payment splits below the rail's declared maximum",
      operationKind: "split-transfer",
    }),
  }),
  "platform:connector-operation": Object.freeze({
    platformWorkProposal: Object.freeze({ gapId: "platform:connector-operation", title: "a connector operation the corridor's rails require" }),
  }),
  "platform:provider-integration": Object.freeze({
    platformWorkProposal: Object.freeze({ gapId: "platform:provider-integration", title: "a provider integration serving the corridor's served-set gaps" }),
  }),
  "platform:permission-model": Object.freeze({
    platformWorkProposal: Object.freeze({ gapId: "platform:permission-model", title: "a credential permission model that can express the required grant" }),
  }),
  "platform:cross-provider-route-shape": Object.freeze({
    sideConditions: Object.freeze([{ kind: "NO_ROUTE_STATE" }]),
    platformWorkProposal: Object.freeze({ gapId: "platform:cross-provider-route-shape", title: "a frozen route shape composing the cross-provider pair" }),
  }),
  "platform:flutterwave-send-operation": Object.freeze({
    sideConditions: Object.freeze([{ kind: "NO_ROUTE_STATE" }, { kind: "FLW_PROVIDER_RAIL" }]),
    platformWorkProposal: Object.freeze({ gapId: "platform:flutterwave-send-operation", title: "a Flutterwave send operation" }),
  }),
});

/** The lane-A → lane-C non-operator classification-kind mapping (the pin vocabulary). */
const CLASSIFICATION_KIND_MAP: Readonly<Record<string, PinnedNonOperatorClassification["classification"]>> = Object.freeze({
  RECHECK_TRIGGER: "RECHECK",
  WAIT_TRIGGER: "WAIT",
  INTAKE_ASK: "INTAKE_ASK_LOOP",
  REVISE_PATH: "REVISE_PATH",
});

/** Enrich one REAL catalogue row with its presentation payload (fail-closed on drift). */
function enrichOperator(row: RepairOperator): PinnedRepairOperator {
  const presentation = OPERATOR_PRESENTATIONS[row.operatorId];
  if (presentation === undefined) {
    throw new Error(
      `the repair-catalogue adapter has no presentation payload for operator '${row.operatorId}' — the composition never fabricates a repair proposal (grow the adapter table with the lane-A row)`,
    );
  }
  // The cross-checked members: the REAL row's party change and platform gap
  // must AGREE with the adapter's payload (a drifted catalogue never composes).
  // THE CROSS-KIND PRECEDENT (frozen): the P21 `repair:intermediary-introduced`
  // operator (kind MULTI_HOP, no row-level partyChange) ALSO carries the P21
  // party-change conditional — the ADR-0015 D3 byte-compat law (the P21
  // hardcode's third conditional is THIRD_PARTY:INTERMEDIARY_INTRODUCED). No
  // other operator may carry a proposal its row does not declare.
  if (
    presentation.partyChangeProposal !== undefined &&
    row.partyChange === undefined &&
    !CROSS_KIND_PARTY_CHANGE_OPERATORS.includes(row.operatorId)
  ) {
    throw new Error(
      `the presentation payload carries a party change for operator '${row.operatorId}' whose REAL catalogue row declares none — a lying adapter never composes (the only cross-kind precedent is ${CROSS_KIND_PARTY_CHANGE_OPERATORS.join(", ")})`,
    );
  }
  if (presentation.partyChangeProposal !== undefined && row.partyChange !== undefined && presentation.partyChangeProposal.change !== row.partyChange) {
    throw new Error(
      `the presentation payload's party change '${presentation.partyChangeProposal.change}' disagrees with the REAL catalogue row's '${String(row.partyChange)}' for operator '${row.operatorId}' — a lying adapter never composes`,
    );
  }
  if (presentation.platformWorkProposal !== undefined && presentation.platformWorkProposal.gapId !== row.platformGap) {
    throw new Error(
      `the presentation payload's platform gap '${presentation.platformWorkProposal.gapId}' disagrees with the REAL catalogue row's '${String(row.platformGap)}' for operator '${row.operatorId}' — a lying adapter never composes`,
    );
  }
  return Object.freeze({
    operatorId: row.operatorId,
    kind: row.kind,
    applicableExclusionCodes: Object.freeze([...row.applicableExclusionCodes]),
    ...(row.shadowedBy !== undefined ? { shadowedBy: Object.freeze([row.shadowedBy]) } : {}),
    ...(presentation.sideConditions !== undefined ? { sideConditions: Object.freeze([...presentation.sideConditions]) } : {}),
    ...(presentation.partyChangeProposal !== undefined ? { partyChangeProposal: Object.freeze({ ...presentation.partyChangeProposal }) } : {}),
    ...(presentation.platformWorkProposal !== undefined ? { platformWorkProposal: Object.freeze({ ...presentation.platformWorkProposal }) } : {}),
    ...(presentation.hypothesisProposal !== undefined ? { hypothesisProposal: Object.freeze({ ...presentation.hypothesisProposal }) } : {}),
  }) as unknown as PinnedRepairOperator;
}

/** The enriched catalogue (computed once per document; the REAL rows + the presentation payloads). */
let enrichedCache: readonly PinnedRepairOperator[] | undefined;

function enrichedOperators(): readonly PinnedRepairOperator[] {
  enrichedCache ??= Object.freeze((REPAIR_OPERATORS as readonly RepairOperator[]).map(enrichOperator));
  return enrichedCache;
}

/**
 * THE catalogue adapter: the REAL @payswap/opportunities repair-operator
 * catalogue (lane A) bound onto route-planning's pinned
 * RepairOperatorCataloguePort with the presentation payloads. The
 * `operatorsFor(NO_ROUTE_STATE)` lookup answers the state-keyed rows (the
 * pinned corridor-state key, never an exclusion code); every other code
 * answers the rows whose applicable set carries it. Deterministic and
 * total over the pinned 26 codes (the lane-A totality law).
 */
export function realRepairOperatorCatalogue(): RepairOperatorCataloguePort {
  return {
    operatorsFor(code: string): readonly PinnedRepairOperator[] {
      if (code === PINNED_NO_ROUTE_STATE_KEY) {
        return enrichedOperators().filter(
          (operator) => operator.sideConditions?.some((condition) => condition.kind === "NO_ROUTE_STATE") === true,
        );
      }
      return enrichedOperators().filter(
        (operator) => (operator.applicableExclusionCodes as readonly string[]).includes(code),
      );
    },
    classificationOf(code: string): PinnedNonOperatorClassification | null {
      const row = NON_OPERATOR_CLASSIFICATIONS.find((entry) => entry.code === code);
      if (row === undefined) {
        return null;
      }
      const classification = CLASSIFICATION_KIND_MAP[row.classification];
      if (classification === undefined) {
        throw new Error(
          `the lane-A non-operator classification kind '${row.classification}' has no lane-C pin mapping — the adapter never guesses (grow CLASSIFICATION_KIND_MAP with the lane-A row)`,
        );
      }
      return { classification, reason: row.reason };
    },
  };
}

/** Test/inspection helper: the enriched row for one operator id (null when the catalogue has no such row). */
export function enrichedRepairOperatorById(operatorId: string): PinnedRepairOperator | null {
  if (repairOperatorById(operatorId) === null) {
    return null;
  }
  return enrichedOperators().find((operator) => operator.operatorId === operatorId) ?? null;
}

/* ---------------- the REAL conditional construction port ---------------- */

/**
 * THE REAL conditional-opportunity construction port (the composition-root
 * adapter over the REAL @payswap/opportunities machinery — the
 * no-route-fixtures.ts realConditionalOpportunityPort pattern, composed at
 * the renderer): maps one derivation construction request onto
 * `discoverOpportunity` (the honest UNKNOWN-heavy corridor opportunity over
 * the grounding observation) then `publishConditionalOpportunity` (the
 * Part-1 constructor). This is the only place the REAL opportunities
 * construction engines bind renderer-side.
 */
export function realConditionalOpportunityPort(): ConditionalOpportunityConstructionPort {
  return {
    construct(request: ConditionalConstructionRequest): PinnedConditionalOpportunity {
      // The derivation always supplies a non-empty grounding chain (validated fail-closed before the port is called).
      const primary = request.groundingEvidence[0]!;
      const observation: OpportunityObservationInput = {
        family: request.family,
        observationId: primary.observationId,
        observationVersion: primary.version,
        venueId: primary.venueId,
        railKind: request.railKind,
        railKey: request.railKey,
        adapterId: primary.adapterId,
        observerId: primary.observerId,
        freshness: primary.freshness,
        evidenceRefs: [...primary.evidenceRefs],
        title: request.title,
        description: request.description,
        exitPath: {
          status: "UNKNOWN" as const,
          description: "the exit path is not observed until the party change makes the corridor real",
          constraints: [],
        },
        lockUp: { locked: false, durationMs: null, unlockConditions: [] },
        smartContractRisk: {
          level: "UNKNOWN" as const,
          audited: null,
          summary: "no contract risk was observed for a corridor that does not yet compose",
        },
        oracleBridgeRisk: {
          level: "UNKNOWN" as const,
          audited: null,
          summary: "no oracle or bridge dependency was observed for a corridor that does not yet compose",
        },
        returnComponents: [
          {
            componentId: "p23:corridor:composition-gap",
            kind: "INCENTIVE_YIELD" as const,
            ratePerYear: { numerator: "0", denominator: "1" },
            evidenceVerified: false,
            description:
              "no return is observed for a corridor that does not compose — the zero-rate unverified component records the composition gap the conditional names (the estimate stays UNKNOWN)",
          },
        ],
      };
      const opportunity: FinancialOpportunity = discoverOpportunity(observation, request.at);
      const input: ConditionalPublicationInput = {
        optIn: request.optIn,
        expiresAt: request.expiresAt,
        requiredPartyChanges: request.requiredPartyChanges as never,
        assumptions: [...request.assumptions],
        platformPrerequisites: request.platformPrerequisites.map((prerequisite) => ({ ...prerequisite })),
        groundingEvidence: request.groundingEvidence as never,
        disclosureScope: { fields: [...request.disclosureScope.fields], purpose: request.disclosureScope.purpose },
      };
      return publishConditionalOpportunity(opportunity, input, request.at) as unknown as PinnedConditionalOpportunity;
    },
  };
}
