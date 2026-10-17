/**
 * Organization contracts (FROZEN-ARCHITECTURE §7, old INV-G02; canonical
 * INV-3: historical facts are immutable and versioned).
 *
 * An Organization is a VERSIONED GRAPH of Bodies/Instances with
 * communication edges, delegation edges, memory, budgets, evaluators,
 * termination and safety policy. Releasing a version freezes a content
 * hash; released versions are IMMUTABLE — history is never silently
 * rewritten. Every later version records `derivedFrom` lineage (the prior
 * version and its frozen content hash), so the version chain is explicit,
 * content-addressed evidence.
 *
 * Ported from payswap.org@8a735bf packages/agents/src/organization.ts.
 * Net-new in PaySwap 3.0: `derivedFrom` version lineage +
 * `nextOrganizationVersion` (explicit versioned-graph derivation).
 */

import { contentDigest } from "./canonical.ts";
import type { AmountSpec } from "./amount.ts";
import type { AgentBody } from "./body.ts";
import type { AgentInstance, VersionedRef } from "./instance.ts";
import type { MandateRef } from "@payswap/trust";

/**
 * Budget amounts use the exact AmountSpec wire type owned by
 * @payswap/trust (INV-2: exact/lossless monetary representation only).
 */

export interface OrganizationBudget {
  readonly budgetId: string;
  readonly scope: string;
  readonly amount: AmountSpec;
}

/** A communication edge of the versioned organization graph. */
export interface CommunicationEdge {
  readonly fromInstanceId: string;
  readonly toInstanceId: string;
  readonly channel: string;
}

/**
 * Reference to the mandate that authorizes one delegation edge. Full
 * mandate semantics live in the trust domain (type-only sibling import —
 * the wire authority for MandateRef).
 */
export type DelegationMandateRef = MandateRef;

/** A delegation edge of the versioned organization graph. */
export interface DelegationEdge {
  readonly fromInstanceId: string;
  readonly toInstanceId: string;
  readonly mandateRef: DelegationMandateRef;
}

/**
 * The organization memory boundary policy (FROZEN §7 "memory"):
 * - `scope` — who may READ what instances write:
 *   "shared" (every participant of the version reads all records) or
 *   "isolated" (an instance reads only its own records).
 * - `retention` — how long records live:
 *   "ephemeral" (NO memory is retained — writes fail closed),
 *   "session" (records live until the session is explicitly closed),
 *   "persistent" (append-only forever, carried forward explicitly).
 */
export interface OrganizationMemoryPolicy {
  readonly scope: "shared" | "isolated";
  readonly retention: "ephemeral" | "session" | "persistent";
}

/** Reference to an evaluation suite that judges this organization. */
export interface EvaluatorRef {
  readonly evaluationSuiteRef: string;
}

/** Termination policy: when the organization run must stop. */
export interface TerminationPolicy {
  readonly conditions: readonly string[];
  readonly requiresHumanApproval: boolean;
}

/** Safety policy: hard constraints + the escalation surface. */
export interface SafetyPolicy {
  readonly hardConstraints: readonly string[];
  readonly escalationSurfaceRef: string;
}

/** Lineage of one organization version back to the version it derives from. */
export interface OrganizationVersionLineage {
  readonly version: number;
  readonly contentHash: string;
}

/** A mutable, not-yet-released organization version. */
export interface OrganizationDraft {
  readonly id: string;
  readonly version: number;
  /** Version lineage: set when this draft derives from a released version. */
  readonly derivedFrom?: OrganizationVersionLineage;
  readonly bodies: readonly VersionedRef<AgentBody>[];
  readonly instances: readonly AgentInstance[];
  readonly communicationEdges: readonly CommunicationEdge[];
  readonly delegationEdges: readonly DelegationEdge[];
  readonly memory: OrganizationMemoryPolicy;
  readonly budgets: readonly OrganizationBudget[];
  readonly evaluators: readonly EvaluatorRef[];
  readonly termination: TerminationPolicy;
  readonly safetyPolicy: SafetyPolicy;
}

export interface OrganizationRelease {
  readonly releasedAt: number;
  readonly contentHash: string;
}

/** A released organization version: immutable and content-addressed. */
export interface ReleasedOrganization extends OrganizationDraft {
  readonly release: OrganizationRelease;
}

/** Raised when a draft violates organization graph invariants. */
export class OrganizationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationValidationError";
  }
}

/** Raised on any mutation attempt against a released organization. */
export class ReleasedOrganizationImmutableError extends Error {
  constructor(orgId: string, version: number) {
    super(
      `Organization ${orgId}@${version} is released and immutable: create a new version instead`,
    );
    this.name = "ReleasedOrganizationImmutableError";
  }
}

export function isReleased(
  org: OrganizationDraft | ReleasedOrganization,
): org is ReleasedOrganization {
  return (
    typeof (org as ReleasedOrganization).release === "object" &&
    (org as ReleasedOrganization).release !== null
  );
}

function validateDraft(draft: OrganizationDraft): void {
  if (draft.id.length === 0) {
    throw new OrganizationValidationError("organization id must not be empty");
  }
  if (draft.version < 1) {
    throw new OrganizationValidationError("organization version must be >= 1");
  }
  if (
    draft.derivedFrom !== undefined &&
    draft.derivedFrom.version >= draft.version
  ) {
    throw new OrganizationValidationError(
      `derivedFrom version ${draft.derivedFrom.version} must be strictly less than this draft's version ${draft.version}`,
    );
  }
  const instanceIds = new Set<string>();
  for (const instance of draft.instances) {
    if (instanceIds.has(instance.id)) {
      throw new OrganizationValidationError(`duplicate instance id '${instance.id}'`);
    }
    instanceIds.add(instance.id);
  }
  const bodyIds = new Set(draft.bodies.map((body) => body.id));
  for (const instance of draft.instances) {
    if (!bodyIds.has(instance.bodyRef.id)) {
      throw new OrganizationValidationError(
        `instance '${instance.id}' references unknown body '${instance.bodyRef.id}'`,
      );
    }
  }
  for (const edge of draft.communicationEdges) {
    if (!instanceIds.has(edge.fromInstanceId) || !instanceIds.has(edge.toInstanceId)) {
      throw new OrganizationValidationError(
        `communication edge ${edge.fromInstanceId} -> ${edge.toInstanceId} references an unknown instance`,
      );
    }
  }
  for (const edge of draft.delegationEdges) {
    if (!instanceIds.has(edge.fromInstanceId) || !instanceIds.has(edge.toInstanceId)) {
      throw new OrganizationValidationError(
        `delegation edge ${edge.fromInstanceId} -> ${edge.toInstanceId} references an unknown instance`,
      );
    }
  }
}

function deepFreeze(value: object): void {
  if (Object.isFrozen(value)) {
    return;
  }
  Object.freeze(value);
  for (const key of Object.keys(value)) {
    const child = (value as Readonly<Record<string, unknown>>)[key];
    if (child !== null && typeof child === "object") {
      deepFreeze(child);
    }
  }
}

function deepClone<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item)) as unknown as T;
  }
  const source = value as Readonly<Record<string, unknown>>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    result[key] = deepClone(source[key]);
  }
  return result as T;
}

/**
 * Release a draft: validates the graph, computes the content hash over the
 * canonical serialization, attaches the release record and deep-freezes the
 * result. Released versions are immutable.
 */
export function releaseOrganization(
  draft: OrganizationDraft,
  releasedAt: number,
): ReleasedOrganization {
  if (isReleased(draft)) {
    throw new ReleasedOrganizationImmutableError(draft.id, draft.version);
  }
  validateDraft(draft);
  const contentHash = contentDigest(draft);
  const released: ReleasedOrganization = {
    ...deepClone(draft),
    release: { releasedAt, contentHash },
  };
  deepFreeze(released);
  return released;
}

/**
 * Amend an organization. Released organizations are immutable: amending one
 * throws ReleasedOrganizationImmutableError. Drafts are amended by producing
 * a new draft object via the mutator; the target itself is not mutated.
 */
export function amendOrganization(
  target: OrganizationDraft | ReleasedOrganization,
  mutator: (draft: OrganizationDraft) => OrganizationDraft,
): OrganizationDraft {
  if (isReleased(target)) {
    throw new ReleasedOrganizationImmutableError(target.id, target.version);
  }
  return mutator(deepClone(target));
}

/**
 * Derive the NEXT version of an organization from a released one (P3-W1
 * net-new: explicit versioned-graph lineage). The returned draft:
 * - carries version `released.version + 1`;
 * - records `derivedFrom` lineage to the released version's FROZEN content
 *   hash (the chain is explicit, content-addressed evidence);
 * - never mutates the released source (released versions are immutable —
 *   history is preserved, never rewritten).
 */
export function nextOrganizationVersion(
  released: ReleasedOrganization,
): OrganizationDraft {
  const { release: _release, ...draftShape } = deepClone(released);
  return {
    ...draftShape,
    version: released.version + 1,
    derivedFrom: { version: released.version, contentHash: released.release.contentHash },
  };
}
