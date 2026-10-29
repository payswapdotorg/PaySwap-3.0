/**
 * @payswap/route-compiler — the cross-provider corridor LEG ASSEMBLY
 * (P22-C, ADR-0016 D5; split from ./compiler-corridor.ts under the
 * 400-line file law): the four deterministic leg builders of the
 * `cross-provider-corridor` shape, each following its family precedent —
 *
 * - the collect leg: the mixed-psp-onramp collect precedent (the payer's
 *   charge authorization IS the intent's artifact; the provider pool
 *   custody; the origin observation grounding);
 * - the issuance leg: the onramp issuance precedent with the OBSERVED
 *   relay wallet as the custody destination (the issuer protocol is the
 *   `via`; the issuer-scoped asset is what is minted);
 * - the relay (onchain transfer) leg: the writeLeg/transferLegTo
 *   discipline — the gate-evaluated, write-digest-bound transfer of the
 *   issuer-scoped asset from the OBSERVED relay wallet to the off-ramp
 *   provider's receiving account, with the conversion-grounded amount;
 * - the payout leg: the appendPayoutAndBankLegs payout precedent (the
 *   REAL payout gate report as the transfer-out grant; the corridor
 *   observation grounding) — arriving DIRECTLY at the bank instrument
 *   (the corridor's fourth leg IS the fiat arrival; there is no separate
 *   bank-settlement leg in this shape's pinned skeleton).
 */

import { isoUtcFromEpochMillis } from "./canonical-time.ts";
import type { MoneyMovementIntent } from "./intent.ts";
import type { RouteCompilerInput } from "./compiler-input.ts";
import type { RouteLegBase } from "./leg-contracts.ts";
import type { CustodyParty, CustodyTransfer } from "./custody.ts";
import { bankInstrumentParty, onchainWalletParty, providerPoolParty, stablecoinIssuerParty } from "./leg-arms.ts";
import { onchainFinality, providerOwnedFinality } from "./finality.ts";
import { routeLegId, transferOutAuthorizationId } from "./identifiers.ts";
import { conversionAssumption, custodyAccountRefOf, freezeLeg } from "./compiler-support.ts";
import { prepareWrite } from "./compiler-assembly.ts";
import type { OnchainPositionObservation } from "./compiler-assembly.ts";
import type { CorridorCandidate } from "./corridor.ts";
import { isLocationObservationFresh } from "./grounding.ts";

/** A grounded conversion result (the never-guessed amount). */
export interface GroundedConversion {
  readonly basis: "CONVERSION_GROUNDED";
  readonly amount: { readonly currency: string; readonly minorUnits: string };
  readonly ruleId: string;
}

/** The corridor assembly context (every piece already grounded/explicit). */
export interface CorridorAssemblyContext {
  readonly input: RouteCompilerInput;
  readonly intent: MoneyMovementIntent;
  readonly middle: OnchainPositionObservation;
  readonly origin: {
    readonly observationRef: string;
    readonly observationVersion: number;
    readonly providerName: string;
    readonly accountRef: string;
    readonly currency: string;
    readonly fresh: boolean;
  };
  readonly destinationExternalRef: string;
  readonly offRampDeposit: { readonly providerName: string; readonly chainKey: string; readonly accountRef: string };
  readonly payoutCandidate: CorridorCandidate;
  readonly payoutConstraint: {
    readonly routeId: string;
    readonly destination: { readonly providerDestinationRef: string };
    readonly gateReport: import("./authorization.ts").PayoutGateReport;
  };
  readonly issuerConversion: GroundedConversion;
  readonly payoutConversion: GroundedConversion;
  readonly at: number;
}

/** The corridor plan's id prefix (the deterministic identity scheme). */
export function corridorPlanPrefix(intentRef: string): string {
  return `route-plan:${intentRef}:cross-provider-corridor`;
}

/** Assemble the corridor's four legs (deterministic, custody-continuous). */
export function assembleCorridorLegs(context: CorridorAssemblyContext): readonly RouteLegBase[] {
  const { input, intent, middle, origin, offRampDeposit, payoutCandidate, payoutConstraint } = context;
  const planPrefix = corridorPlanPrefix(intent.intentId);
  const middleFresh = isLocationObservationFresh(middle, context.at);
  const providerParty: CustodyParty = {
    kind: "EXTERNAL_PROVIDER",
    providerName: origin.providerName,
    accountRef: origin.accountRef,
  };
  const poolParty = providerPoolParty(origin.providerName);
  const issuerParty = stablecoinIssuerParty(middle.symbol, middle.chainKey);
  const relayWallet = onchainWalletParty(middle.accountRef, middle.chainKey);
  const offRampParty: CustodyParty = {
    kind: "EXTERNAL_PROVIDER",
    providerName: offRampDeposit.providerName,
    accountRef: offRampDeposit.accountRef,
  };
  const payoutParty: CustodyParty = { kind: "EXTERNAL_PROVIDER", providerName: payoutCandidate.providerName };
  const bankParty = bankInstrumentParty(context.destinationExternalRef);

  const collectLeg = freezeLeg({
    legId: routeLegId(planPrefix, 0, "FIAT_PSP_COLLECT"),
    legKind: "FIAT_PSP_COLLECT",
    hopIndex: 0,
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
          fresh: origin.fresh,
          freshnessRule: "location-observation:inclusive-bound",
        },
      ],
      groundingFailures: origin.fresh ? [] : ["the origin provider-account observation is stale"],
    },
    finality: providerOwnedFinality(origin.providerName),
    custody: {
      from: providerParty,
      to: poolParty,
      via: poolParty,
      assetRef: origin.currency,
      amount: intent.originAmount,
      evidenceRefs: [`provider-account:${origin.observationRef}`],
    } as CustodyTransfer,
    plannedAmount: { basis: "INTENT_DECLARED", amount: intent.originAmount },
    assumptions: [
      {
        assumptionId: `assumption:${planPrefix}:collect-freshness`,
        basis: "OBSERVATION_FRESHNESS" as const,
        statement: "the origin provider-account observation's freshness window",
        evidenceRefs: [`observation:${origin.observationRef}`],
        assumedValidUntil: isoUtcFromEpochMillis(intent.expiresAt),
      },
    ],
    evidenceRefs: [`provider-account:${origin.observationRef}`, `native-flow:${origin.providerName}`],
  });

  const issuanceLeg = freezeLeg({
    legId: routeLegId(planPrefix, 1, "PSP_STABLECOIN_ISSUANCE"),
    legKind: "PSP_STABLECOIN_ISSUANCE",
    hopIndex: 1,
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
          fresh: origin.fresh,
          freshnessRule: "location-observation:inclusive-bound",
        },
        {
          observationKind: "AssetObservation",
          observationId: middle.observationRef,
          observationVersion: middle.observationVersion,
          fresh: middleFresh,
          freshnessRule: "location-observation:inclusive-bound",
        },
      ],
      groundingFailures: [
        ...(origin.fresh ? [] : ["the origin provider-account observation is stale"]),
        ...(middleFresh ? [] : ["the relay position observation is stale"]),
      ],
    },
    finality: providerOwnedFinality(origin.providerName),
    custody: {
      from: poolParty,
      to: relayWallet,
      via: issuerParty,
      assetRef: middle.assetId,
      amount: context.issuerConversion.amount,
      evidenceRefs: ["issuance:stablecoin-mint", `asset-observation:${middle.observationRef}`],
    } as CustodyTransfer,
    plannedAmount: context.issuerConversion,
    assumptions: conversionAssumption(intent, context.issuerConversion.ruleId, context.issuerConversion.amount),
    evidenceRefs: [
      "issuance:stablecoin-mint",
      `provider-account:${origin.observationRef}`,
      `asset-observation:${middle.observationRef}`,
    ],
  });

  const relayLeg = corridorRelayLeg(context, relayWallet, offRampParty, middleFresh);

  const payoutLeg = freezeLeg({
    legId: routeLegId(planPrefix, 3, "OFF_RAMP_PAYOUT"),
    legKind: "OFF_RAMP_PAYOUT",
    hopIndex: 3,
    intentRef: intent.intentId,
    authorizationLineage: {
      intentRef: intent.intentId,
      intentAuthorizationRef: intent.intentAuthorizationRef,
      legAuthorization: {
        kind: "PAYOUT_TRANSFER_OUT_GRANT",
        gate: payoutConstraint.gateReport,
        transferOutAuthorizationId: transferOutAuthorizationId(intent.intentId),
      },
    },
    stateGrounding: {
      observations: [
        {
          observationKind: "CorridorObservation",
          observationId: `corridor:${payoutCandidate.routeId}`,
          observationVersion: payoutCandidate.observationVersion,
          fresh: true,
          freshnessRule: "corridor:current-eligibility",
        },
      ],
      groundingFailures: [],
    },
    finality: providerOwnedFinality(payoutCandidate.providerName),
    custody: {
      from: payoutParty,
      to: bankParty,
      via: payoutParty,
      assetRef: intent.arrivalCurrency,
      amount: context.payoutConversion.amount,
      evidenceRefs: [`corridor:${payoutCandidate.routeId}`, `payout-gate:${payoutConstraint.routeId}`],
    } as CustodyTransfer,
    plannedAmount: context.payoutConversion,
    assumptions: conversionAssumption(intent, context.payoutConversion.ruleId, context.payoutConversion.amount),
    evidenceRefs: [
      `corridor:${payoutCandidate.routeId}@${payoutCandidate.observationVersion}`,
      `payout-gate:${payoutConstraint.routeId}`,
      `payout-destination:${payoutConstraint.destination.providerDestinationRef}`,
    ],
  });

  return [collectLeg, issuanceLeg, relayLeg, payoutLeg];
}

/**
 * The corridor's onchain relay leg (hop 2): the gate-evaluated,
 * write-digest-bound transfer of the issuer-scoped asset from the
 * OBSERVED relay wallet to the off-ramp provider's receiving account —
 * the writeLeg/transferLegTo discipline with the conversion-grounded
 * amount (the onramp delivery assumption bridges the issued value's
 * arrival at the observed relay).
 */
function corridorRelayLeg(
  context: CorridorAssemblyContext,
  relayWallet: CustodyParty,
  offRampParty: CustodyParty,
  middleFresh: boolean,
): RouteLegBase {
  const { input, intent, middle } = context;
  const planPrefix = corridorPlanPrefix(intent.intentId);
  const legId = routeLegId(planPrefix, 2, "ONCHAIN_TRANSFER");
  const write = prepareWrite(
    input,
    intent,
    "cross-provider-corridor",
    2,
    "ONCHAIN_TRANSFER",
    middle,
    custodyAccountRefOf(offRampParty),
    context.at,
  );
  const gate = input.onchain.security.evaluateGate({
    write,
    policy: input.onchain.security.policy,
    securityState: input.onchain.security.state,
    at: context.at,
  });
  return freezeLeg({
    legId,
    legKind: "ONCHAIN_TRANSFER",
    hopIndex: 2,
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
          observationId: middle.observationRef,
          observationVersion: middle.observationVersion,
          fresh: middleFresh,
          freshnessRule: "location-observation:inclusive-bound",
        },
      ],
      groundingFailures: middleFresh ? [] : ["the relay position observation is stale"],
    },
    finality: onchainFinality("PROBABILISTIC", middle.chainKey),
    custody: {
      from: relayWallet,
      to: offRampParty,
      assetRef: middle.assetId,
      amount: context.issuerConversion.amount,
      evidenceRefs: [`asset-observation:${middle.observationRef}`, `write:${write.writeDigest}`],
    } as CustodyTransfer,
    plannedAmount: context.issuerConversion,
    assumptions: [
      {
        assumptionId: `assumption:${legId}:relay-arrival`,
        basis: "ROUTING_HINT" as const,
        statement: `the observed relay account '${middle.accountRef}' on '${middle.chainKey}' receives the issued value before the relay transfer draws from it`,
        evidenceRefs: [`onramp-delivery:${middle.accountRef}`, `asset-observation:${middle.observationRef}`],
        assumedValidUntil: isoUtcFromEpochMillis(intent.expiresAt),
      },
    ],
    evidenceRefs: [
      `asset-observation:${middle.observationRef}`,
      `write:${write.writeDigest}`,
      `onramp-delivery:${middle.accountRef}`,
    ],
  });
}
