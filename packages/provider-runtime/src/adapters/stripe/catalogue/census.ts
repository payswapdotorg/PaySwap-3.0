/**
 * @payswap/provider-runtime — the Stripe operation CENSUS reader (P24-0).
 *
 * The single authoritative join point: pinned inventory (generated) ×
 * PaySwap safety overlay (reviewed) → the per-operation census record that
 * the host, the tool registry and the tests consume. LAWS:
 * - Every operation in the inventory resolves to EXACTLY ONE census record
 *   (the census test asserts totality + uniqueness — handoff §13.1).
 * - No operation dispatches unless its overlay support state is an
 *   IMPLEMENTED state (UNKNOWN OVERLAY = DENY).
 * - The reader is synchronous and deterministic: the inventory is committed
 *   data imported as a module asset, never fetched.
 */

import type { StripeCatalogueOperation } from './generator.ts';
import { generateStripeOperationInventory } from './generator.ts';
import { STRIPE_OPENAPI_PIN, STRIPE_OPENAPI_PIN_COUNTS } from './spec-pin.ts';
import {
  stripeOverlayFor,
  stripeOverlayDispatchAllowed,
  type StripeOperationOverlay,
} from './overlay.ts';
import { stripeResourcePackOf, type StripeResourcePackId } from './resource-packs.ts';

/** The pinned inventory artifact, imported as committed data. */
import inventoryJson from './operations.json' with { type: 'json' };

/** The inventory file's top-level shape (the generator's output contract). */
interface InventoryFile {
  specInfoVersion: string;
  generatorId: string;
  operationCount: number;
  namespaceCounts: { v1: number; v2: number };
  operations: StripeCatalogueOperation[];
}

const INVENTORY = inventoryJson as InventoryFile;

/** One census record: the catalogue operation joined with its overlay. */
export interface StripeOperationCensusRecord extends StripeOperationOverlay {
  readonly apiNamespace: 'v1' | 'v2';
  readonly method: StripeCatalogueOperation['method'];
  readonly path: string;
  readonly pathParams: readonly string[];
  readonly listPaginated: boolean;
  readonly specDigest: string;
  readonly summary: string;
}

/** Verify the committed inventory matches its own pin (fail-closed at load). */
function verifyInventoryAgainstPin(): void {
  if (INVENTORY.specInfoVersion !== STRIPE_OPENAPI_PIN.specInfoVersion) {
    throw new Error(
      `stripe inventory spec version drift: file says ${INVENTORY.specInfoVersion}, ` +
        `pin says ${STRIPE_OPENAPI_PIN.specInfoVersion}`,
    );
  }
  if (INVENTORY.generatorId !== STRIPE_OPENAPI_PIN.generatorId) {
    throw new Error(
      `stripe inventory generator drift: file says ${INVENTORY.generatorId}, ` +
        `pin says ${STRIPE_OPENAPI_PIN.generatorId}`,
    );
  }
  if (INVENTORY.operationCount !== STRIPE_OPENAPI_PIN_COUNTS.operations) {
    throw new Error(
      `stripe inventory operation count drift: file says ${INVENTORY.operationCount}, ` +
        `pin says ${STRIPE_OPENAPI_PIN_COUNTS.operations}`,
    );
  }
  const v2 = INVENTORY.namespaceCounts.v2;
  if (v2 !== STRIPE_OPENAPI_PIN_COUNTS.v2Operations) {
    throw new Error(`stripe inventory v2 count drift: file says ${v2}`);
  }
  const ids = new Set<string>();
  for (const operation of INVENTORY.operations) {
    if (ids.has(operation.operationId)) {
      throw new Error(`duplicate operationId in inventory: ${operation.operationId}`);
    }
    ids.add(operation.operationId);
  }
  if (ids.size !== INVENTORY.operationCount) {
    throw new Error('inventory operationId uniqueness violated');
  }
}

verifyInventoryAgainstPin();

/** The joined census (built once at module load; frozen). */
export const STRIPE_OPERATION_CENSUS: readonly StripeOperationCensusRecord[] = Object.freeze(
  INVENTORY.operations.map((operation) => ({
    ...stripeOverlayFor(operation),
    apiNamespace: operation.apiNamespace,
    method: operation.method,
    path: operation.path,
    pathParams: operation.pathParams,
    listPaginated: operation.listPaginated,
    specDigest: operation.specDigest,
    summary: operation.summary,
  })),
);

const CENSUS_BY_ID: ReadonlyMap<string, StripeOperationCensusRecord> = new Map(
  STRIPE_OPERATION_CENSUS.map((record) => [record.operationId, record]),
);

/** Resolve one census record by Stripe operationId (undefined = unknown → DENY). */
export function stripeCensusRecord(
  operationId: string,
): StripeOperationCensusRecord | undefined {
  return CENSUS_BY_ID.get(operationId);
}

/** May this operation be dispatched today? Unknown ID = false (fail-closed). */
export function stripeCensusDispatchAllowed(operationId: string): boolean {
  const record = CENSUS_BY_ID.get(operationId);
  return record !== undefined && stripeOverlayDispatchAllowed(record);
}

/** Census summary by support state (the coverage report the UI/tests read). */
export function stripeCensusSupportStateCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of STRIPE_OPERATION_CENSUS) {
    counts[record.supportState] = (counts[record.supportState] ?? 0) + 1;
  }
  return Object.freeze(counts);
}

/** Census summary by pack (the product-coverage matrix). */
export function stripeCensusPackCounts(): Record<StripeResourcePackId, number> {
  const counts = {} as Record<StripeResourcePackId, number>;
  for (const record of STRIPE_OPERATION_CENSUS) {
    const pack = stripeResourcePackOf(record.path);
    if (pack !== undefined) counts[pack] = (counts[pack] ?? 0) + 1;
  }
  return Object.freeze(counts);
}

/** The pinned inventory metadata (for evidence records). */
export const STRIPE_CENSUS_PIN = Object.freeze({
  releaseTag: STRIPE_OPENAPI_PIN.releaseTag,
  releaseCommitSha: STRIPE_OPENAPI_PIN.releaseCommitSha,
  specInfoVersion: STRIPE_OPENAPI_PIN.specInfoVersion,
  specSha256: STRIPE_OPENAPI_PIN.specSha256,
  generatorId: STRIPE_OPENAPI_PIN.generatorId,
  operationCount: INVENTORY.operationCount,
  namespaceCounts: { ...INVENTORY.namespaceCounts },
});

export { generateStripeOperationInventory };
export type { StripeCatalogueOperation };
