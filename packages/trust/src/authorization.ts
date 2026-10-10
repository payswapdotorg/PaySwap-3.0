/**
 * Deterministic authorization evaluation (adapted from payswap.org@8a735bf
 * packages/trust/src/authorization.ts; artifact section moved to
 * approval-artifacts.ts). evaluate() is a pure function — the same request,
 * grants and epoch state always produce the same decision; no wall-clock
 * time, randomness or external systems. Fail-closed: a mandate dimension
 * that cannot be verified from the request context is NOT permitted.
 *
 * PaySwap 3.0 changes (docs/trust-evidence/BASELINE-VERIFICATION-RECORD.md):
 * internal canonical-integer money ops (reversed dependency removed; TB-7);
 * optional networkEpoch authority in EpochState enforces the TB-5 linkage
 * in-engine (stale stamps die; future stamps fail closed as forged); policy
 * refs cite canonical INV-* / TB-* ids.
 */

import type {
  Mandate,
  PermissionGrant,
  ResourceRef,
} from "./mandate.ts";
import type { AmountSpec } from "./amount-spec.ts";
import { matchesActionPattern, matchesResourcePattern } from "./mandate.ts";
import { validateAmountSpec } from "./amount-spec.ts";
import { addCanonicalMinorUnits, compareCanonicalMinorUnits } from "./minor-units.ts";
import type { Principal } from "./principal.ts";
import { principalRef } from "./principal.ts";
import type { EpochLedger, SecurityEpochAuthority } from "./security-epoch.ts";
import { StaleEpochError, checkEpoch } from "./security-epoch.ts";
import type { ScopedGrantRegistry } from "./grants.ts";
import { scopedExecutionGate } from "./scoped-gate.ts";

/** Context evidence presented with an authorization request. */
export interface AuthorizationContext {
  readonly amount?: AmountSpec;
  readonly rail?: string;
  readonly country?: string;
  readonly beneficiary?: string;
}

/** A request for authorization of one action on one resource. */
export interface AuthorizationRequest {
  readonly principal: Principal;
  readonly action: string;
  readonly resource: ResourceRef;
  readonly context: AuthorizationContext;
  readonly requestHash: string;
  readonly requestedAt: number;
}

export type DenyReason =
  | "stale_security_epoch"
  | "invalid_epoch_stamp"
  | "mandate_expired"
  | "action_not_permitted"
  | "resource_not_permitted"
  | "scope_not_permitted"
  | "per_transaction_limit_currency_mismatch"
  | "per_transaction_limit_exceeded"
  | "velocity_count_exceeded"
  | "velocity_amount_exceeded"
  | "no_matching_grant"
  | "scoped_grant_revoked"
  | "scoped_grant_expired";

/**
 * Specification of the approval needed to proceed (a signed approval
 * artifact — TB-4 — is what satisfies it, never a chat message).
 */
export interface ApprovalSpec {
  readonly approverRef: string;
  readonly requestHash: string;
  readonly scope: {
    readonly actions: readonly string[];
    readonly resources: readonly ResourceRef[];
    readonly maxAmount?: AmountSpec;
  };
  readonly expiresAt: number;
}

export type AuthorizationDecision =
  | { readonly decision: "ALLOW"; readonly evidenceRefs: readonly string[] }
  | { readonly decision: "DENY"; readonly reason: DenyReason; readonly policyRefs: readonly string[] }
  | { readonly decision: "NEEDS_APPROVAL"; readonly approvalSpec: ApprovalSpec };

/** Prior authorized activity, used for deterministic velocity evaluation. */
export interface UsageRecord {
  readonly granteeRef: string;
  readonly occurredAt: number;
  readonly amount?: AmountSpec;
}

/**
 * Evaluation state. Absent optional members ⇒ Stage-0 semantics unchanged.
 * Supplied networkEpoch ⇒ the TB-5 mandate-stamp gate runs inside evaluate().
 * Supplied scopedGrants ⇒ every covering scoped execution grant must be live
 * at `requestedAt`, else fail closed.
 */
export interface EpochState {
  readonly ledger: EpochLedger;
  readonly networkEpoch?: SecurityEpochAuthority;
  readonly usage?: readonly UsageRecord[];
  readonly scopedGrants?: ScopedGrantRegistry;
}

type MandateOutcome =
  | { readonly kind: "allow" }
  | { readonly kind: "deny"; readonly reason: DenyReason; readonly rank: number }
  | { readonly kind: "needs_approval"; readonly approverRef: string };

function deny(reason: DenyReason, rank: number): MandateOutcome {
  return { kind: "deny", reason, rank };
}

/**
 * Canonical policy references per deny reason: PaySwap 3.0 invariant ids
 * (spec/architecture/INVARIANTS.md) and trust-boundary law ids (TB-*,
 * spec/trust/TRUST-BOUNDARY.md).
 */
function invariantRefs(reason: DenyReason): readonly string[] {
  switch (reason) {
    case "stale_security_epoch":
      return ["TB-2", "INV-05"];
    case "invalid_epoch_stamp":
      return ["TB-5", "INV-05"];
    case "scoped_grant_revoked":
    case "scoped_grant_expired":
      return ["TB-2", "INV-05"];
    case "per_transaction_limit_exceeded":
    case "velocity_count_exceeded":
    case "velocity_amount_exceeded":
      return ["TB-8"];
    case "per_transaction_limit_currency_mismatch":
      return ["TB-8", "INV-2"];
    default:
      return ["TB-1"];
  }
}

function limitOutcome(mandate: Mandate, reason: DenyReason, rank: number): MandateOutcome {
  if (mandate.escalation?.onLimitExceeded === "require_approval") {
    return {
      kind: "needs_approval",
      approverRef: mandate.escalation.approverRef ?? mandate.grantor,
    };
  }
  return deny(reason, rank);
}

function evaluateMandate(
  request: AuthorizationRequest,
  granteeRef: string,
  mandate: Mandate,
  usage: readonly UsageRecord[],
): MandateOutcome {
  const context = request.context;

  if (request.requestedAt >= mandate.expiresAt) {
    return deny("mandate_expired", 0);
  }
  if (!mandate.actions.some((pattern) => matchesActionPattern(pattern, request.action))) {
    return deny("action_not_permitted", 1);
  }
  if (!mandate.resources.some((pattern) => matchesResourcePattern(pattern, request.resource))) {
    return deny("resource_not_permitted", 2);
  }

  // Scope dimensions: fail closed when a restricted dimension has no evidence.
  if (mandate.rails !== undefined && (context.rail === undefined || !mandate.rails.includes(context.rail))) {
    return deny("scope_not_permitted", 3);
  }
  if (
    mandate.currencies !== undefined &&
    (context.amount === undefined || !mandate.currencies.includes(context.amount.currency))
  ) {
    return deny("scope_not_permitted", 3);
  }
  if (
    mandate.countries !== undefined &&
    (context.country === undefined || !mandate.countries.includes(context.country))
  ) {
    return deny("scope_not_permitted", 3);
  }
  if (
    mandate.beneficiaries !== undefined &&
    (context.beneficiary === undefined || !mandate.beneficiaries.includes(context.beneficiary))
  ) {
    return deny("scope_not_permitted", 3);
  }

  const limits = mandate.limits;

  // Per-transaction limit. An action without an amount carries no per-transaction
  // value to bound; a limit in a different currency can never bound this amount.
  const perTransaction = limits?.perTransactionAmount;
  if (perTransaction !== undefined && context.amount !== undefined) {
    validateAmountSpec(context.amount);
    validateAmountSpec(perTransaction);
    if (context.amount.currency !== perTransaction.currency) {
      return deny("per_transaction_limit_currency_mismatch", 4);
    }
    if (compareCanonicalMinorUnits(context.amount.minorUnits, perTransaction.minorUnits) > 0) {
      return limitOutcome(mandate, "per_transaction_limit_exceeded", 5);
    }
  }

  // Velocity limit over the sliding window ending at requestedAt. The running
  // sum and the bound are exact integer operations on the canonical wire form
  // (internal minor-units helpers; the money domain stays with the financial
  // lane — TB-7).
  const velocity = limits?.velocity;
  if (velocity !== undefined) {
    const windowStart = request.requestedAt - velocity.windowMs;
    const inWindow = usage.filter(
      (record) =>
        record.granteeRef === granteeRef &&
        record.occurredAt > windowStart &&
        record.occurredAt <= request.requestedAt,
    );
    if (velocity.maxCount !== undefined && inWindow.length + 1 > velocity.maxCount) {
      return limitOutcome(mandate, "velocity_count_exceeded", 6);
    }
    const maxAmount = velocity.maxAmount;
    if (maxAmount !== undefined && context.amount !== undefined) {
      validateAmountSpec(context.amount);
      validateAmountSpec(maxAmount);
      if (context.amount.currency !== maxAmount.currency) {
        return deny("per_transaction_limit_currency_mismatch", 4);
      }
      let sum = context.amount.minorUnits;
      for (const record of inWindow) {
        if (record.amount !== undefined && record.amount.currency === maxAmount.currency) {
          validateAmountSpec(record.amount);
          sum = addCanonicalMinorUnits(sum, record.amount.minorUnits);
        }
      }
      if (compareCanonicalMinorUnits(sum, maxAmount.minorUnits) > 0) {
        return limitOutcome(mandate, "velocity_amount_exceeded", 6);
      }
    }
  }

  return { kind: "allow" };
}

/**
 * Deterministically evaluate an authorization request against grants and
 * epoch state.
 *
 * Decision precedence: ALLOW (first fully-authorizing grant in array order)
 * beats NEEDS_APPROVAL, which beats the most informative DENY. A stale
 * credential epoch denies immediately, before any mandate is considered
 * (TB-2); with a network epoch authority supplied, a mandate stamped at a
 * non-current epoch is dead for this decision (TB-5).
 */
export function evaluate(
  request: AuthorizationRequest,
  grants: readonly PermissionGrant[],
  epochState: EpochState,
): AuthorizationDecision {
  try {
    checkEpoch(request.principal, epochState.ledger);
  } catch (error) {
    if (error instanceof StaleEpochError) {
      return {
        decision: "DENY",
        reason: "stale_security_epoch",
        policyRefs: [`principal:${error.principalRef}`, ...invariantRefs("stale_security_epoch")],
      };
    }
    throw error;
  }

  const ref = principalRef(request.principal);
  const usage = epochState.usage ?? [];
  const networkEpoch = epochState.networkEpoch;
  const currentNetworkEpoch = networkEpoch?.currentEpoch().value;

  let firstNeedsApproval: ApprovalSpec | undefined;
  let bestDeny: { reason: DenyReason; rank: number; policyRefs: readonly string[] } | undefined;

  for (const grant of grants) {
    if (grant.granteeRef !== ref) {
      continue;
    }
    const mandateRef = `mandate:${grant.mandate.id}@${grant.mandate.version}`;

    // TB-5 linkage gate: a mandate lives only in its issuance epoch.
    // (Stamp staleness is the TB-5 linkage law — distinct from the TB-2
    // credential-epoch check that runs before the grant loop, though both
    // surface as stale_security_epoch.)
    if (currentNetworkEpoch !== undefined) {
      const stamp = grant.mandate.issuedAtEpoch;
      if (stamp > currentNetworkEpoch) {
        if (bestDeny === undefined || 0 > bestDeny.rank) {
          bestDeny = {
            reason: "invalid_epoch_stamp",
            rank: 0,
            policyRefs: [mandateRef, ...invariantRefs("invalid_epoch_stamp")],
          };
        }
        continue;
      }
      if (stamp < currentNetworkEpoch) {
        if (bestDeny === undefined || 0 > bestDeny.rank) {
          bestDeny = {
            reason: "stale_security_epoch",
            rank: 0,
            policyRefs: [mandateRef, "TB-5", "INV-05"],
          };
        }
        continue;
      }
    }

    const outcome = evaluateMandate(request, ref, grant.mandate, usage);
    if (outcome.kind === "allow") {
      const registry = epochState.scopedGrants;
      if (registry !== undefined) {
        const gate = scopedExecutionGate(
          request.action,
          request.resource,
          request.requestedAt,
          registry,
          grant.mandate,
        );
        if (!gate.pass) {
          // Scoped-execution rank 7 outranks every mandate deny rank, so a dead
          // scoped path is always the most informative deny in the final answer.
          if (bestDeny === undefined || 7 > bestDeny.rank) {
            bestDeny = {
              reason: gate.reason,
              rank: 7,
              policyRefs: [mandateRef, ...invariantRefs(gate.reason)],
            };
          }
          continue;
        }
        const vouching = gate.vouchingGrant;
        return {
          decision: "ALLOW",
          evidenceRefs: [
            `grant:${grant.grantId}`,
            mandateRef,
            `lineage:${[grant.lineage.rootGrantId, ...grant.lineage.chain, grant.grantId].join(">")}`,
            `request:${request.requestHash}`,
            ...(vouching !== undefined ? [`scopedGrant:${vouching.id}`] : []),
            ...(currentNetworkEpoch !== undefined ? [`epoch:${currentNetworkEpoch}`] : []),
          ],
        };
      }
      return {
        decision: "ALLOW",
        evidenceRefs: [
          `grant:${grant.grantId}`,
          mandateRef,
          `lineage:${[grant.lineage.rootGrantId, ...grant.lineage.chain, grant.grantId].join(">")}`,
          `request:${request.requestHash}`,
          ...(currentNetworkEpoch !== undefined ? [`epoch:${currentNetworkEpoch}`] : []),
        ],
      };
    }
    if (outcome.kind === "needs_approval") {
      if (firstNeedsApproval === undefined) {
        firstNeedsApproval = {
          approverRef: outcome.approverRef,
          requestHash: request.requestHash,
          scope: {
            actions: [request.action],
            resources: [request.resource],
            ...(request.context.amount !== undefined
              ? { maxAmount: request.context.amount }
              : {}),
          },
          expiresAt: grant.mandate.expiresAt,
        };
      }
      continue;
    }
    if (bestDeny === undefined || outcome.rank > bestDeny.rank) {
      bestDeny = {
        reason: outcome.reason,
        rank: outcome.rank,
        policyRefs: [mandateRef, ...invariantRefs(outcome.reason)],
      };
    }
  }

  if (firstNeedsApproval !== undefined) {
    return { decision: "NEEDS_APPROVAL", approvalSpec: firstNeedsApproval };
  }
  if (bestDeny !== undefined) {
    return { decision: "DENY", reason: bestDeny.reason, policyRefs: bestDeny.policyRefs };
  }
  return {
    decision: "DENY",
    reason: "no_matching_grant",
    policyRefs: [`principal:${ref}`],
  };
}
