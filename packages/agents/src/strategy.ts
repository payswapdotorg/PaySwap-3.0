/**
 * Strategy vs Organization — the §7 law, explicit in code and types
 * (P3-W1 net-new; FROZEN-ARCHITECTURE §7).
 *
 *   Strategy answers WHAT happens.
 *   Organization answers WHO or WHAT executes it.
 *
 * A StrategyRecommendation is ADVISORY: it names a strategy (settle-now,
 * delay-with-in-window, batch, net-later, …) and may CITE an organization,
 * but citing is not executing. It structurally carries NO executors, NO
 * instances, NO grants, NO authority — type-level asserted in
 * test/strategy-organization.test.ts. Execution belongs exclusively to a
 * RELEASED organization version through the authority-resolved execution
 * engine; there is no code path from a strategy to an effect.
 *
 * The StrategyAssignment constructor and law queries are the reference
 * implementation of the §7 separation.
 */

import { contentDigest } from "./canonical.ts";
import { assertNotProtocolCommand } from "./proposal.ts";
import type { ReleasedOrganization } from "./organization.ts";

/** The WHAT: an advisory strategy recommendation. */
export interface StrategyRecommendation {
  readonly strategyId: string;
  readonly rationale?: string;
  /**
   * The organization version this strategy is proposed FOR. Advisory
   * citation only — a strategy never executes, and never gains authority
   * by being cited alongside an organization.
   */
  readonly proposedFor?: {
    readonly orgId: string;
    readonly orgVersion: number;
  };
}

/** Raised on an invalid strategy-assignment operation. */
export class StrategyAssignmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StrategyAssignmentError";
  }
}

/**
 * The pinned WHAT + WHO record: one advisory strategy recommendation
 * assigned to one RELEASED organization version (who/what executes). The
 * assignment:
 * - is VERSIONED (schemaVersion) and content-hashed over the strategy +
 *   the organization's FROZEN release hash;
 * - carries NO executors, grants or authority fields — it is evidence of a
 *   recommendation, never a right to act;
 * - never makes the strategy executable: execution belongs exclusively to
 *   the organization through the authority-resolved execution engine.
 */
export interface StrategyAssignment {
  readonly schemaVersion: 1;
  readonly strategy: StrategyRecommendation;
  readonly assignedTo: {
    readonly orgId: string;
    readonly orgVersion: number;
    /** The frozen content hash of the released organization version. */
    readonly orgContentHash: string;
  };
  readonly assignedAt: number;
  readonly contentHash: string;
}

/**
 * Record the advisory assignment of a strategy to a RELEASED organization
 * version (the §7 law in code: WHAT + WHO, pinned side by side, advisory
 * only). The strategy is validated (no command shape anywhere in the
 * recommendation), and the assignment hash freezes the pairing.
 */
export function assignStrategy(
  strategy: StrategyRecommendation,
  org: ReleasedOrganization,
  assignedAt: number,
): StrategyAssignment {
  if (strategy.strategyId.length === 0) {
    throw new StrategyAssignmentError("strategyId must not be empty");
  }
  if (
    strategy.proposedFor !== undefined &&
    (strategy.proposedFor.orgId !== org.id ||
      strategy.proposedFor.orgVersion !== org.version)
  ) {
    throw new StrategyAssignmentError(
      `strategy is proposed for ${strategy.proposedFor.orgId}@${strategy.proposedFor.orgVersion} but assigned to ${org.id}@${org.version}: the WHAT and the WHO must agree`,
    );
  }
  // The advisory WHAT never carries command or authority shape.
  assertNotProtocolCommand(strategy);
  const assignedTo = {
    orgId: org.id,
    orgVersion: org.version,
    orgContentHash: org.release.contentHash,
  };
  return {
    schemaVersion: 1,
    strategy,
    assignedTo,
    assignedAt,
    contentHash: contentDigest({ strategy, assignedTo }),
  };
}

/**
 * Law query: a strategy (the WHAT) can never execute — execution requires a
 * RELEASED organization version resolved through the authority port. This
 * function exists so the law is CHECKABLE in code: given any strategy
 * recommendation, the answer is always `false`, by construction and by type.
 */
export function canStrategyExecuteAlone(
  strategy: StrategyRecommendation,
): false {
  void strategy;
  return false;
}
