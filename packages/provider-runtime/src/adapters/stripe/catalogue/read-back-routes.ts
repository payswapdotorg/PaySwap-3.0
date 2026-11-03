/**
 * @payswap/provider-runtime — the rule-derived READ-BACK ROUTES (P25).
 *
 * Handoff §4.3: every state-changing operation pairs with the catalogue
 * operation that verifies its effect (the frozen StripePreparedAction carries
 * it as readBackOperationId). P24 reviewed 18 routes by hand for the 22
 * implemented writes; the P25 full-coverage flip (631 dispatchable
 * operations, 347 of them writes) makes hand-listing unmaintainable — the
 * routes are now DERIVED from the pinned inventory's path geometry, with the
 * reviewed P24 table kept as the override where review diverged from the
 * rule, and explicit reviewed nulls for one-shot surfaces.
 *
 * THE DERIVATION (path geometry, never semantics guessed):
 * - a GET resolves to null (reads verify themselves);
 * - the reviewed override table wins first (including its honest nulls);
 * - an operation whose path ends in a path parameter (update/delete) reads
 *   back through the SAME-path GET;
 * - an operation at a collection (create) or a named sub-action reads back
 *   through, in order: the object GET one path-param deeper, the same-path
 *   GET, then the parent path's object GET / same-path GET;
 * - no candidate → null (never an invented verification).
 */

import type { StripeCatalogueOperation } from './generator.ts';

/** The pinned inventory artifact, imported as committed data (module asset). */
import inventoryJson from './operations.json' with { type: 'json' };

/** The reviewed P24 read-back overrides (kept verbatim — the derivation
 *  honors them first, including the honest nulls for one-shot surfaces). */
export const STRIPE_P24_READ_BACK_ROUTES: Readonly<Record<string, string | null>> = Object.freeze({
  PostCustomers: 'GetCustomersCustomer',
  PostCustomersCustomer: 'GetCustomersCustomer',
  PostPaymentIntents: 'GetPaymentIntentsIntent',
  PostPaymentIntentsIntentConfirm: 'GetPaymentIntentsIntent',
  PostSetupIntents: 'GetSetupIntentsIntent',
  PostSetupIntentsIntentConfirm: 'GetSetupIntentsIntent',
  PostCheckoutSessions: 'GetCheckoutSessionsSession',
  PostPaymentLinks: 'GetPaymentLinksPaymentLink',
  PostPaymentLinksPaymentLink: 'GetPaymentLinksPaymentLink',
  PostProducts: 'GetProductsId',
  PostProductsId: 'GetProductsId',
  DeleteProductsId: 'GetProductsId',
  PostPrices: 'GetPricesPrice',
  PostInvoices: 'GetInvoicesInvoice',
  PostSubscriptions: 'GetSubscriptionsSubscriptionExposedId',
  PostRefunds: 'GetRefundsRefund',
  PostChargesChargeCapture: 'GetChargesCharge',
  // A billing-portal session is a one-shot hosted URL: there is no
  // retrieve route — the honest null (never an invented verification).
  PostBillingPortalSessions: null,
});

interface InventoryFile {
  operations: StripeCatalogueOperation[];
}

const INVENTORY = inventoryJson as InventoryFile;

/** GET operations indexed by exact path (there is at most one per path). */
const GET_BY_PATH: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const operation of INVENTORY.operations) {
    if (operation.method !== 'GET') continue;
    // First GET wins on the (never-observed) collision; deterministic.
    if (!map.has(operation.path)) map.set(operation.path, operation.operationId);
  }
  return map;
})();

/** Paths that end with a path parameter, e.g. `/v1/customers/{customer}`. */
function endsWithPathParameter(path: string): boolean {
  return /\/\{[^}]+\}$/.test(path);
}

/** Strip the final path segment (`/v1/a/{id}/confirm` → `/v1/a/{id}`). */
function parentPathOf(path: string): string | null {
  const index = path.lastIndexOf('/');
  if (index <= 0) return null;
  return path.slice(0, index);
}

/** The GET operation at `path`, if any. */
function getAt(path: string): string | null {
  return GET_BY_PATH.get(path) ?? null;
}

/** Any GET one path-parameter deeper than `path` (the object GET). */
function objectGetUnder(path: string): string | null {
  for (const [candidatePath, operationId] of GET_BY_PATH) {
    if (
      candidatePath.startsWith(`${path}/`) &&
      endsWithPathParameter(candidatePath) &&
      candidatePath.split('/').length === path.split('/').length + 1
    ) {
      return operationId;
    }
  }
  return null;
}

/** The candidate search order for one derivation level. */
function candidatesAtLevel(path: string): readonly (string | null)[] {
  return [objectGetUnder(path), getAt(path)];
}

/** Resolve the read-back operation for ANY catalogue operation (null = none). */
export function stripeReadBackOperationOf(operationId: string): string | null {
  const reviewed = STRIPE_P24_READ_BACK_ROUTES[operationId];
  if (reviewed !== undefined) return reviewed;
  const operation = INVENTORY.operations.find((op) => op.operationId === operationId);
  if (operation === undefined || operation.method === 'GET') return null;
  const path = operation.path;
  if (endsWithPathParameter(path)) {
    // Update/delete: the same-path GET verifies the object's new state.
    const samePath = getAt(path);
    if (samePath !== null) return samePath;
    const parent = parentPathOf(path);
    if (parent === null) return null;
    for (const candidate of candidatesAtLevel(parent)) {
      if (candidate !== null) return candidate;
    }
    return null;
  }
  // Create at a collection, or a named sub-action: prefer the object GET
  // one param deeper (the created/affected object), then the same-path GET,
  // then the parent level's candidates.
  for (const candidate of candidatesAtLevel(path)) {
    if (candidate !== null) return candidate;
  }
  const parent = parentPathOf(path);
  if (parent === null) return null;
  for (const candidate of candidatesAtLevel(parent)) {
    if (candidate !== null) return candidate;
  }
  return null;
}
