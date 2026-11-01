/**
 * @payswap/provider-runtime — the Stripe catalogue PIN DIFF (P24-1).
 *
 * ADR-0017 D2 (BINDING): a new spec pin follows generate → DIFF → REVIEW
 * → adopt. This module is the pure, deterministic diff engine behind that
 * law: two operation inventories (the pinned one and a candidate) → a
 * machine-readable delta by operationId (added / removed / changed, with
 * the method/path/specDigest evidence on each side). The dev-time CLI
 * (scripts/diff-stripe-spec.ts) binds node:fs; this module stays pure so
 * the battery can test it with synthetic inventories (no spec bytes
 * needed) and against the real pin (self-identity = empty diff).
 *
 * The diff NEVER decides adoption: it produces the evidence the TL review
 * consumes (an added operation has NO overlay entry → DENY until reviewed;
 * a changed operation invalidates its digests → the census drift check
 * fails until the overlay is re-reviewed).
 */

import type { StripeCatalogueOperation } from './generator.ts';

/** One side of a diffed operation (method + path + digest evidence). */
export interface StripeDiffSide {
  readonly method: StripeCatalogueOperation['method'];
  readonly path: string;
  readonly apiNamespace: 'v1' | 'v2';
  readonly specDigest: string;
}

/** One added operation (present in the candidate, absent from the pin). */
export interface StripeDiffAdded {
  readonly operationId: string;
  readonly candidate: StripeDiffSide;
}

/** One removed operation (present in the pin, absent from the candidate). */
export interface StripeDiffRemoved {
  readonly operationId: string;
  readonly pinned: StripeDiffSide;
}

/** One changed operation (same id, different digest/method/path/namespace). */
export interface StripeDiffChanged {
  readonly operationId: string;
  readonly pinned: StripeDiffSide;
  readonly candidate: StripeDiffSide;
}

/** The machine-readable diff (the D2 review artifact). */
export interface StripeCatalogueDiff {
  readonly pinnedSpecInfoVersion: string;
  readonly candidateSpecInfoVersion: string;
  readonly pinnedOperationCount: number;
  readonly candidateOperationCount: number;
  readonly added: readonly StripeDiffAdded[];
  readonly removed: readonly StripeDiffRemoved[];
  readonly changed: readonly StripeDiffChanged[];
  readonly unchangedCount: number;
}

/** The minimal inventory shape the differ consumes (the generator's output). */
export interface StripeInventoryLike {
  readonly specInfoVersion: string;
  readonly operations: readonly StripeCatalogueOperation[];
}

function sideOf(operation: StripeCatalogueOperation): StripeDiffSide {
  return {
    method: operation.method,
    path: operation.path,
    apiNamespace: operation.apiNamespace,
    specDigest: operation.specDigest,
  };
}

/**
 * THE PURE DIFF: pinned inventory × candidate inventory → the delta.
 * Deterministic: outputs are sorted by operationId; equality is the
 * operation's whole evidence tuple (digest + method + path + namespace).
 */
export function diffStripeOperationInventories(
  pinned: StripeInventoryLike,
  candidate: StripeInventoryLike,
): StripeCatalogueDiff {
  const pinnedById = new Map<string, StripeCatalogueOperation>();
  for (const operation of pinned.operations) {
    if (pinnedById.has(operation.operationId)) {
      throw new Error(`duplicate operationId in pinned inventory: ${operation.operationId}`);
    }
    pinnedById.set(operation.operationId, operation);
  }
  const candidateById = new Map<string, StripeCatalogueOperation>();
  for (const operation of candidate.operations) {
    if (candidateById.has(operation.operationId)) {
      throw new Error(`duplicate operationId in candidate inventory: ${operation.operationId}`);
    }
    candidateById.set(operation.operationId, operation);
  }
  const added: StripeDiffAdded[] = [];
  const removed: StripeDiffRemoved[] = [];
  const changed: StripeDiffChanged[] = [];
  let unchangedCount = 0;
  const allIds = [...new Set([...pinnedById.keys(), ...candidateById.keys()])].sort();
  for (const operationId of allIds) {
    const pinnedOp = pinnedById.get(operationId);
    const candidateOp = candidateById.get(operationId);
    if (pinnedOp === undefined && candidateOp !== undefined) {
      added.push({ operationId, candidate: sideOf(candidateOp) });
      continue;
    }
    if (pinnedOp !== undefined && candidateOp === undefined) {
      removed.push({ operationId, pinned: sideOf(pinnedOp) });
      continue;
    }
    if (pinnedOp === undefined || candidateOp === undefined) continue; // unreachable
    const same =
      pinnedOp.specDigest === candidateOp.specDigest &&
      pinnedOp.method === candidateOp.method &&
      pinnedOp.path === candidateOp.path &&
      pinnedOp.apiNamespace === candidateOp.apiNamespace;
    if (same) {
      unchangedCount += 1;
    } else {
      changed.push({ operationId, pinned: sideOf(pinnedOp), candidate: sideOf(candidateOp) });
    }
  }
  return {
    pinnedSpecInfoVersion: pinned.specInfoVersion,
    candidateSpecInfoVersion: candidate.specInfoVersion,
    pinnedOperationCount: pinned.operations.length,
    candidateOperationCount: candidate.operations.length,
    added,
    removed,
    changed,
    unchangedCount,
  };
}

/** A compact human-readable summary for review logs (never the only form). */
export function summarizeStripeCatalogueDiff(diff: StripeCatalogueDiff): string {
  return [
    `pinned ${diff.pinnedSpecInfoVersion} (${String(diff.pinnedOperationCount)} ops)`,
    `candidate ${diff.candidateSpecInfoVersion} (${String(diff.candidateOperationCount)} ops)`,
    `added ${String(diff.added.length)}`,
    `removed ${String(diff.removed.length)}`,
    `changed ${String(diff.changed.length)}`,
    `unchanged ${String(diff.unchangedCount)}`,
  ].join(' · ');
}
