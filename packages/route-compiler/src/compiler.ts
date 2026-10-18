/**
 * @payswap/route-compiler — the deterministic mixed-rail compiler entry
 * (P5-W1).
 *
 * PORT+ADAPT of the old compiler's compileMoneyMovementRoute (MMI-19)
 * onto the rail-neutral intent: the old origin/destination KIND
 * dispatch is re-homed as OBSERVATION-GROUNDED location grounding (the
 * economic lane made the intent neutral — the compiler learns a
 * location's rail from the location observations, never from the
 * intent). The family compilers live in compiler-offramp.ts (off-ramp +
 * merchant families) and compiler-onchain-shapes.ts (on-ramp +
 * cross-chain families); the shared assembly in compiler-assembly.ts.
 *
 * The preserved laws: every shape either compiles a plan or records an
 * honest EXCLUSION (nothing silently dropped); the provider-native
 * baseline is EMITTED like any candidate on real evidence (INV-C08 —
 * the compiler itself does no ranking; plans are emitted in canonical
 * planId order; scoring is the advisory lane surface); FX is never
 * invented; the discovery tier never authorizes execution
 * (discoveryPermitsExecution: false is a LITERAL on the result); the
 * compilation digest binds the canonical projection (byte-identical
 * replays under input permutation).
 */

import { deepFreeze, contentDigest, sortedBy } from "./canonical.ts";
import { validateMoneyMovementIntent } from "./intent.ts";
import type { MoneyMovementIntent } from "./intent.ts";
import { validateCompilerInput } from "./compiler-input.ts";
import type { RouteCompilerInput } from "./compiler-input.ts";
import { corridorCandidates } from "./corridor.ts";
import type { CorridorCandidate } from "./corridor.ts";
import { compileOffRampShapes, compileMerchantShapes } from "./compiler-offramp.ts";
import { compileOnRampShapes, compileCrossChainShapes } from "./compiler-onchain-shapes.ts";
import { locationObservationFor } from "./compiler-assembly.ts";
import { collectObservationVersionPins } from "./compiler-support.ts";
import type { RoutePlan } from "./route-plan.ts";
import type { FundsLocationObservation } from "./grounding.ts";
import type { OnchainPositionObservation } from "./compiler-assembly.ts";

/** One honest route-shape exclusion (shapeId + reasons). */
export interface ExcludedRouteShape {
  readonly shapeId: string;
  readonly reasons: readonly string[];
}

/** The compilation result (the discovery-tier output contract). */
export interface RouteCompilationResult {
  readonly status: "ROUTES_COMPILED" | "NO_COMPILABLE_ROUTE";
  readonly intentRef: string;
  readonly compiledAt: number;
  readonly plans: readonly RoutePlan[];
  readonly exclusions: readonly ExcludedRouteShape[];
  /** The exact observation versions the compilation decided on (the preservation law). */
  readonly observationVersionPins: readonly {
    readonly instanceId: string;
    readonly observationVersion: number;
    readonly pinnedDigest: string;
  }[];
  /** LITERAL: the discovery tier never authorizes execution. */
  readonly discoveryPermitsExecution: false;
  readonly compilationDigest: string;
}

/** Compile the money-movement route: ONE intent -> candidate plans. */
export function compileMoneyMovementRoute(input: RouteCompilerInput): RouteCompilationResult {
  const intent = validateMoneyMovementIntent(input.intent);
  validateCompilerInput({ ...input, intent });
  const at = input.at;

  const plans: RoutePlan[] = [];
  const exclusions: ExcludedRouteShape[] = [];
  const candidates: readonly CorridorCandidate[] = corridorCandidates(input.corridorView);
  const origin = locationObservationFor(input.locationObservations, intent.origin);
  const destination = locationObservationFor(input.locationObservations, intent.destination);
  const onchainOrigin: OnchainPositionObservation | undefined =
    origin !== undefined && origin.observationKind === "ONCHAIN_POSITION"
      ? (origin as OnchainPositionObservation)
      : undefined;

  compileOffRampShapes(input, intent, candidates, onchainOrigin, destination, at, plans, exclusions);
  compileOnRampShapes(input, intent, candidates, origin, destination, at, plans, exclusions);
  compileCrossChainShapes(input, intent, origin, destination, at, plans, exclusions);
  compileMerchantShapes(input, intent, candidates, onchainOrigin, destination, at, plans, exclusions);

  if (
    origin === undefined ||
    destination === undefined ||
    !isSupportedLocationPair(origin, destination)
  ) {
    exclusions.push({
      shapeId: "unsupported-origin-destination-pair",
      reasons: [
        `no route family grounds the observed origin/destination pair ('${origin?.observationKind ?? "unobserved"}' -> '${destination?.observationKind ?? "unobserved"}') — the honest empty state, never a fabricated route`,
      ],
    });
  }

  const orderedPlans = sortedBy(plans, (plan) => plan.planId);
  const orderedExclusions = sortedBy(exclusions, (exclusion) => exclusion.shapeId);
  const observationVersionPins = collectObservationVersionPins(input, candidates);
  const compilationDigest = contentDigest({
    intentRef: intent.intentId,
    compiledAt: at,
    plans: orderedPlans.map((plan) => plan.planDigest),
    exclusions: orderedExclusions,
    observationVersionPins,
    discoveryPermitsExecution: false,
  });
  return deepFreeze({
    status: orderedPlans.length === 0 ? "NO_COMPILABLE_ROUTE" : "ROUTES_COMPILED",
    intentRef: intent.intentId,
    compiledAt: at,
    plans: Object.freeze(orderedPlans),
    exclusions: Object.freeze(orderedExclusions),
    observationVersionPins,
    discoveryPermitsExecution: false,
    compilationDigest,
  });
}

function isSupportedLocationPair(
  origin: FundsLocationObservation,
  destination: FundsLocationObservation,
): boolean {
  const pairs: Record<string, readonly string[]> = {
    ONCHAIN_POSITION: ["BANK_INSTRUMENT", "ONCHAIN_POSITION", "MERCHANT_BALANCE"],
    PROVIDER_ACCOUNT: ["ONCHAIN_POSITION"],
    BANK_INSTRUMENT: [],
    MERCHANT_BALANCE: [],
  };
  return (pairs[origin.observationKind] ?? []).includes(destination.observationKind);
}

/** The discovery-tier law as a first-class predicate (never authorizes). */
export function compilationPermitsExecution(result: RouteCompilationResult): false {
  void result;
  return false;
}
