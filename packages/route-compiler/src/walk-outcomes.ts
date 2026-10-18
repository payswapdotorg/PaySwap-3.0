/**
 * @payswap/route-compiler — the per-leg walk outcomes (P5-W1).
 *
 * The deterministic per-leg execution machinery of the plan walk
 * (split from route-walk.ts under the file law): the leg execution
 * statuses, the per-rail-family walk functions (onchain legs through
 * kernel-law-shaped observations, fiat legs, payout legs, bank legs,
 * merchant legs), the fault-type discipline (cross-family faults
 * throw) and the party descriptions the honest reasons carry. The
 * walk is a LAB SIMULATION (the never-production tier).
 */

import { deepFreeze } from "./canonical.ts";
import { RouteWalkError } from "./errors.ts";
import { LAB_EXECUTION_TIER } from "./simulation-tier.ts";
import { LANE_WALK_SIMULATOR_ID, type OnchainLaneFault } from "./execution-walk.ts";
import type { RouteLeg } from "./route-plan.ts";
import type { RouteLegExecution, RouteLegFault, LegExecutionOutcomeStatus, WalkRoutePlanInput } from "./route-walk.ts";
import { walkExecutionRefs, walkPayoutRefs, walkProviderSettlementRefs } from "./identifiers.ts";
import type { CustodyParty } from "./custody.ts";
import type { PinnedChainFinalityModel } from "./pins/onchain.ts";

export function walkLeg(
  input: WalkRoutePlanInput,
  leg: RouteLeg,
  fault: RouteLegFault | undefined,
): { execution: RouteLegExecution } {
  switch (leg.legKind) {
    case "ONCHAIN_DEX_SWAP":
      return walkOnchainFamilyLeg(input, leg, fault, true);
    case "ONCHAIN_TRANSFER":
    case "ONCHAIN_BRIDGE":
      return walkOnchainFamilyLeg(input, leg, fault, false);
    case "FIAT_PSP_COLLECT":
    case "PSP_STABLECOIN_ISSUANCE":
      return walkFiatLeg(leg, fault);
    case "OFF_RAMP_PAYOUT":
      return walkPayoutLeg(leg, fault);
    case "BANK_SETTLEMENT":
      return walkBankLeg(leg);
    case "MERCHANT_BALANCE_SETTLEMENT":
      return walkMerchantLeg(leg, fault);
  }
}

function walkOnchainFamilyLeg(
  input: WalkRoutePlanInput,
  leg: RouteLeg,
  fault: RouteLegFault | undefined,
  isSwap: boolean,
): { execution: RouteLegExecution } {
  if (fault !== undefined && !fault.kind.startsWith("ONCHAIN_")) {
    throw new RouteWalkError(
      `fault injection is typed per rail family — leg '${leg.legId}' is an onchain leg and cannot carry fault kind '${fault.kind}'`,
    );
  }
  const refs = walkExecutionRefs(leg.legId);
  const finalityModel = input.onchainFinalityModels?.[leg.custody.assetRef.split("/")[0] ?? ""] ?? input.onchainFinalityModels?.["*"];
  const chainKey = isSwap ? laneChainOf(leg) : writeChainOf(leg);
  const model = input.onchainFinalityModels?.[chainKey] ?? finalityModel ?? "PROBABILISTIC";
  const onchainFault: OnchainLaneFault | undefined =
    fault === undefined
      ? undefined
      : fault.kind === "ONCHAIN_PROTOCOL_FAILURE"
        ? { kind: "PROTOCOL_FAILURE", failureClass: fault.failureClass, description: fault.description, retryGuidance: fault.retryGuidance }
        : fault.kind === "ONCHAIN_UNFINALIZED_BROADCAST"
          ? { kind: "UNFINALIZED_BROADCAST" }
          : fault.kind === "ONCHAIN_OUTCOME_UNKNOWN"
            ? { kind: "OUTCOME_UNKNOWN", reason: fault.reason }
            : undefined;
  const observation = buildWalkObservation(leg, refs, input.observedAtIso, chainKey, model, onchainFault) as {
    outcome: "BROADCAST" | "CONFIRMED" | "FAILED" | "OUTCOME_UNKNOWN";
    failure?: {
      failureClass: string;
      description: string;
      retryGuidance: "SAFE_TO_RETRY" | "REQUIRES_RECONCILIATION" | "NOT_RETRYABLE";
    };
    unknownReason?: string;
  };
  const status: LegExecutionOutcomeStatus =
    observation.outcome === "CONFIRMED"
      ? "OBSERVED_FINALITY_CANDIDATE"
      : observation.outcome === "BROADCAST"
        ? "SUBMITTED_NOT_FINAL"
        : observation.outcome === "FAILED"
          ? "DEFINITIVE_FAILED"
          : "OUTCOME_UNKNOWN";
  const eventCandidate =
    observation.outcome === "BROADCAST"
      ? { kind: "NO_EVENT", reason: "SUBMITTED_NOT_FINAL" }
      : { kind: "EVENT_CANDIDATE", event: observation.outcome === "CONFIRMED" ? "CONFIRM_SUCCEEDED" : observation.outcome === "FAILED" ? "CONFIRM_FAILED" : "OUTCOME_UNKNOWN" };
  return {
    execution: deepFreeze({
      legId: leg.legId,
      legKind: leg.legKind,
      status,
      custodyTo: leg.custody.to,
      eventCandidate,
      onchainOutcome: observation.outcome,
      ...(observation.failure !== undefined ? { failure: observation.failure } : {}),
      ...(observation.unknownReason !== undefined ? { unknownReason: observation.unknownReason } : {}),
      evidenceRefs: [...leg.evidenceRefs, `route-walk:${refs.executionRef}`],
    }),
  };
}

function buildWalkObservation(
  leg: RouteLeg,
  refs: ReturnType<typeof walkExecutionRefs>,
  observedAtIso: string,
  chainKey: string,
  finalityModel: PinnedChainFinalityModel,
  fault: OnchainLaneFault | undefined,
) {
  const common = {
    observationId: refs.observationId,
    executionRef: refs.executionRef,
    observedAt: observedAtIso,
    chainKey,
    externalOperationRef: refs.externalOperationRef,
    evidenceRefs: [...leg.evidenceRefs],
    provenance: { providerName: LANE_WALK_SIMULATOR_ID, source: "INTERNAL" as const, capturedAt: observedAtIso },
  };
  if (fault === undefined) {
    return deepFreeze({
      ...common,
      outcome: "CONFIRMED" as const,
      finalityCandidate: {
        candidateOnly: true as const,
        requiresProtocolFinality: true as const,
        confirmationDepth: 1,
        finalityModel,
        reorgDetected: false,
      },
    });
  }
  switch (fault.kind) {
    case "PROTOCOL_FAILURE":
      return deepFreeze({
        ...common,
        outcome: "FAILED" as const,
        failure: {
          failureClass: fault.failureClass,
          description: fault.description,
          retryGuidance: fault.retryGuidance,
        },
      });
    case "UNFINALIZED_BROADCAST":
      return deepFreeze({ ...common, outcome: "BROADCAST" as const });
    case "OUTCOME_UNKNOWN":
      return deepFreeze({ ...common, outcome: "OUTCOME_UNKNOWN" as const, unknownReason: fault.reason });
  }
}

function laneChainOf(leg: RouteLeg): string {
  const via = leg.custody.via;
  if (via !== undefined && via.kind === "ONCHAIN_PROTOCOL") {
    return via.chainKey;
  }
  if (leg.custody.from.kind === "ONCHAIN_WALLET" && leg.custody.from.chainKey !== undefined) {
    return leg.custody.from.chainKey;
  }
  return "ethereum:mainnet";
}

function writeChainOf(leg: RouteLeg): string {
  if (leg.custody.from.kind === "ONCHAIN_WALLET" && leg.custody.from.chainKey !== undefined) {
    return leg.custody.from.chainKey;
  }
  return laneChainOf(leg);
}

function walkFiatLeg(leg: RouteLeg, fault: RouteLegFault | undefined): { execution: RouteLegExecution } {
  if (fault !== undefined && !fault.kind.startsWith("FIAT_")) {
    throw new RouteWalkError(
      `fault injection is typed per rail family — leg '${leg.legId}' is a fiat leg and cannot carry fault kind '${fault.kind}'`,
    );
  }
  const providerName = describePartyName(leg.custody.to);
  if (fault?.kind === "FIAT_DEFINITIVE_FAILED") {
    return {
      execution: deepFreeze({
        legId: leg.legId,
        legKind: leg.legKind,
        status: "DEFINITIVE_FAILED",
        custodyTo: leg.custody.to,
        eventCandidate: { kind: "EVENT_CANDIDATE", event: "CONFIRM_FAILED" },
        failure: {
          failureClass: "PROVIDER_DEFINED",
          description: fault.reason,
          retryGuidance: "REQUIRES_RECONCILIATION" as "SAFE_TO_RETRY" | "REQUIRES_RECONCILIATION" | "NOT_RETRYABLE",
        },
        evidenceRefs: [`route-walk:${leg.legId}`, `provider:${providerName}`],
      }),
    };
  }
  if (fault?.kind === "FIAT_OUTCOME_UNKNOWN") {
    return {
      execution: deepFreeze({
        legId: leg.legId,
        legKind: leg.legKind,
        status: "OUTCOME_UNKNOWN",
        custodyTo: leg.custody.to,
        eventCandidate: { kind: "EVENT_CANDIDATE", event: "OUTCOME_UNKNOWN" },
        unknownReason: fault.reason,
        evidenceRefs: [`route-walk:${leg.legId}`, `provider:${providerName}`],
      }),
    };
  }
  return {
    execution: deepFreeze({
      legId: leg.legId,
      legKind: leg.legKind,
      status: "OBSERVED_FINALITY_CANDIDATE",
      custodyTo: leg.custody.to,
      eventCandidate: { kind: "EVENT_CANDIDATE", event: "CONFIRM_SUCCEEDED" },
      evidenceRefs: [`route-walk:${leg.legId}`, `provider:${providerName}`],
    }),
  };
}

function walkPayoutLeg(leg: RouteLeg, fault: RouteLegFault | undefined): { execution: RouteLegExecution } {
  if (fault !== undefined && fault.kind !== "FIAT_OUTCOME_UNKNOWN" && fault.kind !== "FIAT_DEFINITIVE_FAILED") {
    throw new RouteWalkError(
      `fault injection is typed per rail family — leg '${leg.legId}' is a payout leg and cannot carry fault kind '${fault.kind}'`,
    );
  }
  const refs = walkPayoutRefs(leg.legId);
  const providerName = describePartyName(leg.custody.to);
  const status: LegExecutionOutcomeStatus =
    fault === undefined ? "OBSERVED_FINALITY_CANDIDATE" : fault.kind === "FIAT_DEFINITIVE_FAILED" ? "DEFINITIVE_FAILED" : "OUTCOME_UNKNOWN";
  return {
    execution: deepFreeze({
      legId: leg.legId,
      legKind: leg.legKind,
      status,
      custodyTo: leg.custody.to,
      eventCandidate: {
        kind: "EVENT_CANDIDATE",
        event: status === "OBSERVED_FINALITY_CANDIDATE" ? "CONFIRM_SUCCEEDED" : status === "DEFINITIVE_FAILED" ? "CONFIRM_FAILED" : "OUTCOME_UNKNOWN",
      },
      ...(status === "OUTCOME_UNKNOWN" ? { unknownReason: (fault as { reason: string }).reason } : {}),
      ...(status === "DEFINITIVE_FAILED"
        ? { failure: { failureClass: "PROVIDER_DEFINED", description: (fault as { reason: string }).reason, retryGuidance: "REQUIRES_RECONCILIATION" as "SAFE_TO_RETRY" | "REQUIRES_RECONCILIATION" | "NOT_RETRYABLE" } }
        : {}),
      evidenceRefs: [`route-walk:${refs.observationId}`, `provider:${providerName}`],
    }),
  };
}

function walkBankLeg(leg: RouteLeg): { execution: RouteLegExecution } {
  return {
    execution: deepFreeze({
      legId: leg.legId,
      legKind: leg.legKind,
      status: "OBSERVED_FINALITY_CANDIDATE",
      custodyTo: leg.custody.to,
      eventCandidate: { kind: "EVENT_CANDIDATE", event: "CONFIRM_SUCCEEDED" },
      evidenceRefs: [`route-walk:${leg.legId}`, "bank-settlement-observation"],
    }),
  };
}

function walkMerchantLeg(leg: RouteLeg, fault: RouteLegFault | undefined): { execution: RouteLegExecution } {
  if (fault !== undefined && fault.kind !== "MERCHANT_OUTCOME_UNKNOWN") {
    throw new RouteWalkError(
      `fault injection is typed per rail family — leg '${leg.legId}' is a merchant leg and cannot carry fault kind '${fault.kind}'`,
    );
  }
  const refs = walkProviderSettlementRefs(leg.legId);
  if (fault?.kind === "MERCHANT_OUTCOME_UNKNOWN") {
    return {
      execution: deepFreeze({
        legId: leg.legId,
        legKind: leg.legKind,
        status: "OUTCOME_UNKNOWN",
        custodyTo: leg.custody.to,
        eventCandidate: { kind: "EVENT_CANDIDATE", event: "OUTCOME_UNKNOWN" },
        unknownReason: fault.reason,
        evidenceRefs: [`route-walk:${refs.observationId}`],
      }),
    };
  }
  return {
    execution: deepFreeze({
      legId: leg.legId,
      legKind: leg.legKind,
      status: "OBSERVED_FINALITY_CANDIDATE",
      custodyTo: leg.custody.to,
      eventCandidate: { kind: "EVENT_CANDIDATE", event: "CONFIRM_SUCCEEDED" },
      evidenceRefs: [`route-walk:${refs.observationId}`, `verification:${refs.verificationRef}`],
    }),
  };
}

export function describePartyName(party: CustodyParty): string {
  switch (party.kind) {
    case "ONCHAIN_WALLET":
      return `wallet:${party.accountRef}`;
    case "EXTERNAL_PROVIDER":
      return party.providerName;
    case "EXTERNAL_BANK_INSTRUMENT":
      return `bank:${party.externalRef}`;
    case "ONCHAIN_PROTOCOL":
      return `protocol:${party.protocolKey}@${party.chainKey}`;
    case "MERCHANT_BALANCE":
      return `merchant-balance:${party.merchantAccountRef}`;
  }
}

