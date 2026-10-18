/**
 * @payswap/onchain-domain — asset definitions and exact amounts (P4-W1,
 * lane R2-W1; PORT/ADAPT of payswap.org@8a735bf
 * packages/onchain-domain/src/asset.ts, split for the file-size law — the
 * observation contracts live in ./asset-observation.ts).
 *
 * Assets are DESCRIPTIVE catalogue vocabulary: an AssetDefinition declares
 * what an onchain asset IS (identity, class, exact minor-unit scale, chain
 * scope, provenance). An AssetObservation is an OBSERVATION of external
 * state — a time-stamped report of an amount at an external onchain
 * location, with MANDATORY freshness, provenance and observer identity.
 *
 * INV-7 (external provider/wallet balances are observations, not PaySwap
 * custody; old INV-C09): an AssetObservation is NEVER PaySwap custody and
 * NEVER a customer balance. It is structurally distinct from any
 * ledger/balance type (nominal `observationKind` brand; no mutable
 * balance-shaped field; mandatory freshness/provenance/observer). It may
 * inform routing, timing and reconciliation only according to its
 * provenance and freshness — it can never be booked as an internal balance.
 * This package constructs NO protocol Money and exposes NO balance
 * arithmetic: money truth stays with the Financial Protocol Authority
 * (INV-1; see ./settlement-mapping.ts).
 *
 * INV-2 (exact money): asset amounts are integer minor units,
 * string-encoded for exactness. Floating-point amounts are rejected.
 */

import { ValidationError } from "./errors.ts";
import { isNonEmptyString, isRecord } from "./shared.ts";
import { isValidChainKey } from "./family.ts";
import type { ProvenanceDescriptorPin } from "./pins.ts";
import { validateAssetFamilyExtension } from "./family-extensions.ts";
import type { AssetFamilyExtension } from "./family-extensions.ts";

// ---------------------------------------------------------------------------
// Asset definitions (descriptive catalogue — never authority)
// ---------------------------------------------------------------------------

export const ASSET_CLASSES = [
  "NATIVE",
  "TOKEN",
  "WRAPPED",
  "BRIDGED",
  "OTHER",
] as const;

export type AssetClass = (typeof ASSET_CLASSES)[number];

/**
 * A declared peg claim (descriptive, with provenance). A peg declaration is
 * a CLAIM, never an assumption and never evidence of backing.
 */
export interface PegDeclaration {
  readonly pegKind: "FIAT_PEGGED" | "ASSET_PEGGED" | "UNPEGGED";
  readonly declaredBy: string;
}

/**
 * A declared maximum minor-unit exponent for onchain assets (broader than
 * the ISO-style currency registry bound; still exact integers only).
 */
export const MAX_ASSET_MINOR_UNIT_DIGITS = 18;

/**
 * An onchain asset as a descriptive catalogue entry: canonical identity,
 * symbol, class, exact minor-unit scale, chain scope, optional declared peg
 * claim, provenance and the optional family-scoped extension. Carries NO
 * authorization scope of any kind — asset catalogues never authorize
 * (INV-13).
 */
export interface AssetDefinition {
  /** Canonical asset identity: `${chainKey}/asset:${symbol}`. */
  readonly assetId: string;
  readonly symbol: string;
  readonly displayName: string;
  readonly assetClass: AssetClass;
  /** Exact integer minor-unit scale (INV-2). */
  readonly minorUnitDigits: number;
  readonly chainKey: string;
  /** Optional declared peg claim — a claim, never an assumption. */
  readonly declaredPeg?: PegDeclaration;
  readonly provenance: ProvenanceDescriptorPin;
  /** Optional family-scoped extension — never required by core contracts. */
  readonly familyExtension?: AssetFamilyExtension;
}

/** Deterministic asset identity: `${chainKey}/asset:${symbol}`. */
export function canonicalAssetRef(chainKey: string, symbol: string): string {
  return `${chainKey}/asset:${symbol}`;
}

/** Canonical asset symbol format. */
export const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,31}$/;

/** Exact non-negative integer minor-unit format (no leading zeros). */
export const MINOR_UNITS_PATTERN = /^(0|[1-9][0-9]*)$/;

// ---------------------------------------------------------------------------
// Exact asset amounts (INV-2)
// ---------------------------------------------------------------------------

/** Exact onchain asset amount: integer minor units, string-encoded. */
export interface AssetAmount {
  readonly assetId: string;
  readonly minorUnits: string;
}

// ---------------------------------------------------------------------------
// Validators (implementation)
// ---------------------------------------------------------------------------

/** Guard: a declared asset class. */
export function isAssetClass(value: unknown): value is AssetClass {
  return (
    typeof value === "string" &&
    (ASSET_CLASSES as readonly unknown[]).includes(value)
  );
}

/**
 * Runtime validation for an asset definition from untyped sources.
 * Deterministic rules:
 * - assetId === canonicalAssetRef(chainKey, symbol) (deterministic identity);
 * - minorUnitDigits is an integer 0..18 (exact minor-unit scale);
 * - chainKey is canonical; symbol is canonical;
 * - a declared peg is a well-formed claim;
 * - catalogue provenance is present (descriptive declarations carry
 *   provenance — an anonymous asset claim is rejected);
 * - an optional family extension is well-formed.
 */
export function validateAssetDefinition(candidate: unknown): AssetDefinition {
  const errors: string[] = [];
  if (!isRecord(candidate)) {
    throw new ValidationError("asset definition must be an object");
  }
  const record = candidate;
  if (!isNonEmptyString(record.symbol) || !SYMBOL_PATTERN.test(record.symbol)) {
    errors.push("symbol must match /^[A-Z0-9][A-Z0-9._-]{0,31}$/");
  }
  if (!isNonEmptyString(record.displayName)) {
    errors.push("displayName must be a non-empty string");
  }
  if (!isAssetClass(record.assetClass)) {
    errors.push(`assetClass must be one of [${ASSET_CLASSES.join(", ")}]`);
  }
  if (!isValidChainKey(record.chainKey)) {
    errors.push("chainKey must be a canonical `${namespace}:${network}` chain key");
  }
  if (
    typeof record.minorUnitDigits !== "number" ||
    !Number.isInteger(record.minorUnitDigits) ||
    record.minorUnitDigits < 0 ||
    record.minorUnitDigits > MAX_ASSET_MINOR_UNIT_DIGITS
  ) {
    errors.push(
      `minorUnitDigits must be an integer between 0 and ${MAX_ASSET_MINOR_UNIT_DIGITS} (exact integer minor units — INV-2)`,
    );
  }
  const peg = record.declaredPeg;
  let parsedPeg: PegDeclaration | undefined;
  if (peg !== undefined) {
    if (
      peg === null ||
      typeof peg !== "object" ||
      (peg as Readonly<Record<string, unknown>>).pegKind === undefined ||
      !["FIAT_PEGGED", "ASSET_PEGGED", "UNPEGGED"].includes(
        String((peg as Readonly<Record<string, unknown>>).pegKind),
      ) ||
      !isNonEmptyString((peg as Readonly<Record<string, unknown>>).declaredBy)
    ) {
      errors.push(
        "declaredPeg, when present, must be { pegKind: FIAT_PEGGED | ASSET_PEGGED | UNPEGGED, declaredBy }",
      );
    } else {
      parsedPeg = {
        pegKind: (peg as PegDeclaration).pegKind,
        declaredBy: (peg as PegDeclaration).declaredBy,
      };
    }
  }
  const provenance = record.provenance;
  if (
    provenance === null ||
    typeof provenance !== "object" ||
    !isNonEmptyString((provenance as Readonly<Record<string, unknown>>).declaredBy) ||
    !isNonEmptyString((provenance as Readonly<Record<string, unknown>>).artifactRef) ||
    !isNonEmptyString((provenance as Readonly<Record<string, unknown>>).contentHash)
  ) {
    errors.push(
      "provenance must be a ProvenanceDescriptor { declaredBy, artifactRef, contentHash } — a catalogue entry without provenance is rejected",
    );
  }
  const familyExtension = record.familyExtension;
  if (familyExtension !== undefined) {
    try {
      validateAssetFamilyExtension(familyExtension);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (isNonEmptyString(record.symbol) && isValidChainKey(record.chainKey)) {
    const expectedId = canonicalAssetRef(record.chainKey, record.symbol);
    if (record.assetId !== expectedId) {
      errors.push(
        `asset identity is deterministic: assetId must be '${expectedId}' for symbol '${record.symbol}' on chain '${record.chainKey}'`,
      );
    }
  } else if (!isNonEmptyString(record.assetId)) {
    errors.push("assetId must be a non-empty string");
  }

  if (errors.length > 0) {
    throw new ValidationError(`Invalid asset definition: ${errors.join("; ")}`, {
      errors: [...errors],
    });
  }

  const parsedFamilyExtension =
    familyExtension !== undefined ? validateAssetFamilyExtension(familyExtension) : undefined;
  return Object.freeze({
    assetId: record.assetId as string,
    symbol: record.symbol as string,
    displayName: record.displayName as string,
    assetClass: record.assetClass as AssetClass,
    minorUnitDigits: record.minorUnitDigits as number,
    chainKey: record.chainKey as string,
    provenance: Object.freeze({ ...(record.provenance as ProvenanceDescriptorPin) }),
    ...(parsedPeg !== undefined ? { declaredPeg: Object.freeze(parsedPeg) } : {}),
    ...(parsedFamilyExtension !== undefined ? { familyExtension: parsedFamilyExtension } : {}),
  });
}

// ---------------------------------------------------------------------------
// Exact asset amounts (INV-2 — implementation)
// ---------------------------------------------------------------------------

/**
 * Validates an exact asset amount: non-empty asset id and a non-negative
 * integer decimal string. Floating-point shapes ('1.5', '1e7', '0x10'),
 * negative values and leading zeros are rejected (INV-2).
 */
export function validateAssetAmount(amount: AssetAmount): void {
  if (amount === null || typeof amount !== "object") {
    throw new ValidationError("asset amount must be an object");
  }
  if (!isNonEmptyString(amount.assetId)) {
    throw new ValidationError("assetId must be a non-empty string");
  }
  if (typeof amount.minorUnits !== "string" || !MINOR_UNITS_PATTERN.test(amount.minorUnits)) {
    throw new ValidationError(
      `minorUnits must be a non-negative integer decimal string without leading zeros (exact integer minor units — INV-2; no floating-point money), got '${String(amount.minorUnits)}'`,
    );
  }
}

/** Parses the exact minor units of a validated asset amount. */
export function parseAssetAmountMinorUnits(amount: AssetAmount): bigint {
  validateAssetAmount(amount);
  return BigInt(amount.minorUnits);
}
