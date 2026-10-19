/**
 * @payswap/lab — the pinned wire shapes barrel (P6-W1, lane R4-W1).
 *
 * Every cross-lane contract shape of this package is a LOCAL STRUCTURAL
 * PIN (the v1 leaf-in-flight law — zero sibling imports; the TL wires the
 * types at integration). Each pin module names its AUTHORITY. Commit 1/4
 * of the R4-W1 rebuild: this barrel plus the pin modules below are the
 * COMPLETE type-level pin surface; the implementation lands in commit 2/4
 * and the ported suite in 3/4.
 *
 * Authorities pinned:
 * - ./capability.ts     — @payswap/capability (P2-W1): execution modes
 *                         (CREDITED to the capability lane), capability
 *                         classes, the connected-instance authorization
 *                         scope (INV-13), the catalogue advertisement
 *                         shape, the declared-definition vocabulary.
 * - ./observation.ts    — @payswap/capability: the two-axis availability
 *                         discipline (CapabilityState x SourceAvailability
 *                         -> EffectiveAvailability; UNKNOWN is never
 *                         success and never failure) + the observation
 *                         subset shape.
 * - ./certification.ts  — @payswap/capability: certification records, the
 *                         smart-contract extension searchability law
 *                         (searchable only after certification) and the
 *                         DECLARED_CAPABILITY block payload (the accepted
 *                         P6-W1 rename of the old SERVICE_ACCESS kind).
 * - ./agents.ts         — @payswap/agents (P3-W1): the organization DRAFT
 *                         subset the Lab composes authority-free
 *                         (proposal-only law: no budgets, no delegation).
 * - ./execution-graph.ts— @payswap/execution-graph (P3-W2): the strategy
 *                         program seam (field-compatible subset typing),
 *                         the directive WHAT-vocabulary, the accepted
 *                         executionMode->execution field rename and the
 *                         advisory-envelope literal.
 */

export * from "./capability.ts";
export * from "./observation.ts";
export * from "./certification.ts";
export * from "./agents.ts";
export * from "./execution-graph.ts";
