/**
 * PaySwap Desktop (P7-W2 + P10-B) — the host-side product service.
 *
 * Implements IPaySwapDesktopService over the pure product folds (mission
 * surface, honest states, quote disclosure, security gate, progress
 * timeline, delegation) and, since P10-B, the console workspace surface:
 * host-computed deploymentFacts (facts about configured planes, never
 * renderer-invented) + the DESKTOP_PROFILE workspace store (demand-side
 * mission intent only, persisted under the seam's store directory).
 * Every method is a pure projection or a typed-reference delegation —
 * there is NO method that executes money movement, mints authorization
 * or writes financial truth (the no-parallel-engine law, enforced
 * structurally by the interface).
 *
 * LOGGER DISCIPLINE (ZCode Platform Baseline): the service logs through
 * the injected host seam log (writeHostLog-shaped) — never a console
 * bypass; no secret material is ever logged (the inputs carry none).
 */

import type { IPaySwapDesktopService, PaySwapDesktopHostSeam, PaySwapDesktopSession } from "./contracts.js";
import type {
  DesktopDelegatedMovementRef,
  DesktopDelegationReceipt,
  DesktopJourneyObservationInput,
  DesktopJourneyStateView,
  DesktopMissionBoardView,
  DesktopProgressFoldInput,
  DesktopProgressTimelineView,
  DesktopQuoteDisclosureInput,
  DesktopQuoteDisclosureView,
  DesktopSecurityGateInput,
  DesktopSecurityGateView,
  PaySwapDesktopDeploymentFacts,
} from "../product/contracts.js";
import { foldDesktopMissionBoard } from "../product/mission-surface.js";
import { deriveDesktopJourneyState } from "../product/honest-states.js";
import { foldDesktopQuoteTerms } from "../product/quote-terms.js";
import { foldDesktopSecurityDecision } from "../product/security-gate.js";
import { foldDesktopProgressTimeline } from "../product/progress-timeline.js";
import { delegateDesktopMoneyMovement } from "../product/delegation.js";
import {
  openPersistentWorkspaceStore,
  type PersistentWorkspaceStore,
  type WorkspaceStoreFileSystem,
} from "../product/workspace-store-persistence.js";
import { WorkspaceStoreError } from "../product/workspace-store.js";
import type {
  PinnedMissionDetail,
  PinnedMissionIntakeInput,
  PinnedMissionRecord,
  PinnedMissionSummary,
} from "../pins/index.js";

/** Options for constructing the service (id generation injectable — deterministic tests). */
export interface PaySwapDesktopServiceOptions {
  /** Session id factory; defaults to a UUID. Injected by tests for determinism. */
  readonly createSessionId?: () => string;
  /** Session creation timestamp (ISO-8601); defaults to the injected clock or a fixed composition-time value. */
  readonly createdAt?: string;
  /**
   * (P10-B) The injected file system for the DESKTOP_PROFILE workspace
   * store snapshot. The node:fs binding is supplied at the COMPOSITION
   * EDGE (composition.ts); tests inject fakes. Required exactly when the
   * seam carries a storeDirectory — otherwise the service fails closed.
   */
  readonly workspaceStoreFileSystem?: WorkspaceStoreFileSystem;
}

function defaultSessionId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * The host-computed honest deployment facts for THIS deployment: no
 * economic intake plane, no capability observations, no merchant
 * checkout binding, no provider observations and no reachable
 * delegation plane exist — the all-unconfigured truth. These are FACTS
 * ABOUT CONFIGURED PLANES (never UI state, never renderer-invented); no
 * plane exists in this deployment, so every fact is false. When a plane
 * is ever configured, the owning lane flips its fact here.
 */
function computeHonestDeploymentFacts(): PaySwapDesktopDeploymentFacts {
  return {
    economicIntakeConfigured: false,
    capabilityObservationsAvailable: false,
    merchantCheckoutContextBound: false,
    providerObservationsAvailable: false,
    delegationPlaneReachable: false,
  };
}

/** Create the PaySwap Desktop product service bound to one host seam. */
export function createPaySwapDesktopService(
  seam: PaySwapDesktopHostSeam,
  options: PaySwapDesktopServiceOptions = {},
): IPaySwapDesktopService {
  const createSessionId = options.createSessionId ?? defaultSessionId;
  const session: PaySwapDesktopSession = {
    sessionId: createSessionId(),
    scope: seam.scope,
    clientMode: "desktop-continuous",
    createdAt: options.createdAt ?? "1970-01-01T00:00:00.000Z",
  };
  seam.log(
    "info",
    "payswap-desktop: product service composed",
    JSON.stringify({ sessionId: session.sessionId, scopeKind: seam.scope.kind }),
  );

  // The DESKTOP_PROFILE workspace store opens lazily on FIRST USE (the
  // store must never delay service composition, and unconfigured seams
  // must compose fine — they fail closed per-call, not at construction).
  let storePromise: Promise<PersistentWorkspaceStore> | null = null;
  let storeMissingLogged = false;
  function resolveWorkspaceStore(): Promise<PersistentWorkspaceStore> {
    if (storePromise === null) {
      if (seam.storeDirectory === undefined || options.workspaceStoreFileSystem === undefined) {
        if (!storeMissingLogged) {
          storeMissingLogged = true;
          seam.log(
            "warn",
            "payswap-desktop: workspace store NOT configured (no store directory on the seam or no file system injected at the composition edge) — workspace-store calls fail closed",
          );
        }
        return Promise.reject(
          new WorkspaceStoreError(
            "STORE_NOT_CONFIGURED",
            "The DESKTOP_PROFILE workspace store is not configured in this host (no store directory on the seam) — the console workspace cannot persist mission intent here",
          ),
        );
      }
      const open = openPersistentWorkspaceStore({
        fileSystem: options.workspaceStoreFileSystem,
        directory: seam.storeDirectory,
      });
      // A failed open is not cached: the next call retries (the typed
      // error surfaces every time; transient fs failures can recover).
      storePromise = open.catch((error: unknown) => {
        storePromise = null;
        throw error;
      });
      storePromise
        .then(() => {
          seam.log(
            "info",
            "payswap-desktop: workspace store opened",
            JSON.stringify({ directory: seam.storeDirectory }),
          );
        })
        .catch(() => {});
    }
    return storePromise;
  }

  const service: IPaySwapDesktopService = {
    session,

    deploymentFacts(): PaySwapDesktopDeploymentFacts {
      return computeHonestDeploymentFacts();
    },

    async missionBoard(facts: PaySwapDesktopDeploymentFacts): Promise<DesktopMissionBoardView> {
      const board = foldDesktopMissionBoard(facts);
      seam.log(
        "info",
        "payswap-desktop: mission board folded",
        JSON.stringify({
          rows: board.rows.length,
          anyDispatchable: board.rows.some((row) => row.affordance.kind === "DELEGATE_JOURNEY"),
        }),
      );
      return board;
    },

    async quoteDisclosure(
      input: DesktopQuoteDisclosureInput,
    ): Promise<DesktopQuoteDisclosureView> {
      return foldDesktopQuoteTerms(input);
    },

    async progressTimeline(
      input: DesktopProgressFoldInput,
    ): Promise<DesktopProgressTimelineView> {
      return foldDesktopProgressTimeline(input);
    },

    async securityDecision(input: DesktopSecurityGateInput): Promise<DesktopSecurityGateView> {
      return foldDesktopSecurityDecision(input);
    },

    async journeyState(
      observation: DesktopJourneyObservationInput,
    ): Promise<DesktopJourneyStateView> {
      return deriveDesktopJourneyState(observation);
    },

    async delegateMoneyMovement(
      movement: DesktopDelegatedMovementRef,
    ): Promise<DesktopDelegationReceipt> {
      const receipt = delegateDesktopMoneyMovement(movement);
      seam.log(
        "info",
        "payswap-desktop: money movement delegated via typed reference (acknowledgement only)",
        JSON.stringify({ journeyId: receipt.journeyId, acceptedBy: receipt.acceptedBy }),
      );
      return receipt;
    },

    async workspaceListMissions(): Promise<readonly PinnedMissionSummary[]> {
      const store = await resolveWorkspaceStore();
      return store.listMissions();
    },

    async workspaceRecordMissionDraft(
      input: PinnedMissionIntakeInput,
      now: string,
    ): Promise<PinnedMissionRecord> {
      const store = await resolveWorkspaceStore();
      const record = await store.recordMissionDraft(input, now);
      seam.log(
        "info",
        "payswap-desktop: mission draft recorded (demand-side intent only)",
        JSON.stringify({ missionId: record.id, ok: record.structuralValidation.ok }),
      );
      return record;
    },

    async workspaceRecordMissionIntent(id: string, now: string): Promise<PinnedMissionRecord> {
      const store = await resolveWorkspaceStore();
      const record = await store.recordMissionIntent(id, now);
      seam.log(
        "info",
        "payswap-desktop: mission intent recorded (structural validation passed)",
        JSON.stringify({ missionId: record.id }),
      );
      return record;
    },

    async workspaceMissionDetail(id: string): Promise<PinnedMissionDetail | null> {
      const store = await resolveWorkspaceStore();
      return store.missionDetail(id);
    },

    async workspaceReviseMissionDraft(
      id: string,
      input: PinnedMissionIntakeInput,
      now: string,
    ): Promise<PinnedMissionRecord> {
      const store = await resolveWorkspaceStore();
      return store.reviseMissionDraft(id, input, now);
    },

    async workspaceArchiveMissionDraft(id: string, now: string): Promise<PinnedMissionRecord> {
      const store = await resolveWorkspaceStore();
      return store.archiveMissionDraft(id, now);
    },

    async workspaceStoreHealth() {
      const store = await resolveWorkspaceStore();
      const health = await store.health();
      if (health.quarantinedCount > 0) {
        seam.log(
          "warn",
          "payswap-desktop: workspace store loaded with quarantined records (never rendered as missions)",
          JSON.stringify({ quarantinedCount: health.quarantinedCount }),
        );
      }
      return health;
    },
  };
  return service;
}
