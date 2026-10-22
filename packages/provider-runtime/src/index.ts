/**
 * @payswap/provider-runtime — the provider runtime package (P2-W2).
 *
 * NAME LAW: this package is never named or aliased "provider" — the
 * inherited packages/provider is ZCode's AI-model provider selection
 * (platform layer), a different concept entirely.
 *
 * Work Order P2-W2 surface: connection scope + connection forms +
 * connection lifecycle, the CREDENTIAL/BROWSER ISOLATION boundary (opaque
 * handles; secret material never enters model context, logs or ordinary
 * artifacts — INV-19), the EXECUTION BRIDGE from an authorized command
 * (opaque authorization ref, P1-W2 pattern) through a connection to an
 * external effect attempt with the CONFIRMED/UNKNOWN/FAILED result
 * envelope (INV-04), ENDPOINT-SPECIFIC idempotency contracts (INV-06;
 * Wise §4.4 — never one universal mechanism), AUTHENTICATED event/webhook
 * ingestion with a PLUGGABLE opaque signature-verifier contract (P1-W3
 * finding F-2 precedent), duplicate-delivery-harmless and
 * out-of-order-no-regression event handling, LOSSLESS versioned immutable
 * raw provider-state retention with a stable PaySwap projection (INV-03/
 * INV-14), CANONICAL provider retrieval with provenance and the
 * reconcile-before-consequential-retry gate (INV-04 evidence supply), the
 * correlation/idempotency identifier persistence (INV-05 evidence lineage
 * refs) and the mechanically distinct SANDBOX/LIVE execution-mode law
 * (INV-25; sandbox can never be represented as proof of live behavior —
 * live certification is P8).
 *
 * LEAF-IN-FLIGHT LAW: zero runtime dependencies, zero package imports
 * (MODULE-OWNERSHIP.yaml layer `rails` may depend on contracts/capability/
 * trust/financial — for THIS phase the package is kept dependency-free;
 * the capability-lane refs (P2-W1, in flight) and the P1 authorization
 * lineage type are structurally pinned locally in refs.ts and wired by
 * the TL at integration).
 *
 * Deferred with documentation (spec/provider-runtime/PROVIDER-RUNTIME.md):
 * durable persistence for every in-memory reference store; real provider
 * adapter implementations (this package ships the runtime + contracts;
 * connector implementations are P5-W3/later lane work); cryptographic
 * signature verification (platform/capability lane owns crypto — the
 * verifier contract here is pluggable and opaque); live certification
 * (P8); reconciliation of external funds observations into protocol
 * truth (P1-W2 reconciliation authority consumes the retrieval evidence
 * this runtime supplies).
 */

export const PACKAGE_NAME = '@payswap/provider-runtime' as const;

// Kernel.
export * from './errors.ts';
export * from './clock.ts';
export * from './identifiers.ts';
export * from './redaction.ts';
export * from './refs.ts';

// Connection model.
export * from './connection-forms.ts';
export * from './connection-scope.ts';
export * from './connection-lifecycle.ts';

// Isolation boundary.
export * from './credential-isolation.ts';

// Execution-mode law + transport + result envelope.
export * from './execution-mode.ts';
export * from './transport.ts';
export * from './result-envelope.ts';

// Endpoint-specific idempotency.
export * from './idempotency.ts';
export * from './idempotency-registrar.ts';

// Raw provider-state retention + projection.
export * from './raw-state.ts';

// Event/webhook ingestion.
export * from './event-extractor.ts';
export * from './events.ts';

// Controlled retrieval + reconciliation supply.
export * from './retrieval.ts';

// Operation bindings + the attempt ledger + the execution bridge.
export * from './operation.ts';
export * from './attempts.ts';
export * from './execution-bridge.ts';

// Payment-provider adapters (P13-B): the typed registry declaration
// contracts + the Stripe vertical slice (real HTTPS transport, read-only
// verification probe, capability→scope mapping, OAuth state machinery for
// the declared-but-unconfigured U2/U3 forms). Names are provider-prefixed
// so the adapter surface can never collide with the kernel vocabulary.
export * from './adapters/registry-declaration.ts';
export * from './adapters/stripe/declaration.ts';
export * from './adapters/stripe/capabilities.ts';
export * from './adapters/stripe/https-transport.ts';
export * from './adapters/stripe/verification-probe.ts';
export * from './adapters/stripe/oauth-state.ts';
