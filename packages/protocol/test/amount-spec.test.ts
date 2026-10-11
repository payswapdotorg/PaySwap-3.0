import { describe, expect, it } from 'vitest';
import {
  type AmountSpec,
  EUR,
  GHS,
  InvalidAmountError,
  JPY,
  USD,
  amountSpecToMoney,
  fromMinorUnits,
  fromDecimalString,
  isValidAmountSpec,
  moneyToAmountSpec,
  roundTripsThroughWire,
  validateAmountSpec,
  ValidationError,
  UnknownCurrencyError,
} from '../src/index.ts';

describe('AmountSpec bridge: structural pin (identical shape, semantics owned here)', () => {
  it('validates the pinned wire format: currency /^[A-Z]{3}$/, minorUnits /^(0|[1-9][0-9]*)$/', () => {
    expect(() => validateAmountSpec({ currency: 'USD', minorUnits: '1234' })).not.toThrow();
    expect(() => validateAmountSpec({ currency: 'GHS', minorUnits: '0' })).not.toThrow();
    // currency violations
    for (const bad of ['usd', 'US', 'USDD', '', '12D', 'D-O']) {
      expect(() => validateAmountSpec({ currency: bad, minorUnits: '1' })).toThrow(InvalidAmountError);
    }
    // minorUnits violations: sign, point, exponent, leading zeros, empty
    for (const bad of ['-1', '+1', '1.0', '01', '1e3', '', ' 1', '1 ', '0x10']) {
      expect(() => validateAmountSpec({ currency: 'USD', minorUnits: bad })).toThrow(InvalidAmountError);
    }
  });

  it('isValidAmountSpec is the predicate form of the structural validation', () => {
    expect(isValidAmountSpec({ currency: 'USD', minorUnits: '10' })).toBe(true);
    expect(isValidAmountSpec({ currency: 'usd', minorUnits: '10' })).toBe(false);
    expect(isValidAmountSpec({ currency: 'USD', minorUnits: '1.0' })).toBe(false);
  });
});

describe('AmountSpec bridge: parse (AmountSpec -> Money)', () => {
  it('parses canonical wire amounts into exact Money (BigInt, never float)', () => {
    const money = amountSpecToMoney({ currency: 'USD', minorUnits: '1234' });
    expect(money.currency).toBe(USD);
    expect(money.value).toBe(1234n);
    expect(typeof money.value).toBe('bigint');
    expect(amountSpecToMoney({ currency: 'JPY', minorUnits: '0' }).value).toBe(0n);
    // values beyond Number.MAX_SAFE_INTEGER survive the bridge exactly
    const big = amountSpecToMoney({ currency: 'USD', minorUnits: '9007199254740993' });
    expect(big.value).toBe(9007199254740993n);
  });

  it('produces NON-NEGATIVE money by construction (the wire carries no sign)', () => {
    expect(amountSpecToMoney({ currency: 'EUR', minorUnits: '0' }).value).toBe(0n);
    expect(amountSpecToMoney({ currency: 'EUR', minorUnits: '1' }).value).toBe(1n);
  });

  it('requires a REGISTERED currency (minor-unit semantics are financial-lane property)', () => {
    expect(() => amountSpecToMoney({ currency: 'XYZ', minorUnits: '1' })).toThrow(UnknownCurrencyError);
  });

  it('structurally invalid specs are rejected before registry lookup', () => {
    expect(() => amountSpecToMoney({ currency: 'xyz', minorUnits: '1' })).toThrow(InvalidAmountError);
    expect(() => amountSpecToMoney({ currency: 'USD', minorUnits: '01' } as AmountSpec)).toThrow(InvalidAmountError);
  });
});

describe('AmountSpec bridge: serialize (Money -> AmountSpec)', () => {
  it('serializes non-negative exact Money into the canonical decimal string', () => {
    const spec = moneyToAmountSpec(fromMinorUnits(GHS, 1055n));
    expect(spec.currency).toBe('GHS');
    expect(spec.minorUnits).toBe('1055');
    expect(moneyToAmountSpec(fromDecimalString(JPY, '1000')).minorUnits).toBe('1000');
    expect(moneyToAmountSpec(fromMinorUnits(USD, 0n)).minorUnits).toBe('0');
  });

  it('refuses to serialize negative money (the wire format is non-negative)', () => {
    expect(() => moneyToAmountSpec(fromMinorUnits(USD, -1n))).toThrow(ValidationError);
  });

  it('refuses non-Money values (INV-02 defense in depth)', () => {
    expect(() => moneyToAmountSpec({ currency: 'USD', value: 0.1 } as never)).toThrow(ValidationError);
    expect(() => moneyToAmountSpec({ currency: 'USD', value: '5' } as never)).toThrow(ValidationError);
  });
});

describe('AmountSpec bridge: round trips', () => {
  it('parse(serialize(m)) === m for non-negative money', () => {
    for (const value of [0n, 1n, 99n, 1234n, 9007199254740993n, 10n ** 30n]) {
      const money = fromMinorUnits(USD, value);
      expect(roundTripsThroughWire(money)).toBe(true);
      const back = amountSpecToMoney(moneyToAmountSpec(money));
      expect(back.currency).toBe(money.currency);
      expect(back.value).toBe(money.value);
    }
  });

  it('is deterministic: identical inputs produce identical wire bytes', () => {
    const money = fromMinorUnits(EUR, 424242n);
    expect(moneyToAmountSpec(money)).toEqual(moneyToAmountSpec(money));
  });
});
