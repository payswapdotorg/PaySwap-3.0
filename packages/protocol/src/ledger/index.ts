/**
 * @payswap/protocol — ledger barrel (P1-W2).
 *
 * Append-only double-entry accountability journal + deterministic balance
 * projections, ported as in-memory contract types with tests (durable
 * persistence adapters are DEFERRED — see the deferral register in
 * spec/protocol/FINANCIAL-PROTOCOL.md).
 */

export * from './journal.ts';
export * from './posting.ts';
export * from './projections.ts';
