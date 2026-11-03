/**
 * @payswap/route-planning — the bounded route-graph search (P27-D,
 * ADR-0020 D6; the ADR-0009 D6 bounded-search law over the typed graph).
 *
 * Each provider operation is a TYPED EDGE; each provider account, verified
 * node and permitted settlement venue is a TYPED VERTEX (the schema lives
 * in graph-schema.ts, split per the 400-line file law). The search
 * enumerates simple origin→destination paths up to the intent's hop bound
 * in a canonical order (deterministic, input-order independent), then
 * admits them greedily under the COUNT-BASED budget while all dimension
 * counters fit — with ONE truncation receipt per truncating dimension
 * carrying the TRUE pre-cut total of the COMPLETE enumeration (the graph
 * is bounded and validated at build; the hop bound is the intent's own
 * constraint). Coverage is COMPLETE only when NO receipt exists: a capped
 * search NEVER claims "all routes searched".
 *
 * The output is DISCOVERY (path candidates with their jurisdictions and
 * provenance) — `graphSearchPermitsExecution` is the literal false; the
 * eligibility gates (eligibility-gates.ts) run BEFORE any ranking, and
 * nothing here is executable because a path was found.
 */

import { RouteSearchBudgetError } from "./errors.ts";
import { contentDigest, deepFreeze } from "./canonical.ts";
import type { RouteGraph } from "./graph-schema.ts";
import {
  validateRouteGraphSearchBudget,
  type RouteGraphSearchBudget,
  type RouteGraphTruncationReceipt,
} from "./search-budget.ts";

/** One enumerated path candidate (discovery output; never executable). */
export interface RoutePathCandidate {
  readonly pathId: string;
  readonly originVertexId: string;
  readonly destinationVertexId: string;
  readonly vertexIds: readonly string[];
  readonly edgeIds: readonly string[];
  readonly hopCount: number;
  /** Every jurisdiction the path touches (origin, hops, destination). */
  readonly jurisdictions: readonly string[];
  /** Every node operating a leg of this path (empty = fully local). */
  readonly operatingNodeIds: readonly string[];
  /** The candidate-fact references the path's edges derive from. */
  readonly sourceOfferFactRefs: readonly string[];
}

/** The budgeted graph-search output contract. */
export interface BudgetedRoutePathSearch {
  readonly budget: RouteGraphSearchBudget;
  /** The admitted paths, canonically ordered by pathId. */
  readonly admitted: readonly RoutePathCandidate[];
  readonly receipts: readonly RouteGraphTruncationReceipt[];
  readonly coverage: "COMPLETE" | "TRUNCATED";
  readonly searchDigest: string;
  /** LITERAL: a found path never permits execution. */
  readonly graphSearchPermitsExecution: false;
}

function pathsOf(
  graph: RouteGraph,
  originVertexId: string,
  destinationVertexId: string,
  maxHops: number,
): RoutePathCandidate[] {
  const verticesById = new Map(graph.vertices.map((vertex) => [vertex.vertexId, vertex]));
  const outgoing = new Map<string, RouteGraph["edges"][number][]>();
  for (const edge of graph.edges) {
    const list = outgoing.get(edge.fromVertexId) ?? [];
    list.push(edge);
    outgoing.set(edge.fromVertexId, list);
  }
  for (const list of outgoing.values()) {
    list.sort((left, right) => (left.edgeId < right.edgeId ? -1 : left.edgeId > right.edgeId ? 1 : 0));
  }
  const found: RoutePathCandidate[] = [];
  const visit = (
    currentVertexId: string,
    visited: string[],
    edgePath: RouteGraph["edges"][number][],
  ): void => {
    if (edgePath.length >= maxHops) {
      return;
    }
    for (const edge of outgoing.get(currentVertexId) ?? []) {
      if (visited.includes(edge.toVertexId)) {
        continue; // simple paths only — a vertex is never revisited
      }
      const nextVisited = [...visited, edge.toVertexId];
      const nextEdges = [...edgePath, edge];
      if (edge.toVertexId === destinationVertexId) {
        const pathVertices = [originVertexId, ...nextVisited];
        const jurisdictions = [
          ...new Set(pathVertices.map((id) => verticesById.get(id)?.jurisdiction ?? "")),
        ].filter((code) => code !== "");
        found.push(
          deepFreeze({
            pathId: `route-path:${contentDigest({ edges: nextEdges.map((edge_) => edge_.edgeId) })}`,
            originVertexId,
            destinationVertexId,
            vertexIds: Object.freeze(pathVertices),
            edgeIds: Object.freeze(nextEdges.map((edge_) => edge_.edgeId)),
            hopCount: nextEdges.length,
            jurisdictions: Object.freeze(jurisdictions),
            operatingNodeIds: Object.freeze([
              ...new Set(
                nextEdges
                  .map((edge_) => edge_.operatingNodeId)
                  .filter((id): id is string => id !== null),
              ),
            ]),
            sourceOfferFactRefs: Object.freeze([
              ...new Set(
                nextEdges
                  .map((edge_) => edge_.sourceOfferFactRef)
                  .filter((ref): ref is string => ref !== undefined),
              ),
            ]),
          }),
        );
        continue;
      }
      visit(edge.toVertexId, nextVisited, nextEdges);
    }
  };
  visit(originVertexId, [originVertexId], []);
  return found;
}

/**
 * Search the typed graph for simple origin→destination paths under the
 * count-based budget: enumerate COMPLETELY (bounded graph + the intent's
 * hop bound), order canonically by pathId, admit greedily while every
 * dimension counter fits, and emit ONE receipt per truncating dimension
 * with the TRUE pre-cut totals. COMPLETE only when NO receipt exists.
 */
export function searchRoutePaths(input: {
  readonly graph: RouteGraph;
  readonly originVertexId: string;
  readonly destinationVertexId: string;
  /** The intent's own hop bound (1..8; a path never exceeds it). */
  readonly maxHops: number;
  readonly budget: RouteGraphSearchBudget;
}): BudgetedRoutePathSearch {
  const budget = validateRouteGraphSearchBudget(input.budget);
  if (
    typeof input.maxHops !== "number" ||
    !Number.isSafeInteger(input.maxHops) ||
    input.maxHops < 1 ||
    input.maxHops > 8
  ) {
    throw new RouteSearchBudgetError(
      "the hop bound must be an integer in [1, 8] (the intent's maxRouteHops vocabulary)",
    );
  }
  const vertexIds = new Set(input.graph.vertices.map((vertex) => vertex.vertexId));
  if (!vertexIds.has(input.originVertexId) || !vertexIds.has(input.destinationVertexId)) {
    throw new RouteSearchBudgetError(
      "the origin and destination vertices must be members of the graph",
    );
  }
  const enumerated = pathsOf(
    input.graph,
    input.originVertexId,
    input.destinationVertexId,
    input.maxHops,
  );
  const canonical = [...enumerated].sort((left, right) =>
    left.pathId < right.pathId ? -1 : left.pathId > right.pathId ? 1 : 0,
  );
  const totalPaths = canonical.length;
  const allVertices = new Set<string>();
  const allEdges = new Set<string>();
  for (const path of canonical) {
    for (const vertexId of path.vertexIds) {
      allVertices.add(vertexId);
    }
    for (const edgeId of path.edgeIds) {
      allEdges.add(edgeId);
    }
  }
  const admitted: RoutePathCandidate[] = [];
  const admittedVertices = new Set<string>();
  const admittedEdges = new Set<string>();
  for (const path of canonical) {
    const newVertices = path.vertexIds.filter((vertexId) => !admittedVertices.has(vertexId));
    const newEdges = path.edgeIds.filter((edgeId) => !admittedEdges.has(edgeId));
    const fits =
      admitted.length < budget.maxPathCandidates &&
      admittedVertices.size + newVertices.length <= budget.maxDistinctVertices &&
      admittedEdges.size + newEdges.length <= budget.maxDistinctEdges;
    if (!fits) {
      break;
    }
    admitted.push(path);
    for (const vertexId of newVertices) {
      admittedVertices.add(vertexId);
    }
    for (const edgeId of newEdges) {
      admittedEdges.add(edgeId);
    }
  }
  const receipts: RouteGraphTruncationReceipt[] = [];
  if (totalPaths > budget.maxPathCandidates) {
    receipts.push({
      dimension: "maxPathCandidates",
      limit: budget.maxPathCandidates,
      actualCount: totalPaths,
      disclosedAs: "TRUNCATED",
    });
  }
  if (allVertices.size > budget.maxDistinctVertices) {
    receipts.push({
      dimension: "maxDistinctVertices",
      limit: budget.maxDistinctVertices,
      actualCount: allVertices.size,
      disclosedAs: "TRUNCATED",
    });
  }
  if (allEdges.size > budget.maxDistinctEdges) {
    receipts.push({
      dimension: "maxDistinctEdges",
      limit: budget.maxDistinctEdges,
      actualCount: allEdges.size,
      disclosedAs: "TRUNCATED",
    });
  }
  const coverage: "COMPLETE" | "TRUNCATED" = receipts.length > 0 ? "TRUNCATED" : "COMPLETE";
  const searchDigest = contentDigest({
    origin: input.originVertexId,
    destination: input.destinationVertexId,
    maxHops: input.maxHops,
    budget,
    admitted: admitted.map((path) => path.pathId),
    receipts,
    coverage,
  });
  return deepFreeze({
    budget,
    admitted: Object.freeze(admitted),
    receipts: Object.freeze(receipts),
    coverage,
    searchDigest,
    graphSearchPermitsExecution: false as const,
  });
}
