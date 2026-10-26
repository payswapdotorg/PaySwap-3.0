import { describe, expect, it } from 'vitest';
import {
  CreditLimitExceededError,
  assertDrawWithinLimit,
  buildHypotheticalCreditScenario,
  creditInstrumentStatus,
  hypotheticalCreditIsNeverFunds,
  instrumentUtilization,
  validateCreditInstrument,
} from '../src/credit-instrument.ts';
import * as creditInstrumentModule from '../src/credit-instrument.ts';
import {
  DeterministicClock,
  UnknownCurrencyError,
  USD,
  ValidationError,
} from '../src/index.ts';
import type { CreditInstrument } from '../src/credit-instrument.ts';

/**
 * The evidenced credit instrument — RECORD-ONLY (P16-B, gap-matrix row B9;
 * ADR-0009 D5). Site classification (this file): 15 NET-NEW sites covering
 * construction + every fail-closed negative (principals, currency registry,
 * INV-02 bigint limit, pricing kinds, window/expiry ordering, distinct
 * principals, INV-05 authorization, NON-EMPTY evidence), the obligation-
 * machine boundary conventions on status, exact-bigint utilization + the
 * typed draw guard, the STRUCTURALLY SEPARATE hypothetical scenario (no
 * conversion path) and byte-identical determinism.
 */

const ISSUER = { principalType: 'ISSUER_BANK', principalId: 'bank-1' } as const;
const BORROWER = { principalType: 'MERCHANT', principalId: 'merchant-7' } as const;
const GUARANTOR = { principalType: 'GUARANTOR_BANK', principalId: 'bank-2' } as const;
const AUTHORIZATION = {
  artifactId: 'art-credit-1',
  mandateRef: 'mandate-treasury',
  approverRef: 'approver-risk',
  epoch: 4n,
} as const;

function instrumentInput(): Record<string, unknown> {
  return {
    instrumentId: 'ci-1',
    issuer: { ...ISSUER },
    borrower: { ...BORROWER },
    guarantor: { ...GUARANTOR },
    currency: USD,
    limitMinor: 1_000_000n,
    price: { kind: 'FIXED_FEE_MINOR', fixedFeeMinor: 250n },
    drawdownWindow: { opensAt: 1_000n, closesAt: 9_000n },
    expiresAt: 12_000n,
    authorization: { ...AUTHORIZATION },
    evidenceIds: ['ev-credit-1', 'ev-credit-2'],
    riskNotes: 'collateralized receivables; senior facility',
  };
}

describe('validateCreditInstrument (fail-closed, field paths in messages)', () => {
  it('constructs a FROZEN evidenced instrument (registered currency resolved, principals validated)', () => {
    const instrument = validateCreditInstrument(instrumentInput());
    expect(Object.isFrozen(instrument)).toBe(true);
    expect(instrument.instrumentId).toBe('ci-1');
    expect(instrument.issuer).toEqual({ principalType: 'ISSUER_BANK', principalId: 'bank-1' });
    expect(instrument.borrower).toEqual({ principalType: 'MERCHANT', principalId: 'merchant-7' });
    expect(instrument.guarantor).toEqual({ principalType: 'GUARANTOR_BANK', principalId: 'bank-2' });
    expect(instrument.currency).toBe(USD);
    expect(instrument.limitMinor).toBe(1_000_000n);
    expect(instrument.price).toEqual({ kind: 'FIXED_FEE_MINOR', fixedFeeMinor: 250n });
    expect(instrument.drawdownWindow).toEqual({ opensAt: 1_000n, closesAt: 9_000n });
    expect(instrument.expiresAt).toBe(12_000n);
    expect(instrument.authorization).toEqual({ ...AUTHORIZATION });
    expect(instrument.evidenceIds).toEqual(['ev-credit-1', 'ev-credit-2']);
    expect(instrument.riskNotes).toBe('collateralized receivables; senior facility');
    // BASIS_POINTS pricing constructs too (the other price kind)
    const bps = validateCreditInstrument({
      ...instrumentInput(),
      price: { kind: 'BASIS_POINTS', basisPoints: 75n },
      instrumentId: 'ci-2',
    });
    expect(bps.price).toEqual({ kind: 'BASIS_POINTS', basisPoints: 75n });
  });

  it('rejects bad principals (non-objects and missing principal fields)', () => {
    expect(() => validateCreditInstrument({ ...instrumentInput(), issuer: 'bank-1' })).toThrow(ValidationError);
    expect(() => validateCreditInstrument({ ...instrumentInput(), issuer: null })).toThrow(ValidationError);
    expect(() =>
      validateCreditInstrument({ ...instrumentInput(), issuer: { principalType: 'ISSUER_BANK' } }),
    ).toThrow(ValidationError);
    expect(() =>
      validateCreditInstrument({ ...instrumentInput(), borrower: { principalId: 'merchant-7' } }),
    ).toThrow(ValidationError);
    expect(() =>
      validateCreditInstrument({ ...instrumentInput(), guarantor: { principalType: '', principalId: 'x' } }),
    ).toThrow(ValidationError);
  });

  it('rejects unregistered currencies through the money registry', () => {
    expect(() => validateCreditInstrument({ ...instrumentInput(), currency: 'XYZ' })).toThrow(
      UnknownCurrencyError,
    );
    expect(() => validateCreditInstrument({ ...instrumentInput(), currency: '' })).toThrow(ValidationError);
    expect(() => validateCreditInstrument({ ...instrumentInput(), currency: 7 })).toThrow(ValidationError);
  });

  it('rejects non-positive limits and JS-number money (INV-02)', () => {
    expect(() => validateCreditInstrument({ ...instrumentInput(), limitMinor: 0n })).toThrow(ValidationError);
    expect(() => validateCreditInstrument({ ...instrumentInput(), limitMinor: -5n })).toThrow(ValidationError);
    expect(() => validateCreditInstrument({ ...instrumentInput(), limitMinor: 1_000_000 })).toThrow(ValidationError);
  });

  it('rejects bad price kinds and negative pricing fields', () => {
    expect(() => validateCreditInstrument({ ...instrumentInput(), price: 'flat' })).toThrow(ValidationError);
    expect(() =>
      validateCreditInstrument({ ...instrumentInput(), price: { kind: 'PERCENT', rate: 5n } }),
    ).toThrow(ValidationError);
    expect(() =>
      validateCreditInstrument({
        ...instrumentInput(),
        price: { kind: 'FIXED_FEE_MINOR', fixedFeeMinor: -1n },
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateCreditInstrument({ ...instrumentInput(), price: { kind: 'BASIS_POINTS', basisPoints: -10n } }),
    ).toThrow(ValidationError);
    expect(() =>
      validateCreditInstrument({ ...instrumentInput(), price: { kind: 'FIXED_FEE_MINOR', fixedFeeMinor: 5 } }),
    ).toThrow(ValidationError);
    expect(() =>
      validateCreditInstrument({ ...instrumentInput(), price: { kind: 'BASIS_POINTS', basisPoints: 75 } }),
    ).toThrow(ValidationError);
  });

  it('rejects a window that closes before it opens and an expiry before the window close', () => {
    expect(() =>
      validateCreditInstrument({
        ...instrumentInput(),
        drawdownWindow: { opensAt: 9_000n, closesAt: 8_999n },
      }),
    ).toThrow(ValidationError);
    expect(() => validateCreditInstrument({ ...instrumentInput(), expiresAt: 8_999n })).toThrow(ValidationError);
    expect(() => validateCreditInstrument({ ...instrumentInput(), expiresAt: 500n })).toThrow(ValidationError);
    expect(() =>
      validateCreditInstrument({ ...instrumentInput(), drawdownWindow: { opensAt: 1_000n, closesAt: 'late' } }),
    ).toThrow(ValidationError);
    // the boundary itself is legal: expiry == window close
    expect(() => validateCreditInstrument({ ...instrumentInput(), expiresAt: 9_000n })).not.toThrow();
  });

  it('rejects issuer == borrower and guarantor == issuer (distinct-principal laws)', () => {
    expect(() =>
      validateCreditInstrument({ ...instrumentInput(), borrower: { ...ISSUER } }),
    ).toThrow(ValidationError);
    expect(() =>
      validateCreditInstrument({ ...instrumentInput(), guarantor: { ...ISSUER } }),
    ).toThrow(ValidationError);
    // same principalId under a different principalType is still a different principal
    expect(() =>
      validateCreditInstrument({
        ...instrumentInput(),
        borrower: { principalType: 'OTHER_BANK', principalId: 'bank-1' },
      }),
    ).not.toThrow();
  });

  it('rejects structurally invalid AuthorizationRefs (INV-05)', () => {
    expect(() => validateCreditInstrument({ ...instrumentInput(), authorization: undefined })).toThrow(
      ValidationError,
    );
    expect(() => validateCreditInstrument({ ...instrumentInput(), authorization: 'signed' })).toThrow(
      ValidationError,
    );
    expect(() =>
      validateCreditInstrument({
        ...instrumentInput(),
        authorization: { ...AUTHORIZATION, artifactId: '' },
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateCreditInstrument({
        ...instrumentInput(),
        authorization: { ...AUTHORIZATION, mandateRef: ' spaced ' },
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateCreditInstrument({
        ...instrumentInput(),
        authorization: { ...AUTHORIZATION, epoch: -1n },
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateCreditInstrument({
        ...instrumentInput(),
        authorization: { ...AUTHORIZATION, epoch: 4 },
      }),
    ).toThrow(ValidationError);
  });

  it('rejects EMPTY evidenceIds — an instrument without evidence is unconstructible', () => {
    expect(() => validateCreditInstrument({ ...instrumentInput(), evidenceIds: [] })).toThrow(ValidationError);
    expect(() => validateCreditInstrument({ ...instrumentInput(), evidenceIds: undefined })).toThrow(
      ValidationError,
    );
    expect(() =>
      validateCreditInstrument({ ...instrumentInput(), evidenceIds: ['ev-credit-1', 'ev-credit-1'] }),
    ).toThrow(ValidationError);
    expect(() => validateCreditInstrument({ ...instrumentInput(), evidenceIds: ['ev-credit-1', ''] })).toThrow(
      ValidationError,
    );
  });
});

describe('creditInstrumentStatus (obligation-machine boundary conventions)', () => {
  const instrument = validateCreditInstrument(instrumentInput());
  // window [1000, 9000] INCLUSIVE; expiry 12000 STRICTLY-after.
  it('walks NOT_YET_OPEN -> OPEN (window close INCLUSIVE) -> WINDOW_CLOSED -> EXPIRED on a DeterministicClock', () => {
    const clock = new DeterministicClock(999n);
    expect(creditInstrumentStatus(instrument, clock.now())).toBe('NOT_YET_OPEN');
    clock.advanceMs(1n); // exactly opensAt — inclusive
    expect(creditInstrumentStatus(instrument, clock.now())).toBe('OPEN');
    clock.advanceMs(7_000n); // window mid
    expect(creditInstrumentStatus(instrument, clock.now())).toBe('OPEN');
    clock.advanceMs(1_000n); // exactly closesAt — close is INCLUSIVE
    expect(creditInstrumentStatus(instrument, clock.now())).toBe('OPEN');
    clock.advanceMs(1n); // one past close, before expiry
    expect(creditInstrumentStatus(instrument, clock.now())).toBe('WINDOW_CLOSED');
    clock.advanceMs(2_999n); // exactly expiresAt — expiry is STRICTLY-after
    expect(creditInstrumentStatus(instrument, clock.now())).toBe('WINDOW_CLOSED');
    clock.advanceMs(1n); // strictly after expiry
    expect(creditInstrumentStatus(instrument, clock.now())).toBe('EXPIRED');
  });

  it('EXPIRED dominates every other status; a non-bigint `at` is refused', () => {
    const tight = validateCreditInstrument({ ...instrumentInput(), expiresAt: 9_000n }); // expiry == close
    expect(creditInstrumentStatus(tight, 9_000n)).toBe('OPEN'); // inclusive close, not-yet-expired
    expect(creditInstrumentStatus(tight, 9_001n)).toBe('EXPIRED'); // dominates WINDOW_CLOSED
    expect(creditInstrumentStatus(tight, 12_000n)).toBe('EXPIRED'); // dominates NOT_YET_OPEN-era instants too
    expect(() => creditInstrumentStatus(instrument, 9_000 as unknown as bigint)).toThrow(ValidationError);
  });
});

describe('instrumentUtilization + assertDrawWithinLimit (exact bigint measurements)', () => {
  const instrument = validateCreditInstrument(instrumentInput());

  it('produces exact bigint snapshots at every boundary (0, ==limit, over-limit) and is frozen', () => {
    const zero = instrumentUtilization(instrument, 0n);
    expect(zero).toEqual({
      instrumentId: 'ci-1',
      currency: USD,
      drawnMinor: 0n,
      limitMinor: 1_000_000n,
      remainingMinor: 1_000_000n,
      withinLimit: true,
    });
    expect(Object.isFrozen(zero)).toBe(true);
    const atLimit = instrumentUtilization(instrument, 1_000_000n);
    expect(atLimit.remainingMinor).toBe(0n);
    expect(atLimit.withinLimit).toBe(true); // == limit is within
    const over = instrumentUtilization(instrument, 1_000_003n);
    expect(over.remainingMinor).toBe(-3n); // exact bigint, never clamped
    expect(over.withinLimit).toBe(false);
    expect(() => instrumentUtilization(instrument, 500 as unknown as bigint)).toThrow(ValidationError);
    expect(() => instrumentUtilization(instrument, -1n)).toThrow(ValidationError);
  });

  it('assertDrawWithinLimit throws the typed CreditLimitExceededError with exact details; within-limit is silent', () => {
    expect(() => assertDrawWithinLimit(instrument, 1_000_000n)).not.toThrow();
    expect(() => assertDrawWithinLimit(instrument, 0n)).not.toThrow();
    try {
      assertDrawWithinLimit(instrument, 1_000_003n);
      throw new Error('must throw');
    } catch (error) {
      const typed = error as CreditLimitExceededError;
      expect(typed).toBeInstanceOf(CreditLimitExceededError);
      expect(typed.code).toBe('CREDIT_LIMIT_EXCEEDED');
      expect(typed.category).toBe('CONFLICT');
      const details = typed.details as Record<string, unknown>;
      expect(details['instrumentId']).toBe('ci-1');
      expect(details['limitMinor']).toBe('1000000');
      expect(details['drawnMinor']).toBe('1000003');
      expect(details['excessMinor']).toBe('3');
    }
  });
});

describe('the hypothetical scenario (STRUCTURALLY SEPARATE — never funds)', () => {
  it('carries the literal conditional:true and evidenceIds:[] and the literal never-funds false', () => {
    const scenario = buildHypotheticalCreditScenario({
      scenarioId: 'hs-1',
      currency: USD,
      limitMinor: 500_000n,
    });
    expect(scenario.scenarioId).toBe('hs-1');
    expect(scenario.currency).toBe(USD);
    expect(scenario.limitMinor).toBe(500_000n);
    expect(scenario.conditional).toBe(true); // literal
    expect(scenario.evidenceIds).toEqual([]); // literal empty
    expect(scenario.evidenceIds).toHaveLength(0);
    expect(Object.isFrozen(scenario)).toBe(true);
    expect(hypotheticalCreditIsNeverFunds(scenario)).toBe(false); // literal, never derived
    // the builder itself fails closed on unregistered currencies and non-positive limits
    expect(() =>
      buildHypotheticalCreditScenario({ scenarioId: 'hs-2', currency: 'XYZ', limitMinor: 1n }),
    ).toThrow(UnknownCurrencyError);
    expect(() =>
      buildHypotheticalCreditScenario({ scenarioId: 'hs-3', currency: USD, limitMinor: 0n }),
    ).toThrow(ValidationError);
  });

  it('has NO conversion path to an evidenced instrument (closed export surface + behavioral probe)', () => {
    // (a) the module's runtime export surface is the closed, pinned list — no
    // convert/promote/realize/fund export exists at any name.
    expect(Object.keys(creditInstrumentModule).sort()).toEqual([
      'CreditLimitExceededError',
      'assertDrawWithinLimit',
      'buildHypotheticalCreditScenario',
      'creditInstrumentStatus',
      'hypotheticalCreditIsNeverFunds',
      'instrumentUtilization',
      'validateCreditInstrument',
    ]);
    // (b) the hypothetical shape can NEVER satisfy the evidenced-instrument laws.
    const scenario = buildHypotheticalCreditScenario({
      scenarioId: 'hs-1',
      currency: USD,
      limitMinor: 500_000n,
    });
    expect(() => validateCreditInstrument(scenario)).toThrow(ValidationError);
    // (c) behavioral probe: no exported function turns a hypothetical into an
    // evidenced instrument — each either refuses (typed throw) or returns a
    // measurement that carries no evidence.
    const TAKES_INSTANT = new Set(['creditInstrumentStatus', 'instrumentUtilization', 'assertDrawWithinLimit']);
    for (const [name, exported] of Object.entries(creditInstrumentModule)) {
      if (name === 'buildHypotheticalCreditScenario' || name === 'hypotheticalCreditIsNeverFunds') {
        continue;
      }
      if (typeof exported !== 'function') {
        continue;
      }
      let outcome: unknown;
      try {
        const call = exported as (...args: unknown[]) => unknown;
        outcome = TAKES_INSTANT.has(name) ? call(scenario, 0n) : call(scenario);
      } catch {
        continue; // refused — fail-closed, which is never a conversion
      }
      const candidate = outcome as { evidenceIds?: unknown } | null;
      const isEvidenced =
        typeof candidate === 'object' &&
        candidate !== null &&
        Array.isArray(candidate.evidenceIds) &&
        (candidate.evidenceIds as unknown[]).length > 0;
      expect(isEvidenced).toBe(false);
    }
  });
});

describe('byte-identical determinism of frozen records', () => {
  it('identical inputs produce structurally identical frozen instruments and snapshots (fresh records)', () => {
    const first: CreditInstrument = validateCreditInstrument(instrumentInput());
    const second: CreditInstrument = validateCreditInstrument(instrumentInput());
    expect(first).toEqual(second);
    expect(Object.keys(first)).toEqual(Object.keys(second));
    expect(first).not.toBe(second); // a fresh frozen record, never a cached identity
    expect(instrumentUtilization(first, 123_456n)).toEqual(instrumentUtilization(second, 123_456n));
    expect(creditInstrumentStatus(first, 4_500n)).toBe(creditInstrumentStatus(second, 4_500n));
  });
});
