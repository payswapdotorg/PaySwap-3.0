/**
 * @payswap/protocol — the Financial Protocol Authority package (P1-W2).
 *
 * Work Order P1-W2: exact Money primitive + arithmetic authority, AmountSpec
 * bridge, protocol kernel (errors, identifiers, envelopes, deterministic
 * clock/epoch, state machines, idempotency, aggregate boundaries, opaque
 * authorization refs), obligations/clearing, reservations, same-currency v1
 * netting, settlement instructions/attempts with idempotent retry
 * discipline, protocol-owned finality, reconciliation (the sole definitive
 * resolver of ambiguous external effects), evidence lineage with DISTINCT
 * funding/conversion/payout/observation/finality kinds, proof policies,
 * settlement certificates, in-memory ledger journal/projections, and
 * persistence CONTRACT TYPES.
 *
 * LEAF-IN-FLIGHT LAW: zero runtime dependencies, zero package imports
 * (MODULE-OWNERSHIP.yaml layer `financial` may depend on contracts/trust/
 * capability — for THIS phase the package is kept dependency-free; the
 * trust-lane types it will consume are structurally pinned locally
 * (AmountSpec, AuthorizationRef) and wired by the TL at integration).
 *
 * Deferred with documentation (deferral register,
 * spec/protocol/FINANCIAL-PROTOCOL.md): fx/liquidity/credit/collateral
 * kernels (P5-W1 dependency), value-graph route enumeration, persistence
 * adapters + durable outbox (infrastructure decision pending),
 * payment-plane reconciliation subjects.
 */

export const PACKAGE_NAME = '@payswap/protocol' as const;

// Kernel.
export * from './errors.ts';
export * from './clock.ts';
export * from './identifiers.ts';
export * from './money.ts';
export * from './amount-spec.ts';
export * from './envelope.ts';
export * from './idempotency.ts';
export * from './state-machine.ts';
export * from './aggregate.ts';
export * from './authorization.ts';

// Ledger + obligations + reservations + netting.
export * from './ledger/index.ts';
export * from './obligation.ts';
export * from './obligation-book.ts';
export * from './reservation.ts';
export * from './netting.ts';
export * from './netting-delay.ts';

// Persistence contract types (adapters deferred).
export * from './persistence.ts';

// Settlement plane.
export * from './settlement/index.ts';
