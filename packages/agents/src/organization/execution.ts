/**
 * Organization graph execution (FROZEN-ARCHITECTURE §7; canonical INV-5
 * authorization/evidence lineage + INV-12 attenuated delegation).
 *
 * Deterministic step scheduler over a RELEASED, versioned Organization graph
 * (only released versions can execute). Semantics:
 *
 * 1. PARTICIPATION is computed by breadth-first relay over communication
 *    edges from the initiating instance (deterministic: edge array order,
 *    then instance order). Authority never flows to unreachable nodes.
 * 2. EVERY node passes through the INJECTED authority adapter's
 *    `evaluate()` before acting — no organization node can bypass
 *    authority. Nodes without an ALLOW decision do not act; their denial is
 *    recorded in the trace.
 * 3. DELEGATION edges create child authority through the adapter's
 *    `attenuateGrant()` ONLY (INV-12 enforced at runtime, not just in the
 *    type system): the engine has exactly one code path for minting child
 *    authority, and any widening attempt is rejected with the adapter's
 *    violation error recorded as evidence.
 * 4. A delegation edge fires only when (a) its source has already acted
 *    with an ALLOW, (b) the mandate referenced by the edge is carried by a
 *    grant in the pool, and (c) that grant's grantee IS the source
 *    principal. Anything else fails closed: the edge is recorded as
 *    REJECTED, never best-effort.
 *
 * ADAPTATION (payswap.org@8a735bf -> PaySwap 3.0): the old engine imported
 * @payswap/trust VALUES (evaluate/attenuateGrant/principalRef). PaySwap 3.0
 * layer law pins this package to zero runtime dependencies with a TYPE-ONLY
 * sibling link, so the authority seam is an INJECTED PORT
 * (src/authority-port.ts). The production composition root wires the port
 * to @payswap/trust's own functions; the semantics above are unchanged.
 */

import type {
  AuthorizationContext,
  AuthorizationDecision,
  PermissionGrant,
  Principal,
  ResourceRef,
} from "@payswap/trust";
import type { OrganizationAuthorityAdapter, AuthorityEpochState } from "../authority-port.ts";
import type {
  DelegationEdge,
  OrganizationDraft,
  ReleasedOrganization,
} from "../organization.ts";
import { isReleased } from "../organization.ts";

/** Raised on invalid organization-execution inputs (fail closed). */
export class OrganizationExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationExecutionError";
  }
}

/** One command to execute against a released organization graph. */
export interface OrganizationCommandRequest {
  readonly initiatingInstanceId: string;
  readonly action: string;
  readonly resource: ResourceRef;
  readonly context: AuthorizationContext;
  readonly requestHash: string;
  readonly requestedAt: number;
}

/** Result of one delegation-edge activation attempt. */
export type DelegationOutcome =
  | { readonly outcome: "DELEGATED"; readonly childGrantId: string; readonly childMandateId: string }
  | { readonly outcome: "REJECTED"; readonly reason: string };

/** Audit record of one delegation-edge activation attempt (evidence). */
export interface DelegationRecord {
  readonly sequence: number;
  readonly fromInstanceId: string;
  readonly toInstanceId: string;
  readonly mandateRef: { readonly mandateId: string; readonly version: number };
  readonly result: DelegationOutcome;
}

/** Audit record of one node's authorization step. */
export interface OrganizationStepRecord {
  readonly sequence: number;
  readonly instanceId: string;
  readonly action: string;
  readonly decision: AuthorizationDecision;
  /** Set when the step was authorized by a delegated (attenuated) child grant. */
  readonly actingUnderDelegationFrom?: string;
}

/** Full deterministic execution trace: replayable evidence of the run. */
export interface OrganizationExecutionTrace {
  readonly organizationId: string;
  readonly organizationVersion: number;
  readonly contentHash: string;
  readonly request: OrganizationCommandRequest;
  readonly relayOrder: readonly string[];
  readonly steps: readonly OrganizationStepRecord[];
  readonly delegations: readonly DelegationRecord[];
  /** The final grant pool, including every attenuated child grant minted by the run. */
  readonly grantPool: readonly PermissionGrant[];
}

/** Engine inputs: everything is explicit, nothing is ambient. */
export interface OrganizationExecutionParams {
  readonly organization: OrganizationDraft | ReleasedOrganization;
  readonly request: OrganizationCommandRequest;
  /**
   * The INJECTED authority seam (the trust lane's evaluate/attenuate/
   * principalRef at the composition root). Required: an engine without
   * authority cannot exist.
   */
  readonly authority: OrganizationAuthorityAdapter;
  readonly grants: readonly PermissionGrant[];
  readonly epochState: AuthorityEpochState;
  /** Trust principal per PARTICIPATING instance id (fail closed when missing). */
  readonly principals: ReadonlyMap<string, Principal>;
}

function relayOrder(org: ReleasedOrganization, initiatingInstanceId: string): string[] {
  const adjacency = new Map<string, string[]>();
  for (const edge of org.communicationEdges) {
    const targets = adjacency.get(edge.fromInstanceId);
    if (targets === undefined) {
      adjacency.set(edge.fromInstanceId, [edge.toInstanceId]);
    } else {
      targets.push(edge.toInstanceId);
    }
  }
  const order: string[] = [initiatingInstanceId];
  const visited = new Set<string>([initiatingInstanceId]);
  const queue: string[] = [initiatingInstanceId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) {
      break;
    }
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        order.push(next);
        queue.push(next);
      }
    }
  }
  return order;
}

function requirePrincipal(
  instanceId: string,
  principals: ReadonlyMap<string, Principal>,
): Principal {
  const principal = principals.get(instanceId);
  if (principal === undefined) {
    throw new OrganizationExecutionError(
      `no trust principal resolved for participating instance '${instanceId}': unresolvable principals fail closed, never best-effort`,
    );
  }
  return principal;
}

/**
 * Fail-closed presence guard for the injected authority seam (untyped/JS
 * callers cannot silently run an engine without authority).
 */
function requireAuthority(
  adapter: OrganizationAuthorityAdapter,
): OrganizationAuthorityAdapter {
  const probe = adapter as unknown as Record<string, unknown> | undefined | null;
  if (
    probe === null ||
    typeof probe !== "object" ||
    typeof probe["evaluate"] !== "function" ||
    typeof probe["attenuateGrant"] !== "function" ||
    typeof probe["principalRef"] !== "function"
  ) {
    throw new OrganizationExecutionError(
      "organization execution requires an injected OrganizationAuthorityAdapter: authority lives in the trust lane, never inside this package",
    );
  }
  return adapter;
}

/**
 * Execute one organization command deterministically. See the module
 * documentation for participation, evaluation and delegation semantics.
 */
export function executeOrganizationCommand(
  params: OrganizationExecutionParams,
): OrganizationExecutionTrace {
  const { request, epochState, principals } = params;
  const authority = requireAuthority(params.authority);
  if (!isReleased(params.organization)) {
    throw new OrganizationExecutionError(
      "organization execution requires a RELEASED version: drafts are mutable and cannot execute",
    );
  }
  const org = params.organization;
  if (request.initiatingInstanceId.length === 0) {
    throw new OrganizationExecutionError("initiatingInstanceId must not be empty");
  }
  if (request.action.length === 0) {
    throw new OrganizationExecutionError("action must not be empty");
  }
  if (request.requestHash.length === 0) {
    throw new OrganizationExecutionError("requestHash must not be empty");
  }
  const instanceIds = new Set(org.instances.map((instance) => instance.id));
  if (!instanceIds.has(request.initiatingInstanceId)) {
    throw new OrganizationExecutionError(
      `initiating instance '${request.initiatingInstanceId}' is not part of organization ${org.id}@${org.version}`,
    );
  }

  const order = relayOrder(org, request.initiatingInstanceId);
  // Fail closed up front: every participant must have a resolvable principal.
  for (const instanceId of order) {
    requirePrincipal(instanceId, principals);
  }

  const grantPool: PermissionGrant[] = [...params.grants];
  const steps: OrganizationStepRecord[] = [];
  const delegations: DelegationRecord[] = [];
  const actedWithAllow = new Set<string>();
  let sequence = 0;

  for (const instanceId of order) {
    const principal = requirePrincipal(instanceId, principals);
    let delegatedFrom: string | undefined;
    let childGrantId: string | undefined;

    // Delegation activation (attenuateGrant() ONLY — INV-12): the first
    // edge, in array order, whose source already acted with ALLOW and whose
    // target is this participant.
    if (instanceId !== request.initiatingInstanceId) {
      const edge: DelegationEdge | undefined = org.delegationEdges.find(
        (candidate) =>
          candidate.toInstanceId === instanceId && actedWithAllow.has(candidate.fromInstanceId),
      );
      if (edge !== undefined) {
        sequence += 1;
        const sourcePrincipal = requirePrincipal(edge.fromInstanceId, principals);
        const mandateGrant = grantPool.find(
          (candidate) =>
            candidate.mandate.id === edge.mandateRef.mandateId &&
            candidate.mandate.version === edge.mandateRef.version,
        );
        let result: DelegationOutcome;
        if (mandateGrant === undefined) {
          result = {
            outcome: "REJECTED",
            reason:
              `no grant in the pool carries mandate ${edge.mandateRef.mandateId}@${edge.mandateRef.version}: ` +
              "delegation without authority fails closed",
          };
        } else if (mandateGrant.granteeRef !== authority.principalRef(sourcePrincipal)) {
          result = {
            outcome: "REJECTED",
            reason:
              `grant '${mandateGrant.grantId}' is held by ${mandateGrant.granteeRef}, not by the delegating source ` +
              `${authority.principalRef(sourcePrincipal)}: an instance cannot delegate authority it does not hold`,
          };
        } else {
          // The child mandate narrows the delegated power to exactly this
          // command's action and resource — a genuine subset whenever the
          // parent scope is wider (enforced by the adapter's attenuate,
          // INV-12).
          try {
            const childGrant = authority.attenuateGrant(
              mandateGrant,
              {
                mandateId: `${edge.mandateRef.mandateId}:d${sequence}`,
                version: 1,
                grantee: authority.principalRef(principal),
                actions: [request.action],
                resources: [request.resource],
              },
              {
                grantId: `delegated:${org.id}@${org.version}:${sequence}`,
                issuedAt: request.requestedAt,
              },
            );
            grantPool.push(childGrant);
            childGrantId = childGrant.grantId;
            delegatedFrom = edge.fromInstanceId;
            result = {
              outcome: "DELEGATED",
              childGrantId: childGrant.grantId,
              childMandateId: childGrant.mandate.id,
            };
          } catch (error) {
            // The adapter's attenuation violation (naming the exact widened
            // dimension) — recorded as evidence, never swallowed, never
            // best-effort.
            const message = error instanceof Error ? error.message : String(error);
            result = { outcome: "REJECTED", reason: message };
          }
        }
        delegations.push({
          sequence,
          fromInstanceId: edge.fromInstanceId,
          toInstanceId: edge.toInstanceId,
          mandateRef: { ...edge.mandateRef },
          result,
        });
      }
    }

    // Every node passes through the authority evaluate() before acting
    // (no bypass).
    sequence += 1;
    const decision = authority.evaluate(
      {
        principal,
        action: request.action,
        resource: request.resource,
        context: request.context,
        requestHash: request.requestHash,
        requestedAt: request.requestedAt,
      },
      grantPool,
      epochState,
    );
    if (decision.decision === "ALLOW") {
      actedWithAllow.add(instanceId);
      if (childGrantId !== undefined && !decision.evidenceRefs.includes(`grant:${childGrantId}`)) {
        // The node acted on its own authority, not the delegated child grant.
        delegatedFrom = undefined;
      }
    } else {
      delegatedFrom = undefined;
    }
    steps.push({
      sequence,
      instanceId,
      action: request.action,
      decision,
      ...(delegatedFrom !== undefined ? { actingUnderDelegationFrom: delegatedFrom } : {}),
    });
  }

  return {
    organizationId: org.id,
    organizationVersion: org.version,
    contentHash: org.release.contentHash,
    request: { ...request },
    relayOrder: [...order],
    steps: [...steps],
    delegations: [...delegations],
    grantPool: [...grantPool],
  };
}
