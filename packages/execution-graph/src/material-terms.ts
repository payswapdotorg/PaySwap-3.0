/**
 * @payswap/execution-graph — MATERIAL EXECUTION TERMS evaluation (P3-W2,
 * ENCODED LAW 2 support).
 *
 * Deterministic axis digests + change detection over MaterialExecutionTerms
 * (contract in material-terms-contract.ts). Every covered axis digests
 * canonically (sorted keys, bigint-aware); a change on a covered axis is
 * MATERIAL and must invalidate projections bound to the old terms.
 *
 * ECONOMIC-EXECUTION-GRAPH authority: "Material changes to route,
 * destination, asset, amount, risk or capability observations invalidate
 * affected authorization." The QUOTE axis is the 3.0 addition carrying the
 * work order's "quote ... versions" preservation law into the same
 * invalidation discipline.
 */

import { ValidationError } from './errors.ts';
import { canonicalDigest } from './canonical.ts';
import type {
  MaterialExecutionTerms,
  MaterialTermAxis,
  MaterialTermChange,
  MaterialTermCoverage,
} from './material-terms-contract.ts';
import type { TimestampMs } from '@payswap/protocol';

/** The axes a terms object covers (sorted, deterministic). */
export function materialTermCoverage(terms: MaterialExecutionTerms): MaterialTermCoverage {
  const covered: MaterialTermAxis[] = [];
  if (terms.route !== undefined) {
    covered.push('ROUTE');
  }
  if (terms.destinationId !== undefined) {
    covered.push('DESTINATION');
  }
  if (terms.asset !== undefined) {
    covered.push('ASSET');
  }
  if (terms.amountMinor !== undefined) {
    covered.push('AMOUNT');
  }
  if (terms.riskEpochRef !== undefined) {
    covered.push('RISK');
  }
  if (terms.observationPins !== undefined) {
    covered.push('CAPABILITY_OBSERVATIONS');
  }
  if (terms.quoteRefs !== undefined) {
    covered.push('QUOTE');
  }
  return covered.sort();
}

/** Structural validation of material terms (fail-closed, never repairing). */
export function validateMaterialTerms(terms: MaterialExecutionTerms): MaterialExecutionTerms {
  if (terms === null || typeof terms !== 'object') {
    throw new ValidationError('material terms must be a MaterialExecutionTerms object');
  }
  if (materialTermCoverage(terms).length === 0) {
    throw new ValidationError(
      'material terms must cover at least one axis — a projection bound to nothing covers nothing',
    );
  }
  if (terms.route !== undefined) {
    if (!Array.isArray(terms.route) || terms.route.length === 0) {
      throw new ValidationError('terms.route, when covered, must be a non-empty chain');
    }
    for (const hop of terms.route) {
      if (typeof hop !== 'string' || hop.length === 0) {
        throw new ValidationError('terms.route entries must be non-empty strings');
      }
    }
  }
  if (terms.destinationId !== undefined && (typeof terms.destinationId !== 'string' || terms.destinationId.length === 0)) {
    throw new ValidationError('terms.destinationId must be a non-empty string');
  }
  if (terms.asset !== undefined && (typeof terms.asset !== 'string' || terms.asset.length === 0)) {
    throw new ValidationError('terms.asset must be a non-empty currency/asset symbol');
  }
  if (terms.amountMinor !== undefined) {
    if (typeof terms.amountMinor !== 'bigint' || terms.amountMinor <= 0n) {
      throw new ValidationError('terms.amountMinor must be a positive bigint (exact money)');
    }
  }
  if (terms.riskEpochRef !== undefined && (typeof terms.riskEpochRef !== 'string' || terms.riskEpochRef.length === 0)) {
    throw new ValidationError('terms.riskEpochRef must be a non-empty reference');
  }
  if (terms.observationPins !== undefined) {
    if (!Array.isArray(terms.observationPins) || terms.observationPins.length === 0) {
      throw new ValidationError(
        'terms.observationPins, when covered, must be a non-empty pin list',
      );
    }
    for (const pin of terms.observationPins) {
      if (
        pin === null ||
        typeof pin !== 'object' ||
        typeof pin.instanceId !== 'string' ||
        typeof pin.observationVersion !== 'number'
      ) {
        throw new ValidationError('terms.observationPins entries must be version pins');
      }
    }
  }
  if (terms.quoteRefs !== undefined) {
    if (!Array.isArray(terms.quoteRefs) || terms.quoteRefs.length === 0) {
      throw new ValidationError('terms.quoteRefs, when covered, must be a non-empty list');
    }
    for (const ref of terms.quoteRefs) {
      if (typeof ref !== 'string' || ref.length === 0) {
        throw new ValidationError('terms.quoteRefs entries must be non-empty strings');
      }
    }
  }
  return terms;
}

/** The canonical per-axis digest of a terms object (only covered axes). */
export function materialTermAxisDigests(
  terms: MaterialExecutionTerms,
): Readonly<Record<string, string>> {
  const digests: Record<string, string> = {};
  if (terms.route !== undefined) {
    digests['ROUTE'] = canonicalDigest(terms.route);
  }
  if (terms.destinationId !== undefined) {
    digests['DESTINATION'] = canonicalDigest(terms.destinationId);
  }
  if (terms.asset !== undefined) {
    digests['ASSET'] = canonicalDigest(terms.asset);
  }
  if (terms.amountMinor !== undefined) {
    digests['AMOUNT'] = canonicalDigest(terms.amountMinor);
  }
  if (terms.riskEpochRef !== undefined) {
    digests['RISK'] = canonicalDigest(terms.riskEpochRef);
  }
  if (terms.observationPins !== undefined) {
    digests['CAPABILITY_OBSERVATIONS'] = canonicalDigest(
      terms.observationPins.map((pin) => [pin.instanceId, pin.observationVersion]),
    );
  }
  if (terms.quoteRefs !== undefined) {
    digests['QUOTE'] = canonicalDigest(terms.quoteRefs);
  }
  return digests;
}

/** The canonical digest of a terms object's covered axes (byte-stable). */
export function materialTermsDigest(terms: MaterialExecutionTerms): string {
  return canonicalDigest(materialTermAxisDigests(terms));
}

/**
 * Deterministically diff two terms objects. A change is reported on an axis
 * iff BOTH sides cover the axis AND the digests differ — an axis only the
 * NEW terms cover is not a change of the old terms (it is new coverage; the
 * caller decides whether to re-project). Axes covered by the OLD terms but
 * absent in the new terms are reported as changes (dropped coverage is a
 * material change).
 */
export function diffMaterialTerms(
  before: MaterialExecutionTerms,
  after: MaterialExecutionTerms,
  detectedAt: TimestampMs,
): MaterialTermChange {
  const beforeDigests = materialTermAxisDigests(before);
  const afterDigests = materialTermAxisDigests(after);
  const changed: MaterialTermAxis[] = [];
  const beforeChanged: Record<string, string> = {};
  const afterChanged: Record<string, string> = {};
  for (const axis of Object.keys(beforeDigests)) {
    const afterDigest = afterDigests[axis];
    if (afterDigest === undefined || afterDigest !== beforeDigests[axis]) {
      changed.push(axis as MaterialTermAxis);
      beforeChanged[axis] = beforeDigests[axis] as string;
      afterChanged[axis] = afterDigest ?? 'DROPPED';
    }
  }
  return Object.freeze({
    changedAxes: Object.freeze(changed.sort()),
    before: Object.freeze(beforeChanged),
    after: Object.freeze(afterChanged),
    detectedAt,
  });
}

/**
 * Whether a change record affects a projection's terms: true iff any CHANGED
 * axis is covered by the projection's terms with a DIFFERENT digest (or the
 * coverage was dropped). This is the LAW 2 matching function.
 */
export function changeAffectsTerms(
  change: MaterialTermChange,
  projectionTerms: MaterialExecutionTerms,
): boolean {
  const projectionDigests = materialTermAxisDigests(projectionTerms);
  for (const axis of change.changedAxes) {
    const projected = projectionDigests[axis];
    if (projected !== undefined) {
      // The projection covers this axis and the world changed under it.
      if ((change.after[axis] ?? 'DROPPED') !== projected) {
        return true;
      }
    }
  }
  return false;
}
