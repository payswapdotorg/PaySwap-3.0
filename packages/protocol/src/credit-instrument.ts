/**
 * The evidenced credit instrument — RECORD-ONLY (P16-B, gap-matrix row B9;
 * ADR-0009 D5). A CreditInstrument is an evidenced, authorization-lined
 * RECORD: PrincipalRefs, a registered CurrencyCode, a positive bigint
 * limit, fixed-fee/basis-points pricing, a drawdown window, an expiry, an
 * OPAQUE AuthorizationRef validated by the existing authorization.ts
 * validator (INV-05) and NON-EMPTY evidenceIds — an instrument without
 * evidence is UNCONSTRUCTIBLE.
 *
 * Credit is NEVER liquidity and NEVER funds: this module records and
 * measures; it exposes no execution path, no balance mutation and no
 * conversion into any funding primitive. The credit EXECUTION kernel is
 * NOT claimed — the FINANCIAL-PROTOCOL deferral register stays unamended
 * (P5-W1 dependency). The HypotheticalCreditScenario is STRUCTURALLY
 * SEPARATE: `conditional: true` and `evidenceIds: []` are literal fields,
 * `hypotheticalCreditIsNeverFunds()` returns the literal `false`, and no
 * conversion path exists between the two types.
 *
 * Window conventions follow the obligation-machine boundary conventions:
 * the drawdown window close is INCLUSIVE, expiry is STRICTLY-AFTER, and
 * EXPIRED dominates every other status. All instants are caller-supplied
 * bigint TimestampMs; money is exact bigint minor units (INV-02 — JS
 * numbers are rejected).
 */

import { PaySwapError, ValidationError } from './errors.ts';
import type { PaySwapErrorDetails } from './errors.ts';
import { validateAuthorizationRef } from './authorization.ts';
import type { AuthorizationRef } from './authorization.ts';
import type { TimestampMs } from './clock.ts';
import { getCurrencyInfo } from './money.ts';
import type { CurrencyCode } from './money.ts';
import type { PrincipalRef } from './identifiers.ts';

declare const CreditInstrumentIdBrand: unique symbol;

/** Branded id of one credit instrument record. */
export type CreditInstrumentId = string & { readonly [CreditInstrumentIdBrand]: 'CreditInstrumentId' };

/** The pricing vocabulary: a fixed fee in minor units, or basis points of the drawn amount. */
export type CreditPrice =
  | { readonly kind: 'FIXED_FEE_MINOR'; readonly fixedFeeMinor: bigint }
  | { readonly kind: 'BASIS_POINTS'; readonly basisPoints: bigint };

/** The drawdown window `[opensAt, closesAt]` (bigint ms; close INCLUSIVE). */
export interface CreditDrawdownWindow {
  readonly opensAt: TimestampMs;
  readonly closesAt: TimestampMs;
}

/** The lifecycle status of a credit instrument at a caller-supplied instant. */
export type CreditInstrumentStatus = 'NOT_YET_OPEN' | 'OPEN' | 'WINDOW_CLOSED' | 'EXPIRED';

/**
 * The RECORD-ONLY credit instrument (ADR-0009 D5). Evidence is NON-EMPTY by
 * construction; authorization lineage is structurally complete (INV-05).
 */
export interface CreditInstrument {
  readonly instrumentId: CreditInstrumentId;
  readonly issuer: PrincipalRef;
  readonly borrower: PrincipalRef;
  /** Optional distinct guarantor (must differ from the issuer when present). */
  readonly guarantor?: PrincipalRef;
  readonly currency: CurrencyCode;
  /** Positive bigint limit in minor units (INV-02 — never a JS number). */
  readonly limitMinor: bigint;
  readonly price: CreditPrice;
  readonly drawdownWindow: CreditDrawdownWindow;
  readonly expiresAt: TimestampMs;
  /** Opaque trust-lane authorization lineage (INV-05). */
  readonly authorization: AuthorizationRef;
  /** NON-EMPTY: an instrument without evidence is unconstructible. */
  readonly evidenceIds: readonly string[];
  /** Free-form risk notes (non-empty; a record this consequential must say why it is safe). */
  readonly riskNotes: string;
}

/** A draw would exceed the instrument's limit (exact bigint arithmetic). */
export class CreditLimitExceededError extends PaySwapError {
  constructor(message: string, details?: PaySwapErrorDetails) {
    super({ code: 'CREDIT_LIMIT_EXCEEDED', category: 'CONFLICT', message, details });
  }
}

/** The pure utilization snapshot of one instrument against a drawn amount. */
export interface CreditUtilizationSnapshot {
  readonly instrumentId: CreditInstrumentId;
  readonly currency: CurrencyCode;
  readonly drawnMinor: bigint;
  readonly limitMinor: bigint;
  readonly remainingMinor: bigint;
  readonly withinLimit: boolean;
}

// ---------------------------------------------------------------------------
// Validation (fail-closed, field paths in messages)
// ---------------------------------------------------------------------------

const MAX_ID_LENGTH = 256;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function expectString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`${field} must be a non-empty string`, { field });
  }
  return value;
}

function expectId(value: unknown, field: string): string {
  const id = expectString(value, field);
  if (id.length > MAX_ID_LENGTH) {
    throw new ValidationError(`${field} exceeds ${MAX_ID_LENGTH} characters`, { field, length: id.length });
  }
  if (id.trim() !== id) {
    throw new ValidationError(`${field} must not carry surrounding whitespace`, { field });
  }
  return id;
}

/** BigInt law (INV-02): JS numbers are rejected outright; the value must clear `minimum`. */
function expectBigInt(value: unknown, field: string, minimum: bigint): bigint {
  if (typeof value === 'number') {
    throw new ValidationError(`${field} is a JS number; floating-point money is forbidden (INV-02)`, { field });
  }
  if (typeof value !== 'bigint' || value < minimum) {
    throw new ValidationError(`${field} must be a bigint of at least ${minimum}`, { field });
  }
  return value;
}

function expectTimestamp(value: unknown, field: string): TimestampMs {
  if (typeof value !== 'bigint') {
    throw new ValidationError(`${field} must be a bigint TimestampMs`, { field });
  }
  return value;
}

function expectPrincipalRef(value: unknown, field: string): PrincipalRef {
  if (!isObject(value)) {
    throw new ValidationError(`${field} must be a PrincipalRef object`, { field });
  }
  return {
    principalType: expectString(value.principalType, `${field}.principalType`),
    principalId: expectString(value.principalId, `${field}.principalId`),
  };
}

function expectPrice(value: unknown): CreditPrice {
  if (!isObject(value)) {
    throw new ValidationError('price must be a CreditPrice object');
  }
  switch (value.kind) {
    case 'FIXED_FEE_MINOR':
      return { kind: 'FIXED_FEE_MINOR', fixedFeeMinor: expectBigInt(value.fixedFeeMinor, 'price.fixedFeeMinor', 0n) };
    case 'BASIS_POINTS':
      return { kind: 'BASIS_POINTS', basisPoints: expectBigInt(value.basisPoints, 'price.basisPoints', 0n) };
    default:
      throw new ValidationError('price.kind must be FIXED_FEE_MINOR or BASIS_POINTS', { kind: String(value.kind) });
  }
}

function expectEvidenceIds(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError('evidenceIds must be a NON-EMPTY array — an instrument without evidence is unconstructible (INV-05)');
  }
  const ids = value.map((entry, index) => expectString(entry, `evidenceIds[${index}]`));
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new ValidationError('evidenceIds must not contain duplicates', { evidenceId: id });
    }
    seen.add(id);
  }
  return ids;
}

function expectWindow(value: unknown): CreditDrawdownWindow {
  if (!isObject(value)) {
    throw new ValidationError('drawdownWindow must be a CreditDrawdownWindow object');
  }
  const opensAt = expectTimestamp(value.opensAt, 'drawdownWindow.opensAt');
  const closesAt = expectTimestamp(value.closesAt, 'drawdownWindow.closesAt');
  if (closesAt < opensAt) {
    throw new ValidationError('drawdownWindow closes before it opens', {
      opensAt: opensAt.toString(), closesAt: closesAt.toString(),
    });
  }
  return { opensAt, closesAt };
}

/**
 * Fail-closed validator (unknown-typed input). Every field is checked:
 * window close >= open; expiry >= window close; issuer != borrower;
 * guarantor != issuer (when present); registered currency; positive bigint
 * limit; pricing laws; INV-05 authorization; NON-EMPTY evidence. Returns a
 * new frozen instrument.
 */
export function validateCreditInstrument(instrument: unknown): CreditInstrument {
  if (!isObject(instrument)) {
    throw new ValidationError('instrument must be a CreditInstrument object');
  }
  const drawdownWindow = expectWindow(instrument.drawdownWindow);
  const expiresAt = expectTimestamp(instrument.expiresAt, 'expiresAt');
  if (expiresAt < drawdownWindow.closesAt) {
    throw new ValidationError('expiry must not precede the drawdown window close', {
      expiresAt: expiresAt.toString(), windowClosesAt: drawdownWindow.closesAt.toString(),
    });
  }
  const issuer = expectPrincipalRef(instrument.issuer, 'issuer');
  const borrower = expectPrincipalRef(instrument.borrower, 'borrower');
  const samePrincipal = (a: PrincipalRef, b: PrincipalRef): boolean =>
    a.principalType === b.principalType && a.principalId === b.principalId;
  if (samePrincipal(issuer, borrower)) {
    throw new ValidationError('issuer and borrower must be different principals', { borrower: borrower.principalId });
  }
  const out: { -readonly [K in keyof CreditInstrument]: CreditInstrument[K] } = {
    instrumentId: expectId(instrument.instrumentId, 'instrumentId') as CreditInstrumentId,
    issuer,
    borrower,
    currency: getCurrencyInfo(expectString(instrument.currency, 'currency')).code,
    limitMinor: expectBigInt(instrument.limitMinor, 'limitMinor', 1n),
    price: expectPrice(instrument.price),
    drawdownWindow,
    expiresAt,
    authorization: ((): AuthorizationRef => {
      const ref = instrument.authorization;
      validateAuthorizationRef(ref as AuthorizationRef);
      return ref as AuthorizationRef;
    })(),
    evidenceIds: expectEvidenceIds(instrument.evidenceIds),
    riskNotes: expectString(instrument.riskNotes, 'riskNotes'),
  };
  if (instrument.guarantor !== undefined) {
    const guarantor = expectPrincipalRef(instrument.guarantor, 'guarantor');
    if (samePrincipal(guarantor, issuer)) {
      throw new ValidationError('guarantor and issuer must be different principals', { guarantor: guarantor.principalId });
    }
    out.guarantor = guarantor;
  }
  return Object.freeze(out);
}

// ---------------------------------------------------------------------------
// Status, utilization and the draw guard (record-only measurements)
// ---------------------------------------------------------------------------

/**
 * The instrument's status at a caller-supplied instant, following the
 * obligation-machine boundary conventions: the window close is INCLUSIVE,
 * expiry is STRICTLY-AFTER (`at > expiresAt`), and EXPIRED dominates every
 * other status.
 */
export function creditInstrumentStatus(
  instrument: CreditInstrument,
  at: TimestampMs,
): CreditInstrumentStatus {
  if (typeof at !== 'bigint') {
    throw new ValidationError('at must be a bigint TimestampMs', { at: String(at) });
  }
  if (at > instrument.expiresAt) {
    return 'EXPIRED';
  }
  if (at < instrument.drawdownWindow.opensAt) {
    return 'NOT_YET_OPEN';
  }
  if (at <= instrument.drawdownWindow.closesAt) {
    return 'OPEN';
  }
  return 'WINDOW_CLOSED';
}

/**
 * Pure exact-bigint utilization snapshot of `drawnMinor` against the
 * instrument's limit. Nothing is mutated, no balance is touched, and the
 * snapshot never claims funds: `withinLimit` is a measurement, not a
 * reservation. JS numbers are rejected (INV-02); negative draws are
 * rejected.
 */
export function instrumentUtilization(
  instrument: CreditInstrument,
  drawnMinor: bigint,
): CreditUtilizationSnapshot {
  if (typeof drawnMinor === 'number') {
    throw new ValidationError('drawnMinor is a JS number; floating-point money is forbidden (INV-02)');
  }
  if (typeof drawnMinor !== 'bigint' || drawnMinor < 0n) {
    throw new ValidationError('drawnMinor must be a non-negative bigint', { drawnMinor: String(drawnMinor) });
  }
  return Object.freeze({
    instrumentId: instrument.instrumentId,
    currency: instrument.currency,
    drawnMinor,
    limitMinor: instrument.limitMinor,
    remainingMinor: instrument.limitMinor - drawnMinor,
    withinLimit: drawnMinor <= instrument.limitMinor,
  });
}

/** Fails closed with `CreditLimitExceededError` when the draw would exceed the limit. */
export function assertDrawWithinLimit(
  instrument: CreditInstrument,
  drawnMinor: bigint,
): void {
  const snapshot = instrumentUtilization(instrument, drawnMinor);
  if (!snapshot.withinLimit) {
    throw new CreditLimitExceededError(
      `draw of ${drawnMinor.toString()} ${instrument.currency} minor units exceeds the credit limit of ${instrument.limitMinor.toString()}`,
      {
        instrumentId: instrument.instrumentId,
        limitMinor: instrument.limitMinor.toString(),
        drawnMinor: drawnMinor.toString(),
        excessMinor: (drawnMinor - instrument.limitMinor).toString(),
      },
    );
  }
}

// ---------------------------------------------------------------------------
// The hypothetical scenario (STRUCTURALLY SEPARATE — never funds)
// ---------------------------------------------------------------------------

/**
 * A hypothetical credit scenario. `conditional` is the literal `true` and
 * `evidenceIds` is the literal empty array: this shape can NEVER satisfy
 * the evidenced-instrument laws, and there is intentionally NO conversion
 * path from here to a CreditInstrument. A hypothetical scenario never
 * funds anything.
 */
export interface HypotheticalCreditScenario {
  readonly scenarioId: string;
  readonly currency: CurrencyCode;
  readonly limitMinor: bigint;
  readonly conditional: true;
  readonly evidenceIds: readonly [];
}

/** The literal `false`: a hypothetical credit scenario NEVER funds. Pinned, never derived. */
export function hypotheticalCreditIsNeverFunds(_scenario: HypotheticalCreditScenario): false {
  return false;
}

/** Builds a validated, frozen hypothetical scenario (never funds; no conversion path). */
export function buildHypotheticalCreditScenario(input: {
  readonly scenarioId: string;
  readonly currency: string;
  readonly limitMinor: bigint;
}): HypotheticalCreditScenario {
  return Object.freeze({
    scenarioId: expectId(input.scenarioId, 'scenarioId'),
    currency: getCurrencyInfo(expectString(input.currency, 'currency')).code,
    limitMinor: expectBigInt(input.limitMinor, 'limitMinor', 1n),
    conditional: true,
    evidenceIds: [] as const,
  });
}
