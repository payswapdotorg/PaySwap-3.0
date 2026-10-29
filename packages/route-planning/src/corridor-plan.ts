/**
 * @payswap/route-planning — the CROSS-PROVIDER CORRIDOR plan-level laws,
 * part 1: the LEG-SEPARATION MODEL (P22-C, ADR-0016 D6) — the typed laws
 * the H lane's composite dispatch runtime implements against.
 *
 * THE LEG-SEPARATION LAW (D6): the corridor plan is a 3-provider 4-leg
 * execution in which EVERY leg is its OWN thing — its own LANE (the
 * on-ramp provider, the corridor chain, the off-ramp provider), its own
 * CUSTODY HOP (an explicit from-party and to-party), its own
 * PREREQUISITES (its own grounding observations — a leg without its own
 * evidence is a fabricated leg). The model derives deterministically
 * from a compiled corridor plan (the cross-provider-corridor shape's
 * four legs over the pinned skeleton); any plan that is not that shape,
 * or whose legs deviate from the skeleton, fails closed with the typed
 * CorridorPlanLawError — never a lenient projection.
 *
 * The custody-continuity law and the hop-bound law live in
 * ./corridor-leg-laws.ts (the 400-line file-law split).
 *
 * ADVISORY-PLAN LAW: nothing in this module dispatches, authorizes or
 * executes — these are the plan-level LAWS (pure, deterministic,
 * fail-closed); the dispatch runtime itself is the H lane's (D6).
 */

import { CorridorPlanLawError } from "./errors.ts";
import { deepFreeze, requireObject } from "./canonical.ts";
import type { PinnedRoutePlan } from "./pins/route-compiler.ts";
import { PINNED_CORRIDOR_LEG_SKELETON, PINNED_CROSS_PROVIDER_CORRIDOR_SHAPE_ID } from "./pins/corridor.ts";
import type { PinnedCorridorLegKind } from "./pins/corridor.ts";

// ---------------------------------------------------------------------------
// The leg-separation model (D6: each leg its own lane/hop/prerequisites)
// ---------------------------------------------------------------------------

/** The lane a corridor leg executes on (a provider or the corridor chain). */
export interface CorridorLegLane {
  readonly kind: "PROVIDER" | "ONCHAIN_CHAIN";
  /** The provider name (PROVIDER) or the chain key (ONCHAIN_CHAIN). */
  readonly id: string;
}

/** One party of a custody hop (the explicit from/to of a leg's custody). */
export interface CorridorCustodyParty {
  readonly kind: string;
  readonly id: string;
}

/** The leg's OWN custody hop (an explicit from-party and to-party). */
export interface CorridorCustodyHop {
  readonly from: CorridorCustodyParty;
  readonly to: CorridorCustodyParty;
}

/** The leg's OWN prerequisites (its own grounding observations). */
export interface CorridorLegPrerequisite {
  readonly kind: "GROUNDING_OBSERVATION";
  readonly observationRef: string;
  readonly observationVersion: number;
}

/**
 * One corridor leg's plan-level law record: its OWN lane, its OWN custody
 * hop and its OWN prerequisites (the leg-separation law — pure frozen
 * data derived from the compiled plan, never a dispatch command).
 */
export interface CorridorPlanLegLaw {
  readonly legIndex: number;
  readonly legKind: PinnedCorridorLegKind;
  readonly lane: CorridorLegLane;
  readonly custodyHop: CorridorCustodyHop;
  readonly prerequisites: readonly CorridorLegPrerequisite[];
}

function isPinnedCorridorLegKind(value: string): value is PinnedCorridorLegKind {
  return (PINNED_CORRIDOR_LEG_SKELETON as readonly string[]).includes(value);
}

function custodyPartyOf(party: Readonly<Record<string, unknown>>): CorridorCustodyParty {
  const kind = typeof party["kind"] === "string" ? party["kind"] : "";
  const providerName = party["providerName"];
  const chainKey = party["chainKey"];
  const externalRef = party["externalRef"];
  const accountRef = party["accountRef"];
  const id =
    typeof providerName === "string" ? providerName
    : typeof chainKey === "string" ? chainKey
    : typeof externalRef === "string" ? externalRef
    : typeof accountRef === "string" ? accountRef
    : "";
  if (id === "" || kind === "") {
    throw new CorridorPlanLawError(
      `a corridor leg custody party requires a kind and an identity field (providerName/chainKey/externalRef/accountRef) — custody parties are explicit, never anonymous`,
      { partyKind: kind, partyKeys: Object.keys(party) },
    );
  }
  return deepFreeze({ kind, id });
}

/**
 * Derive the lane of one corridor leg from its custody hop (deterministic):
 * the onchain transfer leg rides the corridor CHAIN (the from-wallet's
 * chain key — the ONCHAIN rail); every other leg rides its PROVIDER (the
 * from-party's provider name — the leg's own lane, never a fused one).
 */
function laneOfLeg(legKind: PinnedCorridorLegKind, hop: CorridorCustodyHop): CorridorLegLane {
  if (legKind === "ONCHAIN_TRANSFER") {
    if (hop.from.kind !== "ONCHAIN_WALLET") {
      throw new CorridorPlanLawError(
        `the corridor's ONCHAIN_TRANSFER leg must leave an ONCHAIN_WALLET custody party (got '${String(hop.from.kind)}') — the chain hop is grounded in the onchain plane`,
        { legKind, fromKind: hop.from.kind },
      );
    }
    return deepFreeze({ kind: "ONCHAIN_CHAIN", id: hop.from.id });
  }
  if (hop.from.kind !== "EXTERNAL_PROVIDER") {
    throw new CorridorPlanLawError(
      `the corridor's ${String(legKind)} leg must leave an EXTERNAL_PROVIDER custody party (got '${String(hop.from.kind)}') — the fiat legs ride their provider's own lane`,
      { legKind, fromKind: hop.from.kind },
    );
  }
  return deepFreeze({ kind: "PROVIDER", id: hop.from.id });
}

/**
 * THE LEG-SEPARATION DERIVATION (deterministic, fail-closed): project a
 * compiled corridor plan into the four leg-law records — each leg its own
 * lane, its own custody hop, its own prerequisites. The plan must be the
 * cross-provider-corridor shape with the exact pinned four-leg skeleton
 * (leg kinds AND hop indices); anything else is a typed violation, never
 * a lenient projection. A leg with NO grounding observations is a
 * fabricated leg (its prerequisites are its own evidence — non-empty).
 */
export function corridorPlanLegLaws(plan: PinnedRoutePlan): readonly CorridorPlanLegLaw[] {
  const record = requireObject(plan, "the corridor plan");
  if (record["shapeId"] !== PINNED_CROSS_PROVIDER_CORRIDOR_SHAPE_ID) {
    throw new CorridorPlanLawError(
      `the corridor plan laws derive only from the '${String(PINNED_CROSS_PROVIDER_CORRIDOR_SHAPE_ID)}' shape (got '${String(record["shapeId"])}') — never a foreign shape`,
      { shapeId: record["shapeId"] },
    );
  }
  const legs = record["legs"];
  if (!Array.isArray(legs) || legs.length !== PINNED_CORRIDOR_LEG_SKELETON.length) {
    throw new CorridorPlanLawError(
      `the corridor plan carries exactly ${String(PINNED_CORRIDOR_LEG_SKELETON.length)} legs (got '${String(Array.isArray(legs) ? legs.length : "non-array")}') — the pinned skeleton is the whole law`,
    );
  }
  const laws: CorridorPlanLegLaw[] = [];
  for (let index = 0; index < legs.length; index += 1) {
    const leg = requireObject(legs[index], `corridor plan leg ${String(index)}`);
    const legKind = String(leg["legKind"]);
    if (!isPinnedCorridorLegKind(legKind) || legKind !== PINNED_CORRIDOR_LEG_SKELETON[index]) {
      throw new CorridorPlanLawError(
        `corridor leg ${String(index)} must be '${String(PINNED_CORRIDOR_LEG_SKELETON[index])}' (got '${legKind}') — the exact skeleton law (ADR-0016 D5)`,
        { legIndex: index, legKind },
      );
    }
    const hopIndex = leg["hopIndex"];
    if (hopIndex !== index) {
      throw new CorridorPlanLawError(
        `corridor leg ${String(index)} must carry hopIndex ${String(index)} (got '${String(hopIndex)}') — legs never silently skip or reorder`,
        { legIndex: index, hopIndex },
      );
    }
    const custody = requireObject(leg["custody"], `corridor leg ${String(index)} custody`);
    const hop = deepFreeze({
      from: custodyPartyOf(requireObject(custody["from"], `corridor leg ${String(index)} custody.from`)),
      to: custodyPartyOf(requireObject(custody["to"], `corridor leg ${String(index)} custody.to`)),
    });
    const grounding = requireObject(leg["stateGrounding"], `corridor leg ${String(index)} stateGrounding`);
    const observations = grounding["observations"];
    if (!Array.isArray(observations) || observations.length === 0) {
      throw new CorridorPlanLawError(
        `corridor leg ${String(index)} carries NO grounding observations — a leg without its own evidence is a fabricated leg (the prerequisites law)`,
        { legIndex: index },
      );
    }
    const prerequisites: CorridorLegPrerequisite[] = [];
    for (const observation of observations) {
      const entry = requireObject(observation, `corridor leg ${String(index)} grounding observation`);
      const observationRef = String(entry["observationId"] ?? "");
      const observationVersion = entry["observationVersion"];
      if (observationRef === "" || typeof observationVersion !== "number" || !Number.isSafeInteger(observationVersion) || observationVersion < 1) {
        throw new CorridorPlanLawError(
          `corridor leg ${String(index)} carries a malformed grounding observation (observationId + observationVersion >= 1 required) — prerequisites are exact evidence, never placeholders`,
          { legIndex: index },
        );
      }
      prerequisites.push(deepFreeze({ kind: "GROUNDING_OBSERVATION", observationRef, observationVersion }));
    }
    laws.push(
      deepFreeze({
        legIndex: index,
        legKind,
        lane: laneOfLeg(legKind, hop),
        custodyHop: hop,
        prerequisites: Object.freeze(prerequisites),
      }),
    );
  }
  return Object.freeze(laws);
}
