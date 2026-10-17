/**
 * @payswap/zcode-bridge — the typed, versioned, framework-free bridge from
 * the pinned ZCode platform substrate to PaySwap (P3-W3).
 *
 * Export surface law (the accepted build's doctrine, reproduced): every
 * RUNTIME export is a plain function, frozen data, or a string/number —
 * no classes-with-state, no singletons, no ambient anything. The bridge
 * DESCRIBES substrate capabilities as typed observations; it never
 * executes, never proxies, and never holds financial authority
 * (no_parallel_financial_authority; the financial semantics live in the
 * financial/economic layers only).
 *
 * Two layers of surface:
 * - the PINNED WIRE SHAPES (src/wire): versioning, authority-boundary
 *   vocabulary, runtime IDs, and the tool-registry / tool-declaration /
 *   model-tool / MCP / skills / session / subagent / model-selection /
 *   workflow / rpc contract types with frozen canonical vocabularies;
 * - the IMPLEMENTATION (src/bridge): validators, guards, projections, the
 *   provenance factory, and the 13 surface observations + inventory.
 */

export * from "./wire/index.ts";
export * from "./bridge/index.ts";
