/**
 * Exact monetary amount for agent-domain contracts (budgets, session keys).
 * Floating-point money is forbidden (INV-2: exact/lossless monetary
 * representation only).
 *
 * The canonical AmountSpec wire TYPE is owned by @payswap/trust
 * (packages/trust/src/amount-spec.ts, the pinned cross-lane wire format:
 * `{ currency: /^[A-Z]{3}$/, minorUnits: /^(0|[1-9][0-9]*)$/ }`). This
 * package consumes it TYPE-ONLY via tsconfig paths — the single accepted
 * sibling-import pattern (mirroring packages/capability) — and re-exports
 * it to preserve the Stage-0 @payswap/agents export surface. Money
 * ARITHMETIC stays with the financial protocol lane (INV-1 single financial
 * authority); the internal exact-integer ordering helpers used by the
 * organization budget ledger (src/organization/budget.ts) are deliberately
 * NOT exported.
 */

import type { AmountSpec } from "@payswap/trust";

export type { AmountSpec };
