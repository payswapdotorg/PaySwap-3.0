import { describe, expect, it } from 'vitest';

import {
  canonicalJson,
  canonicalSafe,
  parseStrictIsoUtc,
  strictIsoUtcToMs,
  strictIsoUtcFromMs,
} from '../src/canonical.ts';
import { ValidationError } from '../src/errors.ts';

describe('canonical JSON (the deterministic serialization contract)', () => {
  it('sorts object keys by code-unit order and emits no whitespace', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ z: { y: 1, x: 2 }, a: [3, 2, 1] })).toBe('{"a":[3,2,1],"z":{"x":2,"y":1}}');
  });

  it('drops undefined-valued keys; undefined array entries become null', () => {
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(canonicalJson([1, undefined, 2])).toBe('[1,null,2]');
  });

  it('rejects bigint, non-finite numbers, symbols and top-level undefined', () => {
    expect(() => canonicalJson(1n)).toThrow(ValidationError);
    expect(() => canonicalJson(Number.NaN)).toThrow(ValidationError);
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow(ValidationError);
    expect(() => canonicalJson(undefined)).toThrow(ValidationError);
    expect(() => canonicalJson(Symbol('x'))).toThrow(ValidationError);
  });

  it('uses standard JSON escaping for strings', () => {
    expect(canonicalJson({ text: 'a"b\\c\nd' })).toBe(JSON.stringify({ text: 'a"b\\c\nd' }));
  });

  it('is deterministic: the same value deep-equal serializes identically (any key order)', () => {
    const a = { x: 1, y: { b: 'two', a: 'one' }, list: [true, null, 'z'] };
    const b = { list: [true, null, 'z'], y: { a: 'one', b: 'two' }, x: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it('canonicalSafe turns bigints into decimal strings, preserving structure', () => {
    expect(canonicalSafe({ issuedAtMs: 1767225600000n, nested: { deep: [1n, 'x'] } })).toEqual({
      issuedAtMs: '1767225600000',
      nested: { deep: ['1', 'x'] },
    });
    expect(canonicalSafe({ keep: undefined, n: 1 })).toEqual({ n: 1 });
  });
});

describe('strict ISO-8601 UTC parsing (timestamps are DATA)', () => {
  it('accepts exactly YYYY-MM-DDTHH:MM:SSZ with calendar validation', () => {
    expect(parseStrictIsoUtc('2030-01-01T00:00:00Z', 't')).toEqual({
      year: 2030,
      month: 1,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
    });
    expect(() => parseStrictIsoUtc('2030-02-30T00:00:00Z', 't')).toThrow(ValidationError);
    expect(() => parseStrictIsoUtc('2030-13-01T00:00:00Z', 't')).toThrow(ValidationError);
    expect(() => parseStrictIsoUtc('2030-01-01T24:00:00Z', 't')).toThrow(ValidationError);
    expect(() => parseStrictIsoUtc('2030-01-01T00:00:00', 't')).toThrow(ValidationError);
    expect(() => parseStrictIsoUtc('2030-01-01T00:00:00.000Z', 't')).toThrow(ValidationError);
    expect(() => parseStrictIsoUtc('2030-01-01 00:00:00Z', 't')).toThrow(ValidationError);
    expect(() => parseStrictIsoUtc(1767225600000n, 't')).toThrow(ValidationError);
  });

  it('handles leap years (2024-02-29 valid; 2023-02-29 rejected)', () => {
    expect(() => parseStrictIsoUtc('2024-02-29T12:00:00Z', 't')).not.toThrow();
    expect(() => parseStrictIsoUtc('2023-02-29T12:00:00Z', 't')).toThrow(ValidationError);
    expect(() => parseStrictIsoUtc('2000-02-29T12:00:00Z', 't')).not.toThrow();
    expect(() => parseStrictIsoUtc('1900-02-29T12:00:00Z', 't')).toThrow(ValidationError);
  });

  it('strictIsoUtcToMs and strictIsoUtcFromMs round-trip', () => {
    const instant = '2026-01-01T00:00:00Z';
    const ms = strictIsoUtcToMs(instant, 't');
    expect(ms).toBe(1767225600000n);
    expect(strictIsoUtcFromMs(ms)).toBe(instant);
    expect(strictIsoUtcFromMs(0n)).toBe('1970-01-01T00:00:00Z');
    expect(strictIsoUtcToMs('1970-01-01T00:00:00Z', 't')).toBe(0n);
    expect(strictIsoUtcFromMs(86400000n)).toBe('1970-01-02T00:00:00Z');
    expect(() => strictIsoUtcFromMs(-1n)).toThrow(ValidationError);
  });

  it('a canonical timestamp equals the civil-calendar arithmetic (no JS Date anywhere)', () => {
    // 2026-06-15T13:45:30Z -> manual arithmetic cross-check.
    const ms = strictIsoUtcToMs('2026-06-15T13:45:30Z', 't');
    expect(Number(ms % 86400000n)).toBe(13 * 3600000 + 45 * 60000 + 30000);
    expect(strictIsoUtcFromMs(ms)).toBe('2026-06-15T13:45:30Z');
  });
});
