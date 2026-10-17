/**
 * @payswap/execution-graph — the execution-mode vocabulary pin (P3-W2).
 *
 * The vocabulary is OWNED by @payswap/capability (EXECUTION_MODES,
 * src/execution-modes.ts, INV-15). This package may reference that lane
 * TYPE-ONLY, so the RUNTIME list is pinned locally: the typed constant
 * below is assignable to (and exhausts) the capability lane's ExecutionMode
 * union — a compile-time pin, never a second vocabulary.
 *
 * Canonical citations: INV-15 (provider-native execution remains a
 * candidate baseline — PASS_THROUGH_NATIVE is never structurally
 * disadvantaged); no mode bypasses the authorization-projection + evidence
 * boundary (old INV-C07/F06 law preserved in projected form).
 */

import type { ExecutionMode } from '@payswap/capability';

/**
 * The pinned execution-mode list (mirrors @payswap/capability
 * EXECUTION_MODES 1:1; the type annotation is the pin).
 */
export const EXECUTION_MODES_LOCAL: readonly ExecutionMode[] = [
  'PASS_THROUGH_NATIVE',
  'COMPOSED_PAYSWAP',
  'OPTIMIZED_MULTI_PROVIDER',
];

/** Total predicate over the pinned vocabulary (local runtime guard). */
export function isExecutionMode(value: unknown): value is ExecutionMode {
  return (
    typeof value === 'string' &&
    (EXECUTION_MODES_LOCAL as readonly unknown[]).includes(value)
  );
}
