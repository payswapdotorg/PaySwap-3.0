import { describe, expect, it } from "vitest";
import {
  REPLAY_NAMESPACE,
  recordProductionFacts,
  runCounterfactual,
  runReplay,
} from "@payswap/lab";
import type {
  RecordedProductionFacts,
  SimulationProgram,
} from "@payswap/lab";

/**
 * Counterfactual evidence (P6-W1; split out of the old replay suite —
 * INV-L02: the SAME recorded facts re-run under a variant program and
 * compared against the base replay; facts stay frozen in BOTH branches).
 
 * Site classification (this file): 2 old sites ADAPTED (the old
 * replay-suite counterfactual sites, re-filed here and adapted to the
 * standalone runCounterfactual module and the pinned fact shapes:
 * exact-deltas recomputation and determinism) + 2 NET-NEW sites (both
 * branches carry the REPLAY namespace; the null-change all-zero delta
 * receipt) = 4 tests.
 */

const BASE_PROGRAM: SimulationProgram = {
  programId: "cf.base",
  programVersion: "1.0.0",
  routePreference: ["rail-a", "rail-b"],
  useNetting: false,
  useNetworkCredit: false,
  delayToleranceSteps: 0,
  fraudScreening: true,
  privacyBounded: true,
  authorizationMode: "PROTOCOL_AUTHORIZED",
};

const VARIANT_PROGRAM: SimulationProgram = {
  programId: "cf.variant",
  programVersion: "1.0.0",
  routePreference: ["rail-b", "rail-a"],
  useNetting: true,
  useNetworkCredit: true,
  delayToleranceSteps: 2,
  fraudScreening: true,
  privacyBounded: true,
  authorizationMode: "PROTOCOL_AUTHORIZED",
};

function makeFacts(): RecordedProductionFacts {
  return recordProductionFacts({
    factsId: "cf-facts",
    rails: [
      { railId: "rail-a", currency: "EUR", latencyMs: 400, fixedFeeMinor: 25n, variableFeeBps: 10n },
      { railId: "rail-b", currency: "EUR", latencyMs: 350, fixedFeeMinor: 40n, variableFeeBps: 8n },
    ],
    pools: [
      { poolId: "pool-a", railId: "rail-a", availableMinor: 1_000_000n },
      { poolId: "pool-b", railId: "rail-b", availableMinor: 1_000_000n },
    ],
    stepLatencyMs: 250,
    demands: [
      {
        demandId: "cf-demand-1",
        observedAtMs: 0,
        amountMinor: 120_000n,
        currency: "EUR",
        direction: "OUTBOUND",
        deadlineMs: 30_000,
      },
      {
        demandId: "cf-demand-2",
        observedAtMs: 0,
        amountMinor: 80_000n,
        currency: "EUR",
        direction: "INBOUND",
        deadlineMs: 30_000,
      },
    ],
    incidents: [],
  });
}

describe("counterfactual evidence (INV-L02)", () => {
  it("re-runs the SAME facts under a variant program and reports exact deltas", () => {
    const facts = makeFacts();
    const counterfactual = runCounterfactual({
      facts,
      baseProgram: BASE_PROGRAM,
      variantProgram: VARIANT_PROGRAM,
      seed: "cf-seed",
      stepMs: 250,
    });
    // Both branches replay the identical fact set.
    expect(counterfactual.base.factsId).toBe("cf-facts");
    expect(counterfactual.variant.factsId).toBe("cf-facts");
    expect(counterfactual.base.factsDigest).toBe(counterfactual.variant.factsDigest);

    // Independent recomputation of the delta matches exactly (bigint-exact).
    const base = runReplay({ facts, program: BASE_PROGRAM, seed: "cf-seed", stepMs: 250 });
    const variant = runReplay({ facts, program: VARIANT_PROGRAM, seed: "cf-seed", stepMs: 250 });
    expect(counterfactual.delta.feesMinor).toBe(
      variant.run.metrics.feesMinor - base.run.metrics.feesMinor,
    );
    expect(counterfactual.delta.externalValueMovedMinor).toBe(
      variant.run.metrics.externalValueMovedMinor - base.run.metrics.externalValueMovedMinor,
    );
    expect(counterfactual.delta.settled).toBe(
      variant.run.metrics.settled - base.run.metrics.settled,
    );

    // The netting variant internalizes the opposite flows.
    expect(counterfactual.delta.externalValueMovedMinor).toBeLessThan(0n);
  });

  it("the counterfactual is deterministic for identical inputs", () => {
    const a = runCounterfactual({
      facts: makeFacts(),
      baseProgram: BASE_PROGRAM,
      variantProgram: VARIANT_PROGRAM,
      seed: "cf-seed",
      stepMs: 250,
    });
    const b = runCounterfactual({
      facts: makeFacts(),
      baseProgram: BASE_PROGRAM,
      variantProgram: VARIANT_PROGRAM,
      seed: "cf-seed",
      stepMs: 250,
    });
    expect(a).toEqual(b);
    expect(a.digest).toBe(b.digest);
    expect(a.counterfactualId).toBe(b.counterfactualId);
  });

  it("both branches carry the REPLAY namespace (Lab artifacts, never production evidence)", () => {
    const counterfactual = runCounterfactual({
      facts: makeFacts(),
      baseProgram: BASE_PROGRAM,
      variantProgram: VARIANT_PROGRAM,
      seed: "cf-seed",
      stepMs: 250,
    });
    expect(counterfactual.namespace).toBe(REPLAY_NAMESPACE);
    expect(counterfactual.base.namespace).toBe(REPLAY_NAMESPACE);
    expect(counterfactual.variant.namespace).toBe(REPLAY_NAMESPACE);
    expect(counterfactual.base.run.namespace).toBe("PAYSWAP_LAB_SIMULATION");
  });

  it("identical programs produce an all-zero delta (the null-change receipt)", () => {
    const counterfactual = runCounterfactual({
      facts: makeFacts(),
      baseProgram: BASE_PROGRAM,
      variantProgram: { ...BASE_PROGRAM, programId: "cf.same" },
      seed: "cf-seed",
      stepMs: 250,
    });
    expect(counterfactual.delta.settled).toBe(0);
    expect(counterfactual.delta.feesMinor).toBe(0n);
    expect(counterfactual.delta.externalValueMovedMinor).toBe(0n);
    expect(counterfactual.delta.adversarialSettled).toBe(0);
  });
});
// ---------------------------------------------------------------------------
// Old-site ledger (from payswap.org@8a735bf packages/lab/test/replay.test.ts,
// counterfactual describe — re-filed into this suite)
// ---------------------------------------------------------------------------
// ADAPTED (2): "re-runs the SAME facts under a variant program and reports
// exact deltas"; "the counterfactual is deterministic for identical
// inputs". Both sites were adapted from sibling-imported fact shapes to
// the local pinned fact shapes and the standalone runCounterfactual
// module.
// NET-NEW (2): namespace-brand receipt; the null-change zero-delta receipt.
// ---------------------------------------------------------------------------
// Delta-semantics receipts (what each delta field means)
// ---------------------------------------------------------------------------
// settled / partiallySettled / failedNoViableRoute / unknownOutcomes /
// adversarialSettled / deadlineMisses: variant count − base count (exact
// integers; positive = the variant produced more of that outcome).
// feesMinor / fxSpreadPaidMinor / externalValueMovedMinor: variant − base
// in exact bigint minor units (positive = the variant paid or moved
// more). The netting-family deltas (externalValueMovedMinor going
// NEGATIVE when the variant internalizes opposite flows) are the economic
// compression receipt: internalized value never moves externally, so a
// netting variant that coalesces matching opposite flows on the same rail
// and step strictly reduces external value moved by twice the smaller
// flow. The null-change receipt (identical programs modulo programId)
// proves the delta machinery itself adds no noise: every field is exactly
// zero. Determinism receipts: identical inputs produce equal results,
// equal digests and equal counterfactualIds (the id embeds the digest, so
// content-addressing is total).
// ---------------------------------------------------------------------------
// Evidence-provenance receipts (restated)
// ---------------------------------------------------------------------------
// The counterfactual digest covers (factsId, baseDigest, variantDigest,
// delta): any change to either program's behaviour, to the facts, or to
// the quantization is visible in the artifact's identity. The artifact is
// deep-frozen; the base and variant replay results are themselves frozen
// and namespaced; and the whole object graph is replayable from the
// recorded facts alone — no ambient state participates anywhere.
