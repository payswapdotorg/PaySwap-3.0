import { describe, expect, it } from "vitest";
import {
  BASELINE_SEARCHED_PROGRAM,
  buildLabSearchIndex,
  deterministicBaselineSearchPlugin,
  getSearchPlugin,
  handDesignedBaselineSearchPlugin,
  latestObservationFor,
  listSearchPlugins,
  registerSearchPlugin,
  runSearchPlugin,
  selectExecutableBlocks,
} from "@payswap/lab";
import type { ExecutableBlock, LabSearchPlugin, LabSearchQuery } from "@payswap/lab";
import {
  makeComposedPayoutDefinition,
  makeInstance,
  makeNativeRoutingDefinition,
  makeObservation,
  makeCatalogueEntry,
  SEARCH_TEST_WORLD,
} from "./fixtures.ts";

/**
 * Executable grounding, two-axis availability, incumbent baselines and
 * the replaceable plug-in seam (P6-W1 rebuild of the old W2-004 search
 * suite; INV-13 + the two-axis law + INV-15 no-prior). THE ACCEPTED
 * RENAME: the execution-mode field is `execution` here (the vocabulary is
 * unchanged and credited to the capability lane).
 
 * Site classification (this file): 16P + 2A + 3N = 21 tests (see the
 * old-site ledger at the tail for the full per-site mapping).
 */

function index(): ReturnType<typeof buildLabSearchIndex> {
  return buildLabSearchIndex({
    definitions: [
      makeNativeRoutingDefinition(),
      makeComposedPayoutDefinition({ capabilityId: "psp.payouts-b" }),
      makeComposedPayoutDefinition({ capabilityId: "psp.payouts-c" }),
      makeComposedPayoutDefinition({ capabilityId: "psp.payouts-d" }),
    ],
    instances: [
      makeInstance({ instanceId: "inst-native", capabilityId: "psp.native-routing", simulatedRailId: "rail-a" }),
      makeInstance({ instanceId: "inst-payouts", capabilityId: "psp.payouts-b", simulatedRailId: "rail-b" }),
      makeInstance({ instanceId: "inst-payouts-c", capabilityId: "psp.payouts-c", simulatedRailId: "rail-c", currencies: ["USD"] }),
      makeInstance({ instanceId: "inst-payouts-d", capabilityId: "psp.payouts-d", simulatedRailId: "rail-d" }),
    ],
    observations: ["inst-native", "inst-payouts", "inst-payouts-c", "inst-payouts-d"].map(
      (instanceId) => makeObservation({ instanceId, observationVersion: 1 }),
    ),
    catalogueEntries: [makeCatalogueEntry({ capabilityId: "psp.advertised-only" })],
  });
}

const QUERY: LabSearchQuery = { domain: "payment-routing" };
const WORLD = SEARCH_TEST_WORLD;

/** One definition + one bound instance + one current observation. */
function singleInstance(input: {
  capabilityId: string;
  capabilityState?: "AVAILABLE" | "DEGRADED" | "UNAVAILABLE";
  sourceAvailability?: "REACHABLE" | "UNREACHABLE" | "UNKNOWN";
  availabilityOverride?: "AVAILABLE" | "DEGRADED" | "UNAVAILABLE" | "UNKNOWN";
}): ReturnType<typeof buildLabSearchIndex> {
  return buildLabSearchIndex({
    definitions: [makeComposedPayoutDefinition({ capabilityId: input.capabilityId })],
    instances: [
      makeInstance({ instanceId: `inst-${input.capabilityId}`, capabilityId: input.capabilityId }),
    ],
    observations: [
      makeObservation({
        instanceId: `inst-${input.capabilityId}`,
        ...(input.capabilityState !== undefined ? { capabilityState: input.capabilityState } : {}),
        ...(input.sourceAvailability !== undefined ? { sourceAvailability: input.sourceAvailability } : {}),
        ...(input.availabilityOverride !== undefined
          ? { availabilityOverride: input.availabilityOverride }
          : {}),
      }),
    ],
  });
}

describe("executable grounding (INV-13: instance + observation, never catalogue alone)", () => {
  it("a catalogue entry alone NEVER yields an executable block", () => {
    const result = selectExecutableBlocks(index(), QUERY);
    const rejected = result.selections.find((selection) => selection.status === "REJECTED");
    expect(rejected).toBeDefined();
    if (rejected?.status === "REJECTED") expect(rejected.reason).toBe("CATALOGUE_ENTRY_ONLY");
    expect(result.executable.length).toBe(4);
  });

  it("a definition without a connected instance is rejected, not executable", () => {
    const lonely = buildLabSearchIndex({
      definitions: [makeComposedPayoutDefinition({ capabilityId: "psp.lonely" })],
    });
    const result = selectExecutableBlocks(lonely, QUERY);
    expect(result.executable.length).toBe(0);
    const rejected = result.selections[0];
    expect(rejected?.status).toBe("REJECTED");
    if (rejected?.status === "REJECTED") {
      expect(rejected.reason).toBe("CATALOGUE_ENTRY_ONLY");
      expect(rejected.definition?.capabilityId).toBe("psp.lonely");
    }
  });

  it("an instance without a current observation is not executable", () => {
    const noObservation = buildLabSearchIndex({
      definitions: [makeComposedPayoutDefinition()],
      instances: [makeInstance({ instanceId: "inst-x", capabilityId: "psp.payouts" })],
    });
    const result = selectExecutableBlocks(noObservation, QUERY);
    expect(result.executable.length).toBe(0);
    const rejected = result.selections[0];
    expect(rejected?.status).toBe("REJECTED");
    if (rejected?.status === "REJECTED") expect(rejected.reason).toBe("NO_OBSERVATION");
  });

  it("an ACTIVE instance with a current healthy observation IS executable", () => {
    const result = selectExecutableBlocks(index(), QUERY);
    const block = result.executable.find(
      (b: ExecutableBlock) => b.instance.instanceId === "inst-payouts",
    );
    expect(block).toBeDefined();
    expect(block?.effectiveAvailability).toBe("AVAILABLE");
    expect(block?.definition.capabilityId).toBe("psp.payouts-b");
  });

  it("the LATEST observation version wins", () => {
    const evolving = buildLabSearchIndex({
      definitions: [makeComposedPayoutDefinition()],
      instances: [makeInstance({ instanceId: "inst-evo", capabilityId: "psp.payouts" })],
      observations: [
        makeObservation({ instanceId: "inst-evo", observationVersion: 1, capabilityState: "DEGRADED" }),
        makeObservation({ instanceId: "inst-evo", observationVersion: 3, capabilityState: "AVAILABLE" }),
        makeObservation({ instanceId: "inst-evo", observationVersion: 2, capabilityState: "UNAVAILABLE" }),
      ],
    });
    const latest = latestObservationFor(evolving, "inst-evo");
    expect(latest?.observationVersion).toBe(3);
    const result = selectExecutableBlocks(evolving, QUERY);
    expect(result.executable.length).toBe(1);
    expect(result.executable[0]?.effectiveAvailability).toBe("AVAILABLE");
  });

  it("authorization, eligibility, currency and geography scope the instance", () => {
    const scopeCases = [
      { suffix: "revoked", rejection: "AUTHORIZATION_NOT_ACTIVE", authorizationStatus: "REVOKED" as const },
      { suffix: "eligible", rejection: "NOT_ELIGIBLE", eligible: false },
      { suffix: "currency", rejection: "CURRENCY_NOT_SUPPORTED", currencies: ["GBP"] },
      { suffix: "geo", rejection: "GEOGRAPHY_NOT_SUPPORTED", countries: ["JP"] },
      { suffix: "ok", rejection: undefined },
    ] as const;
    const scoped = buildLabSearchIndex({
      definitions: scopeCases.map((c) =>
        makeComposedPayoutDefinition({ capabilityId: `psp.sc-${c.suffix}` }),
      ),
      instances: scopeCases.map((c) =>
        makeInstance({
          instanceId: `inst-${c.suffix}`,
          capabilityId: `psp.sc-${c.suffix}`,
          ...("eligible" in c ? { eligible: c.eligible } : {}),
          ...("currencies" in c ? { currencies: [...c.currencies] } : {}),
          ...("countries" in c ? { countries: [...c.countries] } : {}),
          ...("authorizationStatus" in c
            ? { authorizationStatus: c.authorizationStatus as "REVOKED" }
            : {}),
        }),
      ),
      observations: scopeCases.map((c) => makeObservation({ instanceId: `inst-${c.suffix}` })),
    });
    const rejectedReasons = selectExecutableBlocks(scoped, {
      domain: "payment-routing",
      currency: "EUR",
      country: "DE",
    }).selections
      .filter((s) => s.status === "REJECTED")
      .map((s) => (s.status === "REJECTED" ? s.reason : ""));
    for (const reason of [
      "AUTHORIZATION_NOT_ACTIVE",
      "NOT_ELIGIBLE",
      "CURRENCY_NOT_SUPPORTED",
      "GEOGRAPHY_NOT_SUPPORTED",
    ]) {
      expect(rejectedReasons).toContain(reason);
    }
    expect(rejectedReasons).not.toContain("NO_OBSERVATION");
  });

  it("the query scopes by capabilityId and by execution (the accepted field rename)", () => {
    const result = selectExecutableBlocks(index(), {
      domain: "payment-routing",
      capabilityId: "psp.payouts-b",
      execution: "COMPOSED_PAYSWAP",
    });
    expect(result.executable.length).toBe(1);
    expect(result.executable[0]?.instance.instanceId).toBe("inst-payouts");
    // Every definition declares all three modes, so all remain.
    expect(
      selectExecutableBlocks(index(), { domain: "payment-routing", execution: "PASS_THROUGH_NATIVE" })
        .executable.length,
    ).toBe(4);
  });

  it("the search index takes defensive copies of its inputs", () => {
    const definitions = [makeComposedPayoutDefinition()];
    const built = buildLabSearchIndex({ definitions });
    definitions.push(makeComposedPayoutDefinition({ capabilityId: "psp.mutated" }));
    expect(built.definitions.length).toBe(1); // the push never reached it
  });
});

describe("two-axis availability (UNKNOWN is never success or failure)", () => {
  it("an UNREACHABLE source surfaces as UNKNOWN with the last-known state carried", () => {
    // The pinned fixture derives availability from the two axes exactly the
    // way the capability authority's observeCapability does.
    const result = selectExecutableBlocks(
      singleInstance({ capabilityId: "psp.un", capabilityState: "AVAILABLE", sourceAvailability: "UNREACHABLE" }),
      QUERY,
    );
    expect(result.executable.length).toBe(0);
    const unknown = result.selections[0];
    expect(unknown?.status).toBe("UNKNOWN");
    if (unknown?.status === "UNKNOWN") {
      expect(unknown.effectiveAvailability).toBe("UNKNOWN");
      expect(unknown.reason).toBe("SOURCE_UNREACHABLE");
      expect(unknown.observation.capabilityState).toBe("AVAILABLE");
    }
  });

  it("a source-UNKNOWN observation also surfaces as UNKNOWN", () => {
    const result = selectExecutableBlocks(
      singleInstance({ capabilityId: "psp.su", capabilityState: "DEGRADED", sourceAvailability: "UNKNOWN" }),
      QUERY,
    );
    const unknown = result.selections[0];
    expect(unknown?.status).toBe("UNKNOWN");
    if (unknown?.status === "UNKNOWN") expect(unknown.reason).toBe("SOURCE_UNKNOWN");
    expect(result.executable.length).toBe(0);
  });

  it("an observation whose stored availability disagrees with the axes is flagged UNKNOWN", () => {
    // Axes say AVAILABLE/REACHABLE; the STORED availability disagrees.
    const result = selectExecutableBlocks(
      singleInstance({
        capabilityId: "psp.tam",
        capabilityState: "AVAILABLE",
        sourceAvailability: "REACHABLE",
        availabilityOverride: "UNAVAILABLE",
      }),
      QUERY,
    );
    expect(result.executable.length).toBe(0);
    const unknown = result.selections[0];
    expect(unknown?.status).toBe("UNKNOWN");
    if (unknown?.status === "UNKNOWN") expect(unknown.reason).toBe("AXES_INCONSISTENT");
  });

  it("a two-axis UNAVAILABLE capability is REJECTED (a definite negative, not UNKNOWN)", () => {
    const result = selectExecutableBlocks(
      singleInstance({ capabilityId: "psp.down", capabilityState: "UNAVAILABLE", sourceAvailability: "REACHABLE" }),
      QUERY,
    );
    expect(result.executable.length).toBe(0);
    const rejected = result.selections[0];
    expect(rejected?.status).toBe("REJECTED");
    if (rejected?.status === "REJECTED") expect(rejected.reason).toBe("EFFECTIVELY_UNAVAILABLE");
  });
});

describe("incumbent provider-native baselines (INV-15)", () => {
  it("a nativeOptimization benchmarkBaseline definition is flagged as the incumbent baseline", () => {
    const result = selectExecutableBlocks(index(), QUERY);
    const native = result.executable.find(
      (b) => b.definition.capabilityId === "psp.native-routing",
    );
    expect(native?.isIncumbentBaseline).toBe(true);
    const payouts = result.executable.find(
      (b) => b.definition.capabilityId === "psp.payouts-b",
    );
    expect(payouts?.isIncumbentBaseline).toBe(false);
  });

  it("a non-native definition is NOT flagged as incumbent", () => {
    const result = selectExecutableBlocks(index(), QUERY);
    for (const block of result.executable) {
      if (block.definition.capabilityId.startsWith("psp.payouts")) {
        expect(block.isIncumbentBaseline).toBe(false);
      }
    }
  });
});

describe("search plug-ins (LAB.md 'Search': replaceable optimizers)", () => {
  const blocks = (): readonly ExecutableBlock[] =>
    selectExecutableBlocks(index(), QUERY).executable;
  const plug = (pluginId: string) =>
    runSearchPlugin(pluginId, { world: WORLD, executableBlocks: blocks(), query: QUERY });

  it("the deterministic baseline plug-in emits the incumbent native, composed and optimized candidates", () => {
    const candidates = plug("deterministic-baseline");
    expect(candidates.length).toBe(3);
    const modes = candidates.map((c) => c.execution);
    expect(modes).toContain("PASS_THROUGH_NATIVE");
    expect(modes).toContain("COMPOSED_PAYSWAP");
    expect(modes).toContain("OPTIMIZED_MULTI_PROVIDER");
    const incumbent = candidates.find((c) => c.isIncumbentBaseline);
    expect(incumbent?.execution).toBe("PASS_THROUGH_NATIVE");
    expect(incumbent?.program.routePreference).toEqual(["rail-a"]);
  });

  it("the searched baseline program in the baseline suite reproduces the plug-in output", () => {
    const optimized = plug("deterministic-baseline").find(
      (c) => c.execution === "OPTIMIZED_MULTI_PROVIDER",
    );
    expect(optimized?.program).toEqual(BASELINE_SEARCHED_PROGRAM);
  });

  it("the plug-in search is deterministic", () => {
    expect(plug("deterministic-baseline")).toEqual(plug("deterministic-baseline"));
  });

  it("the hand-designed plug-in produces a netting, screening, latency-first candidate", () => {
    const candidates = plug("hand-designed-baseline");
    expect(candidates.length).toBe(1);
    const program = candidates[0]?.program;
    expect(program?.useNetting).toBe(true);
    expect(program?.useNetworkCredit).toBe(true);
    expect(program?.fraudScreening).toBe(true);
    expect(program?.delayToleranceSteps).toBe(2);
    expect(candidates[0]?.execution).toBe("COMPOSED_PAYSWAP");
  });

  it("custom optimizer plug-ins register and run (evolutionary/bandit/RL plug in here)", () => {
    const custom: LabSearchPlugin = {
      pluginId: "custom-optimizer",
      description: "a deterministic stand-in for a learned optimizer",
      search: (input) => [
        {
          candidateId: "custom:one",
          origin: "custom-optimizer",
          execution: "OPTIMIZED_MULTI_PROVIDER",
          program: {
            programId: "custom.program",
            programVersion: "1.0.0",
            routePreference: input.executableBlocks.some((b) => b.isIncumbentBaseline)
              ? ["rail-a"]
              : [],
            useNetting: true,
            useNetworkCredit: false,
            delayToleranceSteps: 1,
            fraudScreening: true,
            privacyBounded: true,
            authorizationMode: "PROTOCOL_AUTHORIZED",
          },
          instanceRefs: input.executableBlocks
            .filter((b) => b.isIncumbentBaseline)
            .map((b) => b.instance.instanceId),
          isIncumbentBaseline: false,
        },
      ],
    };
    registerSearchPlugin(custom);
    expect(listSearchPlugins().map((p) => p.pluginId)).toContain("custom-optimizer");
    expect(getSearchPlugin("custom-optimizer")?.pluginId).toBe("custom-optimizer");
    expect(plug("custom-optimizer").length).toBe(1);
    expect(plug("custom-optimizer")[0]?.origin).toBe("custom-optimizer");
  });

  it("an unknown plug-in id is rejected", () => {
    expect(() => plug("no-such-plugin")).toThrow(/unknown search plugin/);
  });

  it("both built-in plug-ins are registered and described", () => {
    expect(deterministicBaselineSearchPlugin.pluginId).toBe("deterministic-baseline");
    expect(handDesignedBaselineSearchPlugin.pluginId).toBe("hand-designed-baseline");
    const ids = listSearchPlugins().map((p) => p.pluginId);
    expect(ids).toContain("deterministic-baseline");
    expect(ids).toContain("hand-designed-baseline");
    for (const plugin of listSearchPlugins()) {
      expect(plugin.description.length).toBeGreaterThan(0);
    }
  });
});
// Old-site ledger (old search.test.ts, 18 sites): 16 PORTED (catalogue-
// alone; definition-without-instance; instance-without-observation;
// ACTIVE-healthy-executable; latest-observation; scoping; two-axis
// UNAVAILABLE; incumbent flag; non-native flag; plug-in trio emission;
// baseline reproduction; plug-in determinism; hand-designed shape; custom
// plug-ins; unknown plug-in; both-built-ins) + 2 ADAPTED (the
// UNREACHABLE-source and AXES_INCONSISTENT construction sites) + 3 NET-NEW
// (execution-rename receipt; latestObservationFor; defensive copies).
