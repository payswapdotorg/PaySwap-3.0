import { describe, expect, it } from 'vitest';
import {
  ValidationError,
  validateCorridorRestrictionSet,
  restrictionWideningViolations,
  isCustomerType,
  CUSTOMER_TYPES,
} from '../src/index.ts';
import { eurGbpRestrictionSet } from './fixtures.ts';
import type { CorridorRestrictionSet } from '../src/index.ts';

/**
 * Corridor restrictions (NET-NEW — Wise §4.1 discipline inputs). Absent
 * dimensions are unrestricted; present dimensions are hard constraints.
 * The narrowing law keeps implementation-level restrictions inside the
 * definition-level scope. Amount bounds are exact via the pinned AmountSpec
 * wire type (structural ordering, never float).
 */

describe('validateCorridorRestrictionSet', () => {
  it('accepts the fixture (all dimensions declared)', () => {
    const validated = validateCorridorRestrictionSet(eurGbpRestrictionSet());
    expect(validated.restrictionSetId).toBe('rs:sepa-core');
    expect(validated.version).toBe('1.0.0');
  });

  it('accepts a minimal set: only id/version/declaredBy/requiredFields/cutoffs', () => {
    const minimal = validateCorridorRestrictionSet({
      restrictionSetId: 'rs:minimal',
      version: '1.0.0',
      requiredFields: [],
      cutoffs: [],
      declaredBy: 'x',
    });
    expect(minimal.currencies).toBeUndefined();
    expect(minimal.amountLimits).toBeUndefined();
  });

  it('requires provenance, id and version', () => {
    expect(() =>
      validateCorridorRestrictionSet({ ...eurGbpRestrictionSet(), declaredBy: '' }),
    ).toThrow(/declaredBy/);
    expect(() =>
      validateCorridorRestrictionSet({ ...eurGbpRestrictionSet(), version: '' }),
    ).toThrow(/version/);
    expect(() =>
      validateCorridorRestrictionSet({ ...eurGbpRestrictionSet(), restrictionSetId: '' }),
    ).toThrow(/restrictionSetId/);
  });

  it('rejects malformed country and currency codes', () => {
    expect(() =>
      validateCorridorRestrictionSet({
        ...eurGbpRestrictionSet(),
        sourceCountries: ['deu'],
      }),
    ).toThrow(/sourceCountries/);
    expect(() =>
      validateCorridorRestrictionSet({ ...eurGbpRestrictionSet(), currencies: ['eu'] }),
    ).toThrow(/currencies/);
  });

  it('customer types are PERSONAL | BUSINESS only', () => {
    expect([...CUSTOMER_TYPES]).toEqual(['PERSONAL', 'BUSINESS']);
    expect(isCustomerType('PERSONAL')).toBe(true);
    expect(isCustomerType('GOVERNMENT')).toBe(false);
    expect(() =>
      validateCorridorRestrictionSet({
        ...eurGbpRestrictionSet(),
        customerTypes: ['PERSONAL', 'NGO' as never],
      }),
    ).toThrow(/customerTypes/);
  });

  it('amount bounds must share one currency with min <= max (exact ordering)', () => {
    expect(() =>
      validateCorridorRestrictionSet({
        ...eurGbpRestrictionSet(),
        amountLimits: {
          min: { currency: 'EUR', minorUnits: '500' },
          max: { currency: 'EUR', minorUnits: '100' },
        },
      }),
    ).toThrow(/min must be <= max/);
    expect(() =>
      validateCorridorRestrictionSet({
        ...eurGbpRestrictionSet(),
        amountLimits: {
          min: { currency: 'EUR', minorUnits: '100' },
          max: { currency: 'USD', minorUnits: '500' },
        },
      }),
    ).toThrow(/share one currency/);
    // lexicographic-vs-length discipline: '900' < '1000' via length ordering
    expect(() =>
      validateCorridorRestrictionSet({
        ...eurGbpRestrictionSet(),
        amountLimits: {
          min: { currency: 'EUR', minorUnits: '1000' },
          max: { currency: 'EUR', minorUnits: '900' },
        },
      }),
    ).toThrow(/min must be <= max/);
  });

  it('required fields need id/description/appliesTo; cutoffs need HH:MM UTC + day rule', () => {
    expect(() =>
      validateCorridorRestrictionSet({
        ...eurGbpRestrictionSet(),
        requiredFields: [{ fieldId: 'x', description: 'y', appliesTo: 'MOON' as never }],
      }),
    ).toThrow(/requiredFields\[0\]/);
    for (const badTime of ['24:00', '9:30', '0930', '09:60']) {
      expect(() =>
        validateCorridorRestrictionSet({
          ...eurGbpRestrictionSet(),
          cutoffs: [
            {
              cutoffId: 'c',
              description: 'd',
              appliesTo: 'PAYOUT',
              cutoffTimeUtc: badTime,
              processingDayRule: 'CALENDAR_DAYS',
            },
          ],
        }),
      ).toThrow(ValidationError);
    }
  });

  it('terms references are versioned and label estimates honestly', () => {
    expect(() =>
      validateCorridorRestrictionSet({
        ...eurGbpRestrictionSet(),
        terms: { termsRef: 't', termsVersion: '', deliveryEstimateLabel: 'INDICATIVE' },
      }),
    ).toThrow(/terms/);
    expect(() =>
      validateCorridorRestrictionSet({
        ...eurGbpRestrictionSet(),
        terms: {
          termsRef: 't',
          termsVersion: '1',
          deliveryEstimateLabel: 'PROMISE' as never,
        },
      }),
    ).toThrow(/terms/);
    const good = validateCorridorRestrictionSet(eurGbpRestrictionSet());
    expect(good.terms?.deliveryEstimateLabel).toBe('INDICATIVE');
  });
});

describe('the narrowing law (restrictionWideningViolations)', () => {
  const parent = eurGbpRestrictionSet();

  it('returns no violations for an identical set', () => {
    expect(restrictionWideningViolations(parent, parent)).toEqual([]);
  });

  it('flags widened scopes dimension by dimension', () => {
    const wider = eurGbpRestrictionSet({
      restrictionSetId: 'rs:child',
      destinationCountries: ['DE', 'FR', 'NL', 'GB', 'US'],
    });
    const violations = restrictionWideningViolations(wider, parent);
    expect(violations).toContain('destinationCountries widen beyond the definition-level scope');
    expect(violations).not.toContain('sourceCountries widen beyond the definition-level scope');
  });

  it('flags a dropped restriction (unrestricted widening) on every dimension', () => {
    const { customerTypes: _ct, amountLimits: _al, ...dropped } = eurGbpRestrictionSet({
      restrictionSetId: 'rs:child',
    });
    const violations = restrictionWideningViolations(dropped, parent);
    expect(violations).toContain('customerTypes widen beyond the definition-level scope');
    expect(violations).toContain('amountLimits dropped: a restricted parent cannot be unrestricted');
  });

  it('flags min/max bound widening and dropped required fields', () => {
    const lowerMin = eurGbpRestrictionSet({
      restrictionSetId: 'rs:child',
      amountLimits: { min: { currency: 'EUR', minorUnits: '1' } },
    });
    expect(restrictionWideningViolations(lowerMin, parent)).toContain(
      'amountLimits.max narrows upward (widening)',
    );
    const noFields = eurGbpRestrictionSet({ restrictionSetId: 'rs:child', requiredFields: [] });
    expect(restrictionWideningViolations(noFields, parent)).toContain(
      'requiredFields dropped fields declared by the parent',
    );
  });

  it('an unrestricted parent accepts any child (narrowing is vacuous)', () => {
    const permissive: CorridorRestrictionSet = {
      restrictionSetId: 'rs:permissive',
      version: '1.0.0',
      requiredFields: [],
      cutoffs: [],
      declaredBy: 'x',
    };
    const child = eurGbpRestrictionSet({ restrictionSetId: 'rs:child' });
    expect(restrictionWideningViolations(child, permissive)).toEqual([]);
  });
});
