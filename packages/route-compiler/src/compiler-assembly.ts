/**
 * @payswap/route-compiler — shared compiler assembly (P5-W1).
 *
 * The deterministic leg-assembly helpers every family compiler shares:
 * location grounding (which rail a neutral funds location is), the
 * baseline pick (explicit hint or the PASS_THROUGH_NATIVE offer — never
 * fabricated), the DEX-swap lane leg (through the engine), the
 * transfer/write legs (digest-bound, gate-evaluated), the auditable
 * assumption builders, the plan push (with the lane's evaluation as the
 * plan score) and the observation-version pin collection (the
 * preservation law).
 */

import { deepFreeze, contentDigest, sortedBy } from "./canonical.ts";
import { isoUtcFromEpochMillis } from "./canonical-time.ts";
import type { MoneyMovementIntent } from "./intent.ts";
import type { RouteCompilerInput } from "./compiler-input.ts";
import { laneSwapRequest } from "./compiler-input.ts";
import { BestExecutionEngine } from "./best-execution.ts";
import { discoverOnchainLane } from "./onchain-lane.ts";
import type { OnchainLaneProof } from "./onchain-lane.ts";
import { buildRoutePlan } from "./route-plan.ts";
import type { RoutePlan, RouteLeg } from "./route-plan.ts";
import { convertAmount } from "./conversion.ts";
import { ROUTE_LEG_FAILURE_SEMANTICS } from "./finality.ts";
import { onchainFinality } from "./finality.ts";
import { routeLegId, routeHashFor, settlementInstructionBinding } from "./identifiers.ts";
import type { RouteLegBase } from "./leg-contracts.ts";
import { legIsExecutable } from "./leg-contracts.ts";
import type { CustodyParty, CustodyTransfer } from "./custody.ts";
import { onchainWalletParty, onchainProtocolParty } from "./leg-arms.ts";
import type { CorridorCandidate } from "./corridor.ts";
import { corridorCandidateByRouteId, nativeBaselineCorridorCandidate } from "./corridor.ts";
import type { FundsLocationObservation } from "./grounding.ts";
import type { AuditableAssumption } from "./assumptions.ts";
import type { PinnedAssetIdentity } from "./pins/onchain.ts";
import type { NetOutcomeEvaluation } from "./scoring.ts";
import type { ExcludedRouteShape } from "./compiler.ts";

/** An onchain-position observation (narrowed for assembly). */
export type OnchainPositionObservation = FundsLocationObservation & {
  observationKind: "ONCHAIN_POSITION";
};

/** Ground a neutral funds location through the location observations. */
export function locationObservationFor(
  observations: readonly FundsLocationObservation[],
  location: { observationRef: string; locationRef: string },
): FundsLocationObservation | undefined {
  return sortedBy(observations, (observation) => observation.observationRef).find(
    (observation) =>
      observation.observationRef === location.observationRef ||
      observation.locationRef === location.locationRef,
  );
}

/** The provider-native baseline candidate (explicit hint first, never fabricated). */
export function pickBaselineCandidate(
  input: RouteCompilerInput,
  candidates: readonly CorridorCandidate[],
): CorridorCandidate | undefined {
  const hinted = input.routingHints?.nativeBaselineRouteId;
  if (hinted !== undefined) {
    return corridorCandidateByRouteId(candidates, hinted);
  }
  return nativeBaselineCorridorCandidate(candidates);
}

/** A quote-grounded swap assembly (the leg + the lane + the planned amount). */
export interface DexSwapAssembly {
  readonly leg: RouteLegBase;
  readonly lane: OnchainLaneProof;
  readonly plannedAmount: {
    readonly basis: "QUOTE_GROUNDED";
    readonly amount: { readonly currency: string; readonly minorUnits: string };
    readonly quoteId: string;
  };
}

/** Assemble the DEX-swap lane leg through the REAL engine (hop 0 of swap shapes). */
export function assembleDexSwapLeg(
  input: RouteCompilerInput,
  intent: MoneyMovementIntent,
  shapeId: string,
  outputAsset: PinnedAssetIdentity,
  origin: OnchainPositionObservation,
  at: number,
): DexSwapAssembly | undefined {
  const engine = new BestExecutionEngine();
  for (const venue of sortedBy(input.venues, (venue) => venue.descriptor.venueId)) {
    engine.register(venue);
  }
  const swap = laneSwapRequest({
    intentRef: intent.intentId,
    shapeId,
    chain: origin.chainKey,
    inputAsset: { chain: origin.chainKey, assetId: origin.assetId, symbol: origin.symbol },
    outputAsset,
    amount: intent.originAmount,
  });
  const laneResult = discoverOnchainLane(engine, {
    executionId: `route-swap:${intent.intentId}:${shapeId}`,
    swap,
    policy: input.onchain.policy,
    security: input.onchain.security,
    instances: sortedBy(input.onchain.instances, (instance) => instance.instanceId),
    owner: origin.accountRef,
    beneficiary: origin.accountRef,
    requestedBy: input.onchain.requestedBy,
    routeExpiryMs: input.onchain.routeExpiryMs,
    at,
    assetObservations: input.assetObservations,
  });
  if (laneResult.status !== "LANE_PROVED") {
    return undefined;
  }
  const lane = laneResult.lane;
  const planPrefix = `route-plan:${intent.intentId}:${shapeId}`;
  const legId = routeLegId(planPrefix, 0, "ONCHAIN_DEX_SWAP");
  const protocolParty = onchainProtocolParty(lane.protocolBinding.protocolKey, lane.protocolBinding.chainKey);
  const walletParty = onchainWalletParty(origin.accountRef, origin.chainKey);
  const plannedAmount = {
    basis: "QUOTE_GROUNDED" as const,
    amount: lane.quote.slippage.worstCaseOutput,
    quoteId: lane.quote.quoteId,
  };
  const leg = freezeLeg({
    legId,
    legKind: "ONCHAIN_DEX_SWAP",
    hopIndex: 0,
    intentRef: intent.intentId,
    authorizationLineage: {
      intentRef: intent.intentId,
      intentAuthorizationRef: intent.intentAuthorizationRef,
      legAuthorization: {
        kind: "ONCHAIN_GATE_DECISION",
        gateDecision: lane.gateDecision,
        writeDigest: lane.write.writeDigest,
        routeRef: lane.routeRef,
        routeHash: lane.routeHash,
      },
    },
    stateGrounding: {
      observations: [
        {
          observationKind: "AssetObservation",
          observationId: lane.inputAssetObservation.observationRef,
          observationVersion: lane.inputAssetObservation.observationVersion,
          fresh: true,
          freshnessRule: "location-observation:inclusive-bound",
        },
        {
          observationKind: "VenueQuote",
          observationId: lane.quote.quoteId,
          observationVersion: 1,
          fresh: true,
          freshnessRule: "venue-quote:inclusive-freshness-bound",
        },
      ],
      groundingFailures: [],
    },
    finality: onchainFinality(lane.quote.timeToSettlement.finalityModel, lane.quote.chain),
    custody: {
      from: walletParty,
      to: walletParty,
      via: protocolParty,
      assetRef: origin.assetId,
      amount: intent.originAmount,
      evidenceRefs: [`asset-observation:${lane.inputAssetObservation.observationRef}`],
    } as CustodyTransfer,
    plannedAmount,
    assumptions: [
      {
        assumptionId: `assumption:${legId}:worst-case`,
        basis: "QUOTE_DISCLOSURE" as const,
        statement: `the venue quote '${lane.quote.quoteId}' worst-case output holds at execution (declared slippage protection)`,
        evidenceRefs: [`quote:${lane.quote.quoteId}`, ...lane.quote.provenance.evidenceRefs],
        assumedValidUntil: isoUtcFromEpochMillis(lane.quote.freshness.asOfMs + lane.quote.freshness.maxAgeMs),
      },
    ],
    evidenceRefs: [...lane.evidenceRefs],
  });
  return { leg, lane, plannedAmount };
}

/** Prepare the deterministic write record of an onchain transfer/bridge hop. */
export function prepareWrite(
  input: RouteCompilerInput,
  intent: MoneyMovementIntent,
  shapeId: string,
  hop: number,
  legKind: string,
  origin: OnchainPositionObservation,
  toAccountRef: string,
  at: number,
): {
  writeId: string;
  action: string;
  chain: string;
  route: { routeId: string; routeHash: string };
  expiry: number;
  requestedBy: string;
  writeDigest: string;
  preparedAt: number;
} {
  const planId = `route-plan:${intent.intentId}:${shapeId}`;
  const writeId = `${planId}:write:${hop}`;
  const routeHash = routeHashFor(planId, hop, legKind);
  const write = {
    writeId,
    action: `onchain.${legKind.split("_").map((part) => part.toLowerCase()).join(".")}`,
    chain: origin.chainKey,
    transfer: {
      asset: { chain: origin.chainKey, assetId: origin.assetId, symbol: origin.symbol },
      amount: intent.originAmount,
      from: origin.accountRef,
      to: toAccountRef,
    },
    route: { routeId: planId, routeHash },
    expiry: intent.expiresAt,
    requestedBy: input.onchain.requestedBy,
    settlementInstruction: settlementInstructionBinding(intent.intentId, shapeId),
    preparedAt: at,
  };
  return deepFreeze({
    writeId,
    action: write.action,
    chain: write.chain,
    route: write.route,
    expiry: write.expiry,
    requestedBy: write.requestedBy,
    writeDigest: contentDigest(write),
    preparedAt: at,
  });
}

/** The transfer leg (deposit / delivery / direct): gate-evaluated, digest-bound. */
export function transferLegTo(
  input: RouteCompilerInput,
  intent: MoneyMovementIntent,
  shapeId: string,
  hop: number,
  origin: OnchainPositionObservation,
  to: CustodyParty,
  plannedAmount: { basis: string; amount?: { currency: string; minorUnits: string }; quoteId?: string },
  at: number,
): RouteLegBase {
  const planPrefix = `route-plan:${intent.intentId}:${shapeId}`;
  const legId = routeLegId(planPrefix, hop, "ONCHAIN_TRANSFER");
  const write = prepareWrite(input, intent, shapeId, hop, "ONCHAIN_TRANSFER", origin, custodyAccountRefOf(to), at);
  const gate = input.onchain.security.evaluateGate({
    write,
    policy: input.onchain.security.policy,
    securityState: input.onchain.security.state,
    at,
  });
  const amount = plannedAmount.amount ?? intent.originAmount;
  return freezeLeg({
    legId,
    legKind: "ONCHAIN_TRANSFER",
    hopIndex: hop,
    intentRef: intent.intentId,
    authorizationLineage: {
      intentRef: intent.intentId,
      intentAuthorizationRef: intent.intentAuthorizationRef,
      legAuthorization: {
        kind: "ONCHAIN_GATE_DECISION",
        gateDecision: gate,
        writeDigest: write.writeDigest,
        routeRef: write.route.routeId,
        routeHash: write.route.routeHash,
      },
    },
    stateGrounding: {
      observations: [
        {
          observationKind: "AssetObservation",
          observationId: origin.observationRef,
          observationVersion: origin.observationVersion,
          fresh: true,
          freshnessRule: "location-observation:inclusive-bound",
        },
      ],
      groundingFailures: [],
    },
    finality: onchainFinality("PROBABILISTIC", origin.chainKey),
    custody: {
      from: onchainWalletParty(origin.accountRef, origin.chainKey),
      to,
      assetRef: origin.assetId,
      amount,
      evidenceRefs: [`asset-observation:${origin.observationRef}`],
    } as CustodyTransfer,
    plannedAmount:
      plannedAmount.basis === "QUOTE_GROUNDED" && plannedAmount.amount !== undefined
        ? { basis: "QUOTE_GROUNDED", amount: plannedAmount.amount, quoteId: plannedAmount.quoteId ?? "" }
        : { basis: "INTENT_DECLARED", amount: intent.originAmount },
    assumptions: [
      {
        assumptionId: `assumption:${legId}:deposit`,
        basis: plannedAmount.basis === "QUOTE_GROUNDED" ? ("QUOTE_DISCLOSURE" as const) : ("ROUTING_HINT" as const),
        statement: `the deposit amount is grounded ('${plannedAmount.basis}') and the receiving account is the explicit routing hint`,
        evidenceRefs: [`asset-observation:${origin.observationRef}`],
        assumedValidUntil: isoUtcFromEpochMillis(intent.expiresAt),
      },
    ],
    evidenceRefs: [`asset-observation:${origin.observationRef}`, `write:${write.writeDigest}`],
  });
}

/** The write-grounded leg (bridge / direct transfer), custody-complete. */
export function writeLeg(
  input: RouteCompilerInput,
  intent: MoneyMovementIntent,
  shapeId: string,
  hop: number,
  legKind: "ONCHAIN_TRANSFER" | "ONCHAIN_BRIDGE",
  origin: OnchainPositionObservation,
  custody: { from: CustodyParty; to: CustodyParty; via?: CustodyParty; assetRef: string; amount: { currency: string; minorUnits: string } },
  plannedAmount: RouteLegBase["plannedAmount"],
  arrivalChainKey?: string,
): RouteLegBase {
  const planPrefix = `route-plan:${intent.intentId}:${shapeId}`;
  const legId = routeLegId(planPrefix, hop, legKind);
  const write = prepareWrite(input, intent, shapeId, hop, legKind, origin, custodyAccountRefOf(custody.to), input.at);
  const gate = input.onchain.security.evaluateGate({
    write,
    policy: input.onchain.security.policy,
    securityState: input.onchain.security.state,
    at: input.at,
  });
  return freezeLeg({
    legId,
    legKind,
    hopIndex: hop,
    intentRef: intent.intentId,
    authorizationLineage: {
      intentRef: intent.intentId,
      intentAuthorizationRef: intent.intentAuthorizationRef,
      legAuthorization: {
        kind: "ONCHAIN_GATE_DECISION",
        gateDecision: gate,
        writeDigest: write.writeDigest,
        routeRef: write.route.routeId,
        routeHash: write.route.routeHash,
      },
    },
    stateGrounding: {
      observations: [
        {
          observationKind: "AssetObservation",
          observationId: origin.observationRef,
          observationVersion: origin.observationVersion,
          fresh: true,
          freshnessRule: "location-observation:inclusive-bound",
        },
      ],
      groundingFailures: [],
    },
    finality: onchainFinality("PROBABILISTIC", arrivalChainKey ?? origin.chainKey),
    custody: {
      from: custody.from,
      to: custody.to,
      ...(custody.via !== undefined ? { via: custody.via } : {}),
      assetRef: custody.assetRef,
      amount: custody.amount,
      evidenceRefs: [`asset-observation:${origin.observationRef}`, `write:${write.writeDigest}`],
    } as CustodyTransfer,
    plannedAmount,
    assumptions: [
      {
        assumptionId: `assumption:${legId}:write`,
        basis: "ROUTING_HINT" as const,
        statement:
          plannedAmount.basis === "UNKNOWN"
            ? "the bridge arrival is observed at destination-chain finality — the amount stays honestly unknown"
            : `the write '${write.writeId}' is the gate-evaluated write and the transfer grounds on the origin observation`,
        evidenceRefs: [`asset-observation:${origin.observationRef}`, `write:${write.writeDigest}`],
        assumedValidUntil: isoUtcFromEpochMillis(intent.expiresAt),
      },
    ],
    evidenceRefs: [`asset-observation:${origin.observationRef}`, `write:${write.writeDigest}`],
  });
}

// The support helpers (assumptions, freeze, push, pins) live in
// compiler-support.ts; re-exported here so the family compilers' single
// import surface reads linearly.
export {
  conversionAssumption,
  freshnessAssumption,
  pushPlan,
  collectObservationVersionPins,
  convertedAmount,
} from "./compiler-support.ts";
import { freezeLeg, custodyAccountRefOf } from "./compiler-support.ts";
export { freezeLeg, custodyAccountRefOf };
export type { FreezableLeg } from "./compiler-support.ts";
