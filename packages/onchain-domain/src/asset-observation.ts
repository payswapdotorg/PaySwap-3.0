/**
 * @payswap/onchain-domain — asset observations (external onchain state —
 * NEVER custody, NEVER a balance) (P4-W1, lane R2-W1; PORT/ADAPT of
 * payswap.org@8a735bf packages/onchain-domain/src/asset.ts, split for the
 * file-size law).
 *
 * INV-7 (external provider/wallet balances are observations, not PaySwap
 * custody): an AssetObservation is NEVER PaySwap custody and NEVER a
 * customer balance. It is structurally distinct from any ledger/balance
 * type (nominal `observationKind` brand; no mutable balance-shaped field;
 * mandatory freshness/provenance/observer). It may inform routing, timing
 * and reconciliation only according to its provenance and freshness — it
 * can never be booked as an internal balance. This package constructs NO
 * protocol Money and exposes NO balance arithmetic: money truth stays with
 * the Financial Protocol Authority (INV-1; see ./settlement-mapping.ts).
 */

import { ValidationError } from "./errors.ts";
import { isNonEmptyString, isRecord } from "./shared.ts";
import { isValidChainKey } from "./family.ts";
import type { ObservationProvenancePin } from "./pins.ts";
import { MINOR_UNITS_PATTERN } from "./asset.ts";

// ---------------------------------------------------------------------------
// Asset observations (external state — NEVER custody, NEVER a balance)
// ---------------------------------------------------------------------------

/** Nominal brand: this value is an external observation, never a balance. */
export const ASSET_OBSERVATION_KIND = "AssetObservation" as const;

/**
 * The declared observer kinds (who observed the external position). Observer
 * identity is MANDATORY on every asset observation (INV-7).
 */
export const ONCHAIN_OBSERVER_KINDS = [
  "CHAIN_NODE",
  "INDEXER",
  "RPC_PROVIDER",
  "WALLET_PROVIDER",
  "OPERATOR",
  "OTHER",
] as const;

/** Who observed the external position (observer identity is mandatory). */
export interface OnchainObserverIdentity {
  /** Opaque observer id (a connector/indexer/operator reference — never key material). */
  readonly observerId: string;
  readonly observerKind: (typeof ONCHAIN_OBSERVER_KINDS)[number];
}

/**
 * An external onchain location where an asset position may reside: the
 * chain plus an opaque holder account/address reference. This is a
 * provider-neutral location shape — family-specific address formats live in
 * family extensions and adapters, never here (INV-16).
 */
export interface OnchainFundsLocation {
  readonly chainKey: string;
  /** The external holder account/address reference (opaque, neutral). */
  readonly accountRef: string;
  /** Optional instrument reference (e.g. a token account), opaque. */
  readonly instrumentRef?: string;
}

/**
 * Freshness of an external observation: the provider-reported time the
 * position was true (`asOf`, declared DATA — no ambient clock in this
 * library) and the consumer-side maximum tolerated age in seconds.
 * MANDATORY on every asset observation.
 */
export interface ObservationFreshness {
  readonly asOf: string;
  readonly maxAgeSeconds: number;
}

/**
 * A time-stamped observation of an onchain asset position at an external
 * location (INV-7).
 *
 * STRUCTURALLY NOT A BALANCE: the nominal `observationKind` brand plus the
 * MANDATORY freshness, provenance and observer identity make it
 * non-assignable to and from any ledger/balance type. There is deliberately
 * no mutable balance-shaped field and NO path from this type to PaySwap
 * custody or a customer balance. It can inform routing, payout timing,
 * netting and reconciliation only according to its provenance and
 * freshness.
 */
export interface AssetObservation {
  readonly observationKind: typeof ASSET_OBSERVATION_KIND;
  readonly observationId: string;
  readonly observedAt: string;
  readonly assetId: string;
  readonly chainKey: string;
  readonly location: OnchainFundsLocation;
  /**
   * Exact observed amount. The currency field carries the ASSET id (the
   * shape is the canonical exact-minor-units wire shape; PaySwap money is
   * ISO-currency-scoped and is constructed by the protocol lane, never
   * here — INV-1/INV-7).
   */
  readonly observedAmount: { readonly currency: string; readonly minorUnits: string };
  readonly freshness: ObservationFreshness;
  readonly provenance: ObservationProvenancePin;
  readonly observer: OnchainObserverIdentity;
}


/**
 * Runtime validation for an asset observation. Freshness, provenance and
 * observer identity are MANDATORY: an observation without them is not
 * evidence of anything (INV-7). Deterministic consistency rules:
 * - location.chainKey === chainKey;
 * - observedAmount.currency === assetId (the observed amount is in the
 *   observed asset);
 * - minorUnits are exact integer minor units (INV-2).
 */
export function validateAssetObservation(candidate: unknown): AssetObservation {
  const errors: string[] = [];
  if (!isRecord(candidate)) {
    throw new ValidationError("asset observation must be an object");
  }
  const record = candidate;
  if (record.observationKind !== ASSET_OBSERVATION_KIND) {
    errors.push(
      `observationKind must be '${ASSET_OBSERVATION_KIND}' (nominal separation from ledger/balance types — INV-7)`,
    );
  }
  for (const field of ["observationId", "observedAt", "assetId"] as const) {
    if (!isNonEmptyString(record[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  if (!isValidChainKey(record.chainKey)) {
    errors.push("chainKey must be a canonical chain key");
  }
  const location = record.location;
  if (
    location === null ||
    typeof location !== "object" ||
    !isValidChainKey((location as Readonly<Record<string, unknown>>).chainKey) ||
    !isNonEmptyString((location as Readonly<Record<string, unknown>>).accountRef)
  ) {
    errors.push(
      "location must be { chainKey, accountRef, instrumentRef? } (an external onchain funds location)",
    );
  } else if (
    (location as OnchainFundsLocation).chainKey !== record.chainKey
  ) {
    errors.push("location.chainKey must match the observation's chainKey");
  }
  const amount = record.observedAmount;
  if (
    amount === null ||
    typeof amount !== "object" ||
    !isNonEmptyString((amount as Readonly<Record<string, unknown>>).currency) ||
    typeof (amount as Readonly<Record<string, unknown>>).minorUnits !== "string" ||
    !MINOR_UNITS_PATTERN.test(String((amount as Readonly<Record<string, unknown>>).minorUnits))
  ) {
    errors.push(
      "observedAmount must be { currency, minorUnits } with exact integer minor units (INV-2)",
    );
  } else if ((amount as { currency: string }).currency !== record.assetId) {
    errors.push(
      "observedAmount.currency must equal the observed assetId (the amount is denominated in the observed asset)",
    );
  }
  const freshness = record.freshness;
  if (freshness === null || typeof freshness !== "object") {
    errors.push("freshness is MANDATORY on every asset observation (INV-7)");
  } else {
    const fresh = freshness as Readonly<Record<string, unknown>>;
    if (!isNonEmptyString(fresh.asOf)) {
      errors.push("freshness.asOf must be a non-empty timestamp string");
    }
    if (
      typeof fresh.maxAgeSeconds !== "number" ||
      !Number.isInteger(fresh.maxAgeSeconds) ||
      fresh.maxAgeSeconds <= 0
    ) {
      errors.push("freshness.maxAgeSeconds must be a positive integer");
    }
  }
  const provenance = record.provenance;
  if (
    provenance === null ||
    typeof provenance !== "object" ||
    !isNonEmptyString((provenance as Readonly<Record<string, unknown>>).providerName) ||
    !isNonEmptyString((provenance as Readonly<Record<string, unknown>>).capturedAt)
  ) {
    errors.push("provenance is MANDATORY on every asset observation (INV-7)");
  }
  const observer = record.observer;
  if (
    observer === null ||
    typeof observer !== "object" ||
    !isNonEmptyString((observer as Readonly<Record<string, unknown>>).observerId)
  ) {
    errors.push("observer identity is MANDATORY on every asset observation (INV-7)");
  } else {
    const observerKind = (observer as Readonly<Record<string, unknown>>).observerKind;
    if (!(ONCHAIN_OBSERVER_KINDS as readonly unknown[]).includes(observerKind)) {
      errors.push(`observer.observerKind must be one of [${ONCHAIN_OBSERVER_KINDS.join(", ")}]`);
    }
  }
  if (errors.length > 0) {
    throw new ValidationError(`Invalid asset observation: ${errors.join("; ")}`, {
      errors: [...errors],
    });
  }
  return candidate as unknown as AssetObservation;
}
