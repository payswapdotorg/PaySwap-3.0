/**
 * @payswap/node-network — the node registry with revocation (P27-D,
 * ADR-0020 D5/D11).
 *
 * THE HONEST DEFAULT: the registry starts EMPTY — no fake ACTIVE node
 * ships as a shipped default (D11). Enrollment of a real node is
 * operator-gated/key-ready: the enrollment record must validate (the
 * accountable-principal laws of enrollment.ts) and is APPEND-ONLY.
 * Revocation is a recorded fact (who/when/why); a revoked node's
 * enrollment stays in the record (history is immutable) but the node is
 * excluded from every active projection, and its offers contribute
 * nothing (offer-verification.ts consumes the revocation fact).
 *
 * Deterministic, caller-supplied time everywhere; digests are
 * order-independent over canonically-sorted records.
 */

import { NodeRegistryError } from "./errors.ts";
import { contentDigest, deepFreeze, sortedBy } from "./canonical.ts";
import {
  validateNodeEnrollmentRecord,
  type NodeEnrollmentRecord,
} from "./enrollment.ts";

/** One recorded node revocation (a fact, never a deletion). */
export interface NodeRevocationRecord {
  readonly nodeId: string;
  readonly revokedAt: string;
  readonly reason: string;
  readonly revokedBy: string;
}

/** The registry state: append-only enrollments + recorded revocations. */
export interface NodeRegistryState {
  readonly enrollments: readonly NodeEnrollmentRecord[];
  readonly revocations: readonly NodeRevocationRecord[];
}

/**
 * THE EMPTY REGISTRY — the honest shipped default. No node is enrolled,
 * no offer exists, nothing is ACTIVE until an operator enrolls a real
 * node through the accountable path (D11: key-ready, never a fake).
 */
export function createEmptyNodeRegistry(): NodeRegistryState {
  return deepFreeze({ enrollments: Object.freeze([]), revocations: Object.freeze([]) });
}

/**
 * Enroll a node (append-only): the record must pass the full
 * accountable-enrollment validation; a duplicate nodeId is a typed error
 * (an identity is enrolled once — re-enrollment is a NEW versioned
 * record with a new nodeId, never a silent overwrite).
 */
export function enrollNode(
  state: NodeRegistryState,
  candidate: unknown,
): NodeRegistryState {
  const record = validateNodeEnrollmentRecord(candidate);
  if (state.enrollments.some((existing) => existing.nodeId === record.nodeId)) {
    throw new NodeRegistryError(
      `node '${record.nodeId}' is already enrolled — enrollment is append-only; a re-enrollment is a new versioned identity, never an overwrite`,
      { nodeId: record.nodeId },
    );
  }
  return deepFreeze({
    enrollments: Object.freeze([...state.enrollments, record]),
    revocations: state.revocations,
  });
}

/**
 * Revoke a node: a recorded fact with the revocation instant, the reason
 * and the revoking authority. Revoking an unenrolled node is a typed
 * error (never a phantom record); revoking an already-revoked node is a
 * typed error (the revocation history is append-once).
 */
export function revokeNode(
  state: NodeRegistryState,
  input: {
    readonly nodeId: string;
    readonly revokedAt: string;
    readonly reason: string;
    readonly revokedBy: string;
  },
): NodeRegistryState {
  if (
    typeof input?.nodeId !== "string" ||
    input.nodeId.length === 0 ||
    typeof input?.revokedAt !== "string" ||
    input.revokedAt.length === 0 ||
    typeof input?.reason !== "string" ||
    input.reason.length === 0 ||
    typeof input?.revokedBy !== "string" ||
    input.revokedBy.length === 0
  ) {
    throw new NodeRegistryError(
      "a revocation must carry the nodeId, the revokedAt instant, the reason and the revoking authority (accountable revocation)",
    );
  }
  if (!state.enrollments.some((existing) => existing.nodeId === input.nodeId)) {
    throw new NodeRegistryError(
      `node '${input.nodeId}' is not enrolled — a phantom revocation is never recorded`,
      { nodeId: input.nodeId },
    );
  }
  if (state.revocations.some((existing) => existing.nodeId === input.nodeId)) {
    throw new NodeRegistryError(
      `node '${input.nodeId}' is already revoked — the revocation history is append-once`,
      { nodeId: input.nodeId },
    );
  }
  return deepFreeze({
    enrollments: state.enrollments,
    revocations: Object.freeze([
      ...state.revocations,
      deepFreeze({
        nodeId: input.nodeId,
        revokedAt: input.revokedAt,
        reason: input.reason,
        revokedBy: input.revokedBy,
      }),
    ]),
  });
}

/** True iff the node is revoked (an unknown node is NOT revoked — a separate lookup). */
export function isNodeRevoked(state: NodeRegistryState, nodeId: string): boolean {
  return state.revocations.some((record) => record.nodeId === nodeId);
}

/** The enrollment record for a node, if any (undefined = not enrolled). */
export function nodeEnrollment(
  state: NodeRegistryState,
  nodeId: string,
): NodeEnrollmentRecord | undefined {
  return state.enrollments.find((record) => record.nodeId === nodeId);
}

/**
 * The ACTIVE projection: enrolled nodes that are not revoked. A revoked
 * node NEVER appears here — its offers contribute nothing downstream.
 */
export function activeEnrollments(state: NodeRegistryState): readonly NodeEnrollmentRecord[] {
  return Object.freeze(
    state.enrollments.filter((record) => !isNodeRevoked(state, record.nodeId)),
  );
}

/** The revocation record for a node, if any (the accountability fact). */
export function nodeRevocation(
  state: NodeRegistryState,
  nodeId: string,
): NodeRevocationRecord | undefined {
  return state.revocations.find((record) => record.nodeId === nodeId);
}

/**
 * The registry digest (order-independent: records canonically sorted by
 * nodeId before digesting; covers enrollments AND revocations — a
 * registry state without its revocations is a different registry).
 */
export function nodeRegistryDigest(state: NodeRegistryState): string {
  return contentDigest({
    enrollments: sortedBy(state.enrollments, (record) => record.nodeId).map((record) =>
      contentDigest(record),
    ),
    revocations: sortedBy(state.revocations, (record) => record.nodeId).map((record) =>
      contentDigest(record),
    ),
  });
}
