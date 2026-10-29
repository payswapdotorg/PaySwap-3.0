/**
 * @payswap/route-compiler — the canonical route shapes (P5-W1).
 *
 * PORT of the old compiler's shape enumeration (MMI-19): the fixed,
 * deterministic vocabulary of ROUTE SHAPES the compiler can emit. A
 * shape is a leg SEQUENCE + composition class + execution mode + a
 * baseline flag — the shapeId is the plan identity's second segment
 * (planId = `route-plan:${intentRef}:${shapeId}`).
 *
 * The ten shapes (the old families, provider-neutralized; the tenth is
 * the P22-C growth — ADR-0016 D5, delivering the P23 platform work item
 * `platform:cross-provider-route-shape`):
 * - onchain-direct-transfer: same-chain wallet -> recipient;
 * - provider-native-bridge (BASELINE): the incumbent bridge;
 * - mixed-dex-bridge: swap -> bridge (cross-chain, composed);
 * - provider-native-offramp (BASELINE): the incumbent off-ramp;
 * - mixed-dex-offramp: swap -> deposit -> payout -> bank;
 * - provider-native-onramp (BASELINE): the incumbent on-ramp;
 * - mixed-psp-onramp: collect -> issuance -> delivery;
 * - merchant-native-settlement (BASELINE, Mode A): the provider-native
 *   merchant balance settlement;
 * - merchant-external-payswap-route (Mode B): the off-ramp shape with
 *   the honest native-unavailable marker;
 * - cross-provider-corridor (P22-C): the fiat -> chain -> fiat corridor
 *   (collect -> issuance -> onchain relay -> payout), admitted ONLY on
 *   an OBSERVED onchain middle (the location-pair law, D5).
 *
 * Plus the exclusion-only shape family (unsupported pair).
 */

/** The closed route-shape vocabulary (frozen; the plan identity law). */
export const ROUTE_SHAPE_IDS = Object.freeze([
  "onchain-direct-transfer",
  "provider-native-bridge",
  "mixed-dex-bridge",
  "provider-native-offramp",
  "mixed-dex-offramp",
  "provider-native-onramp",
  "mixed-psp-onramp",
  "merchant-native-settlement",
  "merchant-external-payswap-route",
  "cross-provider-corridor",
] as const);

export type RouteShapeId = (typeof ROUTE_SHAPE_IDS)[number];

/** The composition classes (frozen). */
export const ROUTE_COMPOSITION_CLASSES = Object.freeze([
  "ONCHAIN_ONLY",
  "MIXED",
] as const);

export type RouteCompositionClass = (typeof ROUTE_COMPOSITION_CLASSES)[number];

/** The candidate-status vocabulary (frozen; honest statuses only). */
export const ROUTE_PLAN_CANDIDATE_STATUSES = Object.freeze([
  "EXECUTABLE_CANDIDATE",
  "PROVIDER_NATIVE_BASELINE",
  "INELIGIBLE_CANDIDATE",
  "NOT_COMPARABLE",
] as const);

export type RoutePlanCandidateStatus = (typeof ROUTE_PLAN_CANDIDATE_STATUSES)[number];

/** True iff the value is a member of the closed shape vocabulary. */
export function isRouteShapeId(value: unknown): value is RouteShapeId {
  return typeof value === "string" && (ROUTE_SHAPE_IDS as readonly unknown[]).includes(value);
}

/** True iff the shape is a provider-native BASELINE shape (INV-C08). */
export function shapeIsProviderNativeBaseline(shapeId: RouteShapeId): boolean {
  return (
    shapeId === "provider-native-bridge" ||
    shapeId === "provider-native-offramp" ||
    shapeId === "provider-native-onramp" ||
    shapeId === "merchant-native-settlement"
  );
}

/** The composition class of a shape (deterministic projection). */
export function shapeCompositionClass(shapeId: RouteShapeId): RouteCompositionClass {
  if (shapeId === "onchain-direct-transfer" || shapeId === "mixed-dex-bridge" || shapeId === "provider-native-bridge") {
    return "ONCHAIN_ONLY";
  }
  return "MIXED";
}

/** The execution mode of a shape (the vocabulary assigns NO priority). */
export function shapeExecutionMode(
  shapeId: RouteShapeId,
): "PASS_THROUGH_NATIVE" | "COMPOSED_PAYSWAP" | "OPTIMIZED_MULTI_PROVIDER" {
  if (shapeIsProviderNativeBaseline(shapeId)) {
    return "PASS_THROUGH_NATIVE";
  }
  if (shapeId === "onchain-direct-transfer" || shapeId === "mixed-psp-onramp") {
    return "COMPOSED_PAYSWAP";
  }
  return "OPTIMIZED_MULTI_PROVIDER";
}

/** The leg-kind sequence of a shape (the deterministic skeleton). */
export function shapeLegSequence(shapeId: RouteShapeId): readonly string[] {
  switch (shapeId) {
    case "onchain-direct-transfer":
      return Object.freeze(["ONCHAIN_TRANSFER"]);
    case "provider-native-bridge":
      return Object.freeze(["ONCHAIN_BRIDGE"]);
    case "mixed-dex-bridge":
      return Object.freeze(["ONCHAIN_DEX_SWAP", "ONCHAIN_BRIDGE"]);
    case "provider-native-offramp":
      return Object.freeze(["ONCHAIN_TRANSFER", "OFF_RAMP_PAYOUT", "BANK_SETTLEMENT"]);
    case "mixed-dex-offramp":
      return Object.freeze([
        "ONCHAIN_DEX_SWAP",
        "ONCHAIN_TRANSFER",
        "OFF_RAMP_PAYOUT",
        "BANK_SETTLEMENT",
      ]);
    case "provider-native-onramp":
      return Object.freeze(["FIAT_PSP_COLLECT", "PSP_STABLECOIN_ISSUANCE"]);
    case "mixed-psp-onramp":
      return Object.freeze(["FIAT_PSP_COLLECT", "PSP_STABLECOIN_ISSUANCE", "ONCHAIN_TRANSFER"]);
    case "merchant-native-settlement":
      return Object.freeze(["MERCHANT_BALANCE_SETTLEMENT"]);
    case "merchant-external-payswap-route":
      return Object.freeze([
        "ONCHAIN_DEX_SWAP",
        "ONCHAIN_TRANSFER",
        "OFF_RAMP_PAYOUT",
        "BANK_SETTLEMENT",
      ]);
    case "cross-provider-corridor":
      // ADR-0016 D5 (the exact skeleton law — pinned byte-exactly by the
      // P22-C battery): the fiat -> chain -> fiat corridor over the
      // OBSERVED onchain middle (the mixed-dex-offramp four-leg precedent,
      // with the collect/issuance head replacing the DEX-swap head).
      return Object.freeze([
        "FIAT_PSP_COLLECT",
        "PSP_STABLECOIN_ISSUANCE",
        "ONCHAIN_TRANSFER",
        "OFF_RAMP_PAYOUT",
      ]);
  }
}

/** The exclusion-only shape family (the honest empty state). */
export const UNSUPPORTED_PAIR_SHAPE = "unsupported-origin-destination-pair" as const;

/** This package's wire vocabulary version (frozen; part of every digest). */
export const ROUTE_COMPILER_WIRE_VERSION = "1.0.0" as const;

/** The route-plan schema version carried by every compiled plan. */
export const ROUTE_PLAN_SCHEMA_VERSION = "1.0.0" as const;

/** The comparability-gate law version (the five-requirement vocabulary). */
export const COMPARABILITY_GATE_VERSION = "1.0.0" as const;

/** The route-scoring vocabulary version (valued-component trace law). */
export const ROUTE_SCORING_VERSION = "1.0.0" as const;

/** The deterministic identity scheme version (plan/leg/lane ids). */
export const ROUTE_IDENTITY_VERSION = "1.0.0" as const;

/** True iff a candidate wire version equals this package's (never coerced). */
export function isCurrentWireVersion(value: unknown): value is typeof ROUTE_COMPILER_WIRE_VERSION {
  return value === ROUTE_COMPILER_WIRE_VERSION;
}

/** Require a wire version equal to the given pinned version (fail closed). */
export function requireWireVersion(
  value: unknown,
  expected: string,
  subject: string,
): string {
  if (value !== expected) {
    throw new Error(`${subject} must carry wire version '${expected}' (stale or foreign input is refused)`);
  }
  return value;
}
