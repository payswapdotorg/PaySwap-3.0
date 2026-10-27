/**
 * PaySwap Desktop (P20-A) — the reconcile-plane battery's shared
 * fixtures, split from ./payment-reconcile-plane.test.ts for the
 * ≤400-line file law (the P19-A dispatch-fixtures precedent).
 *
 * Everything here rides the EXISTING shared harness
 * (./payment-approval-plane-harness.ts) and the EXISTING connection
 * fixtures (./payment-dispatch-plane-fixtures.ts): the labeled
 * scriptedAuthority that answers UNKNOWN, the never-settling authority,
 * the channel dispatch path that seeds the attempt, the byte-identical
 * record snapshot, and the pinned edge literals the scanner laws
 * forbid on every wire shape.
 */

import { expect } from "vitest";

import { createPaySwapDesktopService } from "../../src/host/payswap/shell/service.js";
import {
  CHANNEL_RECONCILIATION_ORIGIN,
  CHANNEL_RECONCILIATION_PRINCIPAL,
} from "../../src/host/payswap/shell/reconcile-members.js";
import { seedDispatchablePreview, approveHostSide, type Harness } from "./payment-approval-plane-harness.js";

/** A well-formed but nonexistent attempt id (the act-time addressing failure). */
export const FOREIGN_ATTEMPT_ID = "pmt-attempt:ffffffffffffffffffffffffffffffff";

/** A realistic provider-statement reference (fixture material only). */
export const STATEMENT_REF = "acct-statement-ref-001";

/** The pinned edge literals — forbidden on every wire shape the battery scans. */
export const EDGE_PIN_LITERALS = [CHANNEL_RECONCILIATION_ORIGIN, CHANNEL_RECONCILIATION_PRINCIPAL];

/** The byte-identical record snapshot (the nothing-changed proof). */
export async function snapshotOf(world: Harness, missionId: string): Promise<string> {
  return JSON.stringify(await world.runtime.getMission(missionId));
}

/** A bare service for the arity laws (no runtime needed — signatures only). */
export const aritySurface = (() => {
  const service = createPaySwapDesktopService(
    { scope: { kind: "local" }, log: () => {} },
    { createSessionId: () => "session-p20a-arity" },
  );
  return { reference: service.paymentMissionPendingReconciliation, act: service.paymentMissionReconcile };
})();

/**
 * Seed an UNKNOWN attempt over the CHANNEL dispatch path (the P19-A
 * members — the honest end-to-end compose: the armed card's lane choice
 * → the dispatch → the scripted authority answers UNKNOWN → the
 * write-ahead + the UNKNOWN envelope both recorded). Returns the
 * addressing keys + the host-side artifact id (for the scans).
 */
export async function seedUnknownAttempt(
  world: Harness,
  connectionId: string,
): Promise<{ readonly missionId: string; readonly attemptId: string; readonly artifactId: string }> {
  const missionId = await seedDispatchablePreview(world);
  const artifactId = await approveHostSide(world.runtime, missionId);
  const outcome = await world.service.paymentMissionDispatch(missionId, connectionId);
  expect(outcome.kind).toBe("DISPATCHED");
  if (outcome.kind !== "DISPATCHED") throw new Error("unreachable");
  const detail = await world.service.paymentMissionDetail(missionId);
  expect(detail?.attempts[0]?.outcome).toBe("OUTCOME_UNKNOWN");
  return { missionId, attemptId: outcome.attemptId, artifactId };
}
