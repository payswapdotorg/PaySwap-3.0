/**
 * VersionedEconomicInput tests (P1-W1, net-new): the typed version envelope
 * + explicit content law. Quote or corridor details entering goals are
 * VERSIONED economic inputs — closed kind vocabulary, positive integer
 * version, opaque observation lineage sourceRef, and CANONICAL JSON content
 * (parse + re-serialize round-trip). Never implicit ambient state; never
 * establishing authorization or financial finality.
 */

import { describe, expect, it } from "vitest";
import {
  ECONOMIC_INPUT_KINDS,
  InvalidEconomicInputError,
  economicInputSortKey,
  validateEconomicInput,
  validateEconomicInputs,
} from "../src/index.ts";
import { corridorInput, quoteInput } from "./fixtures.ts";

function expectReject(candidate: unknown, message: RegExp): void {
  expect(() => validateEconomicInput(candidate)).toThrow(InvalidEconomicInputError);
  expect(() => validateEconomicInput(candidate)).toThrow(message);
}

describe("VersionedEconomicInput validation (fail closed)", () => {
  it("rejects null, non-object and unknown-field candidates", () => {
    expectReject(null, /a VersionedEconomicInput is required/);
    expectReject("quote", /a VersionedEconomicInput is required/);
    expectReject({ ...quoteInput(), extra: 1 }, /exactly the fields/);
  });

  it("rejects kinds outside the closed vocabulary", () => {
    expectReject({ ...quoteInput(), kind: "AMBIENT_QUOTE" }, /kind must be one of/);
    expect(ECONOMIC_INPUT_KINDS).toContain("QUOTE");
    expect(ECONOMIC_INPUT_KINDS).toContain("CORRIDOR");
    expect(ECONOMIC_INPUT_KINDS).toHaveLength(5);
  });

  it("rejects non-positive-integer versions", () => {
    expectReject({ ...quoteInput(), version: 0 }, /version must be a positive integer/);
    expectReject({ ...quoteInput(), version: -1 }, /version must be a positive integer/);
    expectReject({ ...quoteInput(), version: 1.5 }, /version must be a safe integer/);
    expectReject({ ...quoteInput(), version: "1" }, /version must be a safe integer/);
  });

  it("rejects empty source refs (observation lineage is mandatory)", () => {
    expectReject({ ...quoteInput(), sourceRef: "" }, /sourceRef/);
  });

  it("rejects non-JSON, non-object and NON-CANONICAL content (explicit, never ambient)", () => {
    expectReject({ ...quoteInput(), content: "not json" }, /content must be valid JSON text/);
    expectReject({ ...quoteInput(), content: "[1,2]" }, /must be a JSON OBJECT/);
    expectReject({ ...quoteInput(), content: "42" }, /must be a JSON OBJECT/);
    expectReject({ ...quoteInput(), content: '{"b":1,"a":2}' }, /must be CANONICAL JSON/);
    expectReject({ ...quoteInput(), content: '{ "a": 1}' }, /must be CANONICAL JSON/);
    expectReject({ ...quoteInput(), content: '{"a":-0}' }, /must be CANONICAL JSON/);
    // Canonical forms pass.
    expect(() => validateEconomicInput({ ...quoteInput(), content: '{"a":1,"b":[2]}' })).not.toThrow();
  });

  it("returns frozen inputs and sorts deterministically by economicInputSortKey", () => {
    const quote = validateEconomicInput(quoteInput());
    const corridor = validateEconomicInput(corridorInput());
    expect(Object.isFrozen(quote)).toBe(true);
    expect([quote, corridor].map(economicInputSortKey).sort())
      .toEqual([economicInputSortKey(quote), economicInputSortKey(corridor)].sort());
  });
});

describe("economic-input list validation", () => {
  it("accepts an empty list and a valid list; rejects exact duplicates; bounds length", () => {
    expect(validateEconomicInputs([])).toEqual([]);
    expect(validateEconomicInputs([quoteInput()])).toHaveLength(1);
    expect(() => validateEconomicInputs([quoteInput(), quoteInput()])).toThrow(
      /must not contain exact duplicates/,
    );
    expect(() => validateEconomicInputs("nope")).toThrow(/must be an array/);
    const seventeen = Array.from({ length: 17 }, (_v, i) => ({
      ...quoteInput(),
      sourceRef: `obs:quote:${i}`,
    }));
    expect(() => validateEconomicInputs(seventeen)).toThrow(/at most 16 entries/);
  });

  it("wraps per-entry failures with the list index (field-path discipline)", () => {
    expect(() => validateEconomicInputs([quoteInput(), { kind: "QUOTE" }])).toThrow(
      /economicInputs\[1\]/,
    );
  });
});
