/**
 * @payswap/route-compiler — corridor candidate reconciliation (P5-W1).
 *
 * The compiler-side consumption of the capability lane's CORRIDOR VIEW
 * (the discovery projection over capabilities — evidence, never an
 * authority; the corridor pin shapes live in src/pins/capability.ts).
 * This module reconciles the projection onto the compiler's leg
 * grounding surface:
 *
 * - the eligible routes (already deterministic input order) are the
 *   CURRENT-ELIGIBILITY candidates for provider legs;
 * - the BASELINE candidate is the route whose offered execution modes
 *   include PASS_THROUGH_NATIVE (INV-C08: the provider-native incumbent
 *   — emitted as a candidate, never ranked away);
 * - every route's LINEAGE is preserved verbatim (capability definition
 *   version, implementation version, OBSERVATION VERSION, restriction
 *   set ids — the observation-VERSION preservation law);
 * - the versioned terms references are carried for the
 *   credible-pricing requirement;
 * - exclusions of ineligible routes are never fabricated away: the
 *   compiler records them honestly when a shape demands a route that
 *   the projection does not offer.
 */

import { deepFreeze } from "./canonical.ts";
import type {
  PinnedCorridorRouteEvaluation,
  PinnedCorridorView,
} from "./pins/capability.ts";

/** The corridor candidate surface the compiler consumes. */
export interface CorridorCandidate {
  readonly routeId: string;
  readonly eligible: boolean;
  readonly providerName: string;
  readonly observationVersion: number;
  readonly capabilityDefinitionVersion: string;
  readonly implementationVersion: string;
  readonly termsVersion: string;
  readonly offeredExecutionModes: readonly string[];
  readonly isNativeBaseline: boolean;
  readonly effectiveAvailability: string;
}

/** Reconcile a corridor view onto the compiler's candidate surface. */
export function corridorCandidates(view: PinnedCorridorView): readonly CorridorCandidate[] {
  return view.routes.map((route) =>
    deepFreeze({
      routeId: route.routeId,
      eligible: route.eligible,
      providerName: route.lineage.providerName,
      observationVersion: route.lineage.observationVersion,
      capabilityDefinitionVersion: route.lineage.capabilityDefinitionVersion,
      implementationVersion: route.lineage.implementationVersion,
      termsVersion: termsVersionOf(route),
      offeredExecutionModes: Object.freeze([...route.offeredExecutionModes]),
      isNativeBaseline: route.offeredExecutionModes.includes("PASS_THROUGH_NATIVE"),
      effectiveAvailability: route.effectiveAvailability,
    }),
  );
}

function termsVersionOf(route: PinnedCorridorRouteEvaluation): string {
  return route.termsRefs[0]?.termsVersion ?? "";
}

/** The eligible candidates only (the current-eligibility subset). */
export function eligibleCorridorCandidates(
  candidates: readonly CorridorCandidate[],
): readonly CorridorCandidate[] {
  return candidates.filter((candidate) => candidate.eligible);
}

/** The provider-native baseline candidate (PASS_THROUGH_NATIVE offer). */
export function nativeBaselineCorridorCandidate(
  candidates: readonly CorridorCandidate[],
): CorridorCandidate | undefined {
  return candidates.find(
    (candidate) => candidate.eligible && candidate.isNativeBaseline,
  );
}

/** The candidate with the given routeId (explicit, never inferred). */
export function corridorCandidateByRouteId(
  candidates: readonly CorridorCandidate[],
  routeId: string,
): CorridorCandidate | undefined {
  return candidates.find((candidate) => candidate.routeId === routeId);
}

/**
 * The observation-version pins of a candidate set (the lineage records
 * the graph preserves — exact versions, never "latest").
 */
export function corridorObservationVersionPins(
  candidates: readonly CorridorCandidate[],
): readonly { instanceId: string; observationVersion: number; pinnedDigest: string }[] {
  return candidates.map((candidate) =>
    Object.freeze({
      instanceId: candidate.routeId,
      observationVersion: candidate.observationVersion,
      pinnedDigest: `corridor:${candidate.routeId}@${candidate.observationVersion}`,
    }),
  );
}
