/**
 * PaySwap Desktop renderer (P17-C, ADR-0010 D1/D5) — the composition
 * root: binds the REAL route-planning engine + the route-planning
 * session into the app's shared seams at the desktop renderer's
 * business-root initialization, over the payswap-desktop channel's
 * mission-plane members (P17-A).
 *
 * THE WIRING (ADR-0010 D5):
 * - The engine: createRealRoutePlanningEngine over the channel-backed
 *   mission source — the panel's presentableView then composes the
 *   REAL stages (0-7) synchronously over the mission CACHE.
 * - The session: createRoutePlanningSession over the composer
 *   controller's ONE task-session port (sessionPort() — never a second
 *   adapter over the storage key; two adapters would race on the
 *   monotonic counters).
 * - The stage-9a decorator: chooseProceed records the REQUEST on the
 *   task (the app session, unchanged) AND the plan selection on the
 *   MISSION plane (paymentMissionRecordPlanSelection) — two records,
 *   zero authority. Every session mutation refreshes the mission cache
 *   (the engine's synchronous reads stay fresh).
 * - HONEST FAILURE: if the composition cannot bind (the channel is
 *   absent, the mission plane is not configured), the seams stay at
 *   their honest defaults — the panel renders the unbound note and the
 *   not-wired choice notes; nothing is masked.
 */

import {
  bindRoutePlanningEngine,
  bindRoutePlanningSession,
  createRoutePlanningSession,
  sharedAgentComposerController,
  type RoutePlanningSession,
  type RoutePlanningWaitCriteriaPin,
} from "@payswap/app";
import {
  createRealRoutePlanningEngine,
} from "./routePlanningEngineAdapter.js";
import type {
  RoutePlanningMissionBoardItem,
  RoutePlanningMissionDetail,
  RoutePlanningMissionSource,
} from "./routePlanningMissionLinkage.js";
import type { DesktopConsoleChannelServices } from "./consoleWorkspaceMount.js";
import type { PaySwapConnectionCapabilityChainDto } from "./consoleConnectionsWire.js";

/* ---------------- the channel-backed mission source (P17-A members) ---------------- */

/** The mission-plane members the source rides (the channel client's surface). */
export interface MissionPlaneChannelClient {
  paymentMissionBoard(): Promise<readonly RoutePlanningMissionBoardItem[]>;
  paymentMissionDetail(missionId: string): Promise<RoutePlanningMissionDetail | null>;
  paymentMissionRecordPlanSelection(
    missionId: string,
    input: { planId: string; viewDigest: string; routineId: string; routineVersion: string },
  ): Promise<RoutePlanningMissionDetail>;
}

/**
 * (P21-D Gap A) The corridor-chains member the composition reads (the
 * channel client's surface — the bridge-derived four-layer route chains
 * the engine's stages 2/3 consume).
 */
export interface RoutePlanningChainsChannelClient {
  connectionCapabilityChains(): Promise<readonly PaySwapConnectionCapabilityChainDto[]>;
}

/** Adapt the channel services (the payswap-desktop proxy) to the mission source. */
export function channelMissionSource(services: DesktopConsoleChannelServices): RoutePlanningMissionSource {
  const client = services.payswapDesktopService as unknown as MissionPlaneChannelClient;
  return {
    board: () => client.paymentMissionBoard(),
    detail: (missionId) => client.paymentMissionDetail(missionId),
  };
}

/* ------------------------------ the composition ------------------------------ */

/** The composition's mutable state (the mission cache + the corridor chains cache + the engine's linkage). */
export interface RoutePlanningCompositionState {
  missions: readonly RoutePlanningMissionBoardItem[];
  details: ReadonlyMap<string, RoutePlanningMissionDetail>;
  /**
   * (P21-D Gap A) The corridor capability chains cache — the wire DTO
   * shape structurally mirrors the route-planning pin, so the engine
   * consumes it without a cast; the REAL corridor validators re-validate
   * every chain fail-closed at the stage-2/3 snapshot derivation.
   */
  chains: readonly PaySwapConnectionCapabilityChainDto[];
  lastPresented: { missionId: string; viewDigest: string; routineId: string; routineVersion: string } | null;
  planSelectionSink: ((input: { planId: string; viewDigest: string; routineId: string; routineVersion: string }) => Promise<unknown>) | null;
}

/** The composed binding handle (refresh + reset for the bridge-tier battery). */
export interface RoutePlanningComposition {
  readonly state: RoutePlanningCompositionState;
  readonly source: RoutePlanningMissionSource;
  readonly session: RoutePlanningSession;
  /** Refresh the mission cache from the source (init + after every mutation). */
  refresh(): Promise<void>;
}

/**
 * Compose + bind the live route-planning plane. Called ONCE at the
 * renderer's business-root initialization (after the console services
 * connect); the channel-backed mission source is the default, and the
 * bridge-tier battery may inject its own (the DI seam — the mission
 * source is the only replaced part, always labeled).
 */
export function composeRoutePlanningBinding(options: {
  readonly services?: DesktopConsoleChannelServices;
  readonly source?: RoutePlanningMissionSource;
  readonly controller?: ReturnType<typeof sharedAgentComposerController>;
  readonly planSelectionSink?: RoutePlanningCompositionState["planSelectionSink"];
}): RoutePlanningComposition {
  const controller = options.controller ?? sharedAgentComposerController();
  const source = options.source ?? (options.services !== undefined ? channelMissionSource(options.services) : null);
  const state: RoutePlanningCompositionState = { missions: [], details: new Map(), chains: [], lastPresented: null, planSelectionSink: options.planSelectionSink ?? null };
  if (source === null) {
    // HONEST FAILURE: no channel and no injected source — the seams stay
    // at their defaults (the unbound engine + the not-wired notes).
    throw new Error("the route-planning composition requires the payswap-desktop channel services (or an injected mission source) — nothing is bound, the honest defaults stand");
  }
  // (P21-D Gap A) The corridor-chains reader: the channel member when the
  // host exposes it; NULL when the member is absent (an older host — the
  // composition then stays at the honest EMPTY chain set, fail-closed,
  // never a crash, never fabricated chains).
  const chainsClient =
    options.services !== undefined
      ? (options.services.payswapDesktopService as unknown as Partial<RoutePlanningChainsChannelClient>)
      : undefined;
  const readChains =
    chainsClient !== undefined && typeof chainsClient.connectionCapabilityChains === "function"
      ? chainsClient.connectionCapabilityChains.bind(chainsClient)
      : null;
  const engine = createRealRoutePlanningEngine(source, state, state);
  bindRoutePlanningEngine(engine);

  // The stage-9a sink (the channel member by default; the battery may inject).
  if (options.planSelectionSink === undefined && options.services !== undefined) {
    const client = options.services.payswapDesktopService as unknown as MissionPlaneChannelClient;
    state.planSelectionSink = (input) =>
      state.lastPresented === null
        ? Promise.resolve(null)
        : client.paymentMissionRecordPlanSelection(state.lastPresented.missionId, input);
  }

  const refresh = async (): Promise<void> => {
    try {
      const board = await source.board();
      state.missions = board;
      const details = new Map<string, RoutePlanningMissionDetail>();
      for (const item of board) {
        const detail = await source.detail(item.missionId);
        if (detail !== null) { details.set(item.missionId, detail); }
      }
      state.details = details;
    } catch {
      // The honest read-failure posture: the cache stays as-is; the
      // engine fails closed on its own typed states, never fabricated.
    }
    // (P21-D Gap A) The corridor chains cache: read through the channel
    // member after every mission refresh (init + after every session
    // mutation — the same cache law). Fail-closed: an absent member (an
    // older host) keeps the honest empty set; a rejected read keeps the
    // previous set (the observations are freshness-stamped — the corridor
    // evaluation itself excludes stale rails); a non-array answer changes
    // nothing. Never a crash, never a fabricated chain.
    if (readChains !== null) {
      try {
        const chains = await readChains();
        if (Array.isArray(chains)) {
          state.chains = chains;
        }
      } catch {
        // the honest read-failure posture: the chains cache stays as-is
      }
    }
  };

  // The session over the controller's ONE port, with the stage-9a decorator.
  const base = createRoutePlanningSession({ session: controller.sessionPort() });
  const decorate = <T>(call: () => Promise<T>): Promise<T> =>
    call().then(
      (result) => refresh().then(
        () => result,
        () => result,
      ),
      (error) => {
        throw error;
      },
    );
  const session: RoutePlanningSession = {
    presentChoices: (taskRef, engineView, at) => decorate(() => base.presentChoices(taskRef, engineView, at)),
    chooseProceed: (taskRef, planId, at) =>
      decorate(async () => {
        const record = await base.chooseProceed(taskRef, planId, at);
        const presented = state.lastPresented;
        if (presented !== null && state.planSelectionSink !== null) {
          await state.planSelectionSink({
            planId,
            viewDigest: presented.viewDigest,
            routineId: presented.routineId,
            routineVersion: presented.routineVersion,
          });
        }
        return record;
      }),
    chooseWait: (taskRef: string, criteria: RoutePlanningWaitCriteriaPin, at?: string) => decorate(() => base.chooseWait(taskRef, criteria, at)),
    recordOpportunityMatch: (taskRef: string, match: Parameters<RoutePlanningSession["recordOpportunityMatch"]>[1], at?: string) =>
      decorate(() => base.recordOpportunityMatch(taskRef, match, at)),
    cancelWait: (taskRef: string, at?: string) => decorate(() => base.cancelWait(taskRef, at)),
    expireWait: (taskRef: string, at?: string) => decorate(() => base.expireWait(taskRef, at)),
  };
  bindRoutePlanningSession(session);

  return { state, source, session, refresh };
}
