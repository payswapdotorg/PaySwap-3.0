/**
 * @payswap/provider-runtime — the composed canonical payment-provider
 * registry (P14-C, ADR-0008 D5).
 *
 * The registry is COMPOSED DATA: each provider owns its declaration in
 * its own adapter directory (the vertical-slice law); this module is the
 * single canonical list the runtime and the desktop pins mirror. Adding
 * a provider means adding its declaration file and one entry here — no
 * shared-contract change.
 *
 * CURRENT ENTRIES:
 * - stripe       — CONFIGURED own-store test mode (read-only + the P14-A
 *                  execution surface) + the declared-but-unconfigured
 *                  OAuth/Connect forms.
 * - flutterwave  — CONFIGURED own-store test mode (read-only balances).
 * - paystack     — CONFIGURED own-store test mode (read-only
 *                  transactions).
 * - mtn-momo     — UNCONFIGURED typed prerequisite (invalid credentials
 *                  as delivered; no adapter).
 */

import type { PaymentProviderRegistryEntry } from './registry-declaration.ts';
import { STRIPE_REGISTRY_ENTRY } from './stripe/declaration.ts';
import { FLUTTERWAVE_REGISTRY_ENTRY } from './flutterwave/declaration.ts';
import { PAYSTACK_REGISTRY_ENTRY } from './paystack/declaration.ts';
import { MTN_MOMO_REGISTRY_ENTRY } from './mtn-momo/declaration.ts';

/**
 * The canonical payment-provider registry (frozen composition of the
 * per-provider declarations; each entry is validated at its module load).
 */
export const PAYMENT_PROVIDER_REGISTRY: readonly PaymentProviderRegistryEntry[] = Object.freeze([
  STRIPE_REGISTRY_ENTRY,
  FLUTTERWAVE_REGISTRY_ENTRY,
  PAYSTACK_REGISTRY_ENTRY,
  MTN_MOMO_REGISTRY_ENTRY,
]);
