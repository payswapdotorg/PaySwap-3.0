/**
 * @payswap/route-compiler — compiler support: assumptions, plan push and
 * the observation-version pins (P5-W1).
 *
 * The small deterministic helpers every family compiler shares: the
 * auditable-assumption builders (conversion-grounded, freshness-grounded),
 * the leg freeze (with the frozen INV-X contract), the plan push (the
 * buildRoutePlan bridge with its honest construction-law exclusion) and
 * the observation-version pin collection (the preservation law: the
 * exact versions the compilation decided on).
 */
import { deepFreeze, sortedBy } from "./canonical.ts";
import { isoUtcFromEpochMillis } from "./canonical-time.ts";
import type { MoneyMovementIntent } from "./intent.ts";
import { buildRoutePlan } from "./route-plan.ts";
import type { RoutePlan, RouteLeg } from "./route-plan.ts";
import type { RouteLegBase } from "./leg-contracts.ts";
import { legIsExecutable } from "./leg-contracts.ts";
import type { CustodyParty } from "./custody.ts";
import { convertAmount } from "./conversion.ts";
import { ROUTE_LEG_FAILURE_SEMANTICS } from "./finality.ts";
import type { CorridorCandidate } from "./corridor.ts";
import type { AuditableAssumption } from "./assumptions.ts";
import type { NetOutcomeEvaluation } from "./scoring.ts";
import type { RouteCompilerInput } from "./compiler-input.ts";
import type { ExcludedRouteShape } from "./compiler.ts";

/** The conversion-grounded assumption set of a leg. */
export function conversionAssumption(
  intent: MoneyMovementIntent,
  ruleId: string,
  amount: { currency: string; minorUnits: string },
): readonly AuditableAssumption[] {
  return [
    {
      assumptionId: `assumption:conversion:${ruleId}:${amount.currency}`,
      basis: "DECLARED_CONVERSION" as const,
      statement: `the declared conversion rule '${ruleId}' grounds '${amount.currency}' ${amount.minorUnits} minor units`,
      evidenceRefs: [`conversion-rule:${ruleId}`],
      assumedValidUntil: isoUtcFromEpochMillis(intent.expiresAt),
    },
  ];
}

/** The freshness-grounded assumption set of a leg. */
export function freshnessAssumption(
  intent: MoneyMovementIntent,
  observationRef: string,
  statement: string,
): readonly AuditableAssumption[] {
  return [
    {
      assumptionId: `assumption:freshness:${observationRef}`,
      basis: "OBSERVATION_FRESHNESS" as const,
      statement,
      evidenceRefs: [`observation:${observationRef}`],
      assumedValidUntil: isoUtcFromEpochMillis(intent.expiresAt),
    },
  ];
}

/** A leg before the frozen failure-semantics contract is attached. */
export type FreezableLeg = Omit<RouteLegBase, "failureSemantics">;

/** Freeze a leg with the frozen failure-semantics contract (INV-X singleton). */
export function freezeLeg(leg: FreezableLeg): RouteLegBase {
  return deepFreeze({ ...leg, failureSemantics: ROUTE_LEG_FAILURE_SEMANTICS }) as RouteLegBase;
}

/** The custody party's account reference (write destination). */
export function custodyAccountRefOf(party: CustodyParty): string {
  switch (party.kind) {
    case "ONCHAIN_WALLET":
      return party.accountRef;
    case "EXTERNAL_PROVIDER":
      return party.accountRef ?? `provider:${party.providerName}`;
    case "EXTERNAL_BANK_INSTRUMENT":
      return party.externalRef;
    case "ONCHAIN_PROTOCOL":
      return `protocol:${party.protocolKey}@${party.chainKey}`;
    case "MERCHANT_BALANCE":
      return party.merchantAccountRef;
  }
}

/** Push a built plan (or its honest construction-law exclusion). */
export function pushPlan(
  intent: MoneyMovementIntent,
  shapeId: string,
  legs: readonly RouteLegBase[],
  environmentClasses: readonly string[],
  at: number,
  plans: RoutePlan[],
  exclusions: ExcludedRouteShape[],
  score?: NetOutcomeEvaluation,
  marker?: RoutePlan["merchantNativeSettlementUnavailable"],
): void {
  try {
    plans.push(
      buildRoutePlan({
        intentRef: intent.intentId,
        shapeId: shapeId as RoutePlan["shapeId"],
        legs,
        environmentClasses,
        at,
        ...(score !== undefined ? { score } : {}),
        ...(marker !== undefined ? { merchantNativeSettlementUnavailable: marker } : {}),
      }),
    );
  } catch (error) {
    exclusions.push({
      shapeId,
      reasons: [`the plan failed construction law: ${error instanceof Error ? error.message : String(error)}`],
    });
  }
}

/** Convert through the declared rules (the honest never-invented-FX law). */
export function convertedAmount(
  intent: MoneyMovementIntent,
  input: RouteCompilerInput,
  toCurrency: string,
): ReturnType<typeof convertAmount> {
  return convertAmount(intent.originAmount, input.conversionRules, toCurrency);
}

/** The observation-version pins of the compilation (the preservation law). */
export function collectObservationVersionPins(
  input: RouteCompilerInput,
  candidates: readonly CorridorCandidate[],
): readonly { instanceId: string; observationVersion: number; pinnedDigest: string }[] {
  const pins: { instanceId: string; observationVersion: number; pinnedDigest: string }[] = [];
  for (const candidate of sortedBy(candidates, (candidate) => candidate.routeId)) {
    pins.push({
      instanceId: candidate.routeId,
      observationVersion: candidate.observationVersion,
      pinnedDigest: `corridor:${candidate.routeId}@${candidate.observationVersion}`,
    });
  }
  for (const observation of [
    ...sortedBy(input.locationObservations, (observation) => observation.observationRef),
    ...sortedBy(input.assetObservations, (observation) => observation.observationRef),
  ]) {
    pins.push({
      instanceId: observation.locationRef,
      observationVersion: observation.observationVersion,
      pinnedDigest: `observation:${observation.observationRef}@${observation.observationVersion}`,
    });
  }
  return Object.freeze(pins);
}

// The compiler family's shared type imports (aggregated under the file law).
export type { MoneyMovementIntent } from "./intent.ts";
export type { RouteCompilerInput } from "./compiler-input.ts";
export type { RouteLegBase } from "./leg-contracts.ts";
export type { CustodyParty, CustodyTransfer } from "./custody.ts";
export type { CorridorCandidate } from "./corridor.ts";
export type { ExcludedRouteShape } from "./compiler.ts";
export type { FundsLocationObservation } from "./grounding.ts";
export type { RoutePlan } from "./route-plan.ts";
export type { OnchainPositionObservation } from "./compiler-assembly.ts";
