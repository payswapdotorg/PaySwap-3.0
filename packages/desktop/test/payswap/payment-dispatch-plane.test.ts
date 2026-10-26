/**
 * PaySwap Desktop (P19-A, ADR-0012 D1/D2/D3) — the dispatch-plane
 * CHANNEL battery (the connection fixtures + the dispatch-plane
 * scanners live in ./payment-dispatch-plane-fixtures.ts, split for the
 * ≤400-line file law; the shared approval harness in
 * ./payment-approval-plane-harness.ts).
 *
 * Composes the REAL service with the REAL payment-mission runtime and
 * the REAL connection session authority (in-memory fs; the
 * connections-plane battery pattern) and drives the two dispatch
 * members end-to-end:
 *
 * - THE ARMED-LOOKUP HONESTY (D1/D3): no artifact / expired (mint
 *   +600s, clock past it) / consumed — each not-armed reason VERBATIM
 *   with the path back; armed:true echoes the scope + expiry and
 *   NEVER an artifactId;
 * - THE LANE ELIGIBILITY (D2): the resolver's pure laws (ACTIVE
 *   SANDBOX eligible; ACTIVE LIVE ineligible with its verbatim reason;
 *   non-ACTIVE with its state reason; zero candidates → the honest
 *   empty lane) and the member-level truth over the REAL registry
 *   (the LIVE fixture record listed as ineligible, never hidden);
 * - THE CHOICE-VALIDATION LAW (D1): a dispatch with an outside or
 *   ineligible connectionRef is a typed refusal with NO attempt
 *   recorded and the artifact UNCONSUMED;
 * - THE ARTIFACT-NEVER-ON-THE-WIRE SCAN extended to the new shapes
 *   (the armed card — whose lanes lawfully carry the choice key — and
 *   the outcome, which echoes nothing);
 * - THE GOLDEN PATH over the labeled fixtures: seedDispatchablePreview
 *   + approveHostSide (host-side artifact) + a seeded ACTIVE SANDBOX
 *   connection + the scriptedAuthority (CONFIRMED) as the execution
 *   authority → armed:true with the lane → dispatch → DISPATCHED, the
 *   attempt state CONFIRMED on the detail, the mission completed;
 * - THE REFUSED PATH (the unwired authority) → REFUSED with the
 *   honest summary, the artifact consumed, the mission still open;
 * - FAIL-CLOSED: the typed PaymentPlaneNotConfiguredError without a
 *   runtime; the typed ConnectionPlaneNotConfiguredError without a
 *   connections plane (the lane set is never fabricated).
 */

import { describe, expect, it } from "vitest";

import { createPaySwapDesktopService } from "../../src/host/payswap/shell/service.js";
import {
  ConnectionPlaneNotConfiguredError,
  PaymentPlaneNotConfiguredError,
} from "../../src/host/payswap/shell/service.js";
import { PaymentMissionError } from "../../src/host/payswap/payments/contracts.js";
import {
  LIVE_LANE_INELIGIBLE_REASON,
  resolveDispatchLanes,
  type DispatchLaneCandidateRecord,
} from "../../src/host/payswap/payments/dispatch-lane-resolver.js";
import type { IPaySwapDesktopService } from "../../src/host/payswap/shell/contracts.js";
import {
  T0,
  T_PAST_ARTIFACT,
  UNKNOWN_MISSION,
  approveHostSide,
  assertNoArtifactOrLineage,
  expectedScopeFor,
  harness,
  scriptedAuthority,
  seedDispatchablePreview,
} from "./payment-approval-plane-harness.js";
import {
  assertLaneShapesClean,
  assertNoArtifactOrLineageExceptLaneChoice,
  connectionWorld,
  seedActiveSandboxConnection,
  seedLiveActiveConnectionRecord,
  seedProposedConnection,
} from "./payment-dispatch-plane-fixtures.js";

// ---------------------------------------------------------------------------
// COMPILE-TIME LAWS: the members accept ONLY (missionId) and
// (missionId, connectionRef) — no artifact, no operation and no
// execution mode is representable through either signature (the
// act-time law's type-level face; asserted behaviorally below).
// ---------------------------------------------------------------------------

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type ArmedTakesOnlyMissionId = Equal<
  Parameters<IPaySwapDesktopService["paymentMissionArmedEffect"]>,
  [string]
>;
type DispatchTakesOnlyMissionAndLane = Equal<
  Parameters<IPaySwapDesktopService["paymentMissionDispatch"]>,
  [string, string]
>;
const armedTakesOnlyMissionId: ArmedTakesOnlyMissionId = true;
const dispatchTakesOnlyMissionAndLane: DispatchTakesOnlyMissionAndLane = true;

const NO_ARTIFACT_REASON =
  "no authorization artifact exists for this mission — a fresh preview and a fresh explicit approval are required";

describe("the lane resolver (ADR-0012 D2 — ACTIVE SANDBOX only, nothing hidden)", () => {
  const candidates: readonly DispatchLaneCandidateRecord[] = [
    { connectionId: "conn:c", providerId: "stripe", useCaseRef: "own-store-test-mode", state: "ACTIVE", executionMode: "SANDBOX" },
    { connectionId: "conn:b", providerId: "stripe", useCaseRef: "own-store-test-mode", state: "ACTIVE", executionMode: "LIVE" },
    { connectionId: "conn:a", providerId: "flutterwave", useCaseRef: "own-store-test-mode", state: "PROPOSED", executionMode: "SANDBOX" },
  ];

  it("ACTIVE SANDBOX is eligible; ACTIVE LIVE is ineligible with its verbatim reason; non-ACTIVE carries its state reason", () => {
    const lanes = resolveDispatchLanes(candidates);
    expect(lanes.map((lane) => lane.connectionRef)).toEqual(["conn:a", "conn:b", "conn:c"]); // deterministic order
    expect(lanes[0]).toEqual({
      connectionRef: "conn:a",
      label: "Flutterwave (own-store-test-mode)",
      providerId: "flutterwave",
      ineligible: { reason: expect.stringContaining("not ACTIVE (PROPOSED)") },
    });
    expect(lanes[1]).toEqual({
      connectionRef: "conn:b",
      label: "Stripe (own-store-test-mode)",
      providerId: "stripe",
      ineligible: { reason: LIVE_LANE_INELIGIBLE_REASON },
    });
    expect(lanes[2]).toEqual({
      connectionRef: "conn:c",
      label: "Stripe (own-store-test-mode)",
      providerId: "stripe",
    });
    assertLaneShapesClean(lanes);
    assertNoArtifactOrLineageExceptLaneChoice(lanes);
  });

  it("zero candidates → the honest empty lane list (the deployment truth, never an error)", () => {
    expect(resolveDispatchLanes([])).toEqual([]);
  });
});

describe("the armed-effect read (ADR-0012 D1 — the armed-lookup honesty)", () => {
  it("no artifact → armed:false with the verbatim reason; the dispatch act refuses typed (AUTHORIZATION_REQUIRED)", async () => {
    const connections = connectionWorld();
    const world = await harness(undefined, connections.authority);
    const missionId = await seedDispatchablePreview(world);
    const connectionId = await seedActiveSandboxConnection(connections.authority);

    const card = await world.service.paymentMissionArmedEffect(missionId);
    expect(card.armed).toBe(false);
    expect(card.reason).toBe(NO_ARTIFACT_REASON);
    expect(card.scope).toBeUndefined();
    expect(card.expiresAt).toBeUndefined();
    expect(card.lanes.map((lane) => lane.connectionRef)).toEqual([connectionId]);
    assertLaneShapesClean(card.lanes);
    assertNoArtifactOrLineageExceptLaneChoice(card);

    const refused = await world.service.paymentMissionDispatch(missionId, connectionId).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(PaymentMissionError);
    expect((refused as PaymentMissionError).kind).toBe("AUTHORIZATION_REQUIRED");
    expect((refused as PaymentMissionError).message).toContain("no unconsumed authorization artifact");
    const detail = await world.service.paymentMissionDetail(missionId);
    expect(detail?.attemptCount).toBe(0); // no attempt was recorded
  });

  it("expired (mint +600s, clock past it) → the verbatim expired reason with the expiry instant", async () => {
    const connections = connectionWorld();
    const world = await harness(undefined, connections.authority, () => T_PAST_ARTIFACT);
    const missionId = await seedDispatchablePreview(world);
    await seedActiveSandboxConnection(connections.authority);
    await approveHostSide(world.runtime, missionId); // minted at T0 → expires 12:10:00Z

    const card = await world.service.paymentMissionArmedEffect(missionId);
    expect(card.armed).toBe(false);
    expect(card.reason).toBe(
      "the authorization artifact expired at 2026-10-22T12:10:00Z — a fresh preview and a fresh explicit approval are required",
    );
    assertNoArtifactOrLineageExceptLaneChoice(card);
  });

  it("unknown mission and malformed ids fail typed (fail-closed at the edge)", async () => {
    const connections = connectionWorld();
    const world = await harness(undefined, connections.authority);
    const unknown = await world.service.paymentMissionArmedEffect(UNKNOWN_MISSION).catch((e: unknown) => e);
    expect(unknown).toBeInstanceOf(PaymentMissionError);
    expect((unknown as PaymentMissionError).kind).toBe("MISSION_NOT_FOUND");
    const malformed = await world.service.paymentMissionArmedEffect("").catch((e: unknown) => e);
    expect(malformed).toBeInstanceOf(PaymentMissionError);
    expect((malformed as PaymentMissionError).kind).toBe("MISSION_NOT_FOUND");
  });
});

describe("the armed card's lanes over the REAL registry (D2 — the LIVE record is never silently hidden)", () => {
  it("lists the eligible SANDBOX lane, the ineligible LIVE record and the non-ACTIVE record with their reasons", async () => {
    const connections = connectionWorld();
    const liveConnectionId = seedLiveActiveConnectionRecord(connections); // BEFORE the authority loads
    const world = await harness(undefined, connections.authority);
    const missionId = await seedDispatchablePreview(world);
    const activeConnectionId = await seedActiveSandboxConnection(connections.authority);
    const proposedConnectionId = await seedProposedConnection(connections.authority);

    const card = await world.service.paymentMissionArmedEffect(missionId);
    expect(card.armed).toBe(false); // no approval on this mission — the lanes are the subject here
    const byRef = new Map(card.lanes.map((lane) => [lane.connectionRef, lane]));

    const active = byRef.get(activeConnectionId);
    expect(active).toEqual({
      connectionRef: activeConnectionId,
      label: "Stripe (own-store-test-mode)",
      providerId: "stripe",
    });
    const live = byRef.get(liveConnectionId);
    expect(live?.ineligible?.reason).toBe(LIVE_LANE_INELIGIBLE_REASON);
    const proposed = byRef.get(proposedConnectionId);
    expect(proposed?.ineligible?.reason).toContain("not ACTIVE (PROPOSED)");

    assertLaneShapesClean(card.lanes);
    // The registry's credential handle ref never crosses (INV-19).
    assertNoArtifactOrLineageExceptLaneChoice(card, "broker://fixture/p19a-live");
  });
});

describe("the dispatch act (ADR-0012 D1 — the choice-validation law)", () => {
  it("an outside connectionRef is a typed refusal: NO attempt recorded, the artifact UNCONSUMED", async () => {
    const connections = connectionWorld();
    const world = await harness(undefined, connections.authority);
    const missionId = await seedDispatchablePreview(world);
    await seedActiveSandboxConnection(connections.authority);
    const artifactId = await approveHostSide(world.runtime, missionId);

    const refusal = await world.service
      .paymentMissionDispatch(missionId, "conn:not-on-this-host")
      .catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(PaymentMissionError);
    expect((refusal as PaymentMissionError).kind).toBe("INVALID_FIELD_VALUE");
    expect((refusal as PaymentMissionError).message).toContain("no attempt was recorded");

    const detail = await world.service.paymentMissionDetail(missionId);
    expect(detail?.attempts).toEqual([]);
    expect(detail?.attemptCount).toBe(0);
    // The artifact survived the refused act (the mission is still armed).
    const card = await world.service.paymentMissionArmedEffect(missionId);
    expect(card.armed).toBe(true);
    assertNoArtifactOrLineageExceptLaneChoice(card, artifactId);
  });

  it("an INELIGIBLE lane choice (the LIVE fixture record) is a typed refusal carrying its reason", async () => {
    const connections = connectionWorld();
    const liveConnectionId = seedLiveActiveConnectionRecord(connections);
    const world = await harness(undefined, connections.authority);
    const missionId = await seedDispatchablePreview(world);
    await approveHostSide(world.runtime, missionId);

    const refusal = await world.service
      .paymentMissionDispatch(missionId, liveConnectionId)
      .catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(PaymentMissionError);
    expect((refusal as PaymentMissionError).kind).toBe("INVALID_FIELD_VALUE");
    expect((refusal as PaymentMissionError).message).toContain("LIVE mode");
    expect((refusal as PaymentMissionError).message).toContain("no attempt was recorded");
    const detail = await world.service.paymentMissionDetail(missionId);
    expect(detail?.attemptCount).toBe(0);
  });
});

describe("the dispatch golden path over the labeled fixtures (ADR-0012 D1)", () => {
  it("armed:true with the lane → dispatch → DISPATCHED; CONFIRMED on the detail; the single-use artifact consumed", async () => {
    const connections = connectionWorld();
    const world = await harness(scriptedAuthority(["CONFIRMED"]), connections.authority);
    const missionId = await seedDispatchablePreview(world);
    const artifactId = await approveHostSide(world.runtime, missionId);
    const connectionId = await seedActiveSandboxConnection(connections.authority);

    // THE ARMED CARD: the scope + expiry echo (never the artifactId) + the lane.
    const card = await world.service.paymentMissionArmedEffect(missionId);
    expect(card.armed).toBe(true);
    expect(card.reason).toBeUndefined();
    expect(card.scope).toEqual(await expectedScopeFor(world.service, missionId));
    expect(card.expiresAt).toBe("2026-10-22T12:10:00Z"); // mint +600s
    expect(card.lanes).toEqual([
      { connectionRef: connectionId, label: "Stripe (own-store-test-mode)", providerId: "stripe" },
    ]);
    assertNoArtifactOrLineageExceptLaneChoice(card, artifactId);
    assertLaneShapesClean(card.lanes);

    // THE ACT: the operator-picked lane over the host-recomputed eligible set.
    const outcome = await world.service.paymentMissionDispatch(missionId, connectionId);
    expect(outcome.kind).toBe("DISPATCHED");
    if (outcome.kind !== "DISPATCHED") throw new Error("unreachable");
    expect(outcome.attemptId).toMatch(/^pmt-attempt:/);
    expect(outcome.summary).toContain("confirmed");
    // Outcome facts ONLY: no artifactId, no connectionRef echo, no lineage.
    assertNoArtifactOrLineage(outcome, artifactId, connectionId);

    // The attempt state lands on the detail (CONFIRMED; the mode pinned host-side).
    const detail = await world.service.paymentMissionDetail(missionId);
    expect(detail?.attempts).toHaveLength(1);
    expect(detail?.attempts[0]).toEqual({
      attemptId: outcome.attemptId,
      startedAt: T0,
      operation: "CREATE_EXTERNAL_EFFECT",
      executionMode: "SANDBOX",
      outcome: "CONFIRMED",
      summary: expect.stringContaining("confirmed"),
    });
    expect(detail?.status).toBe("COMPLETED");
    assertNoArtifactOrLineage(detail!, artifactId, connectionId);

    // Single-use proven: the consumed artifact now reads not-armed, verbatim.
    const after = await world.service.paymentMissionArmedEffect(missionId);
    expect(after.armed).toBe(false);
    expect(after.reason).toBe(
      `the authorization artifact was consumed at ${T0} — a fresh preview and a fresh explicit approval are required`,
    );
  });
});

describe("the REFUSED path (the unwired authority — the honest deployment default)", () => {
  it("REFUSED with the honest summary; the artifact consumed; the mission stays open; NO artifact or lane echo", async () => {
    const connections = connectionWorld();
    const world = await harness(undefined, connections.authority);
    const missionId = await seedDispatchablePreview(world);
    const artifactId = await approveHostSide(world.runtime, missionId);
    const connectionId = await seedActiveSandboxConnection(connections.authority);

    const outcome = await world.service.paymentMissionDispatch(missionId, connectionId);
    expect(outcome.kind).toBe("REFUSED");
    if (outcome.kind !== "REFUSED") throw new Error("unreachable");
    expect(outcome.attemptId).toMatch(/^pmt-attempt:/);
    expect(outcome.summary).toContain("refused");
    expect(outcome.summary).toContain("NO_AUTHORITY_WIRED");
    expect(outcome.summary).toContain("definitively no effect");
    assertNoArtifactOrLineage(outcome, artifactId, connectionId);

    const detail = await world.service.paymentMissionDetail(missionId);
    expect(detail?.attempts[0]?.outcome).toBe("REFUSED");
    expect(detail?.attempts[0]?.executionMode).toBe("SANDBOX");
    expect(detail?.status).toBe("ACTIVE"); // a refusal is retryable under a fresh authorization

    const after = await world.service.paymentMissionArmedEffect(missionId);
    expect(after.armed).toBe(false);
    expect(after.reason).toBe(
      `the authorization artifact was consumed at ${T0} — a fresh preview and a fresh explicit approval are required`,
    );
    assertNoArtifactOrLineageExceptLaneChoice(after, artifactId);
  });
});

describe("the dispatch channel: fail-closed without a composed plane", () => {
  it("both members throw the typed PaymentPlaneNotConfiguredError without a runtime", async () => {
    const service = createPaySwapDesktopService(
      { scope: { kind: "local" }, log: () => {} },
      { createSessionId: () => "session-p19a-bare" },
    );
    await expect(service.paymentMissionArmedEffect(UNKNOWN_MISSION)).rejects.toBeInstanceOf(
      PaymentPlaneNotConfiguredError,
    );
    await expect(service.paymentMissionDispatch(UNKNOWN_MISSION, "conn:x")).rejects.toBeInstanceOf(
      PaymentPlaneNotConfiguredError,
    );
  });

  it("both members throw the typed ConnectionPlaneNotConfiguredError without a connections plane (the lane set is never fabricated)", async () => {
    const world = await harness(); // runtime composed, NO connection authority
    // A REAL mission — the members reach the lane port (the mission
    // checks pass) and the port fails closed typed, never a fabricated
    // empty lane set masking the missing plane.
    const seeded = await world.service.paymentMissionSeed({
      direction: "PAY",
      goalStatement: "seed the no-connections-plane posture (P19-A)",
    });
    await expect(world.service.paymentMissionArmedEffect(seeded.missionId)).rejects.toBeInstanceOf(
      ConnectionPlaneNotConfiguredError,
    );
    await expect(
      world.service.paymentMissionDispatch(seeded.missionId, "conn:x"),
    ).rejects.toBeInstanceOf(ConnectionPlaneNotConfiguredError);
    expect(armedTakesOnlyMissionId).toBe(true);
    expect(dispatchTakesOnlyMissionAndLane).toBe(true);
  });
});
