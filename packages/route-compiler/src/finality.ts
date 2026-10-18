/**
 * @payswap/route-compiler — the finality contracts (P5-W1).
 *
 * PORT of the old compiler's LegFinalityContract block (MMI-19): a route
 * plan NEVER assumes finality (INV-F06, old rule 29 — submitted is not
 * finality; finality is observed, never declared). The structural law:
 * `finalityNeverAssumed` is a LITERAL true on every leg's finality
 * contract, and the candidates are CANDIDATES ONLY:
 *
 * - a chain finality candidate carries the chain's finality MODEL (the
 *   pinned onchain-domain vocabulary) and an optional confirmation depth;
 * - a provider-owned candidate names the provider whose observation plane
 *   owns the finality decision;
 * - there is NO variant that asserts finality — a final leg would be a
 *   fabricated settlement (structurally unrepresentable).
 */

import { InvalidRouteLegContractError } from "./errors.ts";
import { deepFreeze, requireBoundedString, requireNonNegativeSafeInteger, requireObject, requireStringArray, LIMITS, type Fail } from "./canonical.ts";
import { PINNED_CHAIN_FINALITY_MODELS, type PinnedChainFinalityModel } from "./pins/onchain.ts";

const fail: Fail = (message: string) => new InvalidRouteLegContractError(message);

/** The pinned chain-finality model vocabulary (locally named). */
export type ChainFinalityModel = PinnedChainFinalityModel;

/** A chain finality candidate (candidate ONLY — never finality). */
export interface ChainFinalityCandidate {
  readonly candidateOnly: true;
  readonly model: ChainFinalityModel;
  readonly confirmationDepth?: number;
  readonly chainKey: string;
}

/** A provider-owned finality candidate (the provider observes its rail). */
export interface ProviderOwnedFinalityCandidate {
  readonly candidateOnly: true;
  readonly model: "PROVIDER_OWNED";
  readonly providerName: string;
}

/** The closed finality-candidate union. */
export type LegFinalityCandidate = ChainFinalityCandidate | ProviderOwnedFinalityCandidate;

/**
 * The leg's finality contract: `finalityNeverAssumed` is a LITERAL type —
 * a leg contract asserting finality does not typecheck and does not
 * validate (INV-F06).
 */
export interface LegFinalityContract {
  readonly finalityNeverAssumed: true;
  readonly candidates: readonly LegFinalityCandidate[];
}

/** The frozen default contract of a leg with no finality candidates. */
export function emptyFinalityContract(): LegFinalityContract {
  return Object.freeze({ finalityNeverAssumed: true, candidates: Object.freeze([]) });
}

/** A chain finality-candidate contract for one model (frozen). */
export function onchainFinality(
  model: ChainFinalityModel,
  chainKey: string,
  confirmationDepth?: number,
): LegFinalityContract {
  if (!(PINNED_CHAIN_FINALITY_MODELS as readonly unknown[]).includes(model)) {
    throw fail("the finality model must be a member of the pinned chain-finality vocabulary");
  }
  return deepFreeze({
    finalityNeverAssumed: true,
    candidates: Object.freeze([
      deepFreeze({
        candidateOnly: true as const,
        model,
        ...(confirmationDepth !== undefined ? { confirmationDepth } : {}),
        chainKey,
      }),
    ]),
  }) as LegFinalityContract;
}

/** A provider-owned finality-candidate contract (frozen). */
export function providerOwnedFinality(providerName: string): LegFinalityContract {
  if (providerName.length === 0) {
    throw fail("the provider-owned finality candidate requires a provider name");
  }
  return deepFreeze({
    finalityNeverAssumed: true,
    candidates: Object.freeze([
      Object.freeze({ candidateOnly: true, model: "PROVIDER_OWNED", providerName }),
    ]),
  });
}

/** Fail-closed validation of a finality-candidate contract. */
export function validateLegFinalityContract(candidate: unknown): LegFinalityContract {
  const record = requireObject(candidate, "a LegFinalityContract", fail);
  if (record["finalityNeverAssumed"] !== true) {
    throw fail("LegFinalityContract.finalityNeverAssumed must be true (INV-F06: finality is never assumed)");
  }
  const rawCandidates = record["candidates"];
  if (!Array.isArray(rawCandidates)) {
    throw fail("LegFinalityContract.candidates must be an array");
  }
  const candidates: LegFinalityCandidate[] = [];
  for (const raw of rawCandidates) {
    const rawRecord = requireObject(raw, "a finality candidate", fail);
    if (rawRecord["candidateOnly"] !== true) {
      throw fail("a finality candidate must carry candidateOnly: true — finality is only ever a candidate");
    }
    const model = rawRecord["model"];
    if (model === "PROVIDER_OWNED") {
      const providerName = requireBoundedString(rawRecord["providerName"], "candidate.providerName", LIMITS.refMaxLength, fail);
      candidates.push(Object.freeze({ candidateOnly: true, model, providerName }));
    } else if (
      typeof model === "string" &&
      (PINNED_CHAIN_FINALITY_MODELS as readonly unknown[]).includes(model)
    ) {
      const chainKey = requireBoundedString(rawRecord["chainKey"], "candidate.chainKey", LIMITS.refMaxLength, fail);
      const depth = rawRecord["confirmationDepth"];
      if (depth !== undefined) {
        requireNonNegativeSafeInteger(depth, "candidate.confirmationDepth", fail);
      }
      candidates.push(
        deepFreeze({
          candidateOnly: true as const,
          model: model as ChainFinalityModel,
          ...(depth !== undefined ? { confirmationDepth: depth } : {}),
          chainKey,
        }) as LegFinalityCandidate,
      );
    } else {
      throw fail("the finality model must be a member of the pinned vocabulary or PROVIDER_OWNED");
    }
  }
  return deepFreeze({ finalityNeverAssumed: true, candidates: Object.freeze(candidates) });
}

/** The failure-semantics law shared by EVERY leg kind (frozen singleton). */
export interface LegFailureSemantics {
  readonly unknownIsNotFailed: true;
  readonly blindRetryForbidden: true;
  readonly resolver: "SETTLEMENT_RECONCILIATION_AUTHORITY";
}

/** The frozen leg failure semantics (INV-X01/X02/X03 — never per-leg config). */
export const ROUTE_LEG_FAILURE_SEMANTICS: LegFailureSemantics = Object.freeze({
  unknownIsNotFailed: true,
  blindRetryForbidden: true,
  resolver: "SETTLEMENT_RECONCILIATION_AUTHORITY",
});

/** True iff the candidate equals the frozen failure-semantics contract. */
export function isRouteLegFailureSemantics(candidate: unknown): candidate is LegFailureSemantics {
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    (candidate as Partial<LegFailureSemantics>).unknownIsNotFailed === true &&
    (candidate as Partial<LegFailureSemantics>).blindRetryForbidden === true &&
    (candidate as Partial<LegFailureSemantics>).resolver === "SETTLEMENT_RECONCILIATION_AUTHORITY"
  );
}

/** Evidence refs helper for finality candidates (the observation names). */
export function finalityEvidenceRefs(contract: LegFinalityContract): readonly string[] {
  return requireStringArray(
    contract.candidates.map((candidate) =>
      candidate.model === "PROVIDER_OWNED"
        ? `finality:${candidate.model}:${candidate.providerName}`
        : `finality:${candidate.model}:${candidate.chainKey}`,
    ),
    "finality evidence refs",
    fail,
  );
}
