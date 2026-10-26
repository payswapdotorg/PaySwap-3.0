import { describe, expect, it } from "vitest";
import {
  corridorSideStage,
  requireCorridorProjectionPort,
  requireRouteCompilationPort,
  ROUTE_PLANNING_ENGINE_STAGES,
  unboundCorridorProjectionPort,
  unboundRouteCompilationPort,
  type CorridorProjectionPort,
  type RouteCompilationPort,
} from "../src/ports.ts";
import { PortUnboundError } from "../src/errors.ts";
import { movementCorridorQuery, realCorridorProjectionPort, recipientChain, senderChain } from "./fixtures.ts";

/**
 * THE PORT LAWS (ADR-0009 D2): every default port FAILS CLOSED with a
 * typed PortUnboundError carrying the EXACT unbound stage name. No
 * default fabricates data, falls back, or returns partial results.
 */

const CHAINS = [senderChain(), recipientChain()];

function corridorRequest(side: "SENDER" | "RECIPIENT") {
  return {
    side,
    query: movementCorridorQuery(),
    freshnessPolicy: { maxAgeSeconds: 3600 },
    chains: CHAINS,
  };
}

describe("the unbound corridor projection port (stages 2 and 3)", () => {
  it("the SENDER evaluation fails CLOSED naming stage-2 exactly", () => {
    const port: CorridorProjectionPort = unboundCorridorProjectionPort();
    expect(() => port.evaluateSide(corridorRequest("SENDER"))).toThrow(PortUnboundError);
    let stage = "";
    try {
      port.evaluateSide(corridorRequest("SENDER"));
    } catch (error) {
      expect(error).toBeInstanceOf(PortUnboundError);
      stage = (error as PortUnboundError & { details?: { stage: string } }).details?.stage ?? "";
    }
    expect(stage).toBe("stage-2:discover-sender-rails");
  });

  it("the RECIPIENT evaluation fails CLOSED naming stage-3 exactly", () => {
    const port: CorridorProjectionPort = unboundCorridorProjectionPort();
    let stage = "";
    try {
      port.evaluateSide(corridorRequest("RECIPIENT"));
    } catch (error) {
      expect(error).toBeInstanceOf(PortUnboundError);
      stage = (error as PortUnboundError & { details?: { stage: string } }).details?.stage ?? "";
    }
    expect(stage).toBe("stage-3:discover-recipient-rails");
  });

  it("the unbound error never fabricates a view (the message names the composition root)", () => {
    const port: CorridorProjectionPort = unboundCorridorProjectionPort();
    try {
      port.evaluateSide(corridorRequest("SENDER"));
      expect.unreachable("the unbound port must throw");
    } catch (error) {
      expect((error as Error).message).toContain("not bound");
      expect((error as Error).message).toContain("composition root");
    }
  });
});

describe("the unbound route compilation port (stage 4)", () => {
  it("every compile fails CLOSED naming stage-4 exactly", () => {
    const port: RouteCompilationPort = unboundRouteCompilationPort();
    let stage = "";
    try {
      port.compile({} as Parameters<RouteCompilationPort["compile"]>[0]);
    } catch (error) {
      expect(error).toBeInstanceOf(PortUnboundError);
      stage = (error as PortUnboundError & { details?: { stage: string } }).details?.stage ?? "";
    }
    expect(stage).toBe("stage-4:compile-available-routes");
  });

  it("the unbound error never fabricates plans or exclusions", () => {
    const port: RouteCompilationPort = unboundRouteCompilationPort();
    try {
      port.compile({} as Parameters<RouteCompilationPort["compile"]>[0]);
      expect.unreachable("the unbound port must throw");
    } catch (error) {
      expect((error as Error).message).toContain("never fabricated");
    }
  });
});

describe("the stage-name projection + the require helpers", () => {
  it("the stage vocabulary is frozen with the routine's exact stage names", () => {
    expect(Object.isFrozen(ROUTE_PLANNING_ENGINE_STAGES)).toBe(true);
    expect([...ROUTE_PLANNING_ENGINE_STAGES]).toEqual([
      "stage-2:discover-sender-rails",
      "stage-3:discover-recipient-rails",
      "stage-4:compile-available-routes",
    ]);
    expect(corridorSideStage("SENDER")).toBe("stage-2:discover-sender-rails");
    expect(corridorSideStage("RECIPIENT")).toBe("stage-3:discover-recipient-rails");
  });

  it("requireCorridorProjectionPort fails CLOSED on a missing binding", () => {
    expect(() => requireCorridorProjectionPort(undefined)).toThrow(PortUnboundError);
    expect(() => requireCorridorProjectionPort(null)).toThrow(PortUnboundError);
    expect(() => requireCorridorProjectionPort({})).toThrow(PortUnboundError);
    expect(() => requireCorridorProjectionPort({ evaluateSide: "not-a-function" })).toThrow(
      PortUnboundError,
    );
    const real = unboundCorridorProjectionPort();
    expect(requireCorridorProjectionPort(real)).toBe(real);
  });

  it("requireRouteCompilationPort fails CLOSED on a missing binding", () => {
    expect(() => requireRouteCompilationPort(undefined)).toThrow(PortUnboundError);
    expect(() => requireRouteCompilationPort(null)).toThrow(PortUnboundError);
    expect(() => requireRouteCompilationPort({})).toThrow(PortUnboundError);
    expect(() => requireRouteCompilationPort({ compile: 42 })).toThrow(PortUnboundError);
    const real = unboundRouteCompilationPort();
    expect(requireRouteCompilationPort(real)).toBe(real);
  });
});

describe("the REAL ports bound at the test tier (the composition precedent)", () => {
  it("the real corridor port evaluates a side through the REAL capability machinery", () => {
    const port = realCorridorProjectionPort();
    const evaluation = port.evaluateSide(corridorRequest("SENDER"));
    expect(evaluation.view.projectionVersion).toBe("1.0.0");
    expect(evaluation.view.routes).toHaveLength(2);
    expect(evaluation.view.routes.every((route) => route.eligible)).toBe(true);
    expect(evaluation.routeRestrictionSets).toHaveLength(2);
    expect(evaluation.routeRestrictionSets[0]?.length).toBeGreaterThan(0);
  });

  it("the real corridor port propagates the REAL fail-closed validation", () => {
    const port = realCorridorProjectionPort();
    const malformed = {
      side: "SENDER" as const,
      query: movementCorridorQuery(),
      freshnessPolicy: { maxAgeSeconds: 3600 },
      chains: [
        {
          definition: { not: "a definition" },
          implementation: senderChain().implementation,
          instance: senderChain().instance,
          observation: senderChain().observation,
        },
      ],
    };
    expect(() => port.evaluateSide(malformed)).toThrow();
  });
});
