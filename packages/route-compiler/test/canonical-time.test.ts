import { describe, expect, it } from "vitest";
import {
  parseIsoUtc,
  isIsoUtcTimestamp,
  epochMillisFromIso,
  componentsFromEpochMillis,
  isoUtcFromEpochMillis,
  isLeapYear,
  daysInMonth,
} from "../src/canonical-time.ts";

/**
 * NET-NEW (pure civil-arithmetic strict-ISO): every conversion is
 * performed by civil-calendar arithmetic — no Date object, no lenient
 * parsing, no offsets (the hidden-normalization-channel law).
 */
describe("canonical time: pure civil arithmetic over strict ISO-8601 UTC", () => {
  it("the epoch origin is exactly zero milliseconds", () => {
    expect(epochMillisFromIso("1970-01-01T00:00:00Z")).toBe(0);
    expect(isoUtcFromEpochMillis(0)).toBe("1970-01-01T00:00:00Z");
  });

  it("strict form acceptance: seconds, milliseconds, and the known-instant round trip", () => {
    expect(epochMillisFromIso("2026-10-03T00:00:00Z")).toBe(1_790_985_600_000);
    expect(epochMillisFromIso("2026-10-03T00:00:00.500Z")).toBe(1_790_985_600_500);
    expect(isoUtcFromEpochMillis(1_790_985_600_500)).toBe("2026-10-03T00:00:00.500Z");
    const components = componentsFromEpochMillis(1_790_985_600_500);
    expect(components).toEqual({
      year: 2026,
      month: 10,
      day: 3,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 500,
    });
  });

  it("lenient forms are rejected (no hidden normalization channel)", () => {
    for (const bad of [
      "2026-10-03T00:00:00", // no Z
      "2026-10-03T00:00:00z", // lowercase z
      "2026-10-03 00:00:00Z", // space separator
      "2026-10-03", // date only
      "2026-10-03T00:00:00+02:00", // offset
      "2026-10-03T00:00:00.123456789Z", // nanoseconds beyond ms
    ]) {
      expect(isIsoUtcTimestamp(bad)).toBe(false);
      expect(() => parseIsoUtc(bad)).toThrowError();
    }
  });

  it("civil calendar ranges are enforced (fail closed)", () => {
    expect(() => parseIsoUtc("2026-13-01T00:00:00Z")).toThrowError(/month/);
    expect(() => parseIsoUtc("2026-00-01T00:00:00Z")).toThrowError(/month/);
    expect(() => parseIsoUtc("2026-10-32T00:00:00Z")).toThrowError(/day/);
    expect(() => parseIsoUtc("2026-10-03T24:00:00Z")).toThrowError(/time/);
    expect(() => parseIsoUtc("2026-10-03T00:60:00Z")).toThrowError(/time/);
  });

  it("the leap-year rule is the proleptic Gregorian one (pure)", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2023)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2023, 2)).toBe(28);
    expect(parseIsoUtc("2024-02-29T00:00:00Z").day).toBe(29);
    expect(() => parseIsoUtc("2023-02-29T00:00:00Z")).toThrowError(/day/);
    expect(parseIsoUtc("2000-02-29T00:00:00Z").day).toBe(29);
    expect(() => parseIsoUtc("1900-02-29T00:00:00Z")).toThrowError(/day/);
  });

  it("day-boundary arithmetic is exact (no drift across days)", () => {
    const a = epochMillisFromIso("2026-10-03T00:00:00Z");
    const b = epochMillisFromIso("2026-10-04T00:00:00Z");
    expect(b - a).toBe(86_400_000);
    expect(isoUtcFromEpochMillis(a + 3_600_000)).toBe("2026-10-03T01:00:00Z");
    expect(isoUtcFromEpochMillis(a + 86_399_999)).toBe("2026-10-03T23:59:59.999Z");
    expect(isoUtcFromEpochMillis(1_790_985_600_001)).toBe("2026-10-03T00:00:00.001Z");
  });

  it("negative epochs (pre-1970) round-trip through civil arithmetic", () => {
    expect(epochMillisFromIso("1969-12-31T23:59:59Z")).toBe(-1000);
    expect(isoUtcFromEpochMillis(-1000)).toBe("1969-12-31T23:59:59Z");
  });

  it("same-precision strict forms order lexicographically as chronologically (fixed-width fields)", () => {
    expect("2026-10-03T00:00:00.000Z" < "2026-10-03T00:00:00.500Z").toBe(true);
    expect("2026-10-03T00:00:00.500Z" < "2026-10-03T00:00:01.000Z").toBe(true);
    expect(epochMillisFromIso("2026-10-03T00:00:00.500Z")).toBeLessThan(
      epochMillisFromIso("2026-10-03T00:00:01Z"),
    );
  });

  it("millisecondsBetween is the civil difference (freshness bounds rely on it)", () => {
    const left = "2026-10-03T00:00:00Z";
    const right = "2026-10-03T01:00:00Z";
    expect(epochMillisFromIso(right) - epochMillisFromIso(left)).toBe(3_600_000);
  });

  it("the millisecond field is exactly three digits (no truncation, no padding drift)", () => {
    expect(parseIsoUtc("2026-10-03T00:00:00.001Z").millisecond).toBe(1);
    expect(parseIsoUtc("2026-10-03T00:00:00.999Z").millisecond).toBe(999);
    expect(isoUtcFromEpochMillis(1_790_985_600_001)).toBe("2026-10-03T00:00:00.001Z");
  });
});
