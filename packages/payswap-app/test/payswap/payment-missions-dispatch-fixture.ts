/**
 * @payswap/app — the payment-missions DISPATCH FAKE harness (P19-B; the
 * jsdom battery's in-memory dispatch plane), composed OVER the P18 fake
 * port (./payment-missions-fixture.ts) as the dispatch-capable
 * PaymentMissionsPortWithDispatch — a separate file so the P18 fixture
 * keeps its line budget untouched.
 *
 * Deterministic + honest per ADR-0012 D1/D2 and the REAL host members
 * (the P19-A lane's dispatch-members.ts, landed in parallel): the armed
 * effect derives from the base fake's approval flow (a GRANTED
 * resolution arms the mission; a dispatch outcome consumes the artifact
 * — refused or sent alike), the not-armed reasons mirror the host's
 * pinned constants VERBATIM, the lanes model the host-side lane resolver
 * (an eligible SANDBOX lane + an ineligible LIVE lane with its reason —
 * never hidden, and the lanes resolve even when not armed), and the
 * dispatch member recomputes eligibility AT ACT TIME: a lane outside the
 * recomputed set is a THROWN typed error with NO attempt recorded (the
 * artifact stays live — a re-choice is possible), while a runtime
 * authority refusal returns the REFUSED outcome with the attempt state
 * recorded. Every call is recorded in the shared ledger (the call-order
 * law); armedEffect + dispatch are vi.fn spies so the battery can assert
 * EXACT call arguments.
 */
import { vi } from "vitest";
import type {
  PaymentMissionsArmedEffect,
  PaymentMissionsDispatchOutcome,
  PaymentMissionsExecLane,
  PaymentMissionsPortWithDispatch,
} from "../../src/agent/paymentMissionsDispatchPins.js";
import type {
  PaymentMissionsApprovalResolution,
  PaymentMissionsAttemptState,
  PaymentMissionsEvent,
} from "../../src/agent/paymentMissionsPins.js";
import {
  M1,
  M1_SCOPE_DIGEST,
  M2,
  T5,
  makeFakeMissionsPort,
} from "./payment-missions-fixture.js";

/* --------------------------- the deterministic facts --------------------------- */

export const T6 = "2026-10-26T12:07:00Z";
export const LANE_SANDBOX_REF = "conn:sandbox:stripe-01";
export const LANE_SANDBOX_LABEL = "Stripe test lane";
export const LANE_LIVE_REF = "conn:live:flw-02";
export const LANE_LIVE_LABEL = "Flutterwave live lane";
export const LANE_LIVE_REASON =
  "The live execution mode is not eligible in this deployment — it requires the live-grant derivation that belongs to the execution-lane wave's own amendment.";
export const M1_ATTEMPT_ID = "attempt:a1b2c3d4:1";
export const M1_REFUSAL_ATTEMPT_ID = "attempt:a1b2c3d4:2";
/** Mirrors the host's pinned not-armed reasons VERBATIM (dispatch-members.ts). */
export const NOT_ARMED_NO_ARTIFACT_REASON =
  "no authorization artifact exists for this mission — a fresh preview and a fresh explicit approval are required";
export const NOT_ARMED_CONSUMED_REASON =
  `the authorization artifact was consumed at ${T6} — a fresh preview and a fresh explicit approval are required`;
export const DISPATCHED_SUMMARY =
  "The execution authority confirmed the effect over the chosen sandbox lane — the recorded envelope stands as evidence.";
export const DISPATCH_REFUSED_SUMMARY =
  "The execution authority refused the command before any effect — definitively no effect; a fresh authorization is required to retry.";
export const DISPATCH_NOT_ELIGIBLE_ERROR =
  `connectionRef '${LANE_SANDBOX_REF}' is not eligible for dispatch (not an ACTIVE SANDBOX connection); no attempt was recorded`;

/** The fake's lane configurations (the ADR-0012 D2 resolver shapes). */
export type FakeDispatchLaneMode = "sandbox-and-live" | "no-lanes" | "live-only";

export interface FakeDispatchOptions {
  readonly lanes?: FakeDispatchLaneMode;
  /** When true, the FIRST dispatch returns the runtime authority's REFUSED outcome (the artifact consumed, an attempt recorded). */
  readonly refuseFirstSend?: boolean;
  /** When true, the FIRST dispatch THROWS the act-time not-eligible typed error (no attempt, the artifact stays live). */
  readonly throwOnFirstSend?: boolean;
}

function laneList(mode: FakeDispatchLaneMode): readonly PaymentMissionsExecLane[] {
  const sandbox: PaymentMissionsExecLane = {
    connectionRef: LANE_SANDBOX_REF,
    label: LANE_SANDBOX_LABEL,
    providerId: "stripe",
  };
  const live: PaymentMissionsExecLane = {
    connectionRef: LANE_LIVE_REF,
    label: LANE_LIVE_LABEL,
    providerId: "flutterwave",
    ineligible: { reason: LANE_LIVE_REASON },
  };
  if (mode === "no-lanes") {
    return [];
  }
  return mode === "live-only" ? [live] : [sandbox, live];
}

/** Build the dispatch-capable fake port (deterministic; every call recorded; armedEffect + dispatch spied). */
export function makeFakeDispatchMissionsPort(options: FakeDispatchOptions = {}) {
  const base = makeFakeMissionsPort();
  const calls = base.calls;
  const lanes = laneList(options.lanes ?? "sandbox-and-live");
  let armed = false;
  let consumed = false;
  let refusedOnce = options.refuseFirstSend === true;
  let threwOnce = options.throwOnFirstSend === true;
  const extraEvents: PaymentMissionsEvent[] = [];
  const extraAttempts: PaymentMissionsAttemptState[] = [];

  const armedEffect = vi.fn(async (missionId: string): Promise<PaymentMissionsArmedEffect> => {
    calls.push(`armedEffect:${missionId}`);
    if (missionId !== M1 && missionId !== M2) {
      throw new Error(`no mission '${missionId}' exists on the fake dispatch plane`);
    }
    // The lanes always resolve (the host resolves them even when not armed).
    if (missionId !== M1) {
      return { armed: false, reason: NOT_ARMED_NO_ARTIFACT_REASON, lanes };
    }
    if (consumed) {
      return { armed: false, reason: NOT_ARMED_CONSUMED_REASON, lanes };
    }
    if (!armed) {
      return { armed: false, reason: NOT_ARMED_NO_ARTIFACT_REASON, lanes };
    }
    return {
      armed: true,
      scope: {
        missionId: M1,
        direction: "PAY",
        amount: { currency: "EUR", minorUnits: "2500" },
        destinationSummary: "the supplier's bank account ending ••33",
        intentDigest: M1_SCOPE_DIGEST,
      },
      expiresAt: T5,
      lanes,
    };
  });

  const dispatch = vi.fn(async (missionId: string, connectionRef: string): Promise<PaymentMissionsDispatchOutcome> => {
    calls.push(`dispatch:${missionId}:${connectionRef}`);
    if (missionId !== M1) {
      throw new Error(`no mission '${missionId}' exists on the fake dispatch plane`);
    }
    if (threwOnce) {
      // The act-time recomputed set excludes the chosen lane: a THROWN typed
      // error, no attempt recorded, the artifact NOT consumed.
      threwOnce = false;
      throw new Error(DISPATCH_NOT_ELIGIBLE_ERROR);
    }
    const chosen = lanes.find(
      (lane) => lane.connectionRef === connectionRef && lane.ineligible === undefined,
    );
    if (!armed || consumed || chosen === undefined) {
      throw new Error(
        `connectionRef '${connectionRef}' is not eligible for dispatch (not an ACTIVE SANDBOX connection); no attempt was recorded`,
      );
    }
    // The artifact is consumed by the act — refused or sent alike.
    consumed = true;
    extraEvents.push({
      id: "evt:a1:6",
      at: T6,
      kind: "OPAQUE_HOST_KIND",
      summary: "Dispatch sent over the chosen lane — the attempt state records the outcome.",
    });
    if (refusedOnce) {
      refusedOnce = false;
      extraAttempts.push({
        attemptId: M1_REFUSAL_ATTEMPT_ID,
        startedAt: T6,
        operation: "CREATE_EXTERNAL_EFFECT",
        executionMode: "SANDBOX",
        outcome: "REFUSED",
        summary: "The execution authority refused the command before any effect — no effect happened.",
      });
      return { kind: "REFUSED", attemptId: M1_REFUSAL_ATTEMPT_ID, summary: DISPATCH_REFUSED_SUMMARY };
    }
    extraAttempts.push({
      attemptId: M1_ATTEMPT_ID,
      startedAt: T6,
      operation: "CREATE_EXTERNAL_EFFECT",
      executionMode: "SANDBOX",
      outcome: "CONFIRMED",
      summary: "The sandbox lane confirmed the payment effect.",
    });
    return { kind: "DISPATCHED", attemptId: M1_ATTEMPT_ID, summary: DISPATCHED_SUMMARY };
  });

  const port: PaymentMissionsPortWithDispatch = {
    ...base.port,
    async detail(missionId) {
      const detail = await base.port.detail(missionId);
      if (detail === null || detail.id !== M1) {
        return detail;
      }
      // The dispatch overlay: the attempt states + the timeline events land on the detail.
      return {
        ...detail,
        events: [...detail.events, ...extraEvents],
        attempts: [...(detail.attempts ?? []), ...extraAttempts],
      };
    },
    async resolveApproval(requestId, decision) {
      const resolution: PaymentMissionsApprovalResolution = await base.resolveApproval(
        requestId,
        decision,
      );
      if (resolution.outcome === "GRANTED") {
        armed = true;
      }
      return resolution;
    },
    armedEffect,
    dispatch,
  };

  return { port, calls, resolveApproval: base.resolveApproval, armedEffect, dispatch };
}
