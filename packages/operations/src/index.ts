/**
 * @payswap/operations — the release/operations package barrel (P8-W3,
 * terminal work order of the PaySwap 3.0 program).
 *
 * The OPERATIONS package: deterministic contracts, declarations and
 * checkers that make a release VERIFIABLE — deployment identity,
 * reproducible builds, observability, rollback, provider rollout,
 * runbooks, secrets hygiene and evidence lineage. Contracts + verification
 * ONLY: executing a deployment is the operator-authorized production
 * console's job, which consumes these declarations (law 9).
 */

export const PACKAGE_NAME = "@payswap/operations" as const;

export * from "./digest.js";
export * from "./pins/index.js";
export * from "./environment.js";
export * from "./environment-gates.js";
export * from "./deployment-identity.js";
export * from "./reproducible-build.js";
export * from "./observability.js";
export * from "./health.js";
export * from "./alerting.js";
export * from "./rollback.js";
export * from "./compensation.js";
export * from "./operator-actions.js";
export * from "./operator-catalog.js";
export * from "./runbook.js";
export * from "./provider-environment.js";
export * from "./provider-activation.js";
export * from "./rollout.js";
export * from "./secrets.js";
export * from "./secrets-rotation.js";
export * from "./lineage.js";
export * from "./no-execution.js";
