/**
 * The P23-B emergence-battery fixtures: the compilation-port stub (the
 * REAL corridor projection already runs in the snapshots; the planner
 * re-run over the no-route world compiles nothing — the honest empty
 * rank-eligible set with the corridor's verbatim exclusions).
 */

import type { RouteCompilationPort } from "@payswap/route-planning";

export function realCompilationPortStub(): RouteCompilationPort {
  return {
    compile(input) {
      void input;
      // The honest no-route re-run: nothing compiles, the exclusions ride
      // verbatim (the planner re-run seam's fail-closed empty result).
      return {
        plans: [],
        exclusions: [],
        observationVersionPins: [],
        compilationDigest: "fnv1a64:0123456789abcdef",
      } as never;
    },
  } as RouteCompilationPort;
}
