/**
 * @payswap/adversarial — the quarantine ledger (P6-W3, lane r4-w3;
 * PORT+ADAPT of payswap.org@8a735bf
 * packages/security/src/quarantine.ts, split for the ≤400-line file
 * law: the capability access gate lives in ./capability-gate.ts, the
 * composed immune gate in ./immune-gate.ts).
 *
 * THE LAW (old INV-S03's reversibility half, the D-1 wiring contract's
 * release law): quarantine is released ONLY through EXPLICIT
 * REMEDIATION plus closure of every advisory that caused it —
 * "release from any restricted state requires VERIFIED remediation
 * (evidence-backed, not time-based)". `QuarantineLedger.release`
 * enforces both preconditions and fails closed otherwise:
 *
 * 1. the record must exist and be active;
 * 2. EVERY advisory referenced by the record must be CLOSED in the
 *    supplied advisory registry (closure itself requires verified
 *    remediation — enforced at ./advisories.ts);
 * 3. the remediation evidence must be NON-EMPTY and complete.
 *
 * There is deliberately NO time-based release, NO expiry, NO amnesty:
 * a quarantine without evidence-backed remediation is permanent.
 *
 * History discipline: the ledger keeps an append-only event log;
 * releasing a quarantine appends a `released` event and never rewrites
 * the `quarantined` events that preceded it. Retired/quarantined
 * history stays queryable forever.
 *
 * Deterministic only: no ambient clock, no randomness.
 */

import type { ComponentRef } from "./component-identity.ts";
import { componentKey, isComponentKind } from "./component-identity.ts";
import type { SecurityAdvisoryRegistry } from "./advisory-registry.ts";

// ---------------------------------------------------------------------------
// Evidence refs (the remediation currency — content-addressed pointers)
// ---------------------------------------------------------------------------

/**
 * Reference to an immutable evidence artifact (content-addressed).
 * Structurally identical to the onchain-security kernel's advisory-
 * bridge EvidenceRef pin (no parallel vocabulary).
 */
export interface EvidenceRef {
  readonly evidenceId: string;
  readonly artifactRef: string;
  readonly contentDigest: string;
}

// ---------------------------------------------------------------------------
// Quarantine ledger
// ---------------------------------------------------------------------------

/** A quarantine record. Immutable; release appends a new event, never edits. */
export interface QuarantineRecord {
  readonly quarantineId: string;
  readonly component: ComponentRef;
  readonly reason: string;
  /** Advisories whose enforcement created this quarantine. */
  readonly advisoryRefs: readonly string[];
  readonly quarantinedAt: number;
  readonly status: "active" | "released";
  readonly releasedAt?: number;
  readonly releaseNote?: string;
  /** Remediation evidence presented at release, when released. */
  readonly remediationEvidence?: readonly EvidenceRef[];
}

/** Append-only quarantine lifecycle event. */
export type QuarantineEvent =
  | { readonly eventType: "quarantined"; readonly record: QuarantineRecord }
  | {
      readonly eventType: "released";
      readonly quarantineId: string;
      readonly releasedAt: number;
      readonly releaseNote: string;
      readonly remediationEvidence: readonly EvidenceRef[];
    };

/** Raised for invalid quarantine operations. */
export class QuarantineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuarantineError";
  }
}

/** Remediation presented for a release (work order: explicit remediation). */
export interface QuarantineRemediation {
  readonly releaseNote: string;
  /** Non-empty remediation evidence is MANDATORY for release. */
  readonly evidence: readonly EvidenceRef[];
}

/**
 * The quarantine ledger: append-only, deterministic. Quarantine creation
 * is ordered by the caller (typically the immune gate enforcing an
 * advisory); release requires every driving advisory to be CLOSED and
 * explicit remediation evidence to be present.
 */
export class QuarantineLedger {
  readonly #recordsById = new Map<string, QuarantineRecord>();
  readonly #order: string[] = [];
  readonly #events: QuarantineEvent[] = [];
  #nextSequence = 1;

  /** Quarantines a component. The record references its driving advisories. */
  quarantine(input: {
    component: ComponentRef;
    reason: string;
    advisoryRefs: readonly string[];
    at: number;
  }): QuarantineRecord {
    if (!isComponentKind(input.component.kind)) {
      throw new QuarantineError(
        `unknown component kind '${String(input.component.kind)}'`,
      );
    }
    if (input.component.id.length === 0) {
      throw new QuarantineError("component id must not be empty");
    }
    if (input.reason.length === 0) {
      throw new QuarantineError("quarantine reason must not be empty");
    }
    const key = componentKey(input.component);
    const active = this.#activeRecordsFor(input.component);
    if (active.length > 0) {
      throw new QuarantineError(
        `component '${key}' is already quarantined (${active
          .map((record) => record.quarantineId)
          .join(", ")})`,
      );
    }
    const quarantineId = `quarantine:${key}:${this.#nextSequence}`;
    this.#nextSequence += 1;
    const record: QuarantineRecord = Object.freeze({
      quarantineId,
      component: input.component,
      reason: input.reason,
      advisoryRefs: Object.freeze([...input.advisoryRefs]),
      quarantinedAt: input.at,
      status: "active",
    });
    this.#recordsById.set(quarantineId, record);
    this.#order.push(quarantineId);
    this.#events.push({ eventType: "quarantined", record });
    return record;
  }

  /**
   * Releases a quarantine. Reversible ONLY through explicit remediation
   * + advisory closure (the D-1 release law):
   * 1. the record must exist and be active;
   * 2. EVERY advisory referenced by the record must be CLOSED in the
   *    supplied advisory registry (with verified remediation — enforced
   *    at closure);
   * 3. the remediation evidence must be non-empty and complete.
   * Appends a `released` event; the history of the quarantine is
   * preserved.
   */
  release(input: {
    quarantineId: string;
    remediation: QuarantineRemediation;
    advisories: SecurityAdvisoryRegistry;
    at: number;
  }): QuarantineRecord {
    const record = this.#recordsById.get(input.quarantineId);
    if (record === undefined) {
      throw new QuarantineError(
        `unknown quarantine '${input.quarantineId}'`,
      );
    }
    if (record.status === "released") {
      throw new QuarantineError(
        `quarantine '${input.quarantineId}' is already released`,
      );
    }
    if (input.remediation.releaseNote.length === 0) {
      throw new QuarantineError("release note must not be empty");
    }
    if (input.remediation.evidence.length === 0) {
      throw new QuarantineError(
        "quarantine release requires explicit remediation evidence (an empty remediation can never release a quarantine)",
      );
    }
    for (const evidence of input.remediation.evidence) {
      if (
        evidence.evidenceId.length === 0 ||
        evidence.artifactRef.length === 0 ||
        evidence.contentDigest.length === 0
      ) {
        throw new QuarantineError("remediation evidence refs must be complete");
      }
    }
    const openAdvisories: string[] = [];
    for (const advisoryRef of record.advisoryRefs) {
      const advisory = input.advisories.byId(advisoryRef);
      if (advisory === undefined) {
        throw new QuarantineError(
          `quarantine '${input.quarantineId}' references unknown advisory '${advisoryRef}'`,
        );
      }
      if (advisory.status !== "closed") {
        openAdvisories.push(advisoryRef);
      }
    }
    if (openAdvisories.length > 0) {
      throw new QuarantineError(
        `quarantine '${input.quarantineId}' cannot be released while advisories remain active: ${openAdvisories.join(", ")} (close them with verified remediation first)`,
      );
    }
    if (input.at < record.quarantinedAt) {
      throw new QuarantineError(
        `release at ${input.at} is before the quarantine at ${record.quarantinedAt}`,
      );
    }
    const released: QuarantineRecord = Object.freeze({
      ...record,
      status: "released",
      releasedAt: input.at,
      releaseNote: input.remediation.releaseNote,
      remediationEvidence: Object.freeze([...input.remediation.evidence]),
    });
    this.#recordsById.set(input.quarantineId, released);
    this.#events.push({
      eventType: "released",
      quarantineId: input.quarantineId,
      releasedAt: input.at,
      releaseNote: input.remediation.releaseNote,
      remediationEvidence: Object.freeze([...input.remediation.evidence]),
    });
    return released;
  }

  byId(quarantineId: string): QuarantineRecord | undefined {
    return this.#recordsById.get(quarantineId);
  }

  /** All records in creation order. */
  list(): readonly QuarantineRecord[] {
    return this.#order.map(
      (id) => this.#recordsById.get(id) as QuarantineRecord,
    );
  }

  /** Records for one component (kind + id), creation order, any status. */
  recordsFor(component: ComponentRef): readonly QuarantineRecord[] {
    return this.list().filter(
      (record) =>
        record.component.kind === component.kind &&
        record.component.id === component.id,
    );
  }

  #activeRecordsFor(component: ComponentRef): readonly QuarantineRecord[] {
    return this.recordsFor(component).filter(
      (record) => record.status === "active",
    );
  }

  /** True iff the component has an ACTIVE quarantine. */
  isQuarantined(component: ComponentRef): boolean {
    return this.#activeRecordsFor(component).length > 0;
  }

  /**
   * Active quarantine records for a component, creation order. Used by
   * the access gate to attach the driving quarantine ids to a rejection.
   */
  activeQuarantinesFor(component: ComponentRef): readonly QuarantineRecord[] {
    return this.#activeRecordsFor(component);
  }

  /** Append-only lifecycle history. Never rewritten. */
  history(): readonly QuarantineEvent[] {
    return [...this.#events];
  }
}
