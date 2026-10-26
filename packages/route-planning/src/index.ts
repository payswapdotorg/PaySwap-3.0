/**
 * @payswap/route-planning — the public barrel (P16-A).
 *
 * The package discipline: src carries ZERO sibling imports (every
 * cross-package surface is a LOCAL STRUCTURAL PIN in src/pins/; every
 * REAL engine is an INJECTED fail-closed PORT), discovery NEVER permits
 * execution (routePlanningPermitsExecution() is the literal false), and
 * every output is deterministic under identical inputs/time/seeds
 * (caller-supplied instants everywhere — ADR-0009 D2/D4/D6).
 */

export * from "./canonical.ts";
export * from "./errors.ts";
export * from "./ports.ts";
export * from "./search-budget.ts";
export * from "./rail-snapshot.ts";
export * from "./candidates.ts";
export * from "./hard-gates.ts";
export * from "./ranking.ts";
export * from "./trigger.ts";
export * from "./manifest.ts";
export * from "./lab-adapter.ts";
export * from "./pins/economic.ts";
export * from "./pins/capability.ts";
export * from "./pins/route-compiler.ts";
