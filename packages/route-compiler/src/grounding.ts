/**
 * @payswap/route-compiler — the state-grounding contracts (P5-W1).
 *
 * PORT+ADAPT of the old compiler's GroundedObservation / LegStateGrounding
 * block (MMI-19), extended with the 3.0 observation-VERSION preservation
 * law (the graph keeps the EXACT version it decided on — evidence:
 * @payswap/execution-graph ENCODED LAW 1):
 *
 * - every grounding observation names its KIND, its observation ID and —
 *   MANDATORY — the exact observation VERSION it was decided on (never
 *   "latest": a version-less grounding is not evidence);
 * - freshness is judged by an EXPLICIT, named rule (the freshness law of
 *   the old suite, kept honest: which probe, which policy);
 * - groundingFailures carry the honest reasons when grounding could not
 *   be established (INV-C01: never success or failure without a stated
 *   reason);
 * - the location-observation grounding (which rail a neutral
 *   FundsLocationRef actually is) is the 3.0 ADAPTATION: the old
 *   intent-kind dispatch becomes observation-grounded location
 *   observations.
 */

import { InvalidRouteLegContractError } from "./errors.ts";
import { epochMillisFromIso, isIsoUtcTimestamp } from "./canonical-time.ts";
import { deepFreeze, requireBoundedString, requireNonNegativeSafeInteger, requireObject, LIMITS, type Fail } from "./canonical.ts";
import { isPinnedAssetSymbol, isPinnedChainKey } from "./pins/onchain.ts";

const fail: Fail = (message: string) => new InvalidRouteLegContractError(message);

/** The closed location-observation kind vocabulary (the neutral intent's rail grounding). */
export const FUNDS_LOCATION_OBSERVATION_KINDS = Object.freeze([
  "ONCHAIN_POSITION",
  "PROVIDER_ACCOUNT",
  "BANK_INSTRUMENT",
  "MERCHANT_BALANCE",
] as const);

export type FundsLocationObservationKind = (typeof FUNDS_LOCATION_OBSERVATION_KINDS)[number];

/**
 * An observation-grounded funds-location observation: WHAT a neutral
 * FundsLocationRef actually is on the observation plane. The compiler
 * NEVER guesses a location's rail — it grounds it through this record
 * (the old intent-kind dispatch, re-homed as evidence).
 */
export type FundsLocationObservation =
  | {
      readonly observationKind: "ONCHAIN_POSITION";
      readonly observationRef: string;
      /** Monotonic version of this observation (the preservation law). */
      readonly observationVersion: number;
      readonly locationRef: string;
      readonly chainKey: string;
      readonly accountRef: string;
      readonly assetId: string;
      readonly symbol: string;
      readonly observedAmount: { readonly currency: string; readonly minorUnits: string };
      readonly freshness: { readonly asOf: string; readonly maxAgeSeconds: number };
    }
  | {
      readonly observationKind: "PROVIDER_ACCOUNT";
      readonly observationRef: string;
      /** Monotonic version of this observation (the preservation law). */
      readonly observationVersion: number;
      readonly locationRef: string;
      readonly providerName: string;
      readonly accountRef: string;
      readonly currency: string;
      readonly observedAmount: { readonly currency: string; readonly minorUnits: string };
      readonly freshness: { readonly asOf: string; readonly maxAgeSeconds: number };
    }
  | {
      readonly observationKind: "BANK_INSTRUMENT";
      readonly observationRef: string;
      /** Monotonic version of this observation (the preservation law). */
      readonly observationVersion: number;
      readonly locationRef: string;
      readonly externalRef: string;
      readonly currency: string;
      readonly freshness: { readonly asOf: string; readonly maxAgeSeconds: number };
    }
  | {
      readonly observationKind: "MERCHANT_BALANCE";
      readonly observationRef: string;
      /** Monotonic version of this observation (the preservation law). */
      readonly observationVersion: number;
      readonly locationRef: string;
      readonly providerName: string;
      readonly merchantAccountRef: string;
      readonly currency: string;
      readonly freshness: { readonly asOf: string; readonly maxAgeSeconds: number };
    };

/**
 * A grounded observation reference on a leg: the observation KIND, ID and
 * the EXACT observation VERSION decided on, its freshness verdict and the
 * NAMED rule that judged it (the honest grounding law).
 */
export interface GroundedObservation {
  readonly observationKind: string;
  readonly observationId: string;
  /** The EXACT observation version decided on (the preservation law). */
  readonly observationVersion: number;
  readonly fresh: boolean;
  /** HOW staleness was judged — the named probe or policy applied. */
  readonly freshnessRule: string;
}

/** The per-leg state grounding: the observations + honest failures. */
export interface LegStateGrounding {
  readonly observations: readonly GroundedObservation[];
  /** Empty when fully grounded; otherwise EVERY surfaced reason. */
  readonly groundingFailures: readonly string[];
}

/**
 * Observation freshness by policy: fresh iff
 * (atMs - epoch(asOf)) <= maxAgeSeconds * 1000 — the inclusive bound law
 * (fresh at exactly maxAge, stale one ms later; negative ages are fresh —
 * an asOf slightly in the future of the evaluation instant is not a
 * staleness signal). Unparseable or non-strict timestamps are STALE (fail
 * closed — a lenient parse is a hidden normalization channel; see
 * canonical-time).
 */
export function observationIsFreshByPolicy(
  freshness: { asOf: string; maxAgeSeconds: number },
  atMs: number,
): boolean {
  if (!isIsoUtcTimestamp(freshness.asOf)) {
    return false;
  }
  if (
    typeof freshness.maxAgeSeconds !== "number" ||
    !Number.isSafeInteger(freshness.maxAgeSeconds) ||
    freshness.maxAgeSeconds < 1
  ) {
    return false;
  }
  requireNonNegativeSafeInteger(atMs, "the evaluation instant", fail);
  const ageMs = atMs - epochMillisFromIso(freshness.asOf);
  return ageMs <= freshness.maxAgeSeconds * 1000;
}

/**
 * The canonical freshness probe shared by every location observation
 * (strict ISO parse + inclusive bound; caller-supplied `at`).
 */
export function isLocationObservationFresh(
  observation: { freshness: { asOf: string; maxAgeSeconds: number } },
  atMs: number,
): boolean {
  if (!isIsoUtcTimestamp(observation.freshness.asOf)) {
    return false;
  }
  const ageMs = atMs - epochMillisFromIso(observation.freshness.asOf);
  return ageMs <= observation.freshness.maxAgeSeconds * 1000;
}

/** Fail-closed validation of a funds-location observation. */
export function validateFundsLocationObservation(
  candidate: unknown,
): FundsLocationObservation {
  const record = requireObject(candidate, "a FundsLocationObservation", fail);
  const kind = record["observationKind"];
  const observationRef = requireBoundedString(record["observationRef"], "observation.observationRef", LIMITS.refMaxLength, fail);
  const observationVersionRaw = record["observationVersion"];
  if (typeof observationVersionRaw !== "number" || !Number.isSafeInteger(observationVersionRaw) || observationVersionRaw < 1) {
    throw fail("observation.observationVersion must be a positive integer (a version-less observation is not evidence — the preservation law)");
  }
  const observationVersion = observationVersionRaw;
  const locationRef = requireBoundedString(record["locationRef"], "observation.locationRef", LIMITS.refMaxLength, fail);
  const freshnessRecord = record["freshness"];
  const freshness = validateFreshness(freshnessRecord);
  switch (kind) {
    case "ONCHAIN_POSITION": {
      const chainKey = requireBoundedString(record["chainKey"], "observation.chainKey", LIMITS.refMaxLength, fail);
      if (!isPinnedChainKey(chainKey)) {
        throw fail("observation.chainKey must be a canonical chain key");
      }
      const accountRef = requireBoundedString(record["accountRef"], "observation.accountRef", LIMITS.refMaxLength, fail);
      const assetId = requireBoundedString(record["assetId"], "observation.assetId", LIMITS.refMaxLength, fail);
      // P22-C growth (ADR-0016 D3): an onchain position is held in an ASSET,
      // not an ISO currency — the symbol (and the observed amount's
      // denomination) validate under the pinned ASSET-SYMBOL law (e.g. the
      // issuer-scoped `USDC` of `stellar:testnet/asset:USDC:<issuerG>`),
      // never the three-letter currency-code law.
      const symbol = requireBoundedString(record["symbol"], "observation.symbol", 32, fail);
      if (!isPinnedAssetSymbol(symbol)) {
        throw fail("observation.symbol must be a canonical asset symbol (uppercase-led, 1..32 chars)");
      }
      const observedAmount = validateObservedAssetAmount(record["observedAmount"]);
      return deepFreeze({
        observationKind: kind,
        observationRef,
        observationVersion,
        locationRef,
        chainKey,
        accountRef,
        assetId,
        symbol,
        observedAmount,
        freshness,
      });
    }
    case "PROVIDER_ACCOUNT": {
      const providerName = requireBoundedString(record["providerName"], "observation.providerName", LIMITS.refMaxLength, fail);
      const accountRef = requireBoundedString(record["accountRef"], "observation.accountRef", LIMITS.refMaxLength, fail);
      const currency = requireBoundedString(record["currency"], "observation.currency", 3, fail);
      const observedAmount = validateObservedAmount(record["observedAmount"]);
      return deepFreeze({
        observationKind: kind,
        observationRef,
        observationVersion,
        locationRef,
        providerName,
        accountRef,
        currency,
        observedAmount,
        freshness,
      });
    }
    case "BANK_INSTRUMENT": {
      const externalRef = requireBoundedString(record["externalRef"], "observation.externalRef", LIMITS.refMaxLength, fail);
      const currency = requireBoundedString(record["currency"], "observation.currency", 3, fail);
      return deepFreeze({ observationKind: kind, observationRef, observationVersion, locationRef, externalRef, currency, freshness });
    }
    case "MERCHANT_BALANCE": {
      const providerName = requireBoundedString(record["providerName"], "observation.providerName", LIMITS.refMaxLength, fail);
      const merchantAccountRef = requireBoundedString(record["merchantAccountRef"], "observation.merchantAccountRef", LIMITS.refMaxLength, fail);
      const currency = requireBoundedString(record["currency"], "observation.currency", 3, fail);
      return deepFreeze({
        observationKind: kind,
        observationRef,
        observationVersion,
        locationRef,
        providerName,
        merchantAccountRef,
        currency,
        freshness,
      });
    }
    default:
      throw fail(
        `observation.observationKind must be one of the closed vocabulary [${FUNDS_LOCATION_OBSERVATION_KINDS.join(", ")}]`,
      );
  }
}

function validateFreshness(candidate: unknown): { asOf: string; maxAgeSeconds: number } {
  const record = requireObject(candidate, "a freshness policy", fail);
  const asOf = record["asOf"];
  if (typeof asOf !== "string" || !isIsoUtcTimestamp(asOf)) {
    throw fail("freshness.asOf must be a strict ISO-8601 UTC timestamp (data, never a clock read)");
  }
  const maxAgeSeconds = record["maxAgeSeconds"];
  if (typeof maxAgeSeconds !== "number" || !Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 1) {
    throw fail("freshness.maxAgeSeconds must be a positive integer (a boundless observation is not evidence)");
  }
  return Object.freeze({ asOf, maxAgeSeconds });
}

function validateObservedAmount(
  candidate: unknown,
): { currency: string; minorUnits: string } {
  const record = requireObject(candidate, "an observed amount", fail);
  const currency = requireBoundedString(record["currency"], "amount.currency", 3, fail);
  const minorUnits = record["minorUnits"];
  if (typeof minorUnits !== "string" || !/^(0|[1-9][0-9]*)$/.test(minorUnits)) {
    throw fail("amount.minorUnits must be a canonical integer string (INV-F01)");
  }
  return Object.freeze({ currency, minorUnits });
}

/**
 * The ONCHAIN_POSITION observed amount: denominated in the ASSET symbol
 * (the pinned asset-symbol law — `USDC`, `ETH`, …), never a three-letter
 * ISO currency code. P22-C growth (ADR-0016 D3): the issuer-scoped
 * Stellar asset's symbol is four characters and is none the less a
 * canonical asset denomination.
 */
function validateObservedAssetAmount(
  candidate: unknown,
): { currency: string; minorUnits: string } {
  const record = requireObject(candidate, "an observed amount", fail);
  const currency = requireBoundedString(record["currency"], "amount.currency", 32, fail);
  if (!isPinnedAssetSymbol(currency)) {
    throw fail("amount.currency must be a canonical asset symbol (an onchain position is held in an asset, not an ISO currency)");
  }
  const minorUnits = record["minorUnits"];
  if (typeof minorUnits !== "string" || !/^(0|[1-9][0-9]*)$/.test(minorUnits)) {
    throw fail("amount.minorUnits must be a canonical integer string (INV-F01)");
  }
  return Object.freeze({ currency, minorUnits });
}

/** Fail-closed validation of a grounded-observation reference (with version). */
export function validateGroundedObservation(candidate: unknown): GroundedObservation {
  const record = requireObject(candidate, "a GroundedObservation", fail);
  const observationKind = requireBoundedString(record["observationKind"], "observation.kind", LIMITS.refMaxLength, fail);
  const observationId = requireBoundedString(record["observationId"], "observation.id", LIMITS.refMaxLength, fail);
  const observationVersion = requireNonNegativeSafeInteger(record["observationVersion"], "observation.version", fail);
  if (observationVersion < 1) {
    throw fail("observation.observationVersion must be a positive integer — a version-less grounding is not evidence");
  }
  const fresh = record["fresh"];
  if (typeof fresh !== "boolean") {
    throw fail("observation.fresh must be a boolean");
  }
  const freshnessRule = requireBoundedString(record["freshnessRule"], "observation.freshnessRule", LIMITS.refMaxLength, fail);
  return deepFreeze({ observationKind, observationId, observationVersion, fresh, freshnessRule });
}

/** Fail-closed validation of a leg state grounding. */
export function validateLegStateGrounding(candidate: unknown): LegStateGrounding {
  const record = requireObject(candidate, "a LegStateGrounding", fail);
  const rawObservations = record["observations"];
  if (!Array.isArray(rawObservations)) {
    throw fail("LegStateGrounding.observations must be an array");
  }
  const validated = rawObservations.map((observation) => validateGroundedObservation(observation));
  const rawFailures = record["groundingFailures"];
  if (!Array.isArray(rawFailures)) {
    throw fail("LegStateGrounding.groundingFailures must be an array");
  }
  const groundingFailures = rawFailures.map((reason) => {
    if (typeof reason !== "string" || reason.length === 0) {
      throw fail("grounding failure reasons must be non-empty strings");
    }
    return reason;
  });
  return deepFreeze({
    observations: Object.freeze(validated),
    groundingFailures: Object.freeze(groundingFailures),
  });
}
