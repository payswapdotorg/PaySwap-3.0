/**
 * @payswap/onchain-security — deterministic security gates: the
 * EVALUATION contract + runtime (R2-W2; PORT+ADAPT of
 * payswap.org@8a735bf packages/onchain-security/src/gates.ts, split for
 * the ≤400-line law).
 *
 * `evaluateOnchainWriteGates` is the pure deterministic evaluation over
 * every guard dimension declared in gates-policy.ts. Decision lattice:
 * BLOCK (any block reason) > UNKNOWN (any unresolved dimension) > ALLOW.
 * Every dimension produces exactly one GuardCheck; evidence refs record
 * the policy version, the write digest, the simulation id (when supplied)
 * and the composed security-state epoch.
 */

import type { OnchainSecurityPolicy, OnchainSecurityState } from "./gates-policy.ts";
import type {
  BlockReason,
  GateDecision,
  GuardCheck,
  GuardDimension,
  GuardOutcome,
  UnknownDimension,
  UnknownDimensionEscalation,
} from "./gates-policy.ts";
import { evaluateSimulationConsistencyDimension } from "./gates-simulation.ts";
import { InvalidGateInputError } from "./gates-policy.ts";
import type { PreparedWrite } from "./write-intent.ts";
import type { SimulationObservation } from "./simulation.ts";
import { compareAmounts } from "./pins/index.ts";
import { assertNoSecretMaterial } from "./secrets.ts";
import type { AssetIdentity, ProtocolIdentity } from "./types.ts";
import { sameAsset, sameProtocol } from "./types.ts";

/** Everything the deterministic gates consume (all deterministic inputs). */
export interface GateEvaluationInput {
  readonly write: PreparedWrite;
  /** Simulation observation for the SAME write, when one was run. */
  readonly simulation?: SimulationObservation;
  readonly policy: OnchainSecurityPolicy;
  readonly securityState: OnchainSecurityState;
  /** Deterministic evaluation instant (ms). */
  readonly at: number;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

function check(dimension: GuardDimension, outcome: GuardOutcome, code: string, detail: string): GuardCheck {
  return Object.freeze({ dimension, outcome, code, detail });
}

function block(
  dimension: GuardDimension,
  code: string,
  message: string,
  invariantRefs: readonly string[],
): BlockReason {
  return Object.freeze({ dimension, code, message, invariantRefs: Object.freeze([...invariantRefs]) });
}

function unknown(dimension: GuardDimension, code: string, message: string): UnknownDimension {
  return Object.freeze({ dimension, code, message });
}

function escalationCovers(
  policy: OnchainSecurityPolicy,
  dimension: UnknownDimensionEscalation["dimension"],
  targetRef: string,
  at: number,
): UnknownDimensionEscalation | undefined {
  return (policy.escalations ?? []).find(
    (escalation) =>
      escalation.dimension === dimension &&
      escalation.targetRef === targetRef &&
      escalation.disposition === "allow_with_evidence" &&
      at < escalation.expiresAt,
  );
}

/** Component ids of the write that immune-system components can match. */
function writeComponentIds(write: PreparedWrite): readonly string[] {
  const ids: string[] = [];
  if (write.protocol !== undefined) {
    ids.push(write.protocol.protocolId, write.protocol.contract.contractAddress);
  }
  if (write.contractCall !== undefined) {
    ids.push(write.contractCall.target);
  }
  for (const hop of write.route.hops ?? []) {
    ids.push(hop.venue);
  }
  for (const approval of write.approvals) {
    ids.push(approval.spender);
  }
  return ids;
}

/**
 * The deterministic security gates. Pure function of the input; every
 * dimension produces exactly one GuardCheck; the decision is:
 * BLOCK (any block reason) > UNKNOWN (any unresolved dimension) > ALLOW.
 */
export function evaluateOnchainWriteGates(input: GateEvaluationInput): GateDecision {
  const { write, simulation, policy, securityState, at } = input;

  assertNoSecretMaterial(policy, "onchain security policy");
  assertNoSecretMaterial(securityState, "onchain security state");
  if (policy.policyId.length === 0) {
    throw new InvalidGateInputError("policy.policyId must be non-empty");
  }
  if (policy.version < 1) {
    throw new InvalidGateInputError("policy.version must be >= 1");
  }
  if (!Number.isInteger(at) || at < 0) {
    throw new InvalidGateInputError("evaluation instant `at` must be a non-negative integer (ms)");
  }

  const checks: GuardCheck[] = [];
  const reasons: BlockReason[] = [];
  const unknowns: UnknownDimension[] = [];
  const evidenceRefs: string[] = [
    `policy:${policy.policyId}@${policy.version}`,
    `write:${write.writeDigest}`,
  ];
  if (simulation !== undefined) {
    evidenceRefs.push(`simulation:${simulation.simulationId}`);
  }
  evidenceRefs.push(`securityState:epoch-${securityState.networkEpoch.toString()}`);

  // 1. chain
  if (policy.allowedChains !== undefined && !policy.allowedChains.includes(write.chain)) {
    reasons.push(
      block("chain", "chain_not_permitted", `chain '${write.chain}' is not permitted by policy`, ["INV-20"]),
    );
    checks.push(check("chain", "block", "chain_not_permitted", `chain ${write.chain} not in allowedChains`));
  } else {
    checks.push(check("chain", "pass", "chain_permitted", `chain ${write.chain} permitted`));
  }

  // 2. asset + 3. amount (per transfer leg)
  const transfer = write.transfer;
  if (transfer !== undefined) {
    const assetAllowed =
      policy.allowedAssets === undefined || policy.allowedAssets.some((a) => sameAsset(a, transfer.asset));
    if (!assetAllowed) {
      reasons.push(
        block("asset", "asset_not_permitted", `asset ${transfer.asset.assetId} (${transfer.asset.symbol} on ${transfer.asset.chain}) is not in the policy allowlist (fake-token defense)`, ["INV-20"]),
      );
      checks.push(check("asset", "block", "asset_not_permitted", `asset ${transfer.asset.assetId} not allowlisted`));
    } else {
      checks.push(check("asset", "pass", "asset_permitted", `asset ${transfer.asset.assetId} allowlisted`));
    }
    if (transfer.amount.minorUnits === "0") {
      reasons.push(
        block("amount", "transfer_amount_not_positive", "a value transfer must carry a positive exact amount", ["INV-2"]),
      );
      checks.push(check("amount", "block", "transfer_amount_not_positive", "zero-amount transfer"));
    } else {
      checks.push(check("amount", "pass", "transfer_amount_positive", `exact integer amount ${transfer.amount.minorUnits} ${transfer.amount.currency}`));
    }
  } else {
    checks.push(check("asset", "pass", "no_transfer", "write carries no transfer leg"));
    checks.push(check("amount", "pass", "no_transfer", "write carries no transfer amount"));
  }

  // 4. destination
  if (transfer !== undefined && policy.allowedDestinations !== undefined) {
    if (!policy.allowedDestinations.includes(transfer.to)) {
      reasons.push(
        block("destination", "destination_not_permitted", `destination ${transfer.to} is not a permitted beneficiary`, ["INV-5", "INV-20"]),
      );
      checks.push(check("destination", "block", "destination_not_permitted", `destination ${transfer.to} not allowlisted`));
    } else {
      checks.push(check("destination", "pass", "destination_permitted", `destination ${transfer.to} permitted`));
    }
  } else if (transfer !== undefined) {
    checks.push(check("destination", "pass", "destination_unrestricted", "policy leaves destinations unrestricted"));
  } else {
    checks.push(check("destination", "pass", "no_transfer", "write carries no destination"));
  }

  // 5. spender / approval changes
  for (const approval of write.approvals) {
    const spenderAllowed =
      policy.allowedSpenders === undefined || policy.allowedSpenders.includes(approval.spender);
    if (!spenderAllowed) {
      reasons.push(
        block("spender_approval", "spender_not_permitted", `spender ${approval.spender} is not a permitted spender (malicious-approval defense)`, ["INV-20"]),
      );
      checks.push(check("spender_approval", "block", "spender_not_permitted", `spender ${approval.spender} not allowlisted`));
      continue;
    }
    if (approval.unlimited && policy.forbidUnlimitedApprovals) {
      reasons.push(
        block("spender_approval", "unlimited_approval_forbidden", `unlimited approval to spender ${approval.spender} is forbidden by policy`, ["INV-20"]),
      );
      checks.push(check("spender_approval", "block", "unlimited_approval_forbidden", `unlimited approval for ${approval.spender}`));
      continue;
    }
    const cap = policy.maxApprovalAmount;
    if (!approval.unlimited && cap !== undefined) {
      if (cap.currency !== approval.amount.currency) {
        reasons.push(
          block("spender_approval", "approval_cap_currency_mismatch", `approval currency ${approval.amount.currency} does not match policy cap currency ${cap.currency}`, ["INV-2", "INV-20"]),
        );
        checks.push(check("spender_approval", "block", "approval_cap_currency_mismatch", `currency mismatch vs cap`));
        continue;
      }
      if (compareAmounts(approval.amount, cap) > 0) {
        reasons.push(
          block("spender_approval", "approval_exceeds_cap", `approval of ${approval.amount.minorUnits} ${approval.amount.currency} to ${approval.spender} exceeds the policy cap ${cap.minorUnits}`, ["INV-2", "INV-20"]),
        );
        checks.push(check("spender_approval", "block", "approval_exceeds_cap", `approval exceeds cap`));
        continue;
      }
    }
    checks.push(check("spender_approval", "pass", "approval_permitted", `approval for spender ${approval.spender} permitted`));
  }
  if (write.approvals.length === 0) {
    checks.push(check("spender_approval", "pass", "no_approvals", "write carries no approval changes"));
  }

  // 6. expiry
  if (write.expiry <= at) {
    reasons.push(
      block("expiry", "write_expired", `write expired at ${write.expiry}; the evaluation instant is ${at}`, ["INV-5"]),
    );
    checks.push(check("expiry", "block", "write_expired", `expiry ${write.expiry} <= at ${at}`));
  } else {
    checks.push(check("expiry", "pass", "write_live", `expiry ${write.expiry} > at ${at}`));
  }

  // 7. route
  if (policy.knownRoutes !== undefined && !policy.knownRoutes.includes(write.route.routeHash)) {
    if (policy.unknownRoutePolicy === "block") {
      reasons.push(
        block("route", "route_not_certified", `route ${write.route.routeId} (hash ${write.route.routeHash}) is not a certified route`, ["INV-20", "INV-5"]),
      );
      checks.push(check("route", "block", "route_not_certified", `routeHash ${write.route.routeHash} not certified`));
    } else {
      const escalation = escalationCovers(policy, "route", write.route.routeHash, at);
      if (escalation !== undefined) {
        checks.push(check("route", "pass", "route_escalated", `route ${write.route.routeHash} covered by policy escalation ${escalation.escalationId}`));
        evidenceRefs.push(`escalation:${escalation.escalationId}`, ...escalation.evidenceRefs);
      } else {
        unknowns.push(
          unknown("route", "route_certification_unknown", `route ${write.route.routeHash} is not certified and carries no policy escalation`),
        );
        checks.push(check("route", "unknown", "route_certification_unknown", `routeHash ${write.route.routeHash} unknown`));
      }
    }
  } else {
    checks.push(check("route", "pass", "route_permitted", `route ${write.route.routeHash} permitted`));
  }

  // 8. protocol / contract identity (INV-20)
  if (write.protocol !== undefined) {
    const certified =
      policy.certifiedProtocols === undefined ||
      policy.certifiedProtocols.some((p) => sameProtocol(p, write.protocol!));
    if (!certified) {
      if (policy.unknownContractPolicy === "block") {
        reasons.push(
          block("protocol_identity", "protocol_not_certified", `protocol ${write.protocol.protocolId}@${write.protocol.version} on ${write.protocol.contract.chainRef} at ${write.protocol.contract.contractAddress} is not a certified protocol identity`, ["INV-20"]),
        );
        checks.push(check("protocol_identity", "block", "protocol_not_certified", `protocol ${write.protocol.protocolId} not certified`));
      } else {
        const escalation = escalationCovers(policy, "protocol_identity", write.protocol.protocolId, at);
        if (escalation !== undefined) {
          checks.push(check("protocol_identity", "pass", "protocol_escalated", `protocol ${write.protocol.protocolId} covered by policy escalation ${escalation.escalationId}`));
          evidenceRefs.push(`escalation:${escalation.escalationId}`, ...escalation.evidenceRefs);
        } else {
          unknowns.push(
            unknown("protocol_identity", "protocol_certification_unknown", `protocol ${write.protocol.protocolId}@${write.protocol.version} is not certified and carries no policy escalation`),
          );
          checks.push(check("protocol_identity", "unknown", "protocol_certification_unknown", `protocol ${write.protocol.protocolId} unknown`));
        }
      }
    } else {
      checks.push(check("protocol_identity", "pass", "protocol_certified", `protocol ${write.protocol.protocolId}@${write.protocol.version} certified`));
    }
  } else if (write.contractCall !== undefined) {
    // Generic contract interaction: the controlled escape hatch (INV-20).
    if (policy.unknownContractPolicy === "block") {
      reasons.push(
        block("protocol_identity", "unknown_contract_write", `generic contract write to ${write.contractCall.target} on ${write.chain} has no certified protocol identity and policy blocks unknown writes`, ["INV-20"]),
      );
      checks.push(check("protocol_identity", "block", "unknown_contract_write", `target ${write.contractCall.target} unknown`));
    } else {
      const escalation = escalationCovers(policy, "protocol_identity", write.contractCall.target, at);
      if (escalation !== undefined) {
        checks.push(check("protocol_identity", "pass", "contract_escalated", `target ${write.contractCall.target} covered by policy escalation ${escalation.escalationId}`));
        evidenceRefs.push(`escalation:${escalation.escalationId}`, ...escalation.evidenceRefs);
      } else {
        unknowns.push(
          unknown("protocol_identity", "unknown_contract_requires_escalation", `generic contract write to ${write.contractCall.target} on ${write.chain} requires explicit policy escalation (never executes silently)`),
        );
        checks.push(check("protocol_identity", "unknown", "unknown_contract_requires_escalation", `target ${write.contractCall.target} requires escalation`));
      }
    }
  } else {
    checks.push(check("protocol_identity", "pass", "no_protocol_identity", "write carries no protocol/contract identity (value movement only)"));
  }

  // 9. composed security state
  const maxAge = policy.maxSecurityStateAgeMs;
  if (maxAge !== undefined && at - securityState.observedAt > maxAge) {
    unknowns.push(
      unknown("security_state", "security_state_stale", `security state observed at ${securityState.observedAt} is older than the policy max age ${maxAge}ms at evaluation instant ${at}`),
    );
    checks.push(check("security_state", "unknown", "security_state_stale", `state age ${at - securityState.observedAt}ms > maxAge`));
  } else {
    const componentIds = new Set(writeComponentIds(write));
    const offending = [...securityState.quarantinedComponents, ...securityState.restrictedComponents].find(
      (componentKey) => {
        const id = componentKey.includes(":") ? componentKey.slice(componentKey.indexOf(":") + 1) : componentKey;
        return componentIds.has(id);
      },
    );
    if (offending !== undefined) {
      reasons.push(
        block("security_state", "component_quarantined_or_restricted", `component '${offending}' referenced by this write is quarantined or restricted by an active security advisory (cached capability state can never bypass this)`, ["INV-21", "INV-20"]),
      );
      checks.push(check("security_state", "block", "component_quarantined_or_restricted", `component ${offending} blocked by immune system`));
      for (const advisoryRef of securityState.activeAdvisoryRefs) {
        evidenceRefs.push(`advisory:${advisoryRef}`);
      }
    } else {
      checks.push(check("security_state", "pass", "security_state_clean", `no quarantined/restricted component referenced (epoch ${securityState.networkEpoch.toString()})`));
    }
  }

  // 10. simulation consistency (INV-11: simulation is not production truth)
  if (simulation !== undefined) {
    const consistency = evaluateSimulationConsistencyDimension(write, simulation);
    reasons.push(...consistency.reasons);
    unknowns.push(...consistency.unknowns);
    checks.push(...consistency.checks);
  } else {
    checks.push(check("simulation_consistency", "pass", "no_simulation", "no simulation was run (policy decides whether one is required)"));
  }

  const frozenChecks = Object.freeze(checks);
  const frozenEvidence = Object.freeze(evidenceRefs);

  if (reasons.length > 0) {
    return Object.freeze({
      decision: "BLOCK",
      reasons: Object.freeze(reasons),
      checks: frozenChecks,
      evidenceRefs: frozenEvidence,
    });
  }
  if (unknowns.length > 0) {
    return Object.freeze({
      decision: "UNKNOWN",
      dimensions: Object.freeze(unknowns),
      checks: frozenChecks,
      evidenceRefs: frozenEvidence,
    });
  }
  return Object.freeze({
    decision: "ALLOW",
    checks: frozenChecks,
    evidenceRefs: frozenEvidence,
  });
}
