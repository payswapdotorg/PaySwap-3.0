/**
 * @payswap/operations — pinned wire shapes of the Lab (P8-W3, lane
 * p8-w3; commit 1/4).
 *
 * Authority: @payswap/lab (P6-W1 rebuild). The rollback-rehearsal and
 * drill reports this package declares are REPLAYED/DERIVED evidence —
 * they run over constructed fixtures, never over production state, so
 * they can never pose as production rollback proof. The Lab's replay
 * namespace law is the canonical form of that boundary: replay results
 * carry a phantom namespace brand and no exported conversion turns them
 * into production evidence. PINS ARE NOT IMPORTS.
 */

/**
 * VALUE PIN — authority: @payswap/lab src/replay.ts `REPLAY_NAMESPACE`
 * (byte-identical). Every lab replay result is branded with this
 * namespace; there is no conversion from a replay result to any
 * production-evidence type.
 */
export const PINNED_LAB_REPLAY_NAMESPACE = "PAYSWAP_LAB_REPLAY";

/**
 * STRUCTURAL PIN — authority: @payswap/lab `ReplayNamespaceBrand` (the
 * phantom-brand pattern). Rollback rehearsals in this package carry the
 * same class of brand: a rehearsal is a derived drill over fixtures,
 * operator evidence at execution time is what certifies a real rollback.
 */
export interface PinnedReplayNamespaceBrand {
  readonly __payswapLabReplayNamespace: typeof PINNED_LAB_REPLAY_NAMESPACE;
}

/**
 * VALUE PIN — authority: @payswap/lab src/replay.ts determinism law:
 * "same facts + same program id/version + same seed -> byte-identical
 * result". The evidence-lineage replay in this package holds the same
 * law over operational records: same record sequence -> byte-identical
 * chain, and a tampered sequence is rejected by digest mismatch.
 */
export const PINNED_REPLAY_DETERMINISM_LAW =
  "same-facts-same-program-same-seed-byte-identical-result" as const;

/**
 * VALUE PIN — authority: @payswap/lab src/canonical.ts `deepFreeze` +
 * recorded-facts discipline: historical facts are immutable and replay
 * never rewrites them — replay references facts by id + digest only.
 * Rollback records in this package hold the identical discipline over
 * promotion/rollback history: append-only, digest-referenced.
 */
export const PINNED_RECORDED_FACTS_LAW =
  "recorded-facts-are-immutable-replay-references-by-id-and-digest" as const;
