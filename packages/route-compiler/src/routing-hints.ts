/**
 * @payswap/route-compiler — routing hints (P5-W1).
 *
 * PORT of the old compiler's RoutingHints block (MMI-19): explicit
 * compilation inputs that are ROUTING HINTS, never intent data. The
 * intent is rail-neutral (the economic lane's law) — the compiler
 * learns a location's rail from OBSERVATIONS (grounding.ts) and the
 * concrete execution identities (the intermediate stablecoin, the
 * bridge deposit asset, the provider receiving addresses) from THESE
 * hints. A hint is OPTIONAL: its absence produces an honest EXCLUSION
 * ("the compiler never guesses a custody destination or an
 * intermediate asset"), never a fabricated route.
 */

import { RouteCompilerInputError } from "./errors.ts";
import { deepFreeze, requireBoundedString, requireObject, LIMITS, type Fail } from "./canonical.ts";
import type { PinnedAssetIdentity } from "./pins/onchain.ts";

const fail: Fail = (message: string) => new RouteCompilerInputError(message);

/** Explicit compilation inputs that are routing hints, NOT intent data. */
export interface RoutingHints {
  /** The intermediate asset for swap->payout routes (never invented). */
  readonly intermediateAsset?: PinnedAssetIdentity;
  /** The deposit asset a bridge expects on the origin chain. */
  readonly bridgeDepositAsset?: PinnedAssetIdentity;
  /** The bridge protocol identity on the origin chain (bridge routes). */
  readonly bridgeProtocol?: { readonly protocolKey: string; readonly chainKey: string };
  /** The off-ramp provider's onchain receiving account per chain. */
  readonly offRampDeposit?: {
    readonly providerName: string;
    readonly chainKey: string;
    readonly accountRef: string;
  };
  /** The on-ramp issuer's delivery account on the destination chain. */
  readonly onrampDeliveryAccount?: { readonly chainKey: string; readonly accountRef: string };
  /** The corridor routeId executing off-ramp payouts (explicit, never inferred). */
  readonly offRampPayoutRouteId?: string;
  /** The corridor routeId of the provider-native baseline (explicit). */
  readonly nativeBaselineRouteId?: string;
}

/** Fail-closed validation of the routing hints (all optional, all bounded). */
export function validateRoutingHints(candidate: unknown): RoutingHints {
  if (candidate === undefined) {
    return Object.freeze({});
  }
  const record = requireObject(candidate, "RoutingHints", fail);
  const hints: {
    intermediateAsset?: PinnedAssetIdentity;
    bridgeDepositAsset?: PinnedAssetIdentity;
    bridgeProtocol?: { protocolKey: string; chainKey: string };
    offRampDeposit?: { providerName: string; chainKey: string; accountRef: string };
    onrampDeliveryAccount?: { chainKey: string; accountRef: string };
    offRampPayoutRouteId?: string;
    nativeBaselineRouteId?: string;
  } = {};
  if (record["intermediateAsset"] !== undefined) {
    hints.intermediateAsset = validateAssetHint(record["intermediateAsset"], "intermediateAsset");
  }
  if (record["bridgeDepositAsset"] !== undefined) {
    hints.bridgeDepositAsset = validateAssetHint(record["bridgeDepositAsset"], "bridgeDepositAsset");
  }
  if (record["bridgeProtocol"] !== undefined) {
    const protocolRecord = requireObject(record["bridgeProtocol"], "bridgeProtocol", fail);
    hints.bridgeProtocol = Object.freeze({
      protocolKey: requireBoundedString(protocolRecord["protocolKey"], "bridgeProtocol.protocolKey", LIMITS.refMaxLength, fail),
      chainKey: requireBoundedString(protocolRecord["chainKey"], "bridgeProtocol.chainKey", LIMITS.refMaxLength, fail),
    });
  }
  if (record["offRampDeposit"] !== undefined) {
    const depositRecord = requireObject(record["offRampDeposit"], "offRampDeposit", fail);
    hints.offRampDeposit = Object.freeze({
      providerName: requireBoundedString(depositRecord["providerName"], "offRampDeposit.providerName", LIMITS.refMaxLength, fail),
      chainKey: requireBoundedString(depositRecord["chainKey"], "offRampDeposit.chainKey", LIMITS.refMaxLength, fail),
      accountRef: requireBoundedString(depositRecord["accountRef"], "offRampDeposit.accountRef", LIMITS.refMaxLength, fail),
    });
  }
  if (record["onrampDeliveryAccount"] !== undefined) {
    const deliveryRecord = requireObject(record["onrampDeliveryAccount"], "onrampDeliveryAccount", fail);
    hints.onrampDeliveryAccount = Object.freeze({
      chainKey: requireBoundedString(deliveryRecord["chainKey"], "onrampDeliveryAccount.chainKey", LIMITS.refMaxLength, fail),
      accountRef: requireBoundedString(deliveryRecord["accountRef"], "onrampDeliveryAccount.accountRef", LIMITS.refMaxLength, fail),
    });
  }
  if (record["offRampPayoutRouteId"] !== undefined) {
    hints.offRampPayoutRouteId = requireBoundedString(record["offRampPayoutRouteId"], "offRampPayoutRouteId", LIMITS.refMaxLength, fail);
  }
  if (record["nativeBaselineRouteId"] !== undefined) {
    hints.nativeBaselineRouteId = requireBoundedString(record["nativeBaselineRouteId"], "nativeBaselineRouteId", LIMITS.refMaxLength, fail);
  }
  return deepFreeze(hints);
}

function validateAssetHint(candidate: unknown, subject: string): PinnedAssetIdentity {
  const record = requireObject(candidate, `RoutingHints.${subject}`, fail);
  return Object.freeze({
    chain: requireBoundedString(record["chain"], `${subject}.chain`, LIMITS.refMaxLength, fail),
    assetId: requireBoundedString(record["assetId"], `${subject}.assetId`, LIMITS.refMaxLength, fail),
    symbol: requireBoundedString(record["symbol"], `${subject}.symbol`, 3, fail),
  });
}
