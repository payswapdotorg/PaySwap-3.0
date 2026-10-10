/**
 * Security epochs (P1-W3): the monotonic trust invalidation axis.
 *
 * TWO deliberately composed epoch levels, never duplicated:
 *
 * 1. NETWORK SecurityEpoch (SecurityEpochAuthority below): one monotonic
 *    counter for the whole system, advanced on security-relevant events.
 *    Advancing it deterministically invalidates EVERY epoch-stamped mandate
 *    and approval artifact issued at a lower epoch (TB-5; see policy-epoch.ts
 *    for the linkage functions).
 *
 * 2. PER-PRINCIPAL credential epochs (EpochLedger below): each principal's
 *    credentials are stamped with the epoch at issuance; checkEpoch fails a
 *    principal whose credential epoch is behind the principal's current
 *    ledger epoch — the targeted, revocation-driven scalpel.
 *
 * Deterministic only: no ambient clock (callers pass instants), no
 * randomness; monotonicity is enforced structurally and history is
 * append-only.
 *
 * Adapted from payswap.org@8a735bf packages/trust/src/security-epoch.ts
 * (per-principal ledger, ported) and packages/security/src/epochs.ts
 * (network authority mechanics — advisories/quarantine/experts were NOT
 * ported; they are P6-W3 territory).
 */

import type { Principal } from "./principal.ts";
import { principalRef } from "./principal.ts";

/**
 * One network-wide security epoch value with its advance metadata. `value`
 * starts at 0 (the implicit genesis epoch) and only ever increases
 * (monotonic; advances on security-relevant events).
 */
export interface SecurityEpoch {
  readonly value: bigint;
  /** When the epoch was advanced; never moves backwards (monotonic). */
  readonly advancedAt: number;
  readonly reason: string;
  /** Opaque reference to the security-relevant event that ordered the advance. */
  readonly eventRef?: string;
}

/**
 * A per-principal credential epoch value with its raise metadata. (Renamed
 * from the old repository's per-principal `SecurityEpoch` — in PaySwap 3.0
 * the name SecurityEpoch belongs to the network-wide epoch.)
 */
export interface CredentialEpoch {
  readonly value: bigint;
  readonly raisedAt: number;
  readonly reason: string;
}

/** Append-only ledger record: who raised which credential epoch, when and why. */
export interface CredentialEpochLedgerEntry extends CredentialEpoch {
  readonly principalRef: string;
}

/** Raised when a credential's epoch is behind the current epoch (TB-2). */
export class StaleEpochError extends Error {
  readonly principalRef: string;
  readonly credentialEpoch: bigint;
  readonly currentEpoch: bigint;

  constructor(principalRef: string, credentialEpoch: bigint, currentEpoch: bigint) {
    super(
      `Stale security epoch for ${principalRef}: credential epoch ${credentialEpoch} is behind current epoch ${currentEpoch}`,
    );
    this.name = "StaleEpochError";
    this.principalRef = principalRef;
    this.credentialEpoch = credentialEpoch;
    this.currentEpoch = currentEpoch;
  }
}

/** Raised when an epoch advance/raise would move time backwards or repeat. */
export class NonMonotonicEpochError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonMonotonicEpochError";
  }
}

/**
 * Current credential epoch per principal. Epoch values are monotonically
 * increasing per principal; the raise history is append-only.
 */
export class EpochLedger {
  readonly #current = new Map<string, CredentialEpoch>();
  readonly #history: CredentialEpochLedgerEntry[] = [];

  /** Current credential epoch for a principal; undefined means the implicit epoch 0. */
  currentEpoch(principalRef: string): CredentialEpoch | undefined {
    return this.#current.get(principalRef);
  }

  /**
   * Raise the credential epoch for a principal. The new value is always
   * strictly greater than the previous one (first raise = 1, which
   * invalidates epoch-0 credentials). `raisedAt` must never move backwards.
   */
  raiseEpoch(principalRef: string, reason: string, raisedAt: number): CredentialEpoch {
    if (reason.length === 0) {
      throw new NonMonotonicEpochError("epoch raise reason must not be empty");
    }
    const current = this.#current.get(principalRef);
    if (current !== undefined && raisedAt < current.raisedAt) {
      throw new NonMonotonicEpochError(
        `raisedAt ${raisedAt} is before the previous raise at ${current.raisedAt} for ${principalRef}`,
      );
    }
    const entry: CredentialEpoch = {
      value: (current?.value ?? 0n) + 1n,
      raisedAt,
      reason,
    };
    this.#current.set(principalRef, entry);
    this.#history.push({ principalRef, ...entry });
    return entry;
  }

  /** Append-only raise history, in raise order. */
  history(): readonly CredentialEpochLedgerEntry[] {
    return [...this.#history];
  }
}

/**
 * Check a principal's credential epoch against the ledger (TB-2: a stale
 * credential can never authorize a sensitive delegated action). Throws
 * StaleEpochError when the credential epoch is behind the current epoch.
 * Service principals carry no delegable credential epoch and are not checked.
 */
export function checkEpoch(principal: Principal, ledger: EpochLedger): void {
  if (principal.kind === "service") {
    return;
  }
  const ref = principalRef(principal);
  const current = ledger.currentEpoch(ref);
  if (current !== undefined && principal.securityEpoch < current.value) {
    throw new StaleEpochError(ref, principal.securityEpoch, current.value);
  }
}

/**
 * The network security epoch authority: one monotonic counter for the whole
 * system plus an append-only advance history. Advancing the network epoch is
 * a security-relevant event in itself: every epoch-stamped mandate and
 * approval artifact issued at a lower epoch becomes stale immediately and
 * deterministically (TB-5). BLOCK verdicts are the deliberate exception —
 * they survive epoch advancement (INV-21; see security-block.ts).
 */
export class SecurityEpochAuthority {
  #current: SecurityEpoch = Object.freeze({
    value: 0n,
    advancedAt: 0,
    reason: "genesis: implicit epoch 0",
  });
  readonly #advanceHistory: SecurityEpoch[] = [this.#current];

  /** Current network epoch (genesis epoch 0 until the first advance). */
  currentEpoch(): SecurityEpoch {
    return this.#current;
  }

  /**
   * Advance the network epoch. The new value is strictly `previous + 1`;
   * `advancedAt` must never move backwards. Deterministic: a pure function
   * of the authority state and the supplied event.
   */
  advance(input: { reason: string; at: number; eventRef?: string }): SecurityEpoch {
    if (input.reason.length === 0) {
      throw new NonMonotonicEpochError("epoch advance reason must not be empty");
    }
    if (input.at < this.#current.advancedAt) {
      throw new NonMonotonicEpochError(
        `advancedAt ${input.at} is before the previous advance at ${this.#current.advancedAt}`,
      );
    }
    const next: SecurityEpoch = Object.freeze({
      value: this.#current.value + 1n,
      advancedAt: input.at,
      reason: input.reason,
      ...(input.eventRef === undefined ? {} : { eventRef: input.eventRef }),
    });
    this.#current = next;
    this.#advanceHistory.push(next);
    return next;
  }

  /** Append-only advance history, genesis first. */
  history(): readonly SecurityEpoch[] {
    return [...this.#advanceHistory];
  }
}
