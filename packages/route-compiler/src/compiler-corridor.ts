/**
 * @payswap/route-compiler — the cross-provider corridor family (P22-C,
 * ADR-0016 D5): the fiat -> chain -> fiat corridor.
 *
 * THE LOCATION-PAIR LAW (D5): the frozen location-pair dispatch grows
 * EXACTLY ONE admission — `PROVIDER_ACCOUNT -> BANK_INSTRUMENT` — and it
 * is admitted ONLY through this shape AND ONLY when an ONCHAIN position
 * is OBSERVED in the middle: the chain hop is grounded in the onchain
 * plane's observations (the relay account's issuer-scoped position on the
 * corridor chain, e.g. `stellar:testnet/asset:USDC:<issuerG>`), NEVER a
 * fabricated middle. Without the observed middle the P21 honest no-route
 * law (ADR-0014 D7) is preserved byte-for-byte: the fiat pair compiles
 * NOTHING and the exclusion surfaces.
 *
 * THE SHAPE (the exact skeleton law, the mixed-dex-offramp four-leg
 * precedent with the on-ramp head): FIAT_PSP_COLLECT ->
 * PSP_STABLECOIN_ISSUANCE -> ONCHAIN_TRANSFER -> OFF_RAMP_PAYOUT. The
 * custody chain is continuous and fully evidenced (INV-C09/E02):
 * payer's provider account -> provider pool -> the OBSERVED relay wallet
 * on the corridor chain -> the off-ramp provider's receiving account ->
 * the beneficiary bank instrument (the leg assembly lives in
 * ./compiler-corridor-legs.ts under the 400-line file law). Every amount
 * is grounded (the intent's declared fiat, the declared fiat->asset
 * conversion, the declared asset->arrival conversion — FX is never
 * invented); every custody destination is an explicit hint (the relay
 * account, the off-ramp deposit, the payout corridor route — never
 * guessed).
 */

import { sortedBy } from "./canonical.ts";
import type { MoneyMovementIntent } from "./intent.ts";
import type { RouteCompilerInput } from "./compiler-input.ts";
import { convertAmount } from "./conversion.ts";
import type { CorridorCandidate } from "./corridor.ts";
import type { ExcludedRouteShape } from "./compiler.ts";
import type { FundsLocationObservation } from "./grounding.ts";
import { isLocationObservationFresh } from "./grounding.ts";
import type { RoutePlan } from "./route-plan.ts";
import type { OnchainPositionObservation } from "./compiler-assembly.ts";
import { assembleCorridorLegs } from "./compiler-corridor-legs.ts";
import { pushPlan } from "./compiler-support.ts";

/** The corridor shape id (the plan identity's second segment). */
export const CROSS_PROVIDER_CORRIDOR_SHAPE_ID = "cross-provider-corridor" as const;

/**
 * THE OBSERVED-MIDDLE LAW (ADR-0016 D5): the corridor's chain hop is
 * grounded in an OBSERVED onchain position — the relay account named by
 * the explicit `onrampDeliveryAccount` routing hint (the on-ramp issuer's
 * delivery account) must carry a matching ONCHAIN_POSITION observation in
 * the compilation's location observations. A hint without an observation
 * grounds NOTHING (never a fabricated middle); an observation without the
 * hint is never selected (the compiler never guesses which position is
 * the relay). Deterministic: matching observations resolve in canonical
 * observationRef order.
 */
export function observedCorridorMiddle(
  input: RouteCompilerInput,
): OnchainPositionObservation | undefined {
  const relay = input.routingHints?.onrampDeliveryAccount;
  if (relay === undefined) {
    return undefined;
  }
  const matching = input.locationObservations.filter(
    (observation): observation is OnchainPositionObservation =>
      observation.observationKind === "ONCHAIN_POSITION" &&
      observation.accountRef === relay.accountRef &&
      observation.chainKey === relay.chainKey,
  );
  return sortedBy(matching, (observation) => observation.observationRef)[0];
}

/**
 * Route family 5: the cross-provider corridor (a fiat provider-account
 * origin -> a fiat bank-instrument destination over the OBSERVED onchain
 * middle). Every prerequisite is explicit evidence; every missing piece
 * is an honest exclusion, never a fabricated leg.
 */
export function compileCorridorShapes(
  input: RouteCompilerInput,
  intent: MoneyMovementIntent,
  candidates: readonly CorridorCandidate[],
  origin: FundsLocationObservation | undefined,
  destination: FundsLocationObservation | undefined,
  middle: OnchainPositionObservation | undefined,
  at: number,
  plans: RoutePlan[],
  exclusions: ExcludedRouteShape[],
): void {
  if (origin?.observationKind !== "PROVIDER_ACCOUNT" || destination?.observationKind !== "BANK_INSTRUMENT") {
    return;
  }
  const relayHint = input.routingHints?.onrampDeliveryAccount;
  if (relayHint === undefined) {
    exclusions.push({
      shapeId: CROSS_PROVIDER_CORRIDOR_SHAPE_ID,
      reasons: [
        "the corridor relay account (the on-ramp delivery account) is an explicit routing hint — the compiler never guesses a relay",
      ],
    });
    return;
  }
  if (middle === undefined) {
    exclusions.push({
      shapeId: CROSS_PROVIDER_CORRIDOR_SHAPE_ID,
      reasons: [
        `the corridor compiles only on an OBSERVED onchain middle — the relay account '${relayHint.accountRef}' on '${relayHint.chainKey}' carries no onchain-position observation in this compilation (never a fabricated middle)`,
      ],
    });
    return;
  }
  const offRampDeposit = input.routingHints?.offRampDeposit;
  if (offRampDeposit === undefined) {
    exclusions.push({
      shapeId: CROSS_PROVIDER_CORRIDOR_SHAPE_ID,
      reasons: [
        "the off-ramp provider's onchain receiving account is an explicit routing hint — custody destinations are explicit, never guessed",
      ],
    });
    return;
  }
  const payoutRouteId = input.routingHints?.offRampPayoutRouteId;
  const payoutCandidate =
    payoutRouteId !== undefined ? candidates.find((candidate) => candidate.routeId === payoutRouteId) : undefined;
  if (payoutCandidate === undefined || !payoutCandidate.eligible) {
    exclusions.push({
      shapeId: CROSS_PROVIDER_CORRIDOR_SHAPE_ID,
      reasons: [
        "the off-ramp payout corridor route is an explicit routing hint (offRampPayoutRouteId) and must be an eligible route — never inferred",
      ],
    });
    return;
  }
  const constraint = input.payoutConstraints.find((item) => item.routeId === payoutCandidate.routeId);
  if (constraint === undefined) {
    exclusions.push({
      shapeId: CROSS_PROVIDER_CORRIDOR_SHAPE_ID,
      reasons: [
        "no payout constraint evidence (an explicit external destination + the REAL gate report) grounds the payout leg",
      ],
    });
    return;
  }
  if (offRampDeposit.providerName !== payoutCandidate.providerName) {
    exclusions.push({
      shapeId: CROSS_PROVIDER_CORRIDOR_SHAPE_ID,
      reasons: [
        `the corridor's off-ramp is ONE provider's custody — the onchain deposit provider ('${offRampDeposit.providerName}') and the payout corridor provider ('${payoutCandidate.providerName}') differ`,
      ],
    });
    return;
  }

  const issuerConversion = convertAmount(intent.originAmount, input.conversionRules, middle.symbol);
  if (issuerConversion.basis !== "CONVERSION_GROUNDED") {
    const reason = issuerConversion.basis === "UNKNOWN" ? issuerConversion.reason : "the conversion is ungrounded";
    exclusions.push({
      shapeId: CROSS_PROVIDER_CORRIDOR_SHAPE_ID,
      reasons: [`the issuance amount is never guessed: ${reason}`],
    });
    return;
  }
  const payoutConversion = convertAmount(issuerConversion.amount, input.conversionRules, intent.arrivalCurrency);
  if (payoutConversion.basis !== "CONVERSION_GROUNDED") {
    const reason = payoutConversion.basis === "UNKNOWN" ? payoutConversion.reason : "the conversion is ungrounded";
    exclusions.push({
      shapeId: CROSS_PROVIDER_CORRIDOR_SHAPE_ID,
      reasons: [`the payout amount is never guessed: ${reason}`],
    });
    return;
  }

  const legs = assembleCorridorLegs({
    input,
    intent,
    middle,
    origin: {
      observationRef: origin.observationRef,
      observationVersion: origin.observationVersion,
      providerName: origin.providerName,
      accountRef: origin.accountRef,
      currency: origin.currency,
      fresh: isLocationObservationFresh(origin, at),
    },
    destinationExternalRef: destination.externalRef,
    offRampDeposit,
    payoutCandidate,
    payoutConstraint: constraint,
    issuerConversion,
    payoutConversion,
    at,
  });
  pushPlan(intent, CROSS_PROVIDER_CORRIDOR_SHAPE_ID, legs, [middle.chainKey], at, plans, exclusions);
}

export type { RoutePlan };
