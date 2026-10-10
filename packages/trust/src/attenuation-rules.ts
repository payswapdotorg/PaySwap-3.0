/**
 * INTERNAL per-dimension narrowing rules for delegation attenuation
 * (INV-12 / TB-3; split from attenuation.ts to respect the <=400-line file
 * law). This module owns the AttenuationViolationError contract, the
 * scope/amount narrowing assertions and the limits/cost-caps resolvers used
 * by attenuate(). Amount ordering uses the internal canonical-integer
 * helpers (minor-units.ts), never a money API (TB-7).
 */

import type {
  CostCaps,
  EscalationPolicy,
  Mandate,
  MandateLimits,
  VelocityLimit,
} from "./mandate.ts";
import type { AmountSpec } from "./amount-spec.ts";
import type { ChildMandateRequest } from "./attenuation.ts";
import { validateAmountSpec } from "./amount-spec.ts";
import { compareCanonicalMinorUnits } from "./minor-units.ts";

/** Dimensions checked by attenuate(). Part of the error contract. */
export type AttenuationDimension =
  | "actions"
  | "resources"
  | "rails"
  | "currencies"
  | "countries"
  | "beneficiaries"
  | "limits.perTransactionAmount"
  | "limits.velocity.windowMs"
  | "limits.velocity.maxCount"
  | "limits.velocity.maxAmount"
  | "costCaps.maxTotalCost"
  | "costCaps.maxFxSpreadBps"
  | "expiry"
  | "escalation"
  | "proofRequirements";

/** Raised when a child mandate would widen the parent on any dimension (INV-12). */
export class AttenuationViolationError extends Error {
  readonly dimension: AttenuationDimension;

  constructor(dimension: AttenuationDimension, detail: string) {
    super(`Attenuation violation on dimension '${dimension}': ${detail}`);
    this.name = "AttenuationViolationError";
    this.dimension = dimension;
  }
}

export function violate(dimension: AttenuationDimension, detail: string): never {
  throw new AttenuationViolationError(dimension, detail);
}

export function escalationStrength(policy: EscalationPolicy["onLimitExceeded"]): number {
  return policy === "deny" ? 2 : 1;
}

function assertAmountNotWider(
  dimension: AttenuationDimension,
  child: AmountSpec,
  parent: AmountSpec,
): void {
  validateAmountSpec(child);
  validateAmountSpec(parent);
  if (child.currency !== parent.currency) {
    violate(
      dimension,
      `child amount currency ${child.currency} does not match parent currency ${parent.currency}: subset cannot be proven`,
    );
  }
  if (compareCanonicalMinorUnits(child.minorUnits, parent.minorUnits) > 0) {
    violate(
      dimension,
      `child amount ${child.currency} ${child.minorUnits} exceeds parent ${child.currency} ${parent.minorUnits}`,
    );
  }
}

export function assertScopeAttenuated(
  dimension: AttenuationDimension,
  child: readonly string[] | undefined,
  parent: readonly string[] | undefined,
): readonly string[] | undefined {
  if (parent === undefined) {
    return child; // parent unrestricted: any child scope is a narrowing
  }
  if (child === undefined) {
    return parent; // inherit
  }
  for (const item of child) {
    if (!parent.includes(item)) {
      violate(dimension, `'${item}' is not permitted by the parent mandate`);
    }
  }
  return child;
}

export function resolveLimits(
  parent: Mandate,
  request: ChildMandateRequest,
): MandateLimits | undefined {
  const parentLimits = parent.limits;
  const childLimits = request.limits;
  if (parentLimits === undefined) {
    return childLimits; // pure addition of restrictions
  }
  if (childLimits === undefined) {
    return parentLimits; // inherit
  }

  let perTransactionAmount = parentLimits.perTransactionAmount;
  if (childLimits.perTransactionAmount !== undefined) {
    if (parentLimits.perTransactionAmount !== undefined) {
      assertAmountNotWider(
        "limits.perTransactionAmount",
        childLimits.perTransactionAmount,
        parentLimits.perTransactionAmount,
      );
    }
    perTransactionAmount = childLimits.perTransactionAmount;
  }

  let velocity: VelocityLimit | undefined = parentLimits.velocity;
  if (childLimits.velocity !== undefined) {
    const parentVelocity = parentLimits.velocity;
    if (parentVelocity === undefined) {
      velocity = childLimits.velocity;
    } else {
      if (childLimits.velocity.windowMs < parentVelocity.windowMs) {
        violate(
          "limits.velocity.windowMs",
          `child window ${childLimits.velocity.windowMs}ms is shorter than parent window ${parentVelocity.windowMs}ms, which weakens the velocity bound`,
        );
      }
      let maxCount = parentVelocity.maxCount;
      if (childLimits.velocity.maxCount !== undefined) {
        if (
          parentVelocity.maxCount !== undefined &&
          childLimits.velocity.maxCount > parentVelocity.maxCount
        ) {
          violate(
            "limits.velocity.maxCount",
            `child maxCount ${childLimits.velocity.maxCount} exceeds parent maxCount ${parentVelocity.maxCount}`,
          );
        }
        maxCount = childLimits.velocity.maxCount;
      }
      let maxAmount = parentVelocity.maxAmount;
      if (childLimits.velocity.maxAmount !== undefined) {
        if (parentVelocity.maxAmount !== undefined) {
          assertAmountNotWider(
            "limits.velocity.maxAmount",
            childLimits.velocity.maxAmount,
            parentVelocity.maxAmount,
          );
        }
        maxAmount = childLimits.velocity.maxAmount;
      }
      velocity = {
        windowMs: childLimits.velocity.windowMs,
        ...(maxCount !== undefined ? { maxCount } : {}),
        ...(maxAmount !== undefined ? { maxAmount } : {}),
      };
    }
  }

  return {
    ...(perTransactionAmount !== undefined ? { perTransactionAmount } : {}),
    ...(velocity !== undefined ? { velocity } : {}),
  };
}

export function resolveCostCaps(
  parent: Mandate,
  request: ChildMandateRequest,
): CostCaps | undefined {
  const parentCaps = parent.costCaps;
  const childCaps = request.costCaps;
  if (parentCaps === undefined) {
    return childCaps;
  }
  if (childCaps === undefined) {
    return parentCaps;
  }
  let maxTotalCost = parentCaps.maxTotalCost;
  if (childCaps.maxTotalCost !== undefined) {
    if (parentCaps.maxTotalCost !== undefined) {
      assertAmountNotWider(
        "costCaps.maxTotalCost",
        childCaps.maxTotalCost,
        parentCaps.maxTotalCost,
      );
    }
    maxTotalCost = childCaps.maxTotalCost;
  }
  let maxFxSpreadBps = parentCaps.maxFxSpreadBps;
  if (childCaps.maxFxSpreadBps !== undefined) {
    if (parentCaps.maxFxSpreadBps !== undefined) {
      if (childCaps.maxFxSpreadBps > parentCaps.maxFxSpreadBps) {
        violate(
          "costCaps.maxFxSpreadBps",
          `child spread cap ${childCaps.maxFxSpreadBps} bps exceeds parent cap ${parentCaps.maxFxSpreadBps} bps`,
        );
      }
    }
    maxFxSpreadBps = childCaps.maxFxSpreadBps;
  }
  return {
    ...(maxTotalCost !== undefined ? { maxTotalCost } : {}),
    ...(maxFxSpreadBps !== undefined ? { maxFxSpreadBps } : {}),
  };
}
