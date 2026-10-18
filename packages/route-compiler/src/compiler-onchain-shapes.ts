/**
 * @payswap/route-compiler — the on-ramp + cross-chain families (P5-W1).
 *
 * Route family 2 (provider origin -> onchain destination): the
 * provider-native on-ramp baseline (collect -> issuance delivering to
 * the recipient wallet) and the mixed on-ramp (collect -> issuance ->
 * delivery transfer). Route family 3 (onchain -> onchain): the
 * same-chain direct transfer, the provider-native bridge baseline and
 * the mixed dex-bridge (whose BRIDGE arrival amount stays honestly
 * UNKNOWN — observed at destination-chain finality, never estimated).
 */

import { isoUtcFromEpochMillis } from "./canonical-time.ts";
import type { MoneyMovementIntent } from "./intent.ts";
import type { RouteCompilerInput } from "./compiler-input.ts";
import type { RouteLegBase } from "./leg-contracts.ts";
import type { CustodyParty, CustodyTransfer } from "./custody.ts";
import { onchainWalletParty, providerPoolParty, stablecoinIssuerParty } from "./leg-arms.ts";
import { onchainFinality } from "./finality.ts";
import { routeLegId } from "./identifiers.ts";
import {
  assembleDexSwapLeg,
  conversionAssumption,
  freezeLeg,
  freshnessAssumption,
  pickBaselineCandidate,
  pushPlan,
  writeLeg,
  type OnchainPositionObservation,
} from "./compiler-assembly.ts";
import type { ExcludedRouteShape } from "./compiler.ts";
import type { FundsLocationObservation } from "./grounding.ts";
import { isLocationObservationFresh } from "./grounding.ts";
import { convertAmount } from "./conversion.ts";
import type { CorridorCandidate } from "./corridor.ts";
import type { RoutePlan } from "./route-plan.ts";

/** Route family 2: provider origin -> onchain destination. */
export function compileOnRampShapes(
  input: RouteCompilerInput,
  intent: MoneyMovementIntent,
  candidates: readonly CorridorCandidate[],
  origin: FundsLocationObservation | undefined,
  destination: FundsLocationObservation | undefined,
  at: number,
  plans: RoutePlan[],
  exclusions: ExcludedRouteShape[],
): void {
  if (origin?.observationKind !== "PROVIDER_ACCOUNT" || destination?.observationKind !== "ONCHAIN_POSITION") {
    return;
  }
  const onchainDestination = destination as OnchainPositionObservation;
  const providerName = origin.providerName;
  const providerParty: CustodyParty = { kind: "EXTERNAL_PROVIDER", providerName, accountRef: origin.accountRef };
  const poolParty = providerPoolParty(providerName);
  const issuerParty = stablecoinIssuerParty(destination.symbol, destination.chainKey);
  const recipientWallet = onchainWalletParty(destination.accountRef, destination.chainKey);
  const converted = convertAmount(intent.originAmount, input.conversionRules, destination.symbol);
  const baseline = pickBaselineCandidate(input, candidates);
  const originFresh = isLocationObservationFresh(origin, at);

  const collectLeg = (hop: number, planPrefix: string): RouteLegBase =>
    freezeLeg({
      legId: routeLegId(planPrefix, hop, "FIAT_PSP_COLLECT"),
      legKind: "FIAT_PSP_COLLECT",
      hopIndex: hop,
      intentRef: intent.intentId,
      authorizationLineage: {
        intentRef: intent.intentId,
        intentAuthorizationRef: intent.intentAuthorizationRef,
        legAuthorization: {
          kind: "INTENT_AUTHORIZATION_ONLY",
          reason: "the payer's charge authorization IS the intent's authorization artifact",
        },
      },
      stateGrounding: {
        observations: [
          {
            observationKind: "LocationObservation",
            observationId: origin.observationRef,
            observationVersion: origin.observationVersion,
            fresh: originFresh,
            freshnessRule: "location-observation:inclusive-bound",
          },
        ],
        groundingFailures: originFresh ? [] : ["the origin provider-account observation is stale"],
      },
      finality: providerOwned(providerName),
      custody: {
        from: providerParty,
        to: poolParty,
        via: poolParty,
        assetRef: origin.currency,
        amount: intent.originAmount,
        evidenceRefs: [`provider-account:${origin.observationRef}`],
      } as CustodyTransfer,
      plannedAmount: { basis: "INTENT_DECLARED", amount: intent.originAmount },
      assumptions: freshnessAssumption(intent, origin.observationRef, "the origin account observation's freshness window"),
      evidenceRefs: [`provider-account:${origin.observationRef}`, `native-flow:${providerName}`],
    });

  const issuanceLeg = (hop: number, planPrefix: string, to: CustodyParty, via: CustodyParty): RouteLegBase => {
    const groundingFailures: string[] = [];
    if (converted.basis !== "CONVERSION_GROUNDED") {
      groundingFailures.push("the issuance conversion is ungrounded");
    }
    return freezeLeg({
      legId: routeLegId(planPrefix, hop, "PSP_STABLECOIN_ISSUANCE"),
      legKind: "PSP_STABLECOIN_ISSUANCE",
      hopIndex: hop,
      intentRef: intent.intentId,
      authorizationLineage: {
        intentRef: intent.intentId,
        intentAuthorizationRef: intent.intentAuthorizationRef,
        legAuthorization: {
          kind: "INTENT_AUTHORIZATION_ONLY",
          reason: "the on-ramp issuance executes under the intent authorization",
        },
      },
      stateGrounding: {
        observations: [
          {
            observationKind: "LocationObservation",
            observationId: origin.observationRef,
            observationVersion: origin.observationVersion,
            fresh: originFresh,
            freshnessRule: "location-observation:inclusive-bound",
          },
        ],
        groundingFailures,
      },
      finality: providerOwned(providerName),
      custody: {
        from: poolParty,
        to,
        via,
        assetRef: destination.assetId,
        amount: "amount" in converted ? converted.amount : intent.originAmount,
        evidenceRefs: ["issuance:stablecoin-mint"],
      } as CustodyTransfer,
      plannedAmount: converted,
      assumptions: conversionAssumption(
        intent,
        "ruleId" in converted ? converted.ruleId : "ungrounded",
        "amount" in converted ? converted.amount : intent.originAmount,
      ),
      evidenceRefs: ["issuance:stablecoin-mint"],
    });
  };

  const deliveryAccount = input.routingHints?.onrampDeliveryAccount;
  if (deliveryAccount !== undefined) {
    const planPrefix = `route-plan:${intent.intentId}:mixed-psp-onramp`;
    const destinationFresh = isLocationObservationFresh(destination, at);
    const legs = [
      collectLeg(0, planPrefix),
      issuanceLeg(1, planPrefix, issuerParty, issuerParty),
      freezeLeg({
        legId: routeLegId(planPrefix, 2, "ONCHAIN_TRANSFER"),
        legKind: "ONCHAIN_TRANSFER",
        hopIndex: 2,
        intentRef: intent.intentId,
        authorizationLineage: {
          intentRef: intent.intentId,
          intentAuthorizationRef: intent.intentAuthorizationRef,
          legAuthorization: {
            kind: "INTENT_AUTHORIZATION_ONLY",
            reason: "the delivery transfer executes under the intent authorization",
          },
        },
        stateGrounding: {
          observations: [
            {
              observationKind: "AssetObservation",
              observationId: destination.observationRef,
              observationVersion: destination.observationVersion,
              fresh: destinationFresh,
              freshnessRule: "location-observation:inclusive-bound",
            },
          ],
          groundingFailures: destinationFresh ? [] : ["the delivery-position observation is stale"],
        },
        finality: onchainFinality("PROBABILISTIC", destination.chainKey),
        custody: {
          from: issuerParty,
          to: recipientWallet,
          assetRef: destination.assetId,
          amount: "amount" in converted ? converted.amount : intent.originAmount,
          evidenceRefs: [`delivery-account:${deliveryAccount.accountRef}`],
        } as CustodyTransfer,
        plannedAmount: converted,
        assumptions: [
          {
            assumptionId: `assumption:${planPrefix}:delivery`,
            basis: "ROUTING_HINT" as const,
            statement: `the on-ramp delivery account '${deliveryAccount.accountRef}' on '${deliveryAccount.chainKey}' receives the issued value before delivery`,
            evidenceRefs: [`onramp-delivery:${deliveryAccount.accountRef}`],
            assumedValidUntil: isoUtcFromEpochMillis(intent.expiresAt),
          },
        ],
        evidenceRefs: [
          `onramp-delivery:${deliveryAccount.accountRef}`,
          `asset-observation:${onchainDestination.observationRef}`,
        ],
      }),
    ];
    pushPlan(intent, "mixed-psp-onramp", legs, [destination.chainKey], at, plans, exclusions);
  } else {
    exclusions.push({
      shapeId: "mixed-psp-onramp",
      reasons: [
        "the on-ramp delivery account is an explicit routing hint — custody destinations are explicit, never guessed",
      ],
    });
  }

  if (baseline === undefined) {
    exclusions.push({
      shapeId: "provider-native-onramp",
      reasons: ["the incumbent baseline is emitted only on real evidence, never fabricated"],
    });
    return;
  }
  {
    const planPrefix = `route-plan:${intent.intentId}:provider-native-onramp`;
    const legs = [collectLeg(0, planPrefix), issuanceLeg(1, planPrefix, recipientWallet, issuerParty)];
    pushPlan(intent, "provider-native-onramp", legs, [destination.chainKey], at, plans, exclusions);
  }
}

/** Route family 3: onchain -> onchain (direct / bridge / dex-bridge). */
export function compileCrossChainShapes(
  input: RouteCompilerInput,
  intent: MoneyMovementIntent,
  origin: FundsLocationObservation | undefined,
  destination: FundsLocationObservation | undefined,
  at: number,
  plans: RoutePlan[],
  exclusions: ExcludedRouteShape[],
): void {
  if (origin?.observationKind !== "ONCHAIN_POSITION" || destination?.observationKind !== "ONCHAIN_POSITION") {
    return;
  }
  const onchainOrigin = origin as OnchainPositionObservation;
  const originWallet = onchainWalletParty(origin.accountRef, origin.chainKey);
  const recipientWallet = onchainWalletParty(destination.accountRef, destination.chainKey);

  if (origin.chainKey === destination.chainKey) {
    const legs = [
      writeLeg(
        input,
        intent,
        "onchain-direct-transfer",
        0,
        "ONCHAIN_TRANSFER",
        onchainOrigin,
        { from: originWallet, to: recipientWallet, assetRef: origin.assetId, amount: intent.originAmount },
        { basis: "INTENT_DECLARED", amount: intent.originAmount },
      ),
    ];
    pushPlan(intent, "onchain-direct-transfer", legs, [origin.chainKey], at, plans, exclusions);
    return;
  }

  const bridgeProtocol = input.routingHints?.bridgeProtocol;
  const nativeBridge = bridgeProtocol ?? { protocolKey: "native-bridge", chainKey: origin.chainKey };
  {
    const legs = [
      writeLeg(
        input,
        intent,
        "provider-native-bridge",
        0,
        "ONCHAIN_BRIDGE",
        onchainOrigin,
        {
          from: originWallet,
          to: recipientWallet,
          via: { kind: "ONCHAIN_PROTOCOL", protocolKey: nativeBridge.protocolKey, chainKey: nativeBridge.chainKey },
          assetRef: origin.assetId,
          amount: intent.originAmount,
        },
        { basis: "INTENT_DECLARED", amount: intent.originAmount },
        destination.chainKey,
      ),
    ];
    pushPlan(intent, "provider-native-bridge", legs, [origin.chainKey, destination.chainKey], at, plans, exclusions);
  }

  const bridgeDepositAsset = input.routingHints?.bridgeDepositAsset;
  if (bridgeDepositAsset === undefined || bridgeProtocol === undefined) {
    exclusions.push({
      shapeId: "mixed-dex-bridge",
      reasons: [
        ...(bridgeDepositAsset === undefined
          ? ["the bridge deposit asset is an explicit routing hint — the compiler never invents a deposit asset"]
          : []),
        ...(bridgeProtocol === undefined
          ? ["the bridge protocol identity is an explicit routing hint — the via party is never guessed"]
          : []),
      ],
    });
    return;
  }
  const swap = assembleDexSwapLeg(input, intent, "mixed-dex-bridge", bridgeDepositAsset, onchainOrigin, at);
  if (swap === undefined) {
    exclusions.push({ shapeId: "mixed-dex-bridge", reasons: ["the DEX lane was not proved"] });
    return;
  }
  const legs = [
    swap.leg,
    writeLeg(
      input,
      intent,
      "mixed-dex-bridge",
      1,
      "ONCHAIN_BRIDGE",
      onchainOrigin,
      {
        from: originWallet,
        to: recipientWallet,
        via: { kind: "ONCHAIN_PROTOCOL", protocolKey: bridgeProtocol.protocolKey, chainKey: bridgeProtocol.chainKey },
        assetRef: origin.assetId,
        amount: intent.originAmount,
      },
      {
        basis: "UNKNOWN",
        reason:
          "the bridge arrival amount on the destination chain is observed at chain-B finality — never estimated without evidence",
      },
      destination.chainKey,
    ),
  ];
  pushPlan(intent, "mixed-dex-bridge", legs, [origin.chainKey, destination.chainKey], at, plans, exclusions, swap.lane.evaluation);
}

function providerOwned(providerName: string) {
  return { finalityNeverAssumed: true as const, candidates: [{ candidateOnly: true as const, model: "PROVIDER_OWNED" as const, providerName }] };
}

export type { RoutePlan };
