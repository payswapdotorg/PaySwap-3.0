/**
 * @payswap/onchain-adapters — the append-only evidence log + confirmation
 * anchors (Work Order P4-W3, lane R2-W3; extracted from the old
 * BaseChainFamilyAdapter to honor the <=400-line file law).
 *
 * INV-E01/E02 discipline: per-operation evidence entries are append-only,
 * frozen, sequence-numbered deterministically (no entropy). Confirmation
 * anchors remember the containing block/slot of a CONFIRMED observation for
 * later reorg/fork detection.
 */

import type { AdapterEvidenceEntry } from '../contract/stage-io.ts';
import type { AdapterLifecycleStage } from '../contract/stages.ts';
import type { RailEnvironmentClass } from '../environment.ts';

/** A remembered containing block/slot anchor (reorg comparison). */
export interface ConfirmationAnchor {
  readonly height: number;
  readonly headHash: string;
}

/**
 * The per-adapter append-only evidence log. Evidence references are
 * deterministic (`evidence:<adapterId>:<seq>` — never entropy).
 */
export class AdapterEvidenceLog {
  readonly #entries = new Map<string, AdapterEvidenceEntry[]>();
  readonly #anchors = new Map<string, ConfirmationAnchor>();
  #seq = 0;

  /** The current sequence (deterministic observation-id salt). */
  get sequence(): number {
    return this.#seq;
  }

  /** Mints a deterministic evidence reference and appends a log entry. */
  log(
    adapterId: string,
    environmentClass: RailEnvironmentClass,
    executionRef: string,
    stage: AdapterLifecycleStage,
    at: number,
    refs: readonly string[],
  ): string {
    this.#seq += 1;
    const evidenceRef = `evidence:${adapterId}:${this.#seq}`;
    const entries = this.#entries.get(executionRef) ?? [];
    entries.push(
      Object.freeze({
        at,
        stage,
        adapterId,
        environmentClass,
        refs: Object.freeze([evidenceRef, ...refs]),
      }),
    );
    this.#entries.set(executionRef, entries);
    return evidenceRef;
  }

  /** The append-only entries for one execution ref (or all, frozen). */
  entries(executionRef?: string): readonly AdapterEvidenceEntry[] {
    if (executionRef !== undefined) {
      return Object.freeze([...(this.#entries.get(executionRef) ?? [])]);
    }
    const all: AdapterEvidenceEntry[] = [];
    for (const list of this.#entries.values()) {
      all.push(...list);
    }
    return Object.freeze(all);
  }

  /** Records (or re-reads) the confirmation anchor for reorg detection. */
  rememberAnchor(executionRef: string, anchor: ConfirmationAnchor): void {
    this.#anchors.set(executionRef, Object.freeze({ ...anchor }));
  }

  /** The remembered confirmation anchor, when one exists. */
  anchor(executionRef: string): ConfirmationAnchor | undefined {
    return this.#anchors.get(executionRef);
  }
}
