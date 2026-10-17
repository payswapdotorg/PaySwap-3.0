/**
 * @payswap/onchain-security — structural pin: the mandate model
 * (action patterns, limits, the parent-mandate substrate of scoped
 * signing delegation) (R2-W2).
 *
 * LAYER LAW: zero sibling imports. Mandates are owned by the trust lane
 * (packages/trust/src/mandate.ts, P1-W3); this file pins the shapes the
 * security plane needs for ATTENUATION CHECKS (INV-12: a child signing
 * delegation must be strictly narrower than its parent mandate) —
 * structurally identical to the real Mandate, so a real trust Mandate
 * satisfies this pin by construction.
 *
 * `validateActionPattern` / `matchesActionPattern` / `actionPatternCoveredBy`
 * mirror the trust lane's helpers verbatim (dotted action ids with a
 * single trailing `*` wildcard).
 */

import { ValidationError } from "./errors.ts";
import type { MandateRef } from "./principal.ts";

/** Trust action pattern: a concrete action id, or one ending in `*`. */
export type ActionPattern = string;

/** The wildcard marker (trailing only). */
export const ACTION_WILDCARD = "*";

/** Per-mandate limits (all optional; absent = unrestricted on that axis). */
export interface MandateLimits {
  readonly perTransactionAmount?: { readonly currency: string; readonly minorUnits: string };
  readonly perDayAmount?: { readonly currency: string; readonly minorUnits: string };
  readonly maxTransactionCount?: number;
}

/** Escalation policy of a mandate (who approves out-of-scope requests). */
export interface EscalationPolicy {
  readonly approverRef: string;
  readonly description?: string;
}

/**
 * A mandate: the trust lane's delegated-power instrument. A signing
 * delegation (src/delegation.ts) is always derived FROM one of these and
 * must be strictly narrower on every dimension the parent speaks (INV-12).
 */
export interface Mandate {
  readonly id: string;
  readonly version: number;
  readonly grantor: string;
  readonly grantee: string;
  readonly actions: readonly ActionPattern[];
  readonly resources: readonly { readonly type: string; readonly resourceId?: string }[];
  /** Permitted rails (a chain IS an onchain rail value — INV-17). */
  readonly rails?: readonly string[];
  /** Permitted currency symbols (3-letter codes). */
  readonly currencies?: readonly string[];
  readonly countries?: readonly string[];
  /** Permitted beneficiaries (destination allowlist). */
  readonly beneficiaries?: readonly string[];
  readonly limits?: MandateLimits;
  readonly costCaps?: { readonly maxTotalCost?: { readonly currency: string; readonly minorUnits: string } };
  readonly expiresAt: number;
  readonly escalation?: EscalationPolicy;
  readonly proofRequirements: readonly string[];
  /** Network security epoch at issuance (linkage stamp). */
  readonly issuedAtEpoch: bigint;
  /** Lineage to the mandate this one was attenuated from, when derived. */
  readonly parentMandate?: MandateRef;
}

/** Fail closed on a malformed action pattern. */
export function validateActionPattern(pattern: ActionPattern): void {
  if (pattern.length === 0) {
    throw new ValidationError("action pattern must not be empty");
  }
  if (pattern.includes(ACTION_WILDCARD) && !pattern.endsWith(ACTION_WILDCARD)) {
    throw new ValidationError(
      `action pattern '${pattern}' may only carry a trailing wildcard`,
    );
  }
}

/** Does a concrete action match one pattern (trailing-`*` prefix match)? */
export function matchesActionPattern(pattern: ActionPattern, action: string): boolean {
  validateActionPattern(pattern);
  if (action.includes(ACTION_WILDCARD)) {
    throw new ValidationError(
      `concrete action must not contain a wildcard: '${action}'`,
    );
  }
  if (pattern.endsWith(ACTION_WILDCARD)) {
    return action.startsWith(pattern.slice(0, -1));
  }
  return pattern === action;
}

/**
 * Is the CHILD pattern covered by the PARENT pattern (attenuation
 * semantics)? A wildcard parent covers concrete children; a concrete
 * child is never covered by a narrower concrete parent.
 */
export function actionPatternCoveredBy(child: ActionPattern, parent: ActionPattern): boolean {
  validateActionPattern(child);
  validateActionPattern(parent);
  const childPrefix = child.endsWith(ACTION_WILDCARD) ? child.slice(0, -1) : undefined;
  const parentPrefix = parent.endsWith(ACTION_WILDCARD) ? parent.slice(0, -1) : undefined;
  if (childPrefix === undefined) {
    if (parentPrefix === undefined) {
      return child === parent;
    }
    return child.startsWith(parentPrefix);
  }
  if (parentPrefix === undefined) {
    return false;
  }
  return childPrefix.startsWith(parentPrefix);
}
