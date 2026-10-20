/**
 * @payswap/operations — pinned wire shapes of the provider runtime
 * (P8-W3, lane p8-w3; commit 1/4).
 *
 * Authority: @payswap/provider-runtime (P2-W2 rebuild, merged into the
 * canonical tree). The provider-environment records and rollout gates in
 * this package must speak the SAME closed vocabularies the execution
 * plane speaks — execution modes and transport classes — or the
 * sandbox/live separation would drift at the seam. PINS ARE NOT IMPORTS:
 * the leaf-in-flight law forbids sibling imports, so the closed
 * vocabularies are mirrored BY VALUE with their authorities cited; the
 * TL wires the types at integration and the pins test pins the bytes.
 */

// ---------------------------------------------------------------------------
// Execution modes (the SANDBOX/LIVE law — INV-25)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/provider-runtime src/execution-mode.ts
 * `EXECUTION_MODES` (byte-identical closed vocabulary). Test/sandbox/live
 * distinctions are explicit and mechanically enforced; nothing defaults
 * silently to live.
 */
export const PINNED_EXECUTION_MODES = Object.freeze([
  "SANDBOX",
  "LIVE",
] as const);

/** STRUCTURAL PIN — authority: @payswap/provider-runtime `ExecutionMode`. */
export type PinnedExecutionMode = (typeof PINNED_EXECUTION_MODES)[number];

export function isPinnedExecutionMode(
  value: unknown,
): value is PinnedExecutionMode {
  return (
    typeof value === "string" &&
    (PINNED_EXECUTION_MODES as readonly unknown[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Transport classes (what a runtime may bind per mode)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/provider-runtime src/execution-mode.ts
 * `TRANSPORT_CLASSES` (byte-identical closed vocabulary).
 */
export const PINNED_TRANSPORT_CLASSES = Object.freeze([
  "FAKE_DETERMINISTIC",
  "PRODUCTION_HTTP",
] as const);

/** STRUCTURAL PIN — authority: @payswap/provider-runtime `TransportClass`. */
export type PinnedTransportClass =
  (typeof PINNED_TRANSPORT_CLASSES)[number];

export function isPinnedTransportClass(
  value: unknown,
): value is PinnedTransportClass {
  return (
    typeof value === "string" &&
    (PINNED_TRANSPORT_CLASSES as readonly unknown[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Credential isolation (opaque handles — INV-19)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/provider-runtime
 * src/credential-isolation.ts: credential material NEVER enters model
 * context, normal logs or ordinary artifacts; it crosses boundaries only
 * as OPAQUE HANDLES/REFERENCES (sequence-minted `cred:<n>` in the
 * runtime). This package's secret-handle law mirrors the discipline: an
 * operational artifact carries the HANDLE, never the material.
 */
export const PINNED_CREDENTIAL_HANDLE_PATTERN = /^cred:[0-9]+$/;

/** STRUCTURAL PIN — authority: @payswap/provider-runtime `CredentialHandleId`. */
export type PinnedCredentialHandleId = string & {
  readonly __pinnedCredentialHandleId: unique symbol;
};

// ---------------------------------------------------------------------------
// Event ingestion outcome law (out-of-order + duplicate discipline)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/provider-runtime src/events.ts law 4:
 * an out-of-order event may never regress canonical state — a late older
 * observation is retained in history and flagged
 * `SUPERSEDED_BY_NEWER_OBSERVATION`. The observability taxonomy's
 * event-ingestion declarations mirror this vocabulary.
 */
export const PINNED_EVENT_REGRESSION_FLAG = "SUPERSEDED_BY_NEWER_OBSERVATION";

/**
 * STRUCTURAL PIN — authority: @payswap/provider-runtime src/clock.ts:
 * domain time is bigint milliseconds (`TimestampMs`), never a JS float
 * number; all time flows through an injected clock. Operational records
 * in this package carry caller-supplied ISO-8601 UTC strings for human
 * fields and never read a host clock.
 */
export type PinnedTimestampMs = bigint;
