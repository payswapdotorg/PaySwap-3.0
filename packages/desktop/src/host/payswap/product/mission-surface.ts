/**
 * PaySwap Desktop (P7-W2) — the mission board fold.
 *
 * Composes the pinned outcome-action registry (surface.outcomes) into the
 * desktop mission surface: five outcome rows, each with the honest
 * dispatchability fact for THIS deployment and the desktop affordance.
 *
 * LAWS (from the work order + pinned contracts):
 * - HONEST DISPATCHABILITY: `dispatchable` is a FACT about configured
 *   authority planes (never a UI mood); when false the typed missing
 *   prerequisite is carried verbatim.
 * - NO DEAD BUTTONS: every row carries an affordance — DELEGATE_JOURNEY
 *   when the journey can dispatch, otherwise the typed prerequisite
 *   (rendered, never hidden, never a fabricated success — INV-24).
 * - HONEST EMPTY STATE: when no provider observations exist, the board
 *   renders the designed empty-state note (never an exception, never a
 *   fabricated board).
 * - The capability law per action mirrors the pinned registry exactly:
 *   pay/receive/move fold the economic intake plane; convert folds
 *   capability observations; checkout folds the merchant plane.
 */

import type {
  DesktopMissionBoardRow,
  DesktopMissionBoardView,
  PaySwapDesktopDeploymentFacts,
} from "./contracts.js";
import {
  PINNED_OUTCOME_ACTIONS,
  DESKTOP_PIN_PROVENANCE,
} from "../pins/index.js";
import type { PinnedOutcomeCapabilityState } from "../pins/index.js";

const DELEGATION_PREREQUISITE =
  "The backend delegation plane is not reachable from this desktop session — the journey cannot be delegated yet. The desktop never executes money movement itself; restore the delegation plane to make this journey live.";

const EMPTY_STATE_NOTE =
  "No provider observations exist in this deployment — the board renders only what provider-verified observations and configured authority planes provide.";

/** The pinned capability law, re-folded per action (mirrors the registry folds). */
function capabilityForAction(
  actionId: "pay" | "receive" | "move" | "convert" | "checkout",
  facts: PaySwapDesktopDeploymentFacts,
): PinnedOutcomeCapabilityState {
  switch (actionId) {
    case "pay":
    case "receive":
    case "move":
      return facts.economicIntakeConfigured
        ? { dispatchable: true }
        : {
            dispatchable: false,
            missingPrerequisite:
              "The economic intake plane is not configured in this deployment — there is nothing to dispatch against yet. Configure the goal/intent intake (accepted P1-W1 economic contracts) to make this journey live.",
          };
    case "convert":
      return facts.capabilityObservationsAvailable
        ? { dispatchable: true }
        : {
            dispatchable: false,
            missingPrerequisite:
              "Quote projection requires fresh capability observations (connected instances and current provider terms). None are configured in this deployment — the honest state is an unavailable preview, never an invented quote.",
          };
    case "checkout":
      return facts.merchantCheckoutContextBound
        ? { dispatchable: true }
        : {
            dispatchable: false,
            missingPrerequisite:
              "No merchant checkout plane exists in this deployment — the merchant package landed with Work Order P5-W3; wiring its checkout plane into this surface is still pending, and this surface refuses to fabricate a checkout session before it exists.",
          };
  }
}

/**
 * Fold the deployment facts into the mission board view. Pure: same facts,
 * same board; no clock, no environment, no hidden state.
 */
export function foldDesktopMissionBoard(
  facts: PaySwapDesktopDeploymentFacts,
): DesktopMissionBoardView {
  const rows: DesktopMissionBoardRow[] = PINNED_OUTCOME_ACTIONS.map((action) => {
    const capability = capabilityForAction(action.id, facts);
    const affordance: DesktopMissionBoardRow["affordance"] =
      capability.dispatchable && facts.delegationPlaneReachable
        ? { kind: "DELEGATE_JOURNEY", journeyId: action.dispatch.journeyId }
        : {
            kind: "UNAVAILABLE",
            missingPrerequisite:
              !capability.dispatchable && capability.missingPrerequisite !== undefined
                ? capability.missingPrerequisite
                : DELEGATION_PREREQUISITE,
          };
    return {
      actionId: action.id,
      label: action.label,
      outcomeLine: action.outcomeLine,
      advancedDisclosure: action.advancedDisclosure,
      capability,
      affordance,
    };
  });

  return {
    rows: Object.freeze(rows),
    emptyStateNote: facts.providerObservationsAvailable ? undefined : EMPTY_STATE_NOTE,
    pin: DESKTOP_PIN_PROVENANCE,
  };
}
