/**
 * @payswap/protocol — settlement plane barrel (P1-W2).
 *
 * Settlement instructions + attempts with idempotent retry discipline,
 * protocol-owned finality, reconciliation as the only definitive resolver
 * of ambiguous external effects, the append-only provider revision ledger,
 * the queryable evidence graph (distinct funding/conversion/payout/
 * observation/finality kinds), risk-driven proof policies and settlement
 * certificates. Adapted from the old repository's @payswap/settlement
 * (Work Order W1-004) and folded into the single Financial Protocol
 * Authority package per the PaySwap 3.0 architecture.
 */

export * from './evidence.ts';
export * from './proof.ts';
export * from './instructions.ts';
export * from './attempts.ts';
export * from './attempt-ledger.ts';
export * from './reconciliation.ts';
export * from './provider-revisions.ts';
export * from './finality.ts';
export * from './certificates.ts';
