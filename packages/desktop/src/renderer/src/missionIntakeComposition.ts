/**
 * PaySwap Desktop renderer (P21-B run 2, ADR-0014 D2) — the
 * MISSION-INTAKE composition root: binds the payswap-desktop channel's
 * intake members (paymentMissionSeed / paymentMissionAskNextField /
 * paymentMissionCapture) into the app's pinned MissionIntakePlanePort,
 * at the desktop renderer's business-root initialization.
 *
 * THE WIRING LAWS (ADR-0014 D2):
 * - 1:1 MEMBER MAPPING: the adapter maps each port member onto its
 *   channel member and NOTHING else — the seed input carries EXACTLY the
 *   two caller fields (the ORIGIN stays HOST-PINNED COMPOSER_TEXT; this
 *   adapter never supplies, forges or sees an origin), the ask order is
 *   the CHANNEL's own (askNextField delegates; no field order exists
 *   renderer-side), and the capture passes the caller's value through
 *   unchanged (the host's own fail-closed validation decides).
 * - FAIL-CLOSED: a member rejection rethrows (the typed error surfaces
 *   through the composer's honest error path, never coerced); the
 *   channel's typed PaymentPlaneNotConfiguredError maps onto the app's
 *   MissionIntakePlaneNotConfiguredError so the composer renders the
 *   honest note (never an error mask).
 * - THE SHARED SEAM: composeMissionIntakeBinding binds the shared plane
 *   (bindSharedMissionIntakePlane) BEFORE the first shared-controller
 *   construction — the desktop business root does exactly that. The web
 *   tier binds nothing: the honest unbound mission tier (ADR-0010 D7
 *   analogue).
 *
 * Mounting law: this module is a composition root beside
 * ./paymentMissionsComposition.ts (the ADR-0010 D1 renderer-exemption
 * precedent; module ownership unchanged — no new edges).
 */

import {
  bindSharedMissionIntakePlane,
  resetSharedMissionIntakePlane,
  type MissionIntakePlanePort,
} from "@payswap/app";
import type { DesktopConsoleChannelServices } from "./consoleWorkspaceMount.js";

/* ------------- the channel client surface this composition rides ------------- */

/**
 * The intake members the port rides (the channel client's surface — the
 * drift-tested member set; see consoleWorkspaceMount.tsx).
 */
export interface MissionIntakeChannelClient {
  paymentMissionSeed(input: {
    readonly direction: string;
    readonly goalStatement: string;
  }): Promise<{ readonly missionId: string; readonly action: "CREATED" | "RESUMED" }>;
  paymentMissionAskNextField(
    missionId: string,
  ): Promise<{ readonly fieldId: string; readonly question: string } | null>;
  paymentMissionCapture(
    missionId: string,
    fieldId: string,
    value: unknown,
  ): Promise<unknown>;
}

/**
 * The honest not-configured failure (the app-side typed analogue of the
 * host's PaymentPlaneNotConfiguredError — the composer surfaces it, it
 * never masks it).
 */
export class MissionIntakePlaneNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissionIntakePlaneNotConfiguredError";
  }
}

/** True iff the thrown value is the host's typed fail-closed plane error. */
function isHostPlaneNotConfigured(thrown: unknown): boolean {
  return (
    thrown !== null &&
    typeof thrown === "object" &&
    (thrown as { readonly name?: unknown }).name === "PaymentPlaneNotConfiguredError"
  );
}

/**
 * Adapt the channel services (the payswap-desktop proxy) to the pinned
 * MissionIntakePlanePort: the 1:1 member mapping, fail-closed.
 */
export function channelMissionIntakePlane(
  services: DesktopConsoleChannelServices,
): MissionIntakePlanePort {
  const client = services.payswapDesktopService as unknown as MissionIntakeChannelClient;
  const guard = async <T>(call: () => Promise<T>): Promise<T> => {
    try {
      return await call();
    } catch (thrown: unknown) {
      if (isHostPlaneNotConfigured(thrown)) {
        throw new MissionIntakePlaneNotConfiguredError(
          "The mission-intake plane is not configured in this host — mission-intake calls fail closed",
        );
      }
      throw thrown;
    }
  };
  return {
    seedMission: (input) => guard(() => client.paymentMissionSeed(input)),
    askNextField: (missionId) => guard(() => client.paymentMissionAskNextField(missionId)),
    captureField: (missionId, fieldId, value) =>
      guard(async () => {
        // The updated detail is the channel's own echo — the port's
        // contract is void; nothing is coerced from the response.
        await client.paymentMissionCapture(missionId, fieldId, value);
      }),
  };
}

/* ------------------------------ the composition ------------------------------ */

/** The composed binding handle (the plane + the reset for the bridge-tier battery). */
export interface MissionIntakeComposition {
  readonly plane: MissionIntakePlanePort;
  /** Restore the seam's honest default (unbound — the honest unbound note). */
  readonly reset: () => void;
}

/**
 * Compose + bind the mission-intake plane. Called ONCE at the renderer's
 * business-root initialization (BEFORE the first shared-controller
 * construction — the shared controller binds the plane at creation); the
 * channel-backed plane is the default, and the bridge-tier battery may
 * inject its own (the DI seam — the plane is the only replaced part,
 * always labeled).
 */
export function composeMissionIntakeBinding(options: {
  readonly services?: DesktopConsoleChannelServices;
  readonly plane?: MissionIntakePlanePort;
}): MissionIntakeComposition {
  const plane =
    options.plane ?? (options.services !== undefined ? channelMissionIntakePlane(options.services) : null);
  if (plane === null) {
    // HONEST FAILURE: no channel and no injected plane — the seam stays
    // at its default (unbound) and the composer renders the honest
    // unbound mission note. Nothing is masked.
    throw new Error(
      "the mission-intake composition requires the payswap-desktop channel services (or an injected plane) — nothing is bound, the honest default stands",
    );
  }
  bindSharedMissionIntakePlane(plane);
  return { plane, reset: resetSharedMissionIntakePlane };
}
