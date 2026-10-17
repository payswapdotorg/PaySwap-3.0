import { describe, expect, it } from "vitest";
import {
  defineStateMachine,
  IllegalTransitionError,
  InvalidStateMachineDefinitionError,
  TerminalStateViolationError,
  UndeclaredEventError,
} from "../src/index.ts";

/**
 * The declared state-machine pin (R2-W2 net-new): the deterministic
 * machine contract the pipeline is built on (a structural mirror of the
 * protocol lane's state-machine kernel). Definition-time validation +
 * terminal-state discipline (INV-3/INV-4: historical facts immutable,
 * UNKNOWN/terminal handled explicitly — anything not declared is
 * impossible).
 */

interface CounterContext {
  readonly count: number;
}

function demoMachine() {
  return defineStateMachine<"A" | "B" | "T", "GO" | "FINISH" | "RESET", CounterContext>({
    name: "demo",
    initial: "A",
    states: ["A", "B", "T"],
    events: ["GO", "FINISH", "RESET"],
    transitions: [
      { from: "A", on: "GO", to: "B" },
      { from: "B", on: "GO", to: "B" },
      { from: "B", on: "FINISH", to: "T", guard: (context) => context.count > 0 },
    ],
    terminalStates: ["T"],
    recovery: [{ from: "T", on: "RESET", to: "A" }],
  });
}

describe("the declared state machine (definition-time validation)", () => {
  it("rejects an initial state that is terminal", () => {
    expect(() =>
      defineStateMachine({
        name: "bad",
        initial: "T" as "A" | "T",
        states: ["A" as const, "T" as const],
        events: ["GO" as const],
        transitions: [{ from: "A" as const, on: "GO" as const, to: "T" as const }],
        terminalStates: ["T" as const, "A" as const],
      }),
    ).toThrow(InvalidStateMachineDefinitionError);
  });

  it("rejects ambiguous rules (at most one rule per from+on)", () => {
    expect(() =>
      defineStateMachine({
        name: "ambiguous",
        initial: "A" as const,
        states: ["A" as const, "B" as const],
        events: ["GO" as const],
        transitions: [
          { from: "A" as const, on: "GO" as const, to: "B" as const },
          { from: "A" as const, on: "GO" as const, to: "A" as const },
        ],
        terminalStates: [],
      }),
    ).toThrow(InvalidStateMachineDefinitionError);
  });

  it("rejects transitions out of terminal states without declared recovery", () => {
    expect(() =>
      defineStateMachine({
        name: "leaky",
        initial: "A" as const,
        states: ["A" as const, "T" as const],
        events: ["GO" as const],
        transitions: [
          { from: "A" as const, on: "GO" as const, to: "T" as const },
          { from: "T" as const, on: "GO" as const, to: "A" as const },
        ],
        terminalStates: ["T" as const],
      }),
    ).toThrow(InvalidStateMachineDefinitionError);
  });
});

describe("the declared state machine (runtime discipline)", () => {
  it("applies declared transitions and reports them", () => {
    const machine = demoMachine();
    const first = machine.transition("A", "GO", { count: 0 });
    expect(first).toEqual({ from: "A", on: "GO", to: "B", viaRecovery: false });
    const second = machine.transition("B", "GO", { count: 0 });
    expect(second.to).toBe("B");
  });

  it("throws a typed error on undeclared events and illegal transitions (never silent)", () => {
    const machine = demoMachine();
    expect(() => machine.transition("A", "NOPE" as "GO", { count: 0 })).toThrow(UndeclaredEventError);
    expect(() => machine.transition("A", "FINISH", { count: 0 })).toThrow(IllegalTransitionError);
  });

  it("guards are pure inputs: a refused guard is an illegal transition", () => {
    const machine = demoMachine();
    expect(() => machine.transition("B", "FINISH", { count: 0 })).toThrow(IllegalTransitionError);
    expect(machine.transition("B", "FINISH", { count: 1 }).to).toBe("T");
  });

  it("terminal states have no exit except declared recovery (INV-3/INV-4 discipline)", () => {
    const machine = demoMachine();
    expect(() => machine.transition("T", "GO", { count: 1 })).toThrow(TerminalStateViolationError);
    const recovered = machine.transition("T", "RESET", { count: 1 });
    expect(recovered).toEqual({ from: "T", on: "RESET", to: "A", viaRecovery: true });
  });
});
