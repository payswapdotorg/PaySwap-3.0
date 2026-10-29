/**
 * PaySwap Desktop renderer (P22-B, ADR-0016 D5/D6) — the CORRIDOR PLAN
 * PROJECTION: derive the app's CorridorPlanPresentationPin from a
 * compiled corridor plan through the C lane's REAL leg-law derivation
 * (corridorPlanLegLaws — the deterministic four-leg law: each leg its
 * own lane, its own custody hop, its own grounding prerequisites).
 *
 * FAIL-CLOSED: a plan that is not the pinned cross-provider-corridor
 * shape, or whose leg laws cannot derive, or whose relay asset is
 * absent, yields NO projection — the plain route row renders without
 * the corridor card (never a fabricated presentation).
 *
 * The people language is DERIVED, never invented: the custody phrases
 * and lane labels project the compiled plan's own party/lane facts;
 * the leg people labels + the corridor method literals are the pinned
 * vocabulary (the app's corridor pins — same literals as the surface
 * fold and the route-planning authority, verified by the mirror tests).
 */

import { corridorPlanLegLaws, type PinnedRoutePlan } from "@payswap/route-planning";
import {
  CORRIDOR_PLAN_LEG_PEOPLE_LABELS_PIN,
  PINNED_CORRIDOR_GHS_ONRAMP_FUNDING_METHOD,
  PINNED_CORRIDOR_KES_OFFRAMP_PAYOUT_METHOD,
  PINNED_CROSS_PROVIDER_CORRIDOR_SHAPE_ID,
  type CorridorPlanLegViewPin,
  type CorridorPlanPresentationPin,
  type PinnedCorridorLegKind,
} from "@payswap/app";

/** The custody-party kinds the compiler's corridor legs use, in people language. */
const CUSTODY_PARTY_PHRASES: Readonly<Record<string, (id: string) => string>> = Object.freeze({
  ONCHAIN_WALLET: (id) => `the onchain wallet ${id}`,
  EXTERNAL_PROVIDER: (id) => `the ${id} provider account`,
  EXTERNAL_BANK_INSTRUMENT: (id) => `the bank account ${id}`,
  ONCHAIN_PROTOCOL: (id) => `the onchain protocol ${id}`,
  MERCHANT_BALANCE: (id) => `the merchant balance ${id}`,
});

function custodyPhrase(party: { readonly kind: string; readonly id: string }): string {
  const phrase = CUSTODY_PARTY_PHRASES[party.kind];
  return phrase !== undefined ? phrase(party.id) : `${party.id} (${party.kind})`;
}

function laneLabel(lane: { readonly kind: "PROVIDER" | "ONCHAIN_CHAIN"; readonly id: string }): string {
  return lane.kind === "ONCHAIN_CHAIN"
    ? `the ${lane.id} onchain rail`
    : `the ${lane.id} provider lane`;
}

/**
 * The funding/payout method of the presentation: the PINNED corridor
 * method literals when the observed lanes ARE the pinned corridor's
 * lanes (the FLW GHS on-ramp + the Paystack KES off-ramp); the honest
 * lane identity otherwise (a method is never invented for a lane the
 * pins do not name).
 */
function corridorMethodOf(
  laneId: string,
  currency: string,
  pinnedProvider: string,
  pinnedCurrency: string,
  pinnedMethod: string,
): string {
  if (laneId === pinnedProvider && currency === pinnedCurrency) {
    return pinnedMethod;
  }
  return `the ${laneId} lane`;
}

/**
 * Derive the corridor plan presentation pin from a compiled plan.
 * Undefined for every non-corridor shape and every law violation —
 * the caller renders nothing then (fail-closed).
 */
export function corridorPlanPresentationOf(
  plan: PinnedRoutePlan,
  corridorQuery: {
    readonly sourceCurrency: string;
    readonly destinationCurrency: string;
  },
): CorridorPlanPresentationPin | undefined {
  if (plan.shapeId !== PINNED_CROSS_PROVIDER_CORRIDOR_SHAPE_ID) {
    return undefined;
  }
  let laws: readonly ReturnType<typeof corridorPlanLegLaws>[number][];
  try {
    laws = [...corridorPlanLegLaws(plan)];
  } catch {
    // The typed CorridorPlanLawError — never a lenient projection.
    return undefined;
  }
  if (laws.length !== 4) {
    return undefined;
  }
  const relayLaw = laws.find((law) => law.legKind === "ONCHAIN_TRANSFER");
  const relayLeg = plan.legs.find((leg) => leg.legKind === "ONCHAIN_TRANSFER");
  const relayAssetRef = relayLeg?.custody.assetRef;
  if (relayLaw === undefined || relayLeg === undefined || typeof relayAssetRef !== "string" || relayAssetRef.length === 0) {
    return undefined;
  }

  const legs: CorridorPlanLegViewPin[] = [];
  const custodyChain: string[] = [];
  for (const law of laws) {
    const peopleLabel = CORRIDOR_PLAN_LEG_PEOPLE_LABELS_PIN[law.legKind as PinnedCorridorLegKind];
    if (peopleLabel === undefined) {
      return undefined;
    }
    const prerequisites = law.prerequisites.map(
      (prerequisite) =>
        `grounded by the recorded observation ${prerequisite.observationRef} (version ${String(prerequisite.observationVersion)})`,
    );
    if (prerequisites.length === 0) {
      return undefined;
    }
    legs.push({
      legIndex: law.legIndex,
      legKind: law.legKind as PinnedCorridorLegKind,
      peopleLabel,
      lane: { kind: law.lane.kind, id: law.lane.id, label: laneLabel(law.lane) },
      custody: {
        from: custodyPhrase(law.custodyHop.from),
        to: custodyPhrase(law.custodyHop.to),
      },
      ...(law.legKind === "ONCHAIN_TRANSFER" ? { assetRef: relayAssetRef } : {}),
      prerequisites,
    });
    if (law.legIndex === 0) {
      custodyChain.push(custodyPhrase(law.custodyHop.from));
    }
    custodyChain.push(custodyPhrase(law.custodyHop.to));
  }

  const directionClass = corridorQuery.sourceCurrency === corridorQuery.destinationCurrency ? "MOVE" : "CONVERT";
  const collectLane = legs[0]?.lane;
  const payoutLane = legs[3]?.lane;
  if (collectLane === undefined || payoutLane === undefined) {
    return undefined;
  }
  const fundingMethod = corridorMethodOf(
    collectLane.id,
    corridorQuery.sourceCurrency,
    "flutterwave",
    "GHS",
    PINNED_CORRIDOR_GHS_ONRAMP_FUNDING_METHOD,
  );
  const payoutMethod = corridorMethodOf(
    payoutLane.id,
    corridorQuery.destinationCurrency,
    "paystack",
    "KES",
    PINNED_CORRIDOR_KES_OFFRAMP_PAYOUT_METHOD,
  );

  return {
    planId: plan.planId,
    shapeId: PINNED_CROSS_PROVIDER_CORRIDOR_SHAPE_ID,
    directionClass,
    legCount: laws.length,
    legs,
    custodyChain,
    relayAssetRef,
    relayChainKey: relayLaw.lane.id,
    fundingMethod,
    payoutMethod,
    outcomeLine:
      `A ${String(laws.length)}-leg cross-provider corridor plan (${directionClass}): ` +
      `collect, issue, transfer onchain, pay out — custody passes through ` +
      `${String(custodyChain.length)} named points and the onchain leg carries the ` +
      `issuer-scoped stablecoin. The leg count is disclosed, never hidden.`,
  };
}
