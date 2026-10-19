import { describe, expect, it } from "vitest";
import type {
  CounterfactualResult,
  DirectorReasoningAnnotation,
  RunEvaluationResult,
  PinnedCapabilityObservation,
  PinnedConnectedInstance,
  PinnedStrategyProgram,
  ReplayResult,
  SimulationProgram,
  SimulationRunResult,
} from "@payswap/lab";
import type { Equal, Expect } from "./type-utils.ts";

/**
 * Type-level contracts (P6-W1 rebuild of the old W2-004 type-contracts
 * suite; checked by tsc --noEmit — a failed Expect is a compile error, so
 * these guarantees are enforced by the typecheck gate). Merely declaring
 * each assertion type makes the compiler verify it.
 
 * Site classification (this file): 1 old site PORTED (the declared
 * assertion types compile — enforced by tsc --noEmit; the old sibling
 * types are now the local pinned wire shapes) + 2 NET-NEW sites (the
 * SimulationProgram <-> StrategyProgram seam assignability receipt; the
 * simulation/replay namespace-brand distinctness receipt) = 3 tests.
 */

type IsAssignable<X, Y> = X extends Y ? true : false;

// INV-L01 / canonical INV-11: a simulation result must not be usable where
// ANY production wire shape is demanded — and conversely. The pinned wire
// shapes stand in for the authority's shapes (the TL wires the real
// imports at integration; the pinned subsets are structurally compatible).
type SimNotInstance = Expect<
  Equal<IsAssignable<SimulationRunResult, PinnedConnectedInstance>, false>
>;
type SimNotObservation = Expect<
  Equal<IsAssignable<SimulationRunResult, PinnedCapabilityObservation>, false>
>;
type InstanceNotSim = Expect<
  Equal<IsAssignable<PinnedConnectedInstance, SimulationRunResult>, false>
>;

// INV-L01: replay/counterfactual results are Lab artifacts, never
// production evidence.
type ReplayNotObservation = Expect<
  Equal<IsAssignable<ReplayResult, PinnedCapabilityObservation>, false>
>;
type ReplayNotInstance = Expect<
  Equal<IsAssignable<CounterfactualResult, PinnedConnectedInstance>, false>
>;
type CfNotSim = Expect<
  Equal<IsAssignable<CounterfactualResult, SimulationRunResult>, false>
>;

// The compliance-first law: the evaluation phases tuple is compile-time
// ordered — hard constraints first, optimization second, exactly two
// phases.
type Phases = RunEvaluationResult["phases"];
type PhaseOne = Expect<Equal<Phases[0]["phase"], "HARD_CONSTRAINTS">>;
type PhaseTwo = Expect<Equal<Phases[1]["phase"], "OPTIMIZATION">>;
type PhaseCount = Expect<Equal<Phases["length"], 2>>;

// Canonical INV-9: Director reasoning annotations are structurally
// non-authoritative — `authoritative` is the literal type false.
type ReasoningNotAuthoritative = Expect<
  Equal<DirectorReasoningAnnotation["authoritative"], false>
>;


describe("type-level isolation and ordering contracts", () => {
  it("the declared assertion types compile (enforced by tsc --noEmit)", () => {
    expect(true).toBe(true);
  });

  it("the Lab SimulationProgram is field-compatible with the strategy-program seam (subset typing)", () => {
    // A real StrategyProgram value is assignable to the Lab program shape
    // and vice versa — the TL wires the imports at integration.
    const seam: PinnedStrategyProgram = {
      programId: "seem.prog",
      programVersion: "1.0.0",
      routePreference: ["rail-a"],
      useNetting: false,
      useNetworkCredit: false,
      delayToleranceSteps: 0,
      fraudScreening: true,
      privacyBounded: true,
      authorizationMode: "PROTOCOL_AUTHORIZED",
    };
    const asLab: SimulationProgram = seam;
    const asSeam: PinnedStrategyProgram = asLab;
    expect(asSeam.programId).toBe("seem.prog");
    expect(asLab.authorizationMode).toBe("PROTOCOL_AUTHORIZED");
  });

  it("the simulation and replay namespaces are structurally distinct brands", () => {
    const simBrand: SimulationRunResult["__payswapLabSimulationNamespace"] =
      "PAYSWAP_LAB_SIMULATION";
    const replayBrand: ReplayResult["__payswapLabReplayNamespace"] =
      "PAYSWAP_LAB_REPLAY";
    expect(simBrand).not.toBe(replayBrand);
    expect(simBrand).toBe("PAYSWAP_LAB_SIMULATION");
    expect(replayBrand).toBe("PAYSWAP_LAB_REPLAY");
  });
});
// ---------------------------------------------------------------------------
// Old-site ledger (payswap.org@8a735bf packages/lab/test/type-contracts.test.ts)
// ---------------------------------------------------------------------------
// PORTED (1): "the declared assertion types compile (enforced by tsc
// --noEmit)" — the old sibling-type assertions now target the local pinned
// wire shapes (the authority's shapes, mirrored under the zero-sibling
// law; the TL wires the real imports at integration).
// NET-NEW (2): the strategy-program seam assignability receipt; the
// namespace-brand distinctness receipt.
// ---------------------------------------------------------------------------
// Contract receipts (what each declared type assertion guarantees)
// ---------------------------------------------------------------------------
// SimNotInstance / SimNotObservation / InstanceNotSim: a simulation
// result is structurally unusable where the pinned connected-instance or
// observation wire shapes are demanded, and conversely — the phantom
// namespace brand makes cross-assignment impossible at the type level,
// which is the compile-time half of INV-L01 (the runtime half is the
// isSimulationResult guard). ReplayNotObservation / ReplayNotInstance /
// CfNotSim: replay and counterfactual artifacts are Lab evidence, never
// production wire shapes and never simulation results.
// PhaseOne / PhaseTwo / PhaseCount: the evaluation phases tuple is
// compile-time ordered (HARD_CONSTRAINTS at [0], OPTIMIZATION at [1],
// length exactly 2) — the compliance-first law cannot be swapped at
// runtime because the type will not permit it.
// ReasoningNotAuthoritative: the literal false on Director reasoning
// annotations. The seam assignability receipt: a PinnedStrategyProgram
// value flows through SimulationProgram and back without a single
// adaptation — the execution-graph lane's StrategyProgram and the Lab's
// SimulationProgram are the same field set by construction.
// Every assertion above compiles or the typecheck gate fails: the
// contracts are enforced exactly where regressions would originate.
// The runtime half of the same guarantees lives in pins.test.ts.
// The seam receipt is asserted twice: here (types) and in search (values).
// Both halves fail closed together at the battery gate.
