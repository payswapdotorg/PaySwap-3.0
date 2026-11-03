/**
 * @payswap/route-planning — the public barrel (P16-A).
 *
 * The package discipline: src carries ZERO sibling imports (every
 * cross-package surface is a LOCAL STRUCTURAL PIN in src/pins/; every
 * REAL engine is an INJECTED fail-closed PORT), discovery NEVER permits
 * execution (routePlanningPermitsExecution() is the literal false), and
 * every output is deterministic under identical inputs/time/seeds
 * (caller-supplied instants everywhere — ADR-0009 D2/D4/D6).
 *
 * P27-D additions (ADR-0020 D5/D6): the typed route-graph schema + the
 * bounded graph search (graph-schema.ts / graph-search.ts), the INV-30
 * node-route eligibility gates (eligibility-gates.ts), the mandatory
 * direct/native baseline comparison (baseline-comparison.ts), and the
 * node-network intelligence pins (pins/node-network.ts).
 */

export * from "./canonical.ts";
export * from "./errors.ts";
export * from "./ports.ts";
export * from "./search-budget.ts";
export * from "./rail-snapshot.ts";
export * from "./candidates.ts";
export * from "./hard-gates.ts";
export * from "./eligibility-gates.ts";
export * from "./eligibility-validation.ts";
export * from "./baseline-comparison.ts";
export * from "./ranking.ts";
export * from "./trigger.ts";
export * from "./manifest.ts";
export * from "./lab-adapter.ts";
export * from "./lab-facts.ts";
export * from "./conditional-stage.ts";
export * from "./conditional-validation.ts";
export * from "./exclusion-repair.ts";
export * from "./exclusion-validation.ts";
export * from "./hypothetical-views.ts";
export * from "./hypothesis-stage.ts";
export * from "./bridge-proof.ts";
export * from "./corridor-plan.ts";
export * from "./corridor-leg-laws.ts";
export * from "./graph-schema.ts";
export * from "./graph-search.ts";
export * from "./pins/economic.ts";
export * from "./pins/capability.ts";
export * from "./pins/route-compiler.ts";
export * from "./pins/route-compiler-input.ts";
export * from "./pins/corridor.ts";
export * from "./pins/opportunities.ts";
export * from "./pins/repairs.ts";
export * from "./pins/hypotheses.ts";
export * from "./pins/node-network.ts";
