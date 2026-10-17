/**
 * @payswap/onchain-security — the simulation-consistency guard dimension
 * (R2-W2; extracted from the old gates evaluation for the ≤400-line law).
 *
 * INV-11: simulation is not production truth — a SUCCEEDED simulation is
 * only accepted when its observed deltas match the intent EXACTLY (debit,
 * credit, every approval allowance); a REVERTED/FAILED simulation BLOCKS;
 * an OUTCOME_UNKNOWN simulation surfaces UNKNOWN (INV-4: UNKNOWN is not
 * FAILED — never silently converted). Pure deterministic helper consumed
 * by evaluateOnchainWriteGates.
 */

import type {
  BlockReason,
  GuardCheck,
  UnknownDimension,
} from "./gates-policy.ts";
import type { PreparedWrite } from "./write-intent.ts";
import type { SimulationObservation } from "./simulation.ts";
import { compareAmounts } from "./pins/index.ts";
import { sameAsset } from "./types.ts";

function check(dimension: "simulation_consistency", outcome: "pass" | "block" | "unknown", code: string, detail: string): GuardCheck {
  return Object.freeze({ dimension, outcome, code, detail });
}

function block(code: string, message: string, invariantRefs: readonly string[]): BlockReason {
  return Object.freeze({
    dimension: "simulation_consistency",
    code,
    message,
    invariantRefs: Object.freeze([...invariantRefs]),
  });
}

/** The simulation-consistency dimension outcome (reasons/unknowns/checks). */
export interface SimulationConsistencyOutcome {
  readonly reasons: readonly BlockReason[];
  readonly unknowns: readonly UnknownDimension[];
  readonly checks: readonly GuardCheck[];
}

/**
 * Evaluate the simulation-consistency dimension for one (write,
 * simulation) pair. Absence of a simulation is NOT evaluated here (the
 * caller records the `no_simulation` pass check).
 */
export function evaluateSimulationConsistencyDimension(
  write: PreparedWrite,
  simulation: SimulationObservation,
): SimulationConsistencyOutcome {
  const reasons: BlockReason[] = [];
  const unknowns: UnknownDimension[] = [];
  const checks: GuardCheck[] = [];

  if (simulation.writeId !== write.writeId) {
    reasons.push(
      block("simulation_write_mismatch", `simulation ${simulation.simulationId} observed write '${simulation.writeId}', not this write '${write.writeId}'`, ["INV-5", "INV-11"]),
    );
    checks.push(check("simulation_consistency", "block", "simulation_write_mismatch", `writeId mismatch`));
    return { reasons: Object.freeze(reasons), unknowns: Object.freeze(unknowns), checks: Object.freeze(checks) };
  }
  if (simulation.status === "REVERTED" || simulation.status === "FAILED") {
    reasons.push(
      block("simulation_reverted", `simulation ${simulation.simulationId} reports status ${simulation.status}`, ["INV-11"]),
    );
    checks.push(check("simulation_consistency", "block", "simulation_reverted", `status ${simulation.status}`));
    return { reasons: Object.freeze(reasons), unknowns: Object.freeze(unknowns), checks: Object.freeze(checks) };
  }
  if (simulation.status === "OUTCOME_UNKNOWN") {
    // INV-4: UNKNOWN is not FAILED — surfaced, never converted.
    unknowns.push({
      dimension: "simulation_consistency",
      code: "simulation_outcome_unknown",
      message: `simulation ${simulation.simulationId} could not determine the outcome (OUTCOME_UNKNOWN is not FAILED)`,
    });
    checks.push(check("simulation_consistency", "unknown", "simulation_outcome_unknown", `simulation inconclusive`));
    return { reasons: Object.freeze(reasons), unknowns: Object.freeze(unknowns), checks: Object.freeze(checks) };
  }

  // SUCCEEDED: observed deltas must match the intent exactly.
  const transferLeg = write.transfer;
  if (transferLeg !== undefined) {
    const debit = simulation.balanceDeltas.find(
      (delta) =>
        delta.direction === "debit" &&
        delta.holder === transferLeg.from &&
        sameAsset(delta.asset, transferLeg.asset),
    );
    if (debit === undefined) {
      reasons.push(
        block("simulation_debit_missing", `simulation observed no debit of ${transferLeg.asset.symbol} from ${transferLeg.from}`, ["INV-2", "INV-11"]),
      );
      checks.push(check("simulation_consistency", "block", "simulation_debit_missing", `no debit for ${transferLeg.from}`));
    } else if (compareAmounts(debit.amount, transferLeg.amount) !== 0) {
      reasons.push(
        block("simulation_amount_mismatch", `simulation observed a debit of ${debit.amount.minorUnits} ${debit.amount.currency}, but the intent moves ${transferLeg.amount.minorUnits} ${transferLeg.amount.currency}`, ["INV-2", "INV-11"]),
      );
      checks.push(check("simulation_consistency", "block", "simulation_amount_mismatch", `debit ${debit.amount.minorUnits} != intent ${transferLeg.amount.minorUnits}`));
    }
    const credit = simulation.balanceDeltas.find(
      (delta) =>
        delta.direction === "credit" &&
        delta.holder === transferLeg.to &&
        sameAsset(delta.asset, transferLeg.asset),
    );
    if (credit === undefined || compareAmounts(credit.amount, transferLeg.amount) !== 0) {
      reasons.push(
        block("simulation_destination_mismatch", `simulation did not observe the intended credit of ${transferLeg.amount.minorUnits} ${transferLeg.amount.currency} to ${transferLeg.to}`, ["INV-2", "INV-11"]),
      );
      checks.push(check("simulation_consistency", "block", "simulation_destination_mismatch", `credit to ${transferLeg.to} missing or divergent`));
    }
  }
  for (const approval of write.approvals) {
    const observed = simulation.approvals.find(
      (candidate) =>
        candidate.owner === approval.owner &&
        candidate.spender === approval.spender &&
        sameAsset(candidate.asset, approval.asset),
    );
    const observedEqual =
      observed !== undefined &&
      observed.unlimited === approval.unlimited &&
      (approval.unlimited || compareAmounts(observed.allowance, approval.amount) === 0);
    if (!observedEqual) {
      reasons.push(
        block("simulation_approval_mismatch", `simulation did not observe the intended allowance for spender ${approval.spender} on ${approval.asset.symbol} (owner ${approval.owner})`, ["INV-20", "INV-11"]),
      );
      checks.push(check("simulation_consistency", "block", "simulation_approval_mismatch", `allowance for spender ${approval.spender} divergent`));
    }
  }
  if (reasons.length === 0 && checks.length === 0) {
    checks.push(check("simulation_consistency", "pass", "simulation_consistent", `simulation ${simulation.simulationId} consistent with intent`));
  }
  return { reasons: Object.freeze(reasons), unknowns: Object.freeze(unknowns), checks: Object.freeze(checks) };
}
