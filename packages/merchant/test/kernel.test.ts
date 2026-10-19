import { describe, expect, it } from "vitest";
import {
  stableStringify,
  canonicalJsonStringify,
  fnv1a64,
  canonicalDigest,
  deepFreeze,
  canonicallyEqual,
  LIMITS,
  defineStateMachine,
} from "../src/index.ts";
import {
  CanonicalizationError,
  MachineTransitionError,
  MachineGuardError,
} from "../src/errors.ts";

/**
 * The deterministic kernel suite (PORTED+ADAPTED from the old corpus's
 * digest/state-machine sites): the bigint-aware canonical digest law
 * (byte-stable, key-sorted, total) and the LOCAL work-item
 * state-machine kernel (guards, terminal monotonicity, fail-closed
 * transitions).
 */

describe("canonical JSON (the bigint-aware digest law)", () => {
  it("objects serialize with recursively sorted keys (byte-stable regardless of insertion order)", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
    expect(stableStringify({ z: { y: 1, x: 2 }, a: 3 })).toBe(
      stableStringify({ a: 3, z: { x: 2, y: 1 } }),
    );
  });

  it("bigints serialize as b:<decimal>, numbers as n:<decimal>, strings via JSON.stringify", () => {
    expect(stableStringify(1n)).toBe("b:1");
    expect(stableStringify(-42n)).toBe("b:-42");
    expect(stableStringify(42)).toBe("n:42");
    expect(stableStringify("x")).toBe('"x"');
    expect(stableStringify(true)).toBe("true");
    expect(stableStringify(null)).toBe("null");
  });

  it("arrays preserve order (never sorted) and nest recursively", () => {
    expect(stableStringify([3, 1, 2])).toBe("[n:3,n:1,n:2]");
    expect(stableStringify([{ b: 1n }, { a: 2n }])).toBe('[{"b":b:1},{"a":b:2}]');
  });

  it("non-finite numbers are rejected fail-closed (canonical text is total over wire data)", () => {
    expect(() => stableStringify(Number.NaN)).toThrow(CanonicalizationError);
    expect(() => stableStringify(Number.POSITIVE_INFINITY)).toThrow(CanonicalizationError);
    expect(() => stableStringify({ fn: () => 1 })).toThrow(CanonicalizationError);
    expect(() => stableStringify(Symbol("x"))).toThrow(CanonicalizationError);
  });

  it("the canonical digest is deterministic and binding (same input, same digest — always)", () => {
    expect(canonicalDigest({ a: 1n, b: [2, 3] })).toBe(canonicalDigest({ b: [2, 3], a: 1n }));
    expect(canonicalDigest({ a: 1n })).not.toBe(canonicalDigest({ a: 2n }));
    expect(canonicalJsonStringify).toBe(stableStringify);
  });

  it("FNV-1a 64 is deterministic, 16-hex-digit padded and distinct across inputs", () => {
    expect(fnv1a64("")).toBe("cbf29ce484222325");
    expect(fnv1a64("a")).toBe("af63dc4c8601ec8c");
    expect(fnv1a64("a")).toBe(fnv1a64("a"));
    expect(fnv1a64("a")).not.toBe(fnv1a64("b"));
    expect(fnv1a64("x")).toMatch(/^[0-9a-f]{16}$/);
  });

  it("canonicallyEqual is structural (order-insensitive, bigint-aware)", () => {
    expect(canonicallyEqual({ a: 1n, b: 2 }, { b: 2, a: 1n })).toBe(true);
    expect(canonicallyEqual({ a: 1n }, { a: 2n })).toBe(false);
  });

  it("deepFreeze freezes recursively and is idempotent (INV-3: historical facts immutable)", () => {
    const value = deepFreeze({ a: { b: [1, 2] } });
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.a)).toBe(true);
    expect(Object.isFrozen(value.a.b)).toBe(true);
    expect(() => {
      (value as { a: { b: number[] } }).a.b.push(3);
    }).toThrow();
    expect(deepFreeze(deepFreeze(value))).toBe(value);
  });

  it("the shared structural limits are pinned", () => {
    expect(LIMITS.refMaxLength).toBe(256);
    expect(LIMITS.secretScanMaxDepth).toBe(8);
  });
});

describe("the local work-item state-machine kernel", () => {
  const machine = defineStateMachine({
    name: "fixture-walk",
    initial: "A",
    states: ["A", "B", "TERMINAL"],
    events: ["GO", "FINISH", "BLOCKED"],
    transitions: [
      { from: "A", on: "GO", to: "B" },
      { from: "B", on: "GO", to: "B", guard: (ctx: { ok: boolean }) => ctx.ok },
      { from: "B", on: "FINISH", to: "TERMINAL" },
    ],
    terminalStates: ["TERMINAL"],
  });

  it("declared transitions execute and return append-only transition records", () => {
    const record = machine.transition("A", "GO");
    expect(record).toEqual({ from: "A", on: "GO", to: "B" });
    expect(Object.isFrozen(record)).toBe(true);
    expect(machine.isTerminal("A")).toBe(false);
    expect(machine.isTerminal("TERMINAL")).toBe(true);
  });

  it("undeclared transitions throw MachineTransitionError (fail-closed)", () => {
    expect(() => machine.transition("A", "FINISH")).toThrow(MachineTransitionError);
    expect(() => machine.transition("A", "BLOCKED")).toThrow(/not declared from state 'A'/);
  });

  it("terminal states are monotonic: no outgoing transitions exist, and the error says so", () => {
    expect(() => machine.transition("TERMINAL", "GO")).toThrow(/terminal/);
    expect(machine.canTransition("TERMINAL", "GO")).toBe(false);
  });

  it("guards reject deterministically with MachineGuardError when the context fails", () => {
    expect(() => machine.transition("B", "GO", { ok: false })).toThrow(MachineGuardError);
    expect(machine.canTransition("B", "GO", { ok: true })).toBe(true);
    expect(machine.canTransition("B", "GO", { ok: false })).toBe(false);
  });

  it("a definition whose terminal state declares outgoing transitions is unconstructible", () => {
    expect(() =>
      defineStateMachine({
        name: "bad",
        initial: "A",
        states: ["A", "B"],
        events: ["GO"],
        transitions: [{ from: "B", on: "GO", to: "A" }],
        terminalStates: ["B"],
      }),
    ).toThrow(/terminal state 'B' declares outgoing/);
  });

  it("definitions referencing undeclared states/events fail closed at construction", () => {
    expect(() =>
      defineStateMachine({
        name: "bad2",
        initial: "A",
        states: ["A"],
        events: ["GO", "OTHER"],
        transitions: [{ from: "A", on: "GO", to: "Z" }],
        terminalStates: [],
      }),
    ).toThrow(/undeclared state/);
    expect(() =>
      defineStateMachine({
        name: "bad3",
        initial: "Z",
        states: ["A"],
        events: ["GO"],
        transitions: [],
        terminalStates: [],
      }),
    ).toThrow(/initial state is not declared/);
  });

  it("the built machine is frozen with its vocabulary intact", () => {
    expect(Object.isFrozen(machine)).toBe(true);
    expect([...machine.states]).toEqual(["A", "B", "TERMINAL"]);
    expect([...machine.events]).toEqual(["GO", "FINISH", "BLOCKED"]);
    expect([...machine.terminalStates]).toEqual(["TERMINAL"]);
  });

  it("an unknown source state fails closed (never a silent no-op)", () => {
    const unknownState = "Z" as "A" | "B" | "TERMINAL";
    expect(() => machine.transition(unknownState, "GO")).toThrow(/unknown source state/);
    expect(machine.canTransition(unknownState, "GO")).toBe(false);
  });
});
