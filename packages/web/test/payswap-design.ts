/**
 * Test-side resolution stub for the @zcode/ui design layer (moved from
 * test/payswap/design.ts in P9-A when the product suite moved to
 * @payswap/app).
 *
 * vitest externalizes bare @zcode/* workspace imports (Node cannot load
 * the substrate's NodeNext .js-suffix TypeScript source), so the suite
 * aliases the specifier onto this in-root stub, which re-exports the
 * design layer through a RELATIVE path (processed by vite's TS-aware
 * resolver). Test infrastructure only — src/** keeps importing
 * "@zcode/ui/payswap" (the workspace export).
 */
export * from "../../ui/src/payswap/index.js";
