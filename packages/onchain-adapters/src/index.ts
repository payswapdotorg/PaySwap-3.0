/**
 * @payswap/onchain-adapters — Multi-chain adapter contracts core (Work
 * Order P4-W3, lane R2-W3).
 *
 * This barrel is the VENDOR-NEUTRAL core: the frozen adapter lifecycle
 * contract, the structural environment/rail discriminator, the transport
 * contracts, the explicit family semantics vocabulary, the shared lifecycle
 * machinery (incl. the pure operation state machine) and the production
 * settlement gate. The family implementations (EVM, Solana, UTXO) are
 * SUBPATH exports (`@payswap/onchain-adapters/evm`, `/solana`, `/utxo`) so
 * the core barrel never imports a family module — the dependency direction
 * is strictly family → core (adversarially verified in the boundary test).
 *
 * DETERMINISM LAW: transports are CONTRACTS (typed request/response
 * shapes) and never perform I/O; the lifecycle is a pure state machine;
 * everything in this package runs offline. Concrete transport wiring is
 * composition-root work.
 *
 * Hard constraints structurally enforced by this package:
 * - NO single RPC/indexer/simulation vendor is a core dependency: vendors
 *   live behind the transport contracts; PRODUCTION transports require
 *   endpoint provider diversity (>=2 distinct providers).
 * - Fee, finality and reorg semantics are EXPLICIT per family and fail
 *   closed when inexpressible (SemanticNotExpressibleError).
 * - UNKNOWN for ambiguous/unfinalized state, never converted to
 *   success/failure; unreachable rails surface availability UNKNOWN.
 * - Testnet/simulation can NEVER be production financial execution: the
 *   environment discriminator is STRUCTURAL (chain-identity registry +
 *   branded types + runtime re-derivation), not a runtime flag alone.
 * - The ADAPTER NEVER AUTHORIZES: the authorize stage drives the INJECTED
 *   onchain-security kernel port; the kernel owns authority.
 * - Adapters map into the canonical settlement vocabulary through the
 *   pinned mapping contracts — no parallel ledger, no duplicate connector
 *   vocabulary. Finality is protocol-owned (candidates only).
 * - The catalogue never authorizes; external balances are OBSERVATIONS
 *   (never custody, never a balance); no secrets in agent-facing contracts
 *   (every adapter output is secret-scanned).
 * - LEAF-IN-FLIGHT LAW: zero runtime dependencies, zero sibling imports —
 *   the onchain-domain (P4-W1) and onchain-security (P4-W2) shapes are
 *   LOCAL STRUCTURAL PINS (src/pins/*), wired by the TL at integration.
 */

export const PACKAGE_NAME = '@payswap/onchain-adapters' as const;

// Package + vocabulary versions.
export * from './version.ts';
// Error taxonomy (self-contained, PaySwapError-shaped).
export * from './errors.ts';
// Deterministic canonical serialization + content digest.
export * from './digest.ts';
// The rule-25 secret boundary.
export * from './secrets.ts';
// Structural environment/rail discriminator.
export * from './environment.ts';
// Explicit family fee/finality/reorg semantics.
export * from './semantics.ts';
export * from './semantics-validation.ts';
// Vendor-neutral transport contracts + the endpoint diversity law.
export * from './transport.ts';

// The frozen family-adapter lifecycle contract.
export * from './contract/stages.ts';
export * from './contract/observations.ts';
export * from './contract/stage-io.ts';
export * from './contract/adapter.ts';

// Shared lifecycle machinery.
export * from './lifecycle/declaration.ts';
export * from './lifecycle/staleness.ts';
export * from './lifecycle/operation-machine.ts';
export * from './lifecycle/evidence-log.ts';
export * from './lifecycle/stage-context.ts';
export * from './lifecycle/observation-factory.ts';
export * from './lifecycle/write-translation.ts';
export * from './lifecycle/prepare-prologue.ts';
export * from './lifecycle/authorize.ts';
export * from './lifecycle/finality.ts';
export * from './lifecycle/reconcile.ts';
export * from './lifecycle/base.ts';

// The production settlement gate (canonical mapping, environment-guarded).
export * from './settlement-gate.ts';

// Structural pins (local mirrors of the in-flight P4-W1/P4-W2 contracts).
export * from './pins/onchain-domain/family.ts';
export * from './pins/onchain-domain/operations.ts';
export * from './pins/onchain-domain/directive.ts';
export * from './pins/onchain-domain/observation.ts';
export * from './pins/onchain-domain/instance.ts';
export * from './pins/onchain-domain/asset-observation.ts';
export * from './pins/onchain-domain/settlement-mapping.ts';
export * from './pins/onchain-security/principal.ts';
export * from './pins/onchain-security/write-request.ts';
export * from './pins/onchain-security/signing.ts';
export * from './pins/onchain-security/kernel-port.ts';
