/**
 * @payswap/command — the universal interaction contract package for
 * PaySwap 3.0 (Work Order P7-W3).
 *
 * The canonical universal interaction surface:
 *   command surface (grammar, proposal envelopes, method registry,
 *   transport typed shapes) + agent interaction protocol boundaries
 *   (MCP/A2A/AG-UI) + the permission/confirmation interaction models
 *   (approval requests, trusted-surface confirmations, intent-at-most
 *   parsing) + the browser Extension boundary (versioned, permission-
 *   scoped, no ambient authority) + developer/external-agent API
 *   contracts (versioned, deterministic, total-error, explicit
 *   capability disclosure).
 *
 * LAYER LAW (MODULE-OWNERSHIP.yaml layer `platform`: may_depend_on
 * [contracts, platform]): ZERO runtime dependencies and ZERO PaySwap
 * sibling imports (the v1 platform pattern). Cross-lane wire shapes the
 * surface consumes (PrincipalRef, AuthorityScope, transport envelopes,
 * approval channels) are pinned STRUCTURALLY byte-identical, locally;
 * the Tech Lead wires the real imports at integration — exactly as the
 * Phase-1/2 lanes pinned AmountSpec and the trust link.
 *
 * LAWS (canonical citations): the command surface NEVER carries financial
 * authorization — commands are proposals/inputs, never financial authority
 * (the authority-firewall law; INV-9/INV-23); the method effect-class
 * vocabulary has no financial-execute member; the Extension permission
 * vocabulary has no financial member and every effect-bearing call is an
 * explicit request with a typed response envelope (no ambient authority);
 * developer/external-agent APIs are versioned, deterministic, total-error
 * with explicit capability disclosure; transports are typed shapes, never
 * I/O (hashing/signing/clock/ids are injected ports); state-changing
 * commands are idempotent and replay-safe (INV-6); UNKNOWN is not FAILED
 * (INV-4); secrets never enter artifacts (INV-19).
 *
 * Machine-checked by test/boundary.test.ts: every src AND test module
 * specifier is relative (test toolchain excepted: vitest + the ambient
 * filesystem/path builtins the boundary scanner itself uses), no PaySwap
 * sibling import anywhere, no built-in-module imports in src, no ambient
 * clock/randomness/network, every file <= 400 lines, devDependencies
 * exactly typescript + vitest.
 */

export const PACKAGE_NAME = '@payswap/command' as const;

// Domain error taxonomy + the total-error law.
export * from './errors.ts';

// Version pins + the explicit-versioning law.
export * from './version.ts';

// Branded identifiers + the PrincipalRef structural mirror.
export * from './identifiers.ts';

// Typed dependency ports (clock/ids/hashing/MAC — transports-as-contracts).
export * from './ports.ts';

// Canonical JSON + strict-UTC timestamp DATA parsing.
export * from './canonical.ts';

// Command proposal envelope + idempotency wire shapes.
export * from './command-envelope.ts';

// Permission/confirmation interaction vocabulary.
export * from './permission.ts';

// Transport wire shapes (request/response envelopes, ApiError, headers).
export * from './transport.ts';

// The universal command grammar (the six verbs; pure parser).
export * from './command-grammar.ts';

// Agent interaction protocol boundaries (MCP/A2A/AG-UI + validators).
export * from './agent-interaction.ts';

// Approval interaction: requests, messages, intent-at-most parsing,
// trusted-channel confirmation seam, request hashes.
export * from './approval-interaction.ts';

// The signed approval artifact contract (HMAC via the injected port).
export * from './approval-artifact.ts';

// The gated messaging gateway (capability-declared channels).
export * from './messaging-gateway.ts';

// The developer session contract (fail-closed decision table + tokens).
export * from './session-contract.ts';

// The webhook delivery contract (sign/verify via ports, backoff math).
export * from './webhook-delivery.ts';

// Browser Extension boundary wire shapes + enforcement.
export * from './extension-boundary.ts';

// Method registry wire shapes + deterministic registry implementation.
export * from './method-registry.ts';

// Developer/external-agent API wire shapes + disclosure/projection.
export * from './developer-api.ts';
