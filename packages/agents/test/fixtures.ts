/**
 * Shared test fixtures for @payswap/agents (P3-W1).
 *
 * Includes the DETERMINISTIC FAKE AUTHORITY ADAPTER: a local implementation
 * of the OrganizationAuthorityAdapter port whose semantics mirror the trust
 * lane's evaluate()/attenuateGrant()/principalRef() (grantee matching,
 * action/resource pattern matching with trailing wildcards, expiry, epoch
 * staleness, attenuation narrowing with dimension-naming violations).
 *
 * WHY A FAKE (adaptation receipt): the hermetic package-local battery runs
 * `npm install --no-workspaces` with devDependencies typescript + vitest
 * ONLY — there is no workspace install, so no runtime @payswap/trust module
 * can (or may) be imported. The trust lane's own 138-test suite covers the
 * REAL evaluate/attenuate semantics; these fixtures preserve the same
 * decision vocabulary (stale_security_epoch / no_matching_grant / …) so the
 * engine's authority-resolution laws are tested against equivalent
 * behavior. The production composition root wires the port to the real
 * @payswap/trust functions (structural compatibility is compile-time
 * asserted in authority-port.test.ts).
 */

import type {
  AuthorizationDecision,
  AuthorizationRequest,
  ChildMandateRequest,
  DenyReason,
  Mandate,
  PermissionGrant,
  Principal,
} from "@payswap/trust";
import type {
  AuthorityEpochState,
  OrganizationAuthorityAdapter,
  OrganizationDraft,
  ReleasedOrganization,
} from "../src/index.ts";
import { releaseOrganization } from "../src/index.ts";

/** The canonical payer principal (mirrors the trust AgentPrincipal shape). */
export function payerPrincipal(overrides: Partial<Extract<Principal, { kind: "agent" }>> = {}): Principal {
  return {
    kind: "agent",
    agentKeyFingerprint: "agent-key-1",
    ownerRef: "user:owner-1",
    bodyRef: "body:payer@2",
    packageVersionRef: "pkg:payer@1",
    authorityEnvelope: [{ mandateId: "mandate-1", version: 1 }],
    securityEpoch: 0n,
    ...overrides,
  };
}

/** The canonical reviewer principal (no authority of its own). */
export function reviewerPrincipal(overrides: Partial<Extract<Principal, { kind: "agent" }>> = {}): Principal {
  return {
    kind: "agent",
    agentKeyFingerprint: "agent-key-2",
    ownerRef: "user:owner-1",
    bodyRef: "body:payer@2",
    packageVersionRef: "pkg:payer@1",
    authorityEnvelope: [],
    securityEpoch: 0n,
    ...overrides,
  };
}

/** The canonical payer mandate (payments.* on payment_intent resources). */
export function payerMandate(overrides: Partial<Mandate> = {}): Mandate {
  return {
    id: "mandate-1",
    version: 1,
    grantor: "user:owner-1",
    grantee: "agent:agent-key-1",
    actions: ["payments.*"],
    resources: [{ type: "payment_intent" }],
    expiresAt: 5_000_000 + 86_400_000,
    proofRequirements: [],
    issuedAtEpoch: 0n,
    ...overrides,
  };
}

/** The canonical issued grant for the payer mandate. */
export function payerGrant(overrides: Partial<PermissionGrant> = {}): PermissionGrant {
  return {
    grantId: "grant-payer",
    mandate: payerMandate(),
    grantorRef: "user:owner-1",
    granteeRef: "agent:agent-key-1",
    issuedAt: 5_000_000 - 1000,
    lineage: { rootGrantId: "grant-payer", chain: [] },
    ...overrides,
  };
}

/** Deterministic epoch-state view: raised epochs per principal ref. */
export function epochState(raised: ReadonlyMap<string, bigint> = new Map()): AuthorityEpochState {
  return {
    ledger: {
      currentEpoch(principalRef: string): { readonly value: bigint } | undefined {
        const value = raised.get(principalRef);
        return value === undefined ? undefined : { value };
      },
    },
  };
}

/** Error thrown by the fake adapter on attenuation widening (dimension-naming). */
export class FakeAttenuationViolationError extends Error {
  constructor(dimension: string, message: string) {
    super(`attenuation violation on '${dimension}': ${message}`);
    this.name = "FakeAttenuationViolationError";
  }
}

function fakePrincipalRef(principal: Principal): string {
  switch (principal.kind) {
    case "user":
      return `user:${principal.id}`;
    case "agent":
      return `agent:${principal.agentKeyFingerprint}`;
    case "service":
      return `service:${principal.id}`;
  }
}

function actionMatches(pattern: string, action: string): boolean {
  return pattern.endsWith("*") ? action.startsWith(pattern.slice(0, -1)) : pattern === action;
}

function actionCoveredBy(child: string, parent: string): boolean {
  if (parent.endsWith("*")) {
    const prefix = parent.slice(0, -1);
    return child.endsWith("*") ? child.slice(0, -1).startsWith(prefix) : child.startsWith(prefix);
  }
  return child === parent;
}

function resourceMatches(
  pattern: { readonly type: string; readonly resourceId?: string },
  resource: { readonly type: string; readonly resourceId?: string },
): boolean {
  if (pattern.type !== resource.type) {
    return false;
  }
  if (pattern.resourceId === undefined) {
    return true;
  }
  return pattern.resourceId === resource.resourceId;
}

/**
 * The deterministic fake authority adapter (mirrors trust semantics — see
 * the module documentation).
 */
export function fakeAuthorityAdapter(): OrganizationAuthorityAdapter {
  return {
    principalRef: fakePrincipalRef,
    evaluate(
      request: AuthorizationRequest,
      grants: readonly PermissionGrant[],
      state: AuthorityEpochState,
    ): AuthorizationDecision {
      const ref = fakePrincipalRef(request.principal);
      // Credential-epoch gate (mirrors trust checkEpoch / TB-2).
      if (request.principal.kind !== "service") {
        const current = state.ledger.currentEpoch(ref);
        if (current !== undefined && request.principal.securityEpoch < current.value) {
          return {
            decision: "DENY",
            reason: "stale_security_epoch",
            policyRefs: [`principal:${ref}`],
          };
        }
      }
      let bestDeny: { reason: DenyReason; rank: number } | undefined;
      for (const grant of grants) {
        if (grant.granteeRef !== ref) {
          continue;
        }
        const mandate = grant.mandate;
        if (request.requestedAt >= mandate.expiresAt) {
          if (bestDeny === undefined || bestDeny.rank > 0) {
            bestDeny = { reason: "mandate_expired", rank: 0 };
          }
          continue;
        }
        if (!mandate.actions.some((pattern) => actionMatches(pattern, request.action))) {
          if (bestDeny === undefined || bestDeny.rank > 1) {
            bestDeny = { reason: "action_not_permitted", rank: 1 };
          }
          continue;
        }
        if (!mandate.resources.some((pattern) => resourceMatches(pattern, request.resource))) {
          if (bestDeny === undefined || bestDeny.rank > 2) {
            bestDeny = { reason: "resource_not_permitted", rank: 2 };
          }
          continue;
        }
        return {
          decision: "ALLOW",
          evidenceRefs: [`grant:${grant.grantId}`, `mandate:${mandate.id}@${mandate.version}`],
        };
      }
      return {
        decision: "DENY",
        reason: bestDeny?.reason ?? "no_matching_grant",
        policyRefs: [`principal:${ref}`],
      };
    },
    attenuateGrant(
      parentGrant: PermissionGrant,
      request: ChildMandateRequest,
      issuance: { readonly grantId: string; readonly issuedAt: number },
    ): PermissionGrant {
      const parent = parentGrant.mandate;
      const actions = request.actions ?? parent.actions;
      for (const pattern of actions) {
        const covered = parent.actions.some((parentPattern) => actionCoveredBy(pattern, parentPattern));
        if (!covered) {
          throw new FakeAttenuationViolationError(
            "actions",
            `child action pattern '${pattern}' is not covered by the parent action patterns [${parent.actions.join(", ")}]`,
          );
        }
      }
      const resources = request.resources ?? parent.resources;
      for (const pattern of resources) {
        const covered = parent.resources.some(
          (parentPattern) =>
            parentPattern.type === pattern.type &&
            (parentPattern.resourceId === undefined ||
              (pattern.resourceId !== undefined && parentPattern.resourceId === pattern.resourceId)),
        );
        if (!covered) {
          throw new FakeAttenuationViolationError(
            "resources",
            `child resource pattern '${pattern.type}' is not covered by the parent resource patterns`,
          );
        }
      }
      const expiresAt = request.expiresAt ?? parent.expiresAt;
      if (expiresAt > parent.expiresAt) {
        throw new FakeAttenuationViolationError(
          "expiry",
          `child expiry ${expiresAt} is later than parent expiry ${parent.expiresAt}`,
        );
      }
      const childMandate: Mandate = {
        id: request.mandateId,
        version: request.version,
        grantor: parent.grantee,
        grantee: request.grantee,
        actions,
        resources,
        expiresAt,
        proofRequirements: request.proofRequirements ?? parent.proofRequirements,
        issuedAtEpoch: parent.issuedAtEpoch,
        parentMandate: { mandateId: parent.id, version: parent.version },
      };
      return {
        grantId: issuance.grantId,
        mandate: childMandate,
        grantorRef: parentGrant.granteeRef,
        granteeRef: request.grantee,
        issuedAt: issuance.issuedAt,
        lineage: {
          rootGrantId: parentGrant.lineage.rootGrantId,
          chain: [...parentGrant.lineage.chain, parentGrant.grantId],
        },
      };
    },
  };
}

/** The canonical two-instance organization draft (payer + reviewer). */
export function makeOrgDraft(overrides: Partial<OrganizationDraft> = {}): OrganizationDraft {
  return {
    id: "org:payops-1",
    version: 1,
    bodies: [{ id: "body:payer", version: 2 }],
    instances: [
      {
        id: "instance-payer",
        bodyRef: { id: "body:payer", version: 2 },
        principal: { agentKeyFingerprint: "agent-key-1", ownerRef: "user:owner-1" },
        modelBinding: { provider: "openai", modelId: "gpt-5.1", bindingVersion: 1 },
        runtimeState: { status: "IDLE" },
      },
      {
        id: "instance-reviewer",
        bodyRef: { id: "body:payer", version: 2 },
        principal: { agentKeyFingerprint: "agent-key-2", ownerRef: "user:owner-1" },
        runtimeState: { status: "IDLE" },
      },
    ],
    communicationEdges: [
      { fromInstanceId: "instance-payer", toInstanceId: "instance-reviewer", channel: "a2a" },
    ],
    delegationEdges: [
      {
        fromInstanceId: "instance-payer",
        toInstanceId: "instance-reviewer",
        mandateRef: { mandateId: "mandate-1", version: 1 },
      },
    ],
    memory: { scope: "shared", retention: "session" },
    budgets: [
      { budgetId: "budget-1", scope: "routing-proposals", amount: { currency: "EUR", minorUnits: "50000" } },
    ],
    evaluators: [{ evaluationSuiteRef: "evalsuite:payops@1" }],
    termination: { conditions: ["budget-exhausted", "safety-violation"], requiresHumanApproval: true },
    safetyPolicy: {
      hardConstraints: ["no-unmandated-beneficiary-change"],
      escalationSurfaceRef: "surface:trusted-approval",
    },
    ...overrides,
  };
}

/** The canonical released organization (releasedAt = 4_000_000). */
export function makeReleasedOrg(overrides: Partial<OrganizationDraft> = {}): ReleasedOrganization {
  return releaseOrganization(makeOrgDraft(overrides), 4_000_000);
}
