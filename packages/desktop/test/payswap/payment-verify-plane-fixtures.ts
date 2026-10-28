/**
 * PaySwap Desktop (P21-D reviewer-gate, Gap C) — the VERIFY-PLANE
 * fixtures: the scripted read-back ports + the seed helpers the
 * verify battery drives (the payment-approval-plane-harness pattern —
 * hermetic, deterministic, clearly-labeled FAKES; no network, no real
 * credentials).
 */

import { expect } from "vitest";

import type { StripeReadBackPort } from "../../src/host/payswap/payments/stripe-read-back.js";
import type { PaymentResultEnvelope } from "../../src/host/payswap/payments/contracts.js";
import type { ExecutionAuthorityPort } from "../../src/host/payswap/payments/execution-authority.js";
import {
  T0,
  approveHostSide,
  seedDispatchablePreview,
  type Harness,
} from "./payment-approval-plane-harness.js";

/** The verify battery's instants (T0 belongs to the shared harness). */
export const T1 = "2026-10-22T12:05:00Z";
export const T2 = "2026-10-22T12:10:00Z";
export const VERIFY_CONNECTION_REF = "conn:test-lane";
export const VERIFY_INTENT_ID = "prv_fake_1";
export const VERIFY_UNKNOWN_ATTEMPT = "pmt-attempt:ffffffffffffffffffffffffffffffff";

/** One recorded read-back call (the exact facts the port received). */
export interface ReadBackCall {
  readonly connectionRef: string;
  readonly paymentIntentId: string;
  readonly executionMode: "SANDBOX" | "LIVE";
}

/** A scripted read-back port (FAKE — clearly labeled, deterministic, records its calls). */
export function scriptedReadBack(
  answer: { readonly outcome: "CONFIRMED" | "FAILED" | "UNKNOWN"; readonly paymentIntentStatus: string | null },
): StripeReadBackPort & { readonly calls: readonly ReadBackCall[] } {
  const calls: ReadBackCall[] = [];
  return {
    calls,
    async readBack(input) {
      calls.push({
        connectionRef: input.connectionRef,
        paymentIntentId: input.paymentIntentId,
        executionMode: input.executionMode,
      });
      return {
        outcome: answer.outcome,
        paymentIntentId: input.paymentIntentId,
        paymentIntentStatus: answer.paymentIntentStatus,
      };
    },
  };
}

/** A scripted authority answering CONFIRMED with NO provider reference (the no-reference branch). */
export function confirmedNoReferenceAuthority(): ExecutionAuthorityPort {
  return {
    async dispatch() {
      const envelope: PaymentResultEnvelope = {
        outcome: "CONFIRMED",
        providerReferences: [],
        dispatchedAt: 1_000,
        completedAt: 2_000,
      };
      return { kind: "ENVELOPE", envelope };
    },
  };
}

/** Seed one CONFIRMED attempt through the REAL runtime (preview → approval → dispatch). */
export async function seedConfirmedAttempt(
  world: Harness,
): Promise<{ readonly missionId: string; readonly attemptId: string }> {
  const missionId = await seedDispatchablePreview(world);
  const artifactId = await approveHostSide(world.runtime, missionId);
  const outcome = await world.runtime.dispatch.dispatch(
    missionId,
    "CREATE_EXTERNAL_EFFECT",
    { authorizationArtifactId: artifactId, connectionRef: VERIFY_CONNECTION_REF, executionMode: "SANDBOX" },
    T0,
  );
  expect(outcome.kind).toBe("DISPATCHED");
  if (outcome.kind !== "DISPATCHED") throw new Error("unreachable");
  expect(outcome.envelope.outcome).toBe("CONFIRMED");
  return { missionId, attemptId: outcome.attemptId };
}

/** The byte-exact mission snapshot (the nothing-appended laws compare these). */
export async function snapshotOf(world: Harness, missionId: string): Promise<string> {
  return JSON.stringify(await world.runtime.getMission(missionId));
}
