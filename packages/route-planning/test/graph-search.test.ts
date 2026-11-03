import { describe, expect, it } from "vitest";
import {
  ROUTE_EDGE_KINDS,
  ROUTE_GRAPH_LIMITS,
  ROUTE_VERTEX_KINDS,
  buildRouteGraph,
  type RouteGraph,
} from "../src/graph-schema.ts";
import { searchRoutePaths } from "../src/graph-search.ts";
import { RouteSearchBudgetError } from "../src/errors.ts";

/**
 * THE BOUNDED ROUTE-GRAPH SEARCH (ADR-0020 D6 under the ADR-0009 D6
 * bounded-search law): typed vertices/edges, complete enumeration within
 * the intent's hop bound, count-based budgets with ONE truncation receipt
 * per truncating dimension carrying the TRUE pre-cut totals, coverage
 * COMPLETE only when NO receipt exists, canonical determinism, and the
 * discovery literal (a found path never permits execution).
 */

const GENEROUS = { maxPathCandidates: 64, maxDistinctVertices: 64, maxDistinctEdges: 256 };

function vertex(vertexId: string, jurisdiction: string, kind = "PROVIDER_ACCOUNT") {
  return { vertexId, kind, jurisdiction };
}

function edge(
  edgeId: string,
  fromVertexId: string,
  toVertexId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    edgeId,
    kind: "PROVIDER_OPERATION",
    fromVertexId,
    toVertexId,
    operation: `op:${edgeId}`,
    operatingNodeId: null,
    amount: { currency: "USD", minorUnits: "1000" },
    ...overrides,
  };
}

/** origin -> {a1,a2,a3} -> destination: THREE 2-hop paths (5 vertices, 6 edges). */
function diamondGraph(): RouteGraph {
  return buildRouteGraph({
    vertices: [
      vertex("v:origin", "US", "SENDER"),
      vertex("v:a1", "US"),
      vertex("v:a2", "GB"),
      vertex("v:a3", "GH"),
      vertex("v:dest", "KE", "BENEFICIARY"),
    ],
    edges: [
      ...["a1", "a2", "a3"].flatMap((mid) => [
        edge(`e:o-${mid}`, "v:origin", `v:${mid}`),
        edge(`e:${mid}-d`, `v:${mid}`, "v:dest"),
      ]),
    ],
  });
}

describe("buildRouteGraph — the typed bounded-by-construction schema", () => {
  it("accepts a typed graph and freezes it", () => {
    const graph = buildRouteGraph({
      vertices: [vertex("v:origin", "US", "SENDER"), vertex("v:dest", "KE", "BENEFICIARY")],
      edges: [edge("e:1", "v:origin", "v:dest")],
    });
    expect(graph.vertices).toHaveLength(2);
    expect(Object.isFrozen(graph)).toBe(true);
    expect(Object.isFrozen(graph.vertices)).toBe(true);
  });

  it("the vertex/edge vocabularies are frozen and closed", () => {
    expect(Object.isFrozen(ROUTE_VERTEX_KINDS)).toBe(true);
    expect([...ROUTE_VERTEX_KINDS]).toEqual([
      "SENDER",
      "PROVIDER_ACCOUNT",
      "VERIFIED_NODE",
      "SETTLEMENT_VENUE",
      "BENEFICIARY",
    ]);
    expect(Object.isFrozen(ROUTE_EDGE_KINDS)).toBe(true);
    expect([...ROUTE_EDGE_KINDS]).toEqual([
      "PROVIDER_OPERATION",
      "NODE_RELAY",
      "SETTLEMENT",
    ]);
  });

  it("rejects duplicate vertex/edge identities and foreign vertices (the graph must be complete)", () => {
    expect(() =>
      buildRouteGraph({
        vertices: [vertex("v:a", "US"), vertex("v:a", "US")],
        edges: [],
      }),
    ).toThrow(RouteSearchBudgetError);
    expect(() =>
      buildRouteGraph({
        vertices: [vertex("v:a", "US")],
        edges: [edge("e:1", "v:a", "v:missing")],
      }),
    ).toThrow(RouteSearchBudgetError);
    expect(() =>
      buildRouteGraph({
        vertices: [vertex("v:a", "US"), vertex("v:b", "US")],
        edges: [edge("e:1", "v:a", "v:b"), edge("e:1", "v:b", "v:a")],
      }),
    ).toThrow(RouteSearchBudgetError);
  });

  it("rejects malformed vertices and edges (typed jurisdiction, positive amount, closed kinds)", () => {
    expect(() => buildRouteGraph({ vertices: [vertex("v:a", "usa")], edges: [] })).toThrow(
      RouteSearchBudgetError,
    );
    expect(() =>
      buildRouteGraph({ vertices: [{ vertexId: "v:a", kind: "PLANET", jurisdiction: "US" }], edges: [] }),
    ).toThrow(RouteSearchBudgetError);
    expect(() =>
      buildRouteGraph({
        vertices: [vertex("v:a", "US"), vertex("v:b", "US")],
        edges: [edge("e:1", "v:a", "v:b", { amount: { currency: "USD", minorUnits: "0" } })],
      }),
    ).toThrow(RouteSearchBudgetError);
    expect(() => buildRouteGraph({ vertices: [], edges: [] })).toThrow(RouteSearchBudgetError);
  });

  it("a graph beyond the construction bounds is an input defect, refused", () => {
    const many = Array.from({ length: ROUTE_GRAPH_LIMITS.maxVertices + 1 }, (_, index) =>
      vertex(`v:${index}`, "US"),
    );
    expect(() => buildRouteGraph({ vertices: many, edges: [] })).toThrow(RouteSearchBudgetError);
    const two = [vertex("v:a", "US"), vertex("v:b", "US")];
    const manyEdges = Array.from({ length: ROUTE_GRAPH_LIMITS.maxEdges + 1 }, (_, index) =>
      edge(`e:${index}`, "v:a", "v:b"),
    );
    expect(() => buildRouteGraph({ vertices: two, edges: manyEdges })).toThrow(RouteSearchBudgetError);
  });
});

describe("searchRoutePaths — the bounded graph search", () => {
  it("enumerates COMPLETELY within the hop bound (all three 2-hop paths through the diamond)", () => {
    const search = searchRoutePaths({
      graph: diamondGraph(),
      originVertexId: "v:origin",
      destinationVertexId: "v:dest",
      maxHops: 2,
      budget: GENEROUS,
    });
    expect(search.admitted).toHaveLength(3);
    expect(search.receipts).toEqual([]);
    expect(search.coverage).toBe("COMPLETE");
    for (const path of search.admitted) {
      expect(path.hopCount).toBe(2);
      expect(path.jurisdictions.length).toBeGreaterThan(0);
    }
  });

  it("respects the intent's hop bound: a 1-hop bound finds nothing in the 2-hop diamond", () => {
    const search = searchRoutePaths({
      graph: diamondGraph(),
      originVertexId: "v:origin",
      destinationVertexId: "v:dest",
      maxHops: 1,
      budget: GENEROUS,
    });
    expect(search.admitted).toEqual([]);
    expect(search.coverage).toBe("COMPLETE");
  });

  it("simple paths only — a vertex is never revisited (no cycles)", () => {
    const graph = buildRouteGraph({
      vertices: [vertex("v:a", "US"), vertex("v:b", "GB"), vertex("v:c", "KE")],
      edges: [
        edge("e:1", "v:a", "v:b"),
        edge("e:2", "v:b", "v:c"),
        edge("e:3", "v:c", "v:a"),
        edge("e:4", "v:c", "v:b"),
      ],
    });
    const search = searchRoutePaths({
      graph,
      originVertexId: "v:a",
      destinationVertexId: "v:c",
      maxHops: 4,
      budget: GENEROUS,
    });
    expect(search.admitted).toHaveLength(1);
    expect(search.admitted[0]?.edgeIds).toEqual(["e:1", "e:2"]);
  });

  it("THE TRUNCATION RECEIPT fires at the budget boundary with the TRUE pre-cut total", () => {
    const search = searchRoutePaths({
      graph: diamondGraph(),
      originVertexId: "v:origin",
      destinationVertexId: "v:dest",
      maxHops: 2,
      budget: { maxPathCandidates: 2, maxDistinctVertices: 64, maxDistinctEdges: 256 },
    });
    expect(search.admitted).toHaveLength(2);
    expect(search.receipts).toHaveLength(1);
    const receipt = search.receipts[0];
    expect(receipt?.dimension).toBe("maxPathCandidates");
    expect(receipt?.limit).toBe(2);
    expect(receipt?.actualCount).toBe(3);
    expect(receipt?.disclosedAs).toBe("TRUNCATED");
    expect(search.coverage).toBe("TRUNCATED");
  });

  it("the distinct-vertex dimension emits its own receipt (the true 5-vertex enumeration under a 4-vertex budget)", () => {
    const search = searchRoutePaths({
      graph: diamondGraph(),
      originVertexId: "v:origin",
      destinationVertexId: "v:dest",
      maxHops: 2,
      budget: { maxPathCandidates: 9, maxDistinctVertices: 4, maxDistinctEdges: 256 },
    });
    // the complete enumeration covers 5 distinct vertices; the first path
    // adds 3, the second adds 1 (4 <= 4 fits), the third would exceed.
    expect(search.admitted).toHaveLength(2);
    const vertexReceipt = search.receipts.find((r) => r.dimension === "maxDistinctVertices");
    expect(vertexReceipt?.limit).toBe(4);
    expect(vertexReceipt?.actualCount).toBe(5);
    expect(search.coverage).toBe("TRUNCATED");
  });

  it("STRUCTURAL LAW: COMPLETE is claimed ONLY when no receipt exists (never 'all routes searched' when capped)", () => {
    const capped = searchRoutePaths({
      graph: diamondGraph(),
      originVertexId: "v:origin",
      destinationVertexId: "v:dest",
      maxHops: 2,
      budget: { maxPathCandidates: 2, maxDistinctVertices: 64, maxDistinctEdges: 256 },
    });
    expect(capped.receipts.length).toBeGreaterThan(0);
    expect(capped.coverage).toBe("TRUNCATED");
    const full = searchRoutePaths({
      graph: diamondGraph(),
      originVertexId: "v:origin",
      destinationVertexId: "v:dest",
      maxHops: 2,
      budget: GENEROUS,
    });
    expect(full.receipts.length).toBe(0);
    expect(full.coverage).toBe("COMPLETE");
  });

  it("deterministic + input-order independent: permuted edge order yields identical admitted paths and digest", () => {
    const base = diamondGraph();
    const permutedEdges = [...base.edges].reverse();
    const permuted = buildRouteGraph({ vertices: [...base.vertices].reverse(), edges: permutedEdges });
    const left = searchRoutePaths({
      graph: base,
      originVertexId: "v:origin",
      destinationVertexId: "v:dest",
      maxHops: 2,
      budget: { maxPathCandidates: 5, maxDistinctVertices: 64, maxDistinctEdges: 256 },
    });
    const right = searchRoutePaths({
      graph: permuted,
      originVertexId: "v:origin",
      destinationVertexId: "v:dest",
      maxHops: 2,
      budget: { maxPathCandidates: 5, maxDistinctVertices: 64, maxDistinctEdges: 256 },
    });
    expect(right.searchDigest).toBe(left.searchDigest);
    expect(right.admitted.map((path) => path.pathId)).toEqual(left.admitted.map((path) => path.pathId));
  });

  it("the path projection carries jurisdictions, operating nodes and offer-fact provenance", () => {
    const graph = buildRouteGraph({
      vertices: [
        vertex("v:origin", "US", "SENDER"),
        { vertexId: "v:node-gh", kind: "VERIFIED_NODE", jurisdiction: "GH", nodeId: "node:gh-1" },
        vertex("v:dest", "KE", "BENEFICIARY"),
      ],
      edges: [
        edge("e:1", "v:origin", "v:node-gh", {
          kind: "NODE_RELAY",
          operatingNodeId: "node:gh-1",
          sourceOfferFactRef: "fact:offer-gh-1",
        }),
        edge("e:2", "v:node-gh", "v:dest", {
          kind: "NODE_RELAY",
          operatingNodeId: "node:gh-1",
          sourceOfferFactRef: "fact:offer-gh-1",
        }),
      ],
    });
    const search = searchRoutePaths({
      graph,
      originVertexId: "v:origin",
      destinationVertexId: "v:dest",
      maxHops: 2,
      budget: GENEROUS,
    });
    const path = search.admitted[0];
    expect(path?.jurisdictions).toEqual(["US", "GH", "KE"]);
    expect(path?.operatingNodeIds).toEqual(["node:gh-1"]);
    expect(path?.sourceOfferFactRefs).toEqual(["fact:offer-gh-1"]);
  });

  it("the hop bound is validated (an integer in [1, 8]; the intent's maxRouteHops vocabulary)", () => {
    for (const bad of [0, 9, 2.5, -1]) {
      expect(() =>
        searchRoutePaths({
          graph: diamondGraph(),
          originVertexId: "v:origin",
          destinationVertexId: "v:dest",
          maxHops: bad,
          budget: GENEROUS,
        }),
      ).toThrow(RouteSearchBudgetError);
    }
  });

  it("the budget is validated (positive integers only — count-based, no wall clock)", () => {
    for (const bad of [0, -1, 1.5]) {
      expect(() =>
        searchRoutePaths({
          graph: diamondGraph(),
          originVertexId: "v:origin",
          destinationVertexId: "v:dest",
          maxHops: 3,
          budget: { maxPathCandidates: bad, maxDistinctVertices: 4, maxDistinctEdges: 4 },
        }),
      ).toThrow(RouteSearchBudgetError);
    }
  });

  it("the origin and destination must be members of the graph", () => {
    expect(() =>
      searchRoutePaths({
        graph: diamondGraph(),
        originVertexId: "v:not-there",
        destinationVertexId: "v:dest",
        maxHops: 3,
        budget: GENEROUS,
      }),
    ).toThrow(RouteSearchBudgetError);
  });

  it("THE DISCOVERY LAW: graphSearchPermitsExecution is the literal false and outputs are frozen", () => {
    const search = searchRoutePaths({
      graph: diamondGraph(),
      originVertexId: "v:origin",
      destinationVertexId: "v:dest",
      maxHops: 2,
      budget: GENEROUS,
    });
    expect(search.graphSearchPermitsExecution).toBe(false);
    expect(Object.isFrozen(search)).toBe(true);
    expect(Object.isFrozen(search.admitted)).toBe(true);
    expect(Object.isFrozen(search.receipts)).toBe(true);
    expect(search.searchDigest).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  });
});
