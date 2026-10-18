/**
 * @payswap/route-compiler — the off-ramp + merchant families (P5-W1).
 *
 * The tail-sharing families: OFF-RAMP (onchain origin -> bank
 * destination: provider-native baseline, mixed-dex composed, shared
 * payout + bank tail) and MERCHANT (onchain origin -> merchant balance:
 * the provider-native settlement baseline — Mode A — and the external
 * route with the honest native-unavailable marker — Mode B). Tail
 * laws: the payout corridor route is an EXPLICIT hint; the payout
 * constraint is the REAL wire evidence (explicit external destination +
 * the real gate report — F-1); payout/bank amounts are
 * CONVERSION-grounded (never guessed); the bank arrival is
 * INTENT_AUTHORIZATION_ONLY (the evidenced consequence).
 */
import { isoUtcFromEpochMillis } from "./canonical-time.ts";
import type { MoneyMovementIntent, RouteCompilerInput, RouteLegBase, CustodyParty, CustodyTransfer, CorridorCandidate, ExcludedRouteShape, FundsLocationObservation, RoutePlan, OnchainPositionObservation } from "./compiler-support.ts";
import { bankInstrumentParty, onchainWalletParty } from "./leg-arms.ts";
import { providerOwnedFinality } from "./finality.ts";
import { merchantBalanceParty, merchantEligibilityIsFresh, merchantNativeSettlementUnavailable } from "./merchant-legs.ts";
import { routeLegId, transferOutAuthorizationId } from "./identifiers.ts";
import { assembleDexSwapLeg, conversionAssumption, custodyAccountRefOf, freezeLeg, pickBaselineCandidate, pushPlan, transferLegTo } from "./compiler-assembly.ts";
import { convertAmount } from "./conversion.ts";

/** Route family 1: onchain origin -> bank destination. */
export function compileOffRampShapes(
  input: RouteCompilerInput,
  intent: MoneyMovementIntent,
  candidates: readonly CorridorCandidate[],
  origin: OnchainPositionObservation | undefined,
  destination: FundsLocationObservation | undefined,
  at: number,
  plans: RoutePlan[],
  exclusions: ExcludedRouteShape[],
): void {
  if (origin === undefined || destination?.observationKind !== "BANK_INSTRUMENT") {
    return;
  }
  const bankParty = bankInstrumentParty(destination.externalRef);
  const baseline = pickBaselineCandidate(input, candidates);
  const intermediate = input.routingHints?.intermediateAsset;
  const offRampDeposit = input.routingHints?.offRampDeposit;

  if (intermediate === undefined || offRampDeposit === undefined) {
    exclusions.push({
      shapeId: "mixed-dex-offramp",
      reasons: [
        ...(intermediate === undefined
          ? ["the intermediate asset is an explicit routing hint — the compiler never invents an intermediate asset"]
          : []),
        ...(offRampDeposit === undefined
          ? ["the off-ramp provider's receiving account is an explicit routing hint — custody destinations are explicit, never guessed"]
          : []),
      ],
    });
  } else {
    const legs: RouteLegBase[] = [];
    const swap = assembleDexSwapLeg(input, intent, "mixed-dex-offramp", intermediate, origin, at);
    if (swap === undefined) {
      exclusions.push({
        shapeId: "mixed-dex-offramp",
        reasons: ["the DEX lane was not proved (engine selection or input-asset grounding failed)"],
      });
    } else {
      legs.push(swap.leg);
      const providerParty: CustodyParty = {
        kind: "EXTERNAL_PROVIDER",
        providerName: offRampDeposit.providerName,
        accountRef: offRampDeposit.accountRef,
      };
      legs.push(transferLegTo(input, intent, "mixed-dex-offramp", 1, origin, providerParty, swap.plannedAmount, at));
      appendPayoutAndBankLegs(input, intent, "mixed-dex-offramp", candidates, bankParty, swap.plannedAmount.amount, at, legs, exclusions, );
      if (legs.length === 4) {
        pushPlan(intent, "mixed-dex-offramp", legs, [origin.chainKey], at, plans, exclusions, swap.lane.evaluation);
      }
    }
  }

  if (baseline === undefined) {
    exclusions.push({
      shapeId: "provider-native-offramp",
      reasons: [
        "the incumbent baseline is emitted only on real evidence (a PASS_THROUGH_NATIVE corridor route), never fabricated",
      ],
    });
    return;
  }
  const legs: RouteLegBase[] = [];
  const providerParty: CustodyParty = {
    kind: "EXTERNAL_PROVIDER",
    providerName: baseline.providerName,
    accountRef: origin.accountRef,
  };
  legs.push(
    transferLegTo(
      input,
      intent,
      "provider-native-offramp",
      0,
      origin,
      providerParty,
      { basis: "INTENT_DECLARED", amount: intent.originAmount },
      at,
    ),
  );
  appendPayoutAndBankLegs(input, intent, "provider-native-offramp", candidates, bankParty, intent.originAmount, at, legs, exclusions);
  if (legs.length === 3) {
    pushPlan(intent, "provider-native-offramp", legs, [origin.chainKey], at, plans, exclusions);
  }
}

/** The shared payout + bank tail (both off-ramp shapes and merchant Mode B). */
export function appendPayoutAndBankLegs(
  input: RouteCompilerInput,
  intent: MoneyMovementIntent,
  shapeId: string,
  candidates: readonly CorridorCandidate[],
  bankParty: CustodyParty,
  sourceAmount: { currency: string; minorUnits: string } | undefined,
  at: number,
  legs: RouteLegBase[],
  exclusions: ExcludedRouteShape[],
): void {
  const payoutRouteId = input.routingHints?.offRampPayoutRouteId;
  const payoutCandidate =
    payoutRouteId !== undefined ? candidates.find((candidate) => candidate.routeId === payoutRouteId) : undefined;
  if (payoutCandidate === undefined || !payoutCandidate.eligible) {
    exclusions.push({
      shapeId,
      reasons: [
        "the off-ramp payout corridor route is an explicit routing hint (offRampPayoutRouteId) and must be an eligible route — never inferred",
      ],
    });
    return;
  }
  const constraint = input.payoutConstraints.find((item) => item.routeId === payoutCandidate.routeId);
  if (constraint === undefined) {
    exclusions.push({ shapeId, reasons: ["no payout constraint evidence (an explicit external destination + the REAL gate report) grounds the payout leg"] });
    return;
  }
  if (sourceAmount === undefined) {
    exclusions.push({ shapeId, reasons: ["the payout amount is never guessed — the upstream hop's grounded amount must convert to the arrival currency"] });
    return;
  }
  const arrivalCurrency = intent.arrivalCurrency;
  const converted = convertAmount(sourceAmount, input.conversionRules, arrivalCurrency);
  if (converted.basis !== "CONVERSION_GROUNDED") {
    const reason = converted.basis === "UNKNOWN" ? converted.reason : "the conversion is ungrounded";
    exclusions.push({
      shapeId,
      reasons: [`the payout amount is never guessed: ${reason}`],
    });
    return;
  }
  const planIdPrefix = `route-plan:${intent.intentId}:${shapeId}`;
  const providerParty: CustodyParty = { kind: "EXTERNAL_PROVIDER", providerName: payoutCandidate.providerName };
  const payoutHop = legs.length;
  const payoutLegId = routeLegId(planIdPrefix, payoutHop, "OFF_RAMP_PAYOUT");
  legs.push(freezeLeg({
      legId: payoutLegId,
      legKind: "OFF_RAMP_PAYOUT",
      hopIndex: payoutHop,
      intentRef: intent.intentId,
      authorizationLineage: {
        intentRef: intent.intentId,
        intentAuthorizationRef: intent.intentAuthorizationRef,
        legAuthorization: {
          kind: "PAYOUT_TRANSFER_OUT_GRANT",
          gate: constraint.gateReport,
          transferOutAuthorizationId: transferOutAuthorizationId(intent.intentId),
        },
      },
      stateGrounding: corridorObservation(payoutCandidate),
      finality: providerOwnedFinality(payoutCandidate.providerName),
      custody: {
        from: providerParty,
        to: providerParty,
        via: providerParty,
        assetRef: arrivalCurrency,
        amount: converted.amount,
        evidenceRefs: [`corridor:${payoutCandidate.routeId}`, `payout-gate:${constraint.routeId}`],
      } as CustodyTransfer,
      plannedAmount: converted,
      assumptions: conversionAssumption(intent, converted.ruleId, converted.amount),
      evidenceRefs: [`corridor:${payoutCandidate.routeId}@${payoutCandidate.observationVersion}`, `payout-gate:${constraint.routeId}`, `payout-destination:${constraint.destination.providerDestinationRef}`],
    }),
  );

  const bankHop = legs.length;
  const settlement = pickSettlementDestinationId(input, bankParty);
  const bankLegId = routeLegId(planIdPrefix, bankHop, "BANK_SETTLEMENT");
  legs.push(
    freezeLeg({
      legId: bankLegId,
      legKind: "BANK_SETTLEMENT",
      hopIndex: bankHop,
      intentRef: intent.intentId,
      authorizationLineage: {
        intentRef: intent.intentId,
        intentAuthorizationRef: intent.intentAuthorizationRef,
        legAuthorization: {
          kind: "INTENT_AUTHORIZATION_ONLY",
          reason: "the bank arrival is the evidenced consequence of the already-authorized payout hop",
        },
      },
      stateGrounding: corridorObservation(payoutCandidate),
      finality: providerOwnedFinality("bank-settlement-observation"),
      custody: {
        from: providerParty,
        to: bankParty,
        assetRef: arrivalCurrency,
        amount: converted.amount,
        evidenceRefs: [`settlement-destination:${settlement}`],
      } as CustodyTransfer,
      plannedAmount: converted,
      assumptions: conversionAssumption(intent, converted.ruleId, converted.amount),
      evidenceRefs: [`settlement-destination:${settlement}`, `payout-authorization:${transferOutAuthorizationId(intent.intentId)}`],
    }),
  );
}

/** Route family 4: onchain origin -> merchant balance destination. */
export function compileMerchantShapes(
  input: RouteCompilerInput,
  intent: MoneyMovementIntent,
  candidates: readonly CorridorCandidate[],
  origin: OnchainPositionObservation | undefined,
  destination: FundsLocationObservation | undefined,
  at: number,
  plans: RoutePlan[],
  exclusions: ExcludedRouteShape[],
): void {
  if (origin === undefined || destination?.observationKind !== "MERCHANT_BALANCE") {
    return;
  }
  const providerName = destination.providerName;
  const merchantBalance = merchantBalanceParty(destination.merchantAccountRef, providerName);
  const originWallet = onchainWalletParty(origin.accountRef, origin.chainKey);
  const evidence = [...input.merchantEligibility]
    .filter(
      (item) =>
        item.merchantAccountRef === destination.merchantAccountRef &&
        item.currency === destination.currency &&
        merchantEligibilityIsFresh(item, at),
    )
    .sort((left, right) => (left.evidenceId < right.evidenceId ? -1 : 1))[0];

  if (evidence !== undefined) {
    const planPrefix = `route-plan:${intent.intentId}:merchant-native-settlement`;
    const converted = convertAmount(intent.originAmount, input.conversionRules, destination.currency);
    const legs: RouteLegBase[] = [freezeLeg({
        legId: routeLegId(planPrefix, 0, "MERCHANT_BALANCE_SETTLEMENT"),
        legKind: "MERCHANT_BALANCE_SETTLEMENT",
        hopIndex: 0,
        intentRef: intent.intentId,
        authorizationLineage: {
          intentRef: intent.intentId,
          intentAuthorizationRef: intent.intentAuthorizationRef,
          legAuthorization: {
            kind: "PROVIDER_VERIFIED_SETTLEMENT_ELIGIBILITY",
            evidenceId: evidence.evidenceId,
            providerName,
            merchantAccountRef: destination.merchantAccountRef,
            currency: destination.currency,
            awaitingAuthority: evidence.awaitingAuthority,
          },
        },
        stateGrounding: {
          observations: [
            {
              observationKind: "MerchantSettlementEligibilityEvidence",
              observationId: evidence.evidenceId,
              observationVersion: 1,
              fresh: true,
              freshnessRule: "merchant-eligibility:inclusive-bound",
            },
          ],
          groundingFailures: [],
        },
        finality: providerOwnedFinality(providerName),
        custody: {
          from: originWallet,
          to: merchantBalance,
          via: { kind: "EXTERNAL_PROVIDER", providerName },
          assetRef: origin.assetId,
          amount: intent.originAmount,
          evidenceRefs: [`merchant-eligibility:${evidence.evidenceId}`],
        } as CustodyTransfer,
        plannedAmount: converted,
        assumptions: [
          {
            assumptionId: `assumption:${planPrefix}:eligibility`,
            basis: "CORRIDOR_TERMS" as const,
            statement: `the provider-verified settlement eligibility '${evidence.evidenceId}' holds for the settlement window`,
            evidenceRefs: [`merchant-eligibility:${evidence.evidenceId}`, `verification:${evidence.verificationRef}`],
            assumedValidUntil: isoUtcFromEpochMillis(intent.expiresAt),
          },
        ],
        evidenceRefs: [`merchant-eligibility:${evidence.evidenceId}`, `verification:${evidence.verificationRef}`],
      }),
    ];
    pushPlan(intent, "merchant-native-settlement", legs, [origin.chainKey], at, plans, exclusions);
  } else {
    exclusions.push({
      shapeId: "merchant-native-settlement",
      reasons: [
        "native merchant settlement compiles only on provider-verified eligibility (providerVerified, fresh, matching account and currency) — the provider-verified-effects law; the real integration awaits the merchant lane (P5-W3)",
      ],
    });
  }

  // Mode B: the external route (the off-ramp family with the honest marker).
  const intermediate = input.routingHints?.intermediateAsset;
  const offRampDeposit = input.routingHints?.offRampDeposit;
  const bankDestination = [...input.settlementDestinations]
    .filter((item) => item.currency === destination.currency)
    .sort((left, right) => (left.destinationId < right.destinationId ? -1 : 1))[0];
  if (intermediate === undefined || offRampDeposit === undefined || bankDestination === undefined) {
    exclusions.push({
      shapeId: "merchant-external-payswap-route",
      reasons: [
        "the external merchant route needs the intermediate asset, the off-ramp deposit hint and a bank settlement destination in the destination currency",
      ],
    });
    return;
  }
  const marker = merchantNativeSettlementUnavailable(
    `native merchant-balance settlement is not grounded for account '${destination.merchantAccountRef}' on this compilation — this external route settles to the merchant's supported external destination instead, never a synthetic merchant balance effect`,
  );
  const legs: RouteLegBase[] = [];
  const swap = assembleDexSwapLeg(input, intent, "merchant-external-payswap-route", intermediate, origin, at);
  if (swap === undefined) {
    exclusions.push({ shapeId: "merchant-external-payswap-route", reasons: ["the DEX lane was not proved"] });
    return;
  }
  legs.push(swap.leg);
  const providerParty: CustodyParty = {
    kind: "EXTERNAL_PROVIDER",
    providerName: offRampDeposit.providerName,
    accountRef: offRampDeposit.accountRef,
  };
  legs.push(
    transferLegTo(input, intent, "merchant-external-payswap-route", 1, origin, providerParty, swap.plannedAmount, at),
  );
  appendPayoutAndBankLegs(
    input,
    intent,
    "merchant-external-payswap-route",
    candidates,
    bankInstrumentParty(bankDestination.externalRef),
    swap.plannedAmount.amount,
    at,
    legs,
    exclusions,
  );
  if (legs.length === 4) {
    pushPlan(
      intent,
      "merchant-external-payswap-route",
      legs,
      [origin.chainKey],
      at,
      plans,
      exclusions,
      swap.lane.evaluation,
      marker,
    );
  }
}

function pickSettlementDestinationId(input: RouteCompilerInput, bankParty: CustodyParty): string {
  const externalRef = bankParty.kind === "EXTERNAL_BANK_INSTRUMENT" ? bankParty.externalRef : custodyAccountRefOf(bankParty);
  const match = [...input.settlementDestinations]
    .sort((left, right) => (left.destinationId < right.destinationId ? -1 : 1))
    .find((item) => item.externalRef === externalRef);
  return match !== undefined ? match.destinationId : `dest:external:${externalRef}`;
}

export type { RoutePlan };

function corridorObservation(candidate: CorridorCandidate): import("./leg-contracts.ts").RouteLegBase["stateGrounding"] {
  return {
    observations: [
      {
        observationKind: "CorridorObservation",
        observationId: `corridor:${candidate.routeId}`,
        observationVersion: candidate.observationVersion,
        fresh: true,
        freshnessRule: "corridor:current-eligibility",
      },
    ],
    groundingFailures: [],
  };
}

