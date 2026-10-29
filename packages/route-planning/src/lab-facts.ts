/**
 * @payswap/route-planning — the stage-6 REAL-facts path (P23-C, lane C;
 * ADR-0015 D9c + D13): the Lab recorded-production facts derived from the
 * rail snapshots' REAL rail records, and the derived repair set mapped
 * onto the EXISTING Lab intervention kinds (NO Lab vocabulary change).
 *
 * HONEST MAPPING LAWS:
 * - every simulated rail NAMES a REAL rail snapshot record (railId = the
 *   routeId); the per-rail simulation economics (latency, fees) are
 *   CALLER-SUPPLIED and REQUIRED per rail — the snapshots carry no fee or
 *   latency observations, and fabricating them would violate the evidence
 *   law (INV-07). A rail record without declared economics fails closed
 *   naming the routeId (never silently dropped, never invented).
 * - pools, demands and incidents are ALWAYS the honest empty sets: the
 *   rail snapshots carry no liquidity-pool or demand observations, and
 *   none are ever fabricated.
 * - the output is the Lab `recordProductionFacts` INPUT projection plus
 *   THIS package's value-form digest: the Lab's own namespaced
 *   factsDigest (labfnv1a64) is derived by the REAL recordProductionFacts
 *   at the binding (the test tier / the composition root) — src never
 *   re-derives a foreign flavor (ADR-0009 D4).
 * - the repair→intervention mapping uses ONLY the EXISTING Lab kinds
 *   (ADR-0015 D13): an assumed rail -> RAIL_ADDED; an intermediary ->
 *   THIRD_PARTY_NODE_JOINS (role "intermediary"); a conversion asset ->
 *   RAIL_ADDED (the asset's rail, labeled); a connector operation ->
 *   RAIL_ADDED. The assumed elements' simulation economics are
 *   caller-supplied parameters (advisory simulation, never real claims).
 */

import { RoutePlanningError } from "./errors.ts";
import { contentDigest, deepFreeze, isNonEmptyString, isRecord, requireObject, sortedBy } from "./canonical.ts";
import type { EligibleRailSnapshot } from "./rail-snapshot.ts";
import {
  PINNED_INTERVENTION_KINDS,
  PINNED_THIRD_PARTY_NODE_ROLES,
  type PinnedRecordedDemandFact,
  type PinnedRecordedIncidentFact,
  type PinnedSimulatedLiquidityPool,
  type PinnedSimulatedRail,
} from "./lab-adapter.ts";
import { PINNED_INTERMEDIARY_OPERATOR_IDS } from "./pins/repairs.ts";
import type { ExclusionRepairDerivation } from "./exclusion-repair.ts";

/** A real-facts derivation violated the honest-mapping laws. */
export class LabFactsError extends RoutePlanningError {
  constructor(message: string, details?: unknown) {
    super(message, "LAB_FACTS_DERIVATION_FAILED", details);
    this.name = "LabFactsError";
  }
}

/** The caller-supplied simulation economics for ONE REAL rail record (never fabricated). */
export interface SnapshotRailEconomics {
  readonly routeId: string;
  readonly latencyMs: number;
  readonly fixedFeeMinor: bigint;
  readonly variableFeeBps: bigint;
  readonly fxSpreadBps?: bigint;
}

/** The snapshot-derived Lab base-facts projection (the recordProductionFacts input + this package's digest). */
export interface SnapshotDerivedLabFacts {
  readonly factsId: string;
  readonly rails: readonly PinnedSimulatedRail[];
  readonly pools: readonly PinnedSimulatedLiquidityPool[];
  readonly stepLatencyMs: number;
  readonly demands: readonly PinnedRecordedDemandFact[];
  readonly incidents: readonly PinnedRecordedIncidentFact[];
  readonly projectionDigest: string;
}

/** The snapshot→facts derivation input. */
export interface RecordedFactsFromSnapshotsInput {
  readonly senderSnapshot: EligibleRailSnapshot;
  readonly recipientSnapshot: EligibleRailSnapshot;
  readonly factsId: string;
  readonly stepLatencyMs: number;
  readonly railEconomics: readonly SnapshotRailEconomics[];
}

function requirePositiveInt(value: unknown, subject: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new LabFactsError(`${subject} must be a positive integer (caller-supplied, count/latency based)`);
  }
  return value;
}

function requireNonNegativeBigint(value: unknown, subject: string): bigint {
  if (typeof value !== "bigint" || value < 0n) {
    throw new LabFactsError(`${subject} must be a non-negative exact bigint minor unit / basis-point amount`);
  }
  return value;
}

function requireCorridorAgreement(sender: EligibleRailSnapshot, recipient: EligibleRailSnapshot): void {
  const matches =
    sender.query.sourceCountry === recipient.query.sourceCountry &&
    sender.query.destinationCountry === recipient.query.destinationCountry &&
    sender.query.sourceCurrency === recipient.query.sourceCurrency &&
    sender.query.destinationCurrency === recipient.query.destinationCurrency &&
    sender.query.asOf === recipient.query.asOf;
  if (!matches) {
    throw new LabFactsError("the sender and recipient snapshots were grounded on different corridor queries — a side snapshot never composes onto a foreign corridor");
  }
}

/**
 * Derive the Lab recorded-production facts from the rail snapshots' REAL
 * rail records: one simulated rail per real record (the side-settlement
 * currency projection — the sender side settles the corridor's source
 * currency, the recipient side its destination currency), the honest EMPTY
 * pools/demands/incidents, and this package's value-form digest over the
 * projection. A snapshot with no rails derives the honest empty facts.
 */
export function recordedFactsFromSnapshots(input: RecordedFactsFromSnapshotsInput): SnapshotDerivedLabFacts {
  const request = requireObject(input, "the recorded-facts derivation request");
  const sender = request["senderSnapshot"] as EligibleRailSnapshot | undefined;
  const recipient = request["recipientSnapshot"] as EligibleRailSnapshot | undefined;
  if (sender?.side !== "SENDER" || recipient?.side !== "RECIPIENT" || !Array.isArray(sender?.rails) || !Array.isArray(recipient?.rails)) {
    throw new LabFactsError("the facts derivation requires the SENDER snapshot first and the RECIPIENT snapshot second (the rail-snapshot shapes)");
  }
  requireCorridorAgreement(sender, recipient);
  const factsId = request["factsId"];
  if (!isNonEmptyString(factsId)) throw new LabFactsError("factsId must be a non-empty string");
  const stepLatencyMs = requirePositiveInt(request["stepLatencyMs"], "stepLatencyMs");
  const economics = request["railEconomics"];
  if (!Array.isArray(economics)) throw new LabFactsError("railEconomics must be an array of per-rail simulation economics");
  const economicsByRouteId = new Map<string, SnapshotRailEconomics>();
  for (const entry of economics) {
    const record = requireObject(entry, "a rail economics entry");
    const routeId = record["routeId"];
    if (!isNonEmptyString(routeId)) throw new LabFactsError("every rail economics entry must carry a non-empty routeId");
    if (economicsByRouteId.has(routeId)) throw new LabFactsError(`duplicate rail economics for routeId '${routeId}'`);
    economicsByRouteId.set(routeId, {
      routeId,
      latencyMs: requirePositiveInt(record["latencyMs"], `railEconomics.${routeId}.latencyMs`),
      fixedFeeMinor: requireNonNegativeBigint(record["fixedFeeMinor"], `railEconomics.${routeId}.fixedFeeMinor`),
      variableFeeBps: requireNonNegativeBigint(record["variableFeeBps"], `railEconomics.${routeId}.variableFeeBps`),
      ...(record["fxSpreadBps"] !== undefined ? { fxSpreadBps: requireNonNegativeBigint(record["fxSpreadBps"], `railEconomics.${routeId}.fxSpreadBps`) } : {}),
    });
  }

  const rails: PinnedSimulatedRail[] = [];
  const byRouteId = (a: { routeId: string }, b: { routeId: string }) => (a.routeId < b.routeId ? -1 : 1);
  for (const side of [
    { name: "SENDER", snapshot: sender, currency: sender.query.sourceCurrency },
    { name: "RECIPIENT", snapshot: recipient, currency: recipient.query.destinationCurrency },
  ] as const) {
    for (const rail of [...side.snapshot.rails].sort(byRouteId)) {
      const declared = economicsByRouteId.get(rail.routeId);
      if (declared === undefined) {
        throw new LabFactsError(
          `the ${side.name} rail record '${rail.routeId}' carries no caller-supplied simulation economics — the snapshots observe no fee or latency, and a rail is never invented (supply railEconomics for every real rail record)`,
          { routeId: rail.routeId, side: side.name },
        );
      }
      rails.push(
        deepFreeze({
          railId: rail.routeId,
          currency: side.currency,
          latencyMs: declared.latencyMs,
          fixedFeeMinor: declared.fixedFeeMinor,
          variableFeeBps: declared.variableFeeBps,
          ...(declared.fxSpreadBps !== undefined ? { fxSpreadBps: declared.fxSpreadBps } : {}),
        }),
      );
    }
  }

  // The honest empty sets: the rail snapshots carry NO liquidity-pool,
  // demand or incident observations — none are ever fabricated.
  const pools: readonly PinnedSimulatedLiquidityPool[] = Object.freeze([]);
  const demands: readonly PinnedRecordedDemandFact[] = Object.freeze([]);
  const incidents: readonly PinnedRecordedIncidentFact[] = Object.freeze([]);
  const projectionDigest = contentDigest({ factsId, rails, pools, stepLatencyMs, demands, incidents });
  return deepFreeze({ factsId, rails, pools, stepLatencyMs, demands, incidents, projectionDigest });
}

/** The assumed elements' caller-supplied simulation parameters (advisory, never real claims). */
export interface AssumedEconomics {
  readonly latencyMs: number;
  readonly fixedFeeMinor: bigint;
  readonly variableFeeBps: bigint;
}

/** STRUCTURAL PIN (subset) — authority: @payswap/lab `RailAddedIntervention`. */
export interface PinnedRailAddedRepairIntervention {
  readonly kind: "RAIL_ADDED";
  readonly interventionId: string;
  readonly name: string;
  readonly rail: PinnedSimulatedRail;
  readonly pools?: readonly PinnedSimulatedLiquidityPool[];
}
/** STRUCTURAL PIN (subset) — authority: @payswap/lab `ThirdPartyNodeJoinsIntervention`. */
export interface PinnedThirdPartyNodeJoinsRepairIntervention {
  readonly kind: "THIRD_PARTY_NODE_JOINS";
  readonly interventionId: string;
  readonly nodeId: string;
  readonly role: "intermediary";
  readonly rails: readonly PinnedSimulatedRail[];
  readonly pools?: readonly PinnedSimulatedLiquidityPool[];
}
/** A derived repair intervention over the EXISTING Lab kinds (assignable to PinnedScenarioIntervention). */
export type PinnedRepairIntervention = PinnedRailAddedRepairIntervention | PinnedThirdPartyNodeJoinsRepairIntervention;

/** The repair→intervention mapping input. */
export interface RepairInterventionsInput {
  readonly repairs: ExclusionRepairDerivation;
  readonly assumedEconomics: AssumedEconomics;
}

/**
 * Map the derived repair set onto the EXISTING Lab intervention kinds
 * (ADR-0015 D13 — NO new Lab kinds): an assumed rail -> RAIL_ADDED; an
 * intermediary operator -> THIRD_PARTY_NODE_JOINS (role "intermediary");
 * a conversion asset -> RAIL_ADDED (the asset's rail, labeled); a
 * connector operation -> RAIL_ADDED. The returned payloads are in the
 * pinned shapes lab-adapter's exploreBoundedScenarios accepts.
 */
export function repairInterventionsFromRepairs(input: RepairInterventionsInput): readonly PinnedRepairIntervention[] {
  const request = requireObject(input, "the repair-interventions request");
  const repairs = requireObject(request["repairs"], "the exclusion-repair derivation");
  if (!Array.isArray(repairs["hypothesisRequests"])) {
    throw new LabFactsError("the repairs must be an ExclusionRepairDerivation (hypothesisRequests is missing)");
  }
  const economicsRecord = requireObject(request["assumedEconomics"], "the assumed economics");
  const economics: AssumedEconomics = {
    latencyMs: requirePositiveInt(economicsRecord["latencyMs"], "assumedEconomics.latencyMs"),
    fixedFeeMinor: requireNonNegativeBigint(economicsRecord["fixedFeeMinor"], "assumedEconomics.fixedFeeMinor"),
    variableFeeBps: requireNonNegativeBigint(economicsRecord["variableFeeBps"], "assumedEconomics.variableFeeBps"),
  };
  const interventions: PinnedRepairIntervention[] = [];
  const seen = new Set<string>();
  for (const hypothesisRequest of repairs["hypothesisRequests"] as ExclusionRepairDerivation["hypothesisRequests"]) {
    const record = requireObject(hypothesisRequest, "a hypothesis request");
    const operatorId = record["operatorId"];
    const augmentation = record["assumption"];
    if (!isNonEmptyString(operatorId) || !isRecord(augmentation)) {
      throw new LabFactsError("every hypothesis request must carry an operatorId and its assumed augmentation");
    }
    const kind = augmentation["kind"] as string;
    const interventionId = `repair-intervention:${operatorId}`;
    if (seen.has(interventionId)) throw new LabFactsError(`duplicate intervention id '${interventionId}' is rejected`);
    seen.add(interventionId);
    if (kind === "ADD_ASSUMED_RAIL" && (PINNED_INTERMEDIARY_OPERATOR_IDS as readonly string[]).includes(operatorId)) {
      const rail = requireObject(augmentation["rail"], "the assumed intermediary rail");
      const railId = rail["assumedRailId"];
      const railCurrency = rail["destinationCurrency"];
      if (!isNonEmptyString(railId) || typeof railCurrency !== "string") {
        throw new LabFactsError("the assumed intermediary rail must carry its assumedRailId and destinationCurrency");
      }
      interventions.push(
        deepFreeze({
          kind: "THIRD_PARTY_NODE_JOINS",
          interventionId,
          nodeId: `assumed-node:${operatorId}`,
          role: "intermediary",
          rails: Object.freeze([
            deepFreeze({
              railId,
              currency: railCurrency,
              latencyMs: economics.latencyMs,
              fixedFeeMinor: economics.fixedFeeMinor,
              variableFeeBps: economics.variableFeeBps,
            }),
          ]),
        }),
      );
      continue;
    }
    if (kind === "ADD_ASSUMED_RAIL") {
      const rail = requireObject(augmentation["rail"], "the assumed rail");
      const railId = rail["assumedRailId"];
      const railCurrency = rail["destinationCurrency"];
      if (!isNonEmptyString(railId) || typeof railCurrency !== "string") {
        throw new LabFactsError("the assumed rail must carry its assumedRailId and destinationCurrency");
      }
      interventions.push(
        deepFreeze({
          kind: "RAIL_ADDED",
          interventionId,
          name: `assumed rail: ${String(rail["summary"] ?? operatorId)}`,
          rail: deepFreeze({
            railId,
            currency: railCurrency,
            latencyMs: economics.latencyMs,
            fixedFeeMinor: economics.fixedFeeMinor,
            variableFeeBps: economics.variableFeeBps,
          }),
        }),
      );
      continue;
    }
    if (kind === "ADD_ASSUMED_CONVERSION_ASSET") {
      const asset = requireObject(augmentation["asset"], "the assumed conversion asset");
      const assetId = asset["assumedAssetId"];
      const assetCurrency = asset["toCurrency"];
      if (!isNonEmptyString(assetId) || typeof assetCurrency !== "string") {
        throw new LabFactsError("the assumed conversion asset must carry its assumedAssetId and toCurrency");
      }
      interventions.push(
        deepFreeze({
          kind: "RAIL_ADDED",
          interventionId,
          name: `assumed conversion-asset rail: ${String(asset["summary"] ?? operatorId)}`,
          rail: deepFreeze({
            railId: assetId,
            currency: assetCurrency,
            latencyMs: economics.latencyMs,
            fixedFeeMinor: economics.fixedFeeMinor,
            variableFeeBps: economics.variableFeeBps,
          }),
        }),
      );
      continue;
    }
    if (kind === "ADD_ASSUMED_CONNECTOR_OPERATION") {
      const operation = requireObject(augmentation["operation"], "the assumed connector operation");
      const operationId = operation["assumedOperationId"];
      const operationCurrency = operation["destinationCurrency"];
      if (!isNonEmptyString(operationId) || typeof operationCurrency !== "string") {
        throw new LabFactsError("the assumed connector operation must carry its assumedOperationId and destinationCurrency");
      }
      interventions.push(
        deepFreeze({
          kind: "RAIL_ADDED",
          interventionId,
          name: `assumed connector-operation rail: ${String(operation["summary"] ?? operatorId)}`,
          rail: deepFreeze({
            railId: operationId,
            currency: operationCurrency,
            latencyMs: economics.latencyMs,
            fixedFeeMinor: economics.fixedFeeMinor,
            variableFeeBps: economics.variableFeeBps,
          }),
        }),
      );
      continue;
    }
    throw new LabFactsError(`the hypothesis request '${operatorId}' carries the unknown augmentation kind '${String(kind)}' — the A.5 kinds are frozen`);
  }
  // The D13 law, machine-enforced: only the EXISTING Lab kinds ever leave.
  for (const intervention of interventions) {
    if (!(PINNED_INTERVENTION_KINDS as readonly string[]).includes(intervention.kind)) {
      throw new LabFactsError(`the intervention kind '${intervention.kind}' is not an EXISTING Lab kind — ADR-0015 D13 forbids new Lab vocabulary`);
    }
    if (intervention.kind === "THIRD_PARTY_NODE_JOINS" && !(PINNED_THIRD_PARTY_NODE_ROLES as readonly string[]).includes(intervention.role)) {
      throw new LabFactsError("the joining node's role must be an EXISTING Lab role");
    }
  }
  return Object.freeze(sortedBy(interventions, (intervention) => intervention.interventionId));
}
