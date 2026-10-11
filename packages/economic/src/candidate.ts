/**
 * @payswap/economic — candidate skeleton types (P1-W1, net-new).
 *
 * The typed output of deterministic candidate compilation. LAWS:
 *
 * - VERSIONED + FORWARD-COMPATIBLE, but this is NOT the Economic Execution
 *   Graph: the EEG formalism (typed, versioned multi-step plans carrying
 *   capability references, observations, policy/security verdicts,
 *   freshness, idempotency, finality and recourse semantics) is owned by
 *   P3-W2. A CandidateSkeleton is the DEMAND-SHAPED graph a goal compiles
 *   to — rail-agnostic placeholders with intent lineage, deliberately
 *   minimal so P3-W2 can supersede `formatVersion` without reinterpretation.
 * - RAIL-AWARE ROUTING, SCORING AND BEST-EXECUTION ARE OUT OF SCOPE (P5-W1):
 *   nodes/edges carry NO rail, provider, venue or capability identity.
 * - Stable content-derived ids: `skeletonId`, `nodeId` and `edgeId` are pure
 *   FNV-1a digests of canonical (sorted-key) JSON content; the compiler
 *   fail-closes on any derived-id collision.
 * - Intent lineage: every node references the compiled intent it belongs
 *   to; the skeleton references goal + authorization lineage (refs only —
 *   the skeleton establishes NO authorization and NO financial finality).
 * - Constraint propagation: the goal's constraints are carried verbatim;
 *   declared NON-goals and versioned economic inputs are carried in
 *   canonical (sorted) order.
 */

import type { IntentArchetype, IntentConstraints } from "./intent.ts";
import type { VersionedEconomicInput } from "./versioned-input.ts";

/** The skeleton format version (bump = forward-compatible supersession, never reinterpretation). */
export const CANDIDATE_SKELETON_FORMAT_VERSION = 1 as const;

/** Closed vocabulary of candidate node kinds (rail-agnostic demand roles). */
export const CANDIDATE_NODE_KINDS = [
  "VALUE_ORIGIN",
  "VALUE_MOVEMENT",
  "VALUE_DESTINATION",
  "SERVICE_PROVISION",
] as const;

/** The rail-agnostic role of one candidate graph node. */
export type CandidateNodeKind = (typeof CANDIDATE_NODE_KINDS)[number];

/** Closed vocabulary of candidate edge kinds. */
export const CANDIDATE_EDGE_KINDS = ["VALUE_FROM", "VALUE_TO"] as const;

/** The rail-agnostic meaning of one candidate graph edge. */
export type CandidateEdgeKind = (typeof CANDIDATE_EDGE_KINDS)[number];

/** One node of the candidate demand graph (references the intent; never re-declares it). */
export interface CandidateNode {
  /** Stable content-derived node identity. */
  readonly nodeId: string;
  /** The rail-agnostic demand role. */
  readonly kind: CandidateNodeKind;
  /** Intent lineage: the compiled intent this node belongs to. */
  readonly intentRef: string;
}

/** One edge of the candidate demand graph (ordering/flow of the demand, never a route). */
export interface CandidateEdge {
  /** Stable content-derived edge identity. */
  readonly edgeId: string;
  /** The node the edge starts from. */
  readonly fromNodeId: string;
  /** The node the edge ends at. */
  readonly toNodeId: string;
  /** The rail-agnostic edge meaning. */
  readonly kind: CandidateEdgeKind;
}

/** The 12 canonical CandidateSkeleton fields. */
export const CANDIDATE_SKELETON_KEYS = [
  "archetype",
  "authorizationRef",
  "constraints",
  "digest",
  "economicInputs",
  "edges",
  "formatVersion",
  "goalId",
  "intentRef",
  "nonGoals",
  "nodes",
  "skeletonId",
] as const;

/**
 * A CANDIDATE skeleton: the versioned, rail-agnostic demand graph compiled
 * from one goal outcome. NOT the EEG (P3-W2). ADVISORY DEMAND ONLY — no
 * authorization, no financial finality, no execution semantics.
 */
export interface CandidateSkeleton {
  /** Skeleton format version (forward-compatible; NOT the EEG). */
  readonly formatVersion: number;
  /** Stable content-derived skeleton identity (invariant across compile instants). */
  readonly skeletonId: string;
  /** Goal lineage. */
  readonly goalId: string;
  /** Intent lineage: the compiled intent this skeleton realizes. */
  readonly intentRef: string;
  /** The archetype of the realized intent. */
  readonly archetype: IntentArchetype;
  /** Authorization lineage (opaque ref propagated from the goal; never authority). */
  readonly authorizationRef: string;
  /** Constraints propagated verbatim from the goal. */
  readonly constraints: IntentConstraints;
  /** The demand-graph nodes (rail-agnostic roles, intent lineage refs). */
  readonly nodes: readonly CandidateNode[];
  /** The demand-graph edges (rail-agnostic flow, never a route). */
  readonly edges: readonly CandidateEdge[];
  /** Declared NON-goals carried from the goal in canonical (sorted) order. */
  readonly nonGoals: readonly string[];
  /** Versioned economic inputs pinned to this skeleton in canonical (sorted) order. */
  readonly economicInputs: readonly VersionedEconomicInput[];
  /** Content digest of the canonical compilation INCLUDING compiledAt + compiler version. */
  readonly digest: string;
}

/** The 5 canonical GoalCompilationResult fields. */
export const GOAL_COMPILATION_RESULT_KEYS = [
  "compiledAt",
  "compilerVersion",
  "goalId",
  "intents",
  "skeletons",
] as const;
