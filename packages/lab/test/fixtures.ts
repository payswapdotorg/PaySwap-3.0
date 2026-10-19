/**
 * Shared deterministic fixtures for the @payswap/lab test suite (the P6-W1
 * rebuild of the old W2-004 fixtures): simulation-world/program fixtures
 * plus the candidate-composition references. The pinned wire-shape
 * builders live in ./pins-fixtures.ts and are re-exported here for the
 * suites that consume both. All identifiers, timestamps and amounts are
 * fixed constants — no clock, no randomness.
 */

export * from "./pins-fixtures.ts";

import type { SimulatedWorld } from "../src/simulation-world.ts";
import type { SimulationProgram } from "../src/simulation-plan.ts";
import { BASELINE_WORLD } from "../src/scenarios.ts";

// ---------------------------------------------------------------------------
// Simulation fixtures (the search test world + programs)
// ---------------------------------------------------------------------------

/** The world the search tests bind instances to (mirrors the baseline world). */
export const SEARCH_TEST_WORLD: SimulatedWorld = BASELINE_WORLD;

export const SEARCH_TEST_PROGRAM: SimulationProgram = {
  programId: "test.search-program",
  programVersion: "1.0.0",
  routePreference: ["rail-a", "rail-b", "rail-c", "rail-d"],
  useNetting: false,
  useNetworkCredit: false,
  delayToleranceSteps: 0,
  fraudScreening: true,
  privacyBounded: true,
  authorizationMode: "PROTOCOL_AUTHORIZED",
};

/** Agents fixtures (candidate composition). */
export const CANDIDATE_BODY_REF = { id: "body.routing-agent", version: 1 } as const;

export const CANDIDATE_PRINCIPAL = {
  agentKeyFingerprint: "sha256:fixedfingerprint",
  ownerRef: "owner-1",
} as const;
// ---------------------------------------------------------------------------
// Fixture-sharing map (which suite consumes which fixture)
// ---------------------------------------------------------------------------
// SEARCH_TEST_WORLD -> search.test.ts (the plug-in reproduction site binds
// instances to the four baseline rails so the cheapest-first ordering is
// exercised exactly as the baseline suite records it) and director.test.ts
// (the resolver sites). SEARCH_TEST_PROGRAM -> the custom-plug-in sites.
// CANDIDATE_BODY_REF + CANDIDATE_PRINCIPAL -> candidates.test.ts (the
// composed-organization sites). The pinned wire-shape builders all live in
// ./pins-fixtures.ts and are re-exported here so suites that need both
// import from one place.
