/**
 * @payswap/route-planning — the typed route-graph SCHEMA (P27-D,
 * ADR-0020 D6; the vertex/edge vocabulary + the bounded-by-construction
 * graph validation, split from graph-search.ts per the 400-line file law).
 *
 * Each provider operation is a TYPED EDGE; each provider account, verified
 * node and permitted settlement venue is a TYPED VERTEX (ADR-0020 D6).
 * Every vertex carries its jurisdiction (the country gates consult it);
 * every edge carries its exact provider operation (mechanism, never
 * permission — D1), the node operating it (null = the local PaySwap
 * instance) and its positive exact amount. The graph is BOUNDED BY
 * CONSTRUCTION (64 vertices / 256 edges — a larger graph is an input
 * defect, refused) and COMPLETE (an edge referencing a vertex outside the
 * graph is refused): the bounded search (graph-search.ts) may then
 * enumerate paths COMPLETELY within the intent's hop bound.
 */

import { RouteSearchBudgetError } from "./errors.ts";
import { deepFreeze, isNonEmptyString } from "./canonical.ts";

/** The typed vertex kinds (ADR-0020 D6). */
export const ROUTE_VERTEX_KINDS = Object.freeze([
  "SENDER",
  "PROVIDER_ACCOUNT",
  "VERIFIED_NODE",
  "SETTLEMENT_VENUE",
  "BENEFICIARY",
] as const);

export type RouteVertexKind = (typeof ROUTE_VERTEX_KINDS)[number];

/** The typed edge kinds (a provider operation / a node relay / a settlement). */
export const ROUTE_EDGE_KINDS = Object.freeze([
  "PROVIDER_OPERATION",
  "NODE_RELAY",
  "SETTLEMENT",
] as const);

export type RouteEdgeKind = (typeof ROUTE_EDGE_KINDS)[number];

/** One typed vertex (a provider account, a verified node, a settlement venue). */
export interface RouteVertex {
  readonly vertexId: string;
  readonly kind: RouteVertexKind;
  /** The jurisdiction this vertex sits in (the country gates consult it). */
  readonly jurisdiction: string;
  readonly providerName?: string;
  readonly nodeId?: string;
}

/** One typed edge (a provider operation with its leg-manifest subset). */
export interface RouteGraphEdge {
  readonly edgeId: string;
  readonly kind: RouteEdgeKind;
  readonly fromVertexId: string;
  readonly toVertexId: string;
  /** The exact provider operation id (mechanism, never permission — D1). */
  readonly operation: string;
  /** The node operating this edge (null = the local PaySwap instance). */
  readonly operatingNodeId: string | null;
  readonly amount: { readonly currency: string; readonly minorUnits: string };
  /** The candidate-fact reference this edge derives from (provenance). */
  readonly sourceOfferFactRef?: string;
}

/** The typed route graph (bounded by construction: 64 vertices / 256 edges). */
export interface RouteGraph {
  readonly vertices: readonly RouteVertex[];
  readonly edges: readonly RouteGraphEdge[];
}

/** The graph construction bounds (a larger graph is an input defect, refused). */
export const ROUTE_GRAPH_LIMITS = Object.freeze({ maxVertices: 64, maxEdges: 256 } as const);

function validateVertex(candidate: unknown): RouteVertex {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw new RouteSearchBudgetError("a route vertex must be an object");
  }
  const record = candidate as Record<string, unknown>;
  const vertexId = record["vertexId"];
  if (!isNonEmptyString(vertexId)) {
    throw new RouteSearchBudgetError("a route vertex must carry a non-empty vertexId");
  }
  if (!(ROUTE_VERTEX_KINDS as readonly unknown[]).includes(record["kind"])) {
    throw new RouteSearchBudgetError(
      `vertex '${vertexId}' carries kind '${String(record["kind"])}' outside the typed vertex vocabulary`,
    );
  }
  if (typeof record["jurisdiction"] !== "string" || !/^[A-Z]{2}$/.test(record["jurisdiction"])) {
    throw new RouteSearchBudgetError(
      `vertex '${vertexId}' must carry its two-letter jurisdiction (the country gates consult it)`,
    );
  }
  return deepFreeze({
    vertexId,
    kind: record["kind"] as RouteVertexKind,
    jurisdiction: record["jurisdiction"] as string,
    ...(isNonEmptyString(record["providerName"])
      ? { providerName: record["providerName"] as string }
      : {}),
    ...(isNonEmptyString(record["nodeId"]) ? { nodeId: record["nodeId"] as string } : {}),
  });
}

function validateEdge(candidate: unknown, vertexIds: ReadonlySet<string>): RouteGraphEdge {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw new RouteSearchBudgetError("a route graph edge must be an object");
  }
  const record = candidate as Record<string, unknown>;
  for (const field of ["edgeId", "operation"] as const) {
    if (!isNonEmptyString(record[field])) {
      throw new RouteSearchBudgetError(`a route graph edge must carry a non-empty ${field}`);
    }
  }
  if (!(ROUTE_EDGE_KINDS as readonly unknown[]).includes(record["kind"])) {
    throw new RouteSearchBudgetError(
      `edge '${String(record["edgeId"])}' carries kind '${String(record["kind"])}' outside the typed edge vocabulary`,
    );
  }
  if (!vertexIds.has(String(record["fromVertexId"])) || !vertexIds.has(String(record["toVertexId"]))) {
    throw new RouteSearchBudgetError(
      `edge '${String(record["edgeId"])}' references a vertex outside the graph — the graph must be complete`,
    );
  }
  const amount = record["amount"];
  const amountIsRecord =
    typeof amount === "object" && amount !== null && !Array.isArray(amount);
  if (
    !amountIsRecord ||
    typeof (amount as Record<string, unknown>)["currency"] !== "string" ||
    !/^[A-Z]{3}$/.test(String((amount as Record<string, unknown>)["currency"])) ||
    typeof (amount as Record<string, unknown>)["minorUnits"] !== "string" ||
    !/^[1-9][0-9]*$/.test(String((amount as Record<string, unknown>)["minorUnits"]))
  ) {
    throw new RouteSearchBudgetError(
      `edge '${String(record["edgeId"])}' must carry a positive exact amount (currency + minorUnits)`,
    );
  }
  return deepFreeze({
    edgeId: record["edgeId"] as string,
    kind: record["kind"] as RouteEdgeKind,
    fromVertexId: record["fromVertexId"] as string,
    toVertexId: record["toVertexId"] as string,
    operation: record["operation"] as string,
    operatingNodeId:
      record["operatingNodeId"] === null || record["operatingNodeId"] === undefined
        ? null
        : (record["operatingNodeId"] as string),
    amount: deepFreeze({
      currency: (amount as Record<string, unknown>)["currency"] as string,
      minorUnits: (amount as Record<string, unknown>)["minorUnits"] as string,
    }),
    ...(isNonEmptyString(record["sourceOfferFactRef"])
      ? { sourceOfferFactRef: record["sourceOfferFactRef"] as string }
      : {}),
  });
}

/** Build (validate) the typed route graph: unique ids, complete edges, bounded size. */
export function buildRouteGraph(input: {
  readonly vertices: readonly unknown[];
  readonly edges: readonly unknown[];
}): RouteGraph {
  if (!Array.isArray(input.vertices) || input.vertices.length === 0) {
    throw new RouteSearchBudgetError("the route graph needs at least one vertex");
  }
  if (input.vertices.length > ROUTE_GRAPH_LIMITS.maxVertices) {
    throw new RouteSearchBudgetError(
      `the route graph carries at most ${ROUTE_GRAPH_LIMITS.maxVertices} vertices (${input.vertices.length} given) — a larger graph is an input defect`,
    );
  }
  if (!Array.isArray(input.edges)) {
    throw new RouteSearchBudgetError("the route graph edges must be an array");
  }
  if (input.edges.length > ROUTE_GRAPH_LIMITS.maxEdges) {
    throw new RouteSearchBudgetError(
      `the route graph carries at most ${ROUTE_GRAPH_LIMITS.maxEdges} edges (${input.edges.length} given) — a larger graph is an input defect`,
    );
  }
  const vertices = input.vertices.map(validateVertex);
  const seen = new Set<string>();
  for (const vertex of vertices) {
    if (seen.has(vertex.vertexId)) {
      throw new RouteSearchBudgetError(
        `duplicate vertexId '${vertex.vertexId}' — the vertex identity is unique`,
      );
    }
    seen.add(vertex.vertexId);
  }
  const edges = input.edges.map((edge) => validateEdge(edge, seen));
  const edgeIds = new Set<string>();
  for (const edge of edges) {
    if (edgeIds.has(edge.edgeId)) {
      throw new RouteSearchBudgetError(
        `duplicate edgeId '${edge.edgeId}' — the edge identity is unique`,
      );
    }
    edgeIds.add(edge.edgeId);
  }
  return deepFreeze({ vertices: Object.freeze(vertices), edges: Object.freeze(edges) });
}
