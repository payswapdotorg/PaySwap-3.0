/**
 * @payswap/app — the outcome-board fold (the five outcome actions
 * with their honest dispatchability facts).
 *
 * NET-NEW fold over the MIRRORED surface registry
 * (lib/outcome-registry.ts — structural mirror of @payswap/surface P2-W3):
 * renders the registry + deployment facts into the OutcomeBoardView the
 * home page and the app entry boundary consume. Mirrors surface
 * outcomes.ts outcomeCapabilityBoard (same fold shape; mirror-tested
 * against the source).
 *
 * LAW: when NO action is dispatchable, `nothingDispatchable` is true and
 * the board leads with that honest fact — never a failure tone, never
 * dead buttons, never fabricated dispatchability (INV-24 posture).
 */

import type {
  OutcomeBoardRow,
  OutcomeBoardView,
} from "../contracts/view-models.js";
import type {
  OutcomeActionIdPin,
  OutcomeDeploymentContextPin,
} from "../pins/surface-pins.js";
import {
  capabilityObservationCapability,
  intakeCapability,
  merchantCapability,
  OUTCOME_REGISTRY_MIRROR,
} from "./outcome-registry.js";

function capabilityFoldFor(
  authority: OutcomeActionIdPin,
  context: OutcomeDeploymentContextPin,
) {
  switch (authority) {
    case "pay":
    case "receive":
    case "move":
      return intakeCapability(context);
    case "convert":
      return capabilityObservationCapability(context);
    case "checkout":
      return merchantCapability(context);
  }
}

/** Every outcome action's honest capability fold for one deployment. */
export function foldOutcomeBoard(
  deployment: OutcomeDeploymentContextPin,
): OutcomeBoardView {
  const rows: OutcomeBoardRow[] = OUTCOME_REGISTRY_MIRROR.map((action) => ({
    actionId: action.id,
    label: action.label,
    outcomeLine: action.outcomeLine,
    advancedDisclosure: action.advancedDisclosure,
    capability: capabilityFoldFor(action.id, deployment),
  }));
  return {
    rows,
    deployment,
    nothingDispatchable: rows.every((row) => !row.capability.dispatchable),
  };
}
