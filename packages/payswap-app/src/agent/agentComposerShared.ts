/**
 * @payswap/app — the SHARED COMPOSER SEAMS (split from
 * ./agentComposerController.ts for the ≤400-line file law).
 *
 * The per-document shared seams a PLATFORM HOST binds at its composition
 * root (the ADR-0010 D1 discipline — the same pattern as the
 * route-planning engine/session seams on RoutePlanningMount):
 *
 * - the ONE shared composer controller (every entrypoint drives it);
 * - the shared mission-intake plane binding (P21-B, ADR-0014 D2): the
 *   desktop renderer's composition root binds the channel-backed plane
 *   BEFORE the first controller construction; the web tier binds
 *   nothing — the honest unbound note (the ADR-0010 D7 analogue).
 */

import { createAgentComposerController } from "./agentComposerController.js";
import type { AgentComposerController } from "./agentComposerTypes.js";
import type { MissionIntakePlanePort } from "./missionIntakePins.js";

/* ------------------- the shared mission-intake plane ------------------- */

let sharedPlane: MissionIntakePlanePort | undefined;

/**
 * Bind the shared mission-intake plane (the platform host's composition
 * root; MUST run before the first sharedAgentComposerController()
 * construction — the desktop business-root initialization does).
 */
export function bindSharedMissionIntakePlane(plane: MissionIntakePlanePort): void {
  sharedPlane = plane;
}

/** Test/inspection helper: drop the shared binding (never used in src). */
export function resetSharedMissionIntakePlane(): void {
  sharedPlane = undefined;
}

/** The shared binding (undefined = the honest unbound mission tier). */
export function sharedMissionIntakePlane(): MissionIntakePlanePort | undefined {
  return sharedPlane;
}

/* ----------------------- the shared controller ----------------------- */

let sharedController: AgentComposerController | undefined;

/**
 * The ONE shared composer controller per document: every entrypoint
 * (product areas, app overview, Agent Workspace overview) drives the
 * same controller, so the composer's identity, draft, progress and
 * history are shared by construction — including across product ↔
 * console surface switches in the same document. The controller binds
 * the shared mission-intake plane at construction (the composition
 * root binds it first; the web tier never does — the honest unbound
 * tier).
 */
export function sharedAgentComposerController(): AgentComposerController {
  if (sharedController === undefined) {
    sharedController =
      sharedPlane === undefined
        ? createAgentComposerController()
        : createAgentComposerController({ missionIntakePlane: sharedPlane });
  }
  return sharedController;
}

/** Test/inspection helper: drop the shared singleton (never used in src). */
export function resetSharedAgentComposerController(): void {
  sharedController = undefined;
}
