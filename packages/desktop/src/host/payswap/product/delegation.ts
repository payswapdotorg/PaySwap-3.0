/**
 * PaySwap Desktop (P7-W2) — delegated money movement.
 *
 * THE DELEGATION LAW (P5-W3 law applied to the desktop; work-order
 * mission constraint): the desktop product COMPOSES shared contracts; it
 * does NOT re-implement engines. There is no parallel payment engine on
 * the desktop — money movement is delegated via TYPED REFERENCES to the
 * backend plane that owns execution:
 *
 * - Constructing/forwarding a DesktopDelegatedMovementRef performs NO
 *   movement and implies NO authorization; the receipt is an
 *   ACKNOWLEDGEMENT, never finality, never success.
 * - The referenced journey MUST exist in the pinned outcome registry, and
 *   the accepting plane MUST be the journey's pinned dispatch authority —
 *   a mismatch refuses the delegation (the desktop never re-routes a
 *   journey to a different authority plane).
 * - The declared amount is wire-validated (AmountSpec pin) and NEVER
 *   desktop-computed.
 * - The authorization lineage ref is structurally validated (opaque pin)
 *   — the desktop never re-derives authority from it.
 * - There is intentionally NO API to execute, retry, cancel or "confirm"
 *   money movement on this surface: those live with the backend planes.
 */

import type { DesktopDelegatedMovementRef, DesktopDelegationReceipt } from "./contracts.js";
import {
  DESKTOP_PIN_PROVENANCE,
  PINNED_OUTCOME_ACTIONS,
  validatePinnedAmountSpec,
  validatePinnedAuthorizationRef,
} from "../pins/index.js";

const ACKNOWLEDGEMENT_NOTE =
  "The backend plane accepted the delegation reference. This is a submission acknowledgement only — not finality, not success. The journey's outcome will be reported by provider-verified observation.";

function authorityAcceptingJourney(journeyId: string):
  | "economic-intent-plane"
  | "quote-projection-plane"
  | "merchant-checkout-plane"
  | undefined {
  const action = PINNED_OUTCOME_ACTIONS.find((candidate) => candidate.dispatch.journeyId === journeyId);
  return action?.dispatch.authority;
}

/**
 * Validate + forward one delegated money-movement reference. Pure and
 * fail-closed; performs no I/O and moves nothing.
 */
export function delegateDesktopMoneyMovement(
  movement: DesktopDelegatedMovementRef,
): DesktopDelegationReceipt {
  if (movement === null || typeof movement !== "object") {
    throw new Error("delegateDesktopMoneyMovement: movement must be a DesktopDelegatedMovementRef");
  }
  if (typeof movement.journeyId !== "string" || movement.journeyId.length === 0) {
    throw new Error("delegateDesktopMoneyMovement: journeyId must be a non-empty string");
  }
  if (typeof movement.intentRef !== "string" || movement.intentRef.length === 0) {
    throw new Error(
      "delegateDesktopMoneyMovement: intentRef must be a non-empty reference to the backend plane's recorded intent",
    );
  }
  if (typeof movement.issuedAt !== "string" || movement.issuedAt.length === 0) {
    throw new Error(
      "delegateDesktopMoneyMovement: issuedAt must be a non-empty ISO-8601 string",
    );
  }

  // The journey must be a REAL pinned journey, and the accepting plane is
  // its pinned dispatch authority — the desktop never re-routes journeys.
  const acceptedBy = authorityAcceptingJourney(movement.journeyId);
  if (acceptedBy === undefined) {
    throw new Error(
      `delegateDesktopMoneyMovement: unknown journey ${JSON.stringify(movement.journeyId)} — journeys are pinned registry ids, never invented`,
    );
  }

  // Opaque authorization lineage: structural completeness only.
  validatePinnedAuthorizationRef(movement.authorization);

  // The declared amount must be a valid wire amount (never computed here).
  validatePinnedAmountSpec(movement.declaredAmount);

  return {
    journeyId: movement.journeyId,
    intentRef: movement.intentRef,
    acceptedBy,
    acknowledgementNote: ACKNOWLEDGEMENT_NOTE,
    issuedAt: movement.issuedAt,
    pin: DESKTOP_PIN_PROVENANCE,
  };
}
