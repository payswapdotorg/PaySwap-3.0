/**
 * PaySwap Desktop renderer (P17-C, ADR-0010 D4) — the mission linkage:
 * the channel DTO shapes the engine plans over + the typed intent guard
 * (the D1 law — a drifted or prose-shaped DTO never constructs a
 * trigger). Split from ./routePlanningEngineAdapter.ts for the
 * ≤400-line file law.
 */

import { RoutePlanningNoIntentError, type PaymentIntentPin } from "@payswap/app";

/** The mission-plane read model the adapter plans over (injected — the channel-backed default lives in ./routePlanningComposition.ts). */
export interface RoutePlanningMissionSource {
  /** The board read model (newest-updated-first; the channel's deterministic order). */
  board(): Promise<readonly RoutePlanningMissionBoardItem[]>;
  /** The full mission detail (null when unknown). */
  detail(missionId: string): Promise<RoutePlanningMissionDetail | null>;
}

/** The board item (the channel DTO subset the linkage reads). */
export interface RoutePlanningMissionBoardItem {
  readonly missionId: string;
  readonly status: string;
  readonly hasCompiledIntent: boolean;
  readonly updatedAt: string;
}

/** The mission detail subset the engine consumes (the channel DTO shape). */
export interface RoutePlanningMissionDetail {
  readonly id: string;
  readonly status: string;
  readonly intent?: RoutePlanningMissionIntentDto;
  readonly fields?: Readonly<Record<string, unknown>>;
}

/** The compiled 11-key canonical intent DTO (the channel wire shape). */
export interface RoutePlanningMissionIntentDto {
  readonly intentId: string;
  readonly principalRef: string;
  readonly origin: { readonly locationRef: string; readonly currency: string; readonly observationRef: string };
  readonly destination: { readonly locationRef: string; readonly currency: string; readonly observationRef: string };
  readonly originAmount: { readonly currency: string; readonly minorUnits: string };
  readonly arrivalCurrency: string;
  readonly constraints: { readonly maxSettlementMs: number; readonly maxRouteHops: number };
  readonly intentAuthorizationRef: string;
  readonly declaredAt: number;
  readonly expiresAt: number;
  readonly commerceRef: string;
}

/* ------------------- the typed intent guard (the D1 law) ------------------- */

const PAYMENT_INTENT_KEYS = [
  "intentId", "principalRef", "origin", "destination", "originAmount",
  "arrivalCurrency", "constraints", "intentAuthorizationRef", "declaredAt", "expiresAt", "commerceRef",
] as const;

function requireLocation(value: unknown, subject: string): { readonly locationRef: string; readonly currency: string; readonly observationRef: string } {
  if (typeof value !== "object" || value === null) { throw new RoutePlanningNoIntentError(`${subject} must be { locationRef, currency, observationRef }`); }
  const record = value as Readonly<Record<string, unknown>>;
  for (const key of ["locationRef", "currency", "observationRef"]) {
    if (typeof record[key] !== "string" || (record[key] as string).length === 0) {
      throw new RoutePlanningNoIntentError(`${subject}.${key} must be a non-empty string`);
    }
  }
  return value as { readonly locationRef: string; readonly currency: string; readonly observationRef: string };
}

/** Field-map the channel DTO into the trigger's PaymentIntentPin (exact key set + shapes; a drifted DTO never constructs a trigger). */
export function mapMissionIntentToPin(dto: RoutePlanningMissionIntentDto): PaymentIntentPin {
  const keys = Object.keys(dto).sort().join(",");
  const expected = [...PAYMENT_INTENT_KEYS].sort().join(",");
  if (keys !== expected) {
    throw new RoutePlanningNoIntentError(`the compiled intent DTO must carry exactly the 11 canonical keys (expected ${expected})`);
  }
  if (typeof dto.intentId !== "string" || dto.intentId.length === 0) { throw new RoutePlanningNoIntentError("intentId must be a non-empty string"); }
  if (typeof dto.principalRef !== "string" || dto.principalRef.length === 0) { throw new RoutePlanningNoIntentError("principalRef must be a non-empty string"); }
  if (typeof dto.originAmount?.currency !== "string" || typeof dto.originAmount?.minorUnits !== "string" || !/^\d+$/.test(dto.originAmount.minorUnits)) {
    throw new RoutePlanningNoIntentError("originAmount must carry a currency and an integer minorUnits string");
  }
  if (typeof dto.arrivalCurrency !== "string" || dto.arrivalCurrency.length === 0) { throw new RoutePlanningNoIntentError("arrivalCurrency must be a non-empty string"); }
  if (typeof dto.constraints?.maxSettlementMs !== "number" || !Number.isSafeInteger(dto.constraints.maxSettlementMs) || dto.constraints.maxSettlementMs < 1) {
    throw new RoutePlanningNoIntentError("constraints.maxSettlementMs must be a positive integer");
  }
  if (typeof dto.constraints?.maxRouteHops !== "number" || !Number.isSafeInteger(dto.constraints.maxRouteHops) || dto.constraints.maxRouteHops < 1 || dto.constraints.maxRouteHops > 8) {
    throw new RoutePlanningNoIntentError("constraints.maxRouteHops must be an integer in [1,8]");
  }
  for (const key of ["intentAuthorizationRef", "commerceRef"] as const) {
    if (typeof dto[key] !== "string" || dto[key].length === 0) { throw new RoutePlanningNoIntentError(`${key} must be a non-empty string`); }
  }
  for (const key of ["declaredAt", "expiresAt"] as const) {
    if (typeof dto[key] !== "number" || !Number.isSafeInteger(dto[key]) || dto[key] < 0) { throw new RoutePlanningNoIntentError(`${key} must be a non-negative integer ms instant`); }
  }
  return {
    intentId: dto.intentId,
    principalRef: dto.principalRef,
    origin: requireLocation(dto.origin, "origin"),
    destination: requireLocation(dto.destination, "destination"),
    originAmount: { currency: dto.originAmount.currency, minorUnits: dto.originAmount.minorUnits },
    arrivalCurrency: dto.arrivalCurrency,
    constraints: { maxSettlementMs: dto.constraints.maxSettlementMs, maxRouteHops: dto.constraints.maxRouteHops },
    intentAuthorizationRef: dto.intentAuthorizationRef,
    declaredAt: dto.declaredAt,
    expiresAt: dto.expiresAt,
    commerceRef: dto.commerceRef,
  };
}
