/**
 * @payswap/financial-certification — the pinned wire shapes of the
 * provider-runtime's idempotency / ambiguity / event-ordering authorities
 * (P8-W1).
 *
 * Authority: @payswap/provider-runtime (P2-W2 — the per-operation
 * idempotency contract registry, the INV-04 result envelope and the
 * webhook ingestion discipline). Under the zero-sibling law the wire
 * shapes are LOCAL STRUCTURAL PINS and the value laws mirrored here are
 * behaviour-identical; cross-lane consistency asserted by
 * test/pins.test.ts. The rails-advisory lesson this lane certifies:
 * "implement idempotency according to each provider operation's actual
 * contract — do not assume a universal header or one global key scope"
 * (there is NO universal mechanism; state-changing operations without a
 * registered contract are refused fail-closed).
 */

/**
 * STRUCTURAL PIN — authority: @payswap/provider-runtime
 * src/idempotency.ts `OperationIdempotencyContract` (subset-typed): the
 * per-operation contract — key scope dimensions, key derivation, replay
 * behavior and conflict reporting.
 */
export interface PinnedOperationIdempotencyContract {
  readonly operationId: string;
  readonly keyScope: {
    readonly connection: boolean;
    readonly operation: boolean;
  };
  readonly keyDerivation: PinnedIdempotencyKeyDerivation;
  readonly replayBehavior: PinnedIdempotencyReplayBehavior;
  readonly conflictReporting:
    | "PROVIDER_CONFLICT_SIGNAL"
    | "LOCAL_CONFLICT_DETECTION";
  readonly providerEvidenceField?: string;
}

/** VALUE PIN — the key-derivation vocabulary (byte-identical). */
export const PINNED_IDEMPOTENCY_KEY_DERIVATIONS = Object.freeze([
  "NAMESPACED_COMMAND_ID",
  "CALLER_SUPPLIED_PROVIDER_FIELD",
  "PROVIDER_ASSIGNED_ECHO",
] as const);

export type PinnedIdempotencyKeyDerivation =
  (typeof PINNED_IDEMPOTENCY_KEY_DERIVATIONS)[number];

/** VALUE PIN — the replay-behavior vocabulary (byte-identical). */
export const PINNED_IDEMPOTENCY_REPLAY_BEHAVIORS = Object.freeze([
  "REPLAYS_ORIGINAL_RESULT",
  "HARMLESS_NOOP_ACKNOWLEDGEMENT",
] as const);

export type PinnedIdempotencyReplayBehavior =
  (typeof PINNED_IDEMPOTENCY_REPLAY_BEHAVIORS)[number];

/**
 * VALUE PIN — authority: @payswap/provider-runtime
 * src/idempotency.ts `deriveIdempotencyKey` (behaviour-identical): the
 * namespaced deterministic derivation — NAMESPACED_COMMAND_ID derives
 * `payswap:<commandId>` (a protocol key can never collide with an
 * unrelated provider-side key); the provider-field derivations carry the
 * command id verbatim (provider-evidence semantics).
 */
export function pinnedDeriveIdempotencyKey(
  contract: PinnedOperationIdempotencyContract,
  commandId: string,
): string {
  if (typeof commandId !== "string" || commandId.length === 0) {
    throw new RangeError(
      "idempotency key derivation requires a command id",
    );
  }
  switch (contract.keyDerivation) {
    case "NAMESPACED_COMMAND_ID":
      return `payswap:${commandId}`;
    case "CALLER_SUPPLIED_PROVIDER_FIELD":
    case "PROVIDER_ASSIGNED_ECHO":
      return commandId;
    default:
      throw new RangeError("unknown key derivation");
  }
}

/**
 * VALUE PIN — authority: @payswap/provider-runtime
 * src/result-envelope.ts `AMBIGUITY_REASONS` (byte-identical): why an
 * outcome is UNKNOWN — the recorded reason on every ambiguous attempt.
 */
export const PINNED_AMBIGUITY_REASONS = Object.freeze([
  "TRANSPORT_TIMEOUT_AFTER_DISPATCH",
  "TRANSPORT_CONNECTION_LOST_AFTER_DISPATCH",
  "MALFORMED_RESPONSE_AFTER_DISPATCH",
] as const);

export type PinnedAmbiguityReason = (typeof PINNED_AMBIGUITY_REASONS)[number];

/**
 * VALUE PIN — authority: @payswap/provider-runtime src/events.ts
 * `EVENT_PROCESSING_OUTCOMES` (byte-identical): the ingestion outcome of
 * one provider event — a late older event is retained in history and
 * flagged SUPERSEDED_BY_NEWER_OBSERVATION; a duplicate is
 * DUPLICATE_IGNORED (harmless).
 */
export const PINNED_EVENT_PROCESSING_OUTCOMES = Object.freeze([
  "CANONICAL_ADVANCED",
  "SUPERSEDED_BY_NEWER_OBSERVATION",
  "RETAINED_WITHOUT_OBJECT_STATE",
  "DUPLICATE_IGNORED",
] as const);

export type PinnedEventProcessingOutcome =
  (typeof PINNED_EVENT_PROCESSING_OUTCOMES)[number];
