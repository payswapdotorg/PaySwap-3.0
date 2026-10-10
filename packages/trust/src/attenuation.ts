/**
 * Delegation attenuation (INV-12 / TB-3): child delegation is ALWAYS
 * attenuated — every child dimension must be a subset of the parent's; any
 * widening raises AttenuationViolationError naming the violated dimension.
 *
 * Adapted from payswap.org@8a735bf (see docs/trust-evidence/): amount checks
 * use the internal canonical-integer ordering (not the old protocol Money
 * bridge — reversed dependency removed), and children inherit the parent's
 * `issuedAtEpoch` stamp (TB-5: the chain dies together).
 */

import type {
  ActionPattern,
  CostCaps,
  EscalationPolicy,
  Mandate,
  MandateLimits,
  PermissionGrant,
  ProofRequirement,
  ResourcePattern,
} from "./mandate.ts";
import {
  actionPatternCoveredBy,
  proofLevelRank,
  resourcePatternCoveredBy,
  validateActionPattern,
  validateResourcePattern,
} from "./mandate.ts";
import {
  assertScopeAttenuated,
  escalationStrength,
  resolveCostCaps,
  resolveLimits,
  violate,
} from "./attenuation-rules.ts";

export type { AttenuationDimension } from "./attenuation-rules.ts";
export { AttenuationViolationError } from "./attenuation-rules.ts";

/**
 * Request for a child mandate. Omitted dimensions are inherited from the
 * parent verbatim (inheritance can never widen). A supplied dimension must be
 * attenuated relative to the parent before the child mandate is constructed.
 */
export interface ChildMandateRequest {
  readonly mandateId: string;
  readonly version: number;
  readonly grantee: string;
  readonly actions?: readonly ActionPattern[];
  readonly resources?: readonly ResourcePattern[];
  readonly rails?: readonly string[];
  readonly currencies?: readonly string[];
  readonly countries?: readonly string[];
  readonly beneficiaries?: readonly string[];
  readonly limits?: MandateLimits;
  readonly costCaps?: CostCaps;
  readonly expiresAt?: number;
  readonly escalation?: EscalationPolicy;
  readonly proofRequirements?: readonly ProofRequirement[];
}

/**
 * Attenuate a parent mandate into a child mandate (INV-12 / TB-3).
 *
 * The child grantor is always the parent grantee. The returned mandate records
 * `parentMandate` lineage and inherits the parent's `issuedAtEpoch` (the
 * child lives and dies in the parent's epoch window — TB-5). Throws
 * AttenuationViolationError naming the exact violated dimension on any
 * widening attempt.
 */
export function attenuate(parent: Mandate, request: ChildMandateRequest): Mandate {
  if (request.mandateId.length === 0) {
    violate("actions", "mandateId must not be empty"); // dimension irrelevant; structural guard
  }
  if (request.version < 1) {
    violate("actions", "mandate version must be >= 1"); // structural guard, see above
  }
  if (request.grantee.length === 0) {
    violate("actions", "grantee must not be empty"); // structural guard, see above
  }

  // actions
  const actions = request.actions ?? parent.actions;
  for (const pattern of actions) {
    validateActionPattern(pattern);
    const covered = parent.actions.some((parentPattern) =>
      actionPatternCoveredBy(pattern, parentPattern),
    );
    if (!covered) {
      violate(
        "actions",
        `child action pattern '${pattern}' is not covered by the parent action patterns [${parent.actions.join(", ")}]`,
      );
    }
  }

  // resources
  const resources = request.resources ?? parent.resources;
  for (const pattern of resources) {
    validateResourcePattern(pattern);
    const covered = parent.resources.some((parentPattern) =>
      resourcePatternCoveredBy(pattern, parentPattern),
    );
    if (!covered) {
      violate(
        "resources",
        `child resource pattern '${pattern.type}${pattern.resourceId === undefined ? "" : ":" + pattern.resourceId}' is not covered by the parent resource patterns`,
      );
    }
  }

  // scope dimensions (undefined = unrestricted; omission = inherit)
  const rails = assertScopeAttenuated("rails", request.rails, parent.rails);
  const currencies = assertScopeAttenuated("currencies", request.currencies, parent.currencies);
  const countries = assertScopeAttenuated("countries", request.countries, parent.countries);
  const beneficiaries = assertScopeAttenuated(
    "beneficiaries",
    request.beneficiaries,
    parent.beneficiaries,
  );

  // limits
  const limits = resolveLimits(parent, request);

  // cost caps
  const costCaps = resolveCostCaps(parent, request);

  // expiry: a child mandate can never outlive its parent
  const expiresAt = request.expiresAt ?? parent.expiresAt;
  if (expiresAt > parent.expiresAt) {
    violate(
      "expiry",
      `child expiry ${expiresAt} is later than parent expiry ${parent.expiresAt}`,
    );
  }

  // escalation: a child can only strengthen escalation, never weaken it
  const escalation = request.escalation ?? parent.escalation;
  if (parent.escalation !== undefined && escalation !== undefined) {
    if (escalationStrength(escalation.onLimitExceeded) < escalationStrength(parent.escalation.onLimitExceeded)) {
      violate(
        "escalation",
        `child policy '${escalation.onLimitExceeded}' is weaker than parent policy '${parent.escalation.onLimitExceeded}'`,
      );
    }
    if (
      escalation.onLimitExceeded === "require_approval" &&
      parent.escalation.approverRef !== undefined
    ) {
      // A 'deny' policy is strictly stronger and needs no approver; only a
      // child that still escalates must preserve the parent's approver.
      if (escalation.approverRef === undefined) {
        violate(
          "escalation",
          `child dropped the parent escalation approver '${parent.escalation.approverRef}'`,
        );
      } else if (escalation.approverRef !== parent.escalation.approverRef) {
        violate(
          "escalation",
          `child escalation approver '${escalation.approverRef}' differs from parent approver '${parent.escalation.approverRef}'`,
        );
      }
    }
  }

  // proof requirements: child must retain every parent requirement (at equal or higher level)
  const proofRequirements = request.proofRequirements ?? parent.proofRequirements;
  for (const required of parent.proofRequirements) {
    const covered = proofRequirements.some(
      (candidate) =>
        (candidate.scope ?? "") === (required.scope ?? "") &&
        proofLevelRank(candidate.proofLevel) >= proofLevelRank(required.proofLevel),
    );
    if (!covered) {
      violate(
        "proofRequirements",
        `child does not retain parent proof requirement ${required.proofLevel}${required.scope === undefined ? "" : ` for scope '${required.scope}'`}`,
      );
    }
  }

  return {
    id: request.mandateId,
    version: request.version,
    grantor: parent.grantee,
    grantee: request.grantee,
    actions,
    resources,
    ...(rails !== undefined ? { rails } : {}),
    ...(currencies !== undefined ? { currencies } : {}),
    ...(countries !== undefined ? { countries } : {}),
    ...(beneficiaries !== undefined ? { beneficiaries } : {}),
    ...(limits !== undefined ? { limits } : {}),
    ...(costCaps !== undefined ? { costCaps } : {}),
    expiresAt,
    ...(escalation !== undefined ? { escalation } : {}),
    proofRequirements,
    issuedAtEpoch: parent.issuedAtEpoch,
    parentMandate: { mandateId: parent.id, version: parent.version },
  };
}

export interface AttenuateGrantParams {
  readonly grantId: string;
  readonly issuedAt: number;
}

/**
 * Attenuate through a grant: builds the child mandate and issues the child
 * PermissionGrant with full lineage back to the root grant.
 */
export function attenuateGrant(
  parentGrant: PermissionGrant,
  request: ChildMandateRequest,
  params: AttenuateGrantParams,
): PermissionGrant {
  const childMandate = attenuate(parentGrant.mandate, request);
  return {
    grantId: params.grantId,
    mandate: childMandate,
    grantorRef: parentGrant.granteeRef,
    granteeRef: request.grantee,
    issuedAt: params.issuedAt,
    lineage: {
      rootGrantId: parentGrant.lineage.rootGrantId,
      chain: [...parentGrant.lineage.chain, parentGrant.grantId],
    },
  };
}
