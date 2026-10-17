/**
 * PaySwap Desktop (P7-W2) — the host-side product service.
 *
 * Implements IPaySwapDesktopService over the pure product folds (mission
 * surface, honest states, quote disclosure, security gate, progress
 * timeline, delegation). Every method is a pure projection or a
 * typed-reference delegation — there is NO method that executes money
 * movement, mints authorization or writes financial truth (the
 * no-parallel-engine law, enforced structurally by the interface).
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

/** Options for constructing the service (id generation injectable — deterministic tests). */
export interface PaySwapDesktopServiceOptions {
  /** Session id factory; defaults to a UUID. Injected by tests for determinism. */
  readonly createSessionId?: () => string;
  /** Session creation timestamp (ISO-8601); defaults to the injected clock or a fixed composition-time value. */
  readonly createdAt?: string;
}

function defaultSessionId(): string {
  return globalThis.crypto.randomUUID();
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

  const service: IPaySwapDesktopService = {
    session,

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
  };
  return service;
}
