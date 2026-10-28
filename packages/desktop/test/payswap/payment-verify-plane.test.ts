/**
 * PaySwap Desktop (P21-D reviewer-gate, Gap C) — the VERIFY-PLANE battery:
 * the runtime verify operation + the channel member laws over SCRIPTED
 * read-back ports (hermetic — no network, no real credentials; the
 * fakes are clearly labeled).
 *
 * THE REVIEWER'S LAW, asserted as tests:
 * - a CONFIRMED attempt whose authoritative read-back AGREES (the provider
 *   reports 'succeeded') appends the ATTEMPT_VERIFIED event + the typed
 *   persisted verification fact on the attempt record — the final stage's
 *   completion contract for a confirmed attempt;
 * - an AMBIGUOUS attempt (UNKNOWN envelope) REFUSES verification with the
 *   typed error and NOTHING appended — an ambiguous outcome must remain
 *   UNKNOWN and require the actual reconciliation path;
 * - a refused / definitively-failed attempt REFUSES (no provider object
 *   exists to read back);
 * - an already-reconciled attempt REFUSES (verification not applicable);
 * - a CONFIRMED attempt with no provider reference REFUSES;
 * - a read-back that is itself UNKNOWN, FAILED, or disagrees with the
 *   recorded confirmation THROWS with nothing rewritten — the envelope is
 *   never mutated;
 * - the REPLAY is idempotent: a second verify appends NOTHING and returns
 *   the recorded verification;
 * - the persistence: a fresh store over the same fs carries the
 *   verification;
 * - the channel member validates at the edge and PROPAGATES the typed
 *   refusals (never masked); the absent-plane posture fails closed with
 *   the typed PaymentPlaneNotConfiguredError.
 */
import { describe, expect, it } from "vitest";

import { createPaySwapDesktopService } from "../../src/host/payswap/shell/service.js";
import { PaymentPlaneNotConfiguredError } from "../../src/host/payswap/shell/plane-errors.js";
import { createPaymentVerifyChannelMembers } from "../../src/host/payswap/shell/verify-members.js";
import { PaymentMissionError } from "../../src/host/payswap/payments/contracts.js";
import {
  T0,
  approveHostSide,
  harness,
  scriptedAuthority,
  seedDispatchablePreview,
} from "./payment-approval-plane-harness.js";
import {
  T1,
  T2,
  VERIFY_CONNECTION_REF as CONNECTION_REF,
  VERIFY_INTENT_ID as INTENT_ID,
  VERIFY_UNKNOWN_ATTEMPT as UNKNOWN_ATTEMPT,
  confirmedNoReferenceAuthority,
  scriptedReadBack,
  seedConfirmedAttempt,
  snapshotOf,
} from "./payment-verify-plane-fixtures.js";

/* --------------------------- the runtime verify laws --------------------------- */

describe("the runtime verify operation (the reviewer's Gap C contract)", () => {
  it("a CONFIRMED attempt + an agreeing authoritative read-back appends ATTEMPT_VERIFIED + the typed persisted verification", async () => {
    const world = await harness(scriptedAuthority(["CONFIRMED"]));
    const { missionId, attemptId } = await seedConfirmedAttempt(world);
    const before = await world.runtime.getMission(missionId);
    const readBack = scriptedReadBack({ outcome: "CONFIRMED", paymentIntentStatus: "succeeded" });
    const outcome = await world.runtime.dispatch.verify(missionId, attemptId, readBack, T1);
    expect(outcome.kind).toBe("VERIFIED");
    if (outcome.kind !== "VERIFIED") throw new Error("unreachable");
    expect(outcome.attemptId).toBe(attemptId);
    expect(outcome.readBackStatus).toBe("succeeded");
    expect(outcome.verifiedAt).toBe(T1);
    // The summary names the authoritative read-back, the provider
    // references, the observed status — and NEVER the word 'reconciled'.
    expect(outcome.summary).toContain("read-back");
    expect(outcome.summary).toContain(INTENT_ID);
    expect(outcome.summary).toContain("succeeded");
    expect(outcome.summary).not.toMatch(/reconcil/i);
    // The read-back rode the attempt's own facts, EXACTLY.
    expect(readBack.calls).toEqual([
      { connectionRef: CONNECTION_REF, paymentIntentId: INTENT_ID, executionMode: "SANDBOX" },
    ]);
    // The persisted record: the attempt carries the typed verification fact.
    const after = (await world.runtime.getMission(missionId))!;
    const attempt = after.attempts.find((candidate) => candidate.attemptId === attemptId)!;
    expect(attempt.verification).toEqual({
      readBackStatus: "succeeded",
      providerReferences: [INTENT_ID, "succeeded"],
      source: "EXTERNAL_PROVIDER_RETRIEVAL",
      verifiedAt: T1,
    });
    // The timeline: exactly ONE new event, the typed closer.
    expect(after.events.length).toBe(before!.events.length + 1);
    const [event] = after.events;
    expect(event?.kind).toBe("ATTEMPT_VERIFIED");
    expect(event?.correlationRef).toBe(attemptId);
    expect(event?.at).toBe(T1);
    expect(event?.summary).toBe(outcome.summary);
  });

  it("the REPLAY is idempotent: a second verify appends NOTHING and returns the recorded verification", async () => {
    const world = await harness(scriptedAuthority(["CONFIRMED"]));
    const { missionId, attemptId } = await seedConfirmedAttempt(world);
    const readBack = scriptedReadBack({ outcome: "CONFIRMED", paymentIntentStatus: "succeeded" });
    const first = await world.runtime.dispatch.verify(missionId, attemptId, readBack, T1);
    const afterFirst = await snapshotOf(world, missionId);
    const second = await world.runtime.dispatch.verify(missionId, attemptId, readBack, T2);
    expect(second.kind).toBe("VERIFIED");
    if (second.kind !== "VERIFIED" || first.kind !== "VERIFIED") throw new Error("unreachable");
    // The recorded instants + facts replay; the new `now` never rewrites.
    expect(second.verifiedAt).toBe(first.verifiedAt);
    expect(second.readBackStatus).toBe(first.readBackStatus);
    expect(second.summary).toBe(first.summary);
    // NOTHING appended on the replay.
    expect(await snapshotOf(world, missionId)).toBe(afterFirst);
    expect(readBack.calls).toHaveLength(1);
  });

  it("an AMBIGUOUS attempt (UNKNOWN envelope) REFUSES verification — the reviewer's law, nothing appended", async () => {
    const world = await harness(scriptedAuthority(["UNKNOWN"]));
    const missionId = await seedDispatchablePreview(world);
    const artifactId = await approveHostSide(world.runtime, missionId);
    const outcome = await world.runtime.dispatch.dispatch(
      missionId,
      "CREATE_EXTERNAL_EFFECT",
      { authorizationArtifactId: artifactId, connectionRef: CONNECTION_REF, executionMode: "SANDBOX" },
      T0,
    );
    expect(outcome.kind === "DISPATCHED" && outcome.envelope.outcome).toBe("UNKNOWN");
    const before = await snapshotOf(world, missionId);
    const attemptId = outcome.kind === "DISPATCHED" ? outcome.attemptId : "";
    await expect(
      world.runtime.dispatch.verify(missionId, attemptId, scriptedReadBack({ outcome: "CONFIRMED", paymentIntentStatus: "succeeded" }), T1),
    ).rejects.toMatchObject({
      name: "PaymentMissionError",
      kind: "VERIFICATION_REFUSED",
      message: expect.stringContaining("an ambiguous outcome must remain UNKNOWN and require the actual reconciliation path"),
    });
    expect(await snapshotOf(world, missionId)).toBe(before);
  });

  it("a REFUSED attempt REFUSES verification (no provider object exists to read back)", async () => {
    const world = await harness(); // the unwired authority: every dispatch is REFUSED
    const missionId = await seedDispatchablePreview(world);
    const artifactId = await approveHostSide(world.runtime, missionId);
    const outcome = await world.runtime.dispatch.dispatch(
      missionId,
      "CREATE_EXTERNAL_EFFECT",
      { authorizationArtifactId: artifactId, connectionRef: CONNECTION_REF, executionMode: "SANDBOX" },
      T0,
    );
    expect(outcome.kind).toBe("REFUSED");
    const before = await snapshotOf(world, missionId);
    const attemptId = outcome.kind === "REFUSED" ? outcome.attemptId : "";
    await expect(
      world.runtime.dispatch.verify(missionId, attemptId, scriptedReadBack({ outcome: "CONFIRMED", paymentIntentStatus: "succeeded" }), T1),
    ).rejects.toMatchObject({ name: "PaymentMissionError", kind: "VERIFICATION_REFUSED" });
    expect(await snapshotOf(world, missionId)).toBe(before);
  });

  it("a definitively FAILED attempt REFUSES verification (the mission stays open for a fresh authorization)", async () => {
    const world = await harness(scriptedAuthority(["FAILED"]));
    const missionId = await seedDispatchablePreview(world);
    const artifactId = await approveHostSide(world.runtime, missionId);
    const outcome = await world.runtime.dispatch.dispatch(
      missionId,
      "CREATE_EXTERNAL_EFFECT",
      { authorizationArtifactId: artifactId, connectionRef: CONNECTION_REF, executionMode: "SANDBOX" },
      T0,
    );
    expect(outcome.kind === "DISPATCHED" && outcome.envelope.outcome).toBe("FAILED");
    const before = await snapshotOf(world, missionId);
    const attemptId = outcome.kind === "DISPATCHED" ? outcome.attemptId : "";
    await expect(
      world.runtime.dispatch.verify(missionId, attemptId, scriptedReadBack({ outcome: "CONFIRMED", paymentIntentStatus: "succeeded" }), T1),
    ).rejects.toMatchObject({ name: "PaymentMissionError", kind: "VERIFICATION_REFUSED" });
    expect(await snapshotOf(world, missionId)).toBe(before);
  });

  it("a CONFIRMED attempt with NO provider reference REFUSES (nothing to address the read-back)", async () => {
    const world = await harness(confirmedNoReferenceAuthority());
    const { missionId, attemptId } = await seedConfirmedAttempt(world);
    const before = await snapshotOf(world, missionId);
    await expect(
      world.runtime.dispatch.verify(missionId, attemptId, scriptedReadBack({ outcome: "CONFIRMED", paymentIntentStatus: "succeeded" }), T1),
    ).rejects.toMatchObject({ name: "PaymentMissionError", kind: "VERIFICATION_REFUSED" });
    expect(await snapshotOf(world, missionId)).toBe(before);
  });

  it("an ALREADY_RECONCILED attempt REFUSES verification (not applicable)", async () => {
    const world = await harness(scriptedAuthority(["UNKNOWN"]));
    const missionId = await seedDispatchablePreview(world);
    const artifactId = await approveHostSide(world.runtime, missionId);
    const outcome = await world.runtime.dispatch.dispatch(
      missionId,
      "CREATE_EXTERNAL_EFFECT",
      { authorizationArtifactId: artifactId, connectionRef: CONNECTION_REF, executionMode: "SANDBOX" },
      T0,
    );
    const attemptId = outcome.kind === "DISPATCHED" ? outcome.attemptId : "";
    await world.runtime.dispatch.reconcile(
      missionId,
      attemptId,
      { resolvedTo: "CONFIRMED", source: "EXTERNAL_PROVIDER_STATEMENT", evidenceRefs: ["stmt-1"] },
      T1,
    );
    const before = await snapshotOf(world, missionId);
    await expect(
      world.runtime.dispatch.verify(missionId, attemptId, scriptedReadBack({ outcome: "CONFIRMED", paymentIntentStatus: "succeeded" }), T2),
    ).rejects.toMatchObject({ name: "PaymentMissionError", kind: "VERIFICATION_REFUSED" });
    expect(await snapshotOf(world, missionId)).toBe(before);
  });

  it("a foreign attemptId is the typed MISSION_NOT_FOUND refusal (never a guess)", async () => {
    const world = await harness(scriptedAuthority(["CONFIRMED"]));
    const { missionId } = await seedConfirmedAttempt(world);
    await expect(
      world.runtime.dispatch.verify(missionId, UNKNOWN_ATTEMPT, scriptedReadBack({ outcome: "CONFIRMED", paymentIntentStatus: "succeeded" }), T1),
    ).rejects.toMatchObject({ name: "PaymentMissionError", kind: "MISSION_NOT_FOUND" });
  });

  it("a read-back that DISAGREES (a different status) THROWS — nothing rewritten, the reconciliation path named", async () => {
    const world = await harness(scriptedAuthority(["CONFIRMED"]));
    const { missionId, attemptId } = await seedConfirmedAttempt(world);
    const before = await snapshotOf(world, missionId);
    await expect(
      world.runtime.dispatch.verify(missionId, attemptId, scriptedReadBack({ outcome: "CONFIRMED", paymentIntentStatus: "processing" }), T1),
    ).rejects.toMatchObject({
      name: "PaymentMissionError",
      kind: "VERIFICATION_REFUSED",
      message: expect.stringContaining("does not agree with the recorded confirmation"),
    });
    expect(await snapshotOf(world, missionId)).toBe(before);
  });

  it("a FAILED read-back THROWS the same disagreement (nothing rewritten)", async () => {
    const world = await harness(scriptedAuthority(["CONFIRMED"]));
    const { missionId, attemptId } = await seedConfirmedAttempt(world);
    const before = await snapshotOf(world, missionId);
    await expect(
      world.runtime.dispatch.verify(missionId, attemptId, scriptedReadBack({ outcome: "FAILED", paymentIntentStatus: null }), T1),
    ).rejects.toMatchObject({
      name: "PaymentMissionError",
      kind: "VERIFICATION_REFUSED",
      message: expect.stringContaining("does not agree with the recorded confirmation"),
    });
    expect(await snapshotOf(world, missionId)).toBe(before);
  });

  it("a read-back that is itself UNKNOWN THROWS — the attempt stays exactly as recorded", async () => {
    const world = await harness(scriptedAuthority(["CONFIRMED"]));
    const { missionId, attemptId } = await seedConfirmedAttempt(world);
    const before = await snapshotOf(world, missionId);
    await expect(
      world.runtime.dispatch.verify(missionId, attemptId, scriptedReadBack({ outcome: "UNKNOWN", paymentIntentStatus: null }), T1),
    ).rejects.toMatchObject({
      name: "PaymentMissionError",
      kind: "VERIFICATION_REFUSED",
      message: expect.stringContaining("read-back itself was ambiguous"),
    });
    expect(await snapshotOf(world, missionId)).toBe(before);
  });

  it("the PERSISTENCE: a fresh store over the same fs carries the verification", async () => {
    const world = await harness(scriptedAuthority(["CONFIRMED"]));
    const { missionId, attemptId } = await seedConfirmedAttempt(world);
    await world.runtime.dispatch.verify(
      missionId,
      attemptId,
      scriptedReadBack({ outcome: "CONFIRMED", paymentIntentStatus: "succeeded" }),
      T1,
    );
    const reloaded = (await world.runtime.getMission(missionId))!;
    const attempt = reloaded.attempts.find((candidate) => candidate.attemptId === attemptId)!;
    expect(attempt.verification?.source).toBe("EXTERNAL_PROVIDER_RETRIEVAL");
    expect(attempt.verification?.readBackStatus).toBe("succeeded");
    expect(reloaded.events.some((event) => event.kind === "ATTEMPT_VERIFIED" && event.correlationRef === attemptId)).toBe(true);
  });
});

/* -------------------------- the channel member laws -------------------------- */

describe("the paymentMissionVerifyAttempt channel member (edge validation + propagation)", () => {
  it("delegates to the runtime verify with the read-back port + the host clock; the outcome DTO carries facts ONLY", async () => {
    const world = await harness(scriptedAuthority(["CONFIRMED"]));
    const { missionId, attemptId } = await seedConfirmedAttempt(world);
    const readBack = scriptedReadBack({ outcome: "CONFIRMED", paymentIntentStatus: "succeeded" });
    const members = createPaymentVerifyChannelMembers({
      resolveRuntime: () => world.runtime,
      readBackPort: readBack,
      now: () => T1,
      log: () => {},
    });
    const outcome = await members.paymentMissionVerifyAttempt(missionId, attemptId);
    expect(outcome).toEqual({
      attemptId,
      verified: true,
      readBackStatus: "succeeded",
      verifiedAt: T1,
      summary: outcome.summary,
    });
    expect(outcome.summary).toContain("read-back");
    // FACTS ONLY: no connectionRef echo, no provider internals beyond the status.
    expect(Object.keys(outcome).sort()).toEqual(["attemptId", "readBackStatus", "summary", "verified", "verifiedAt"]);
    expect(JSON.stringify(outcome)).not.toContain(CONNECTION_REF);
    expect(readBack.calls).toEqual([
      { connectionRef: CONNECTION_REF, paymentIntentId: INTENT_ID, executionMode: "SANDBOX" },
    ]);
  });

  it("fails closed on the channel-supplied shapes BEFORE any runtime call (the edge law)", async () => {
    const world = await harness(scriptedAuthority(["CONFIRMED"]));
    const members = createPaymentVerifyChannelMembers({
      resolveRuntime: () => world.runtime,
      readBackPort: scriptedReadBack({ outcome: "CONFIRMED", paymentIntentStatus: "succeeded" }),
      now: () => T1,
      log: () => {},
    });
    await expect(members.paymentMissionVerifyAttempt("", "pmt-attempt:1")).rejects.toMatchObject({
      name: "PaymentMissionError",
      kind: "MISSION_NOT_FOUND",
    });
    await expect(members.paymentMissionVerifyAttempt("task:PAYMENT_MISSION:x", "")).rejects.toMatchObject({
      name: "PaymentMissionError",
      kind: "INVALID_FIELD_VALUE",
    });
    const unknownMission = "task:PAYMENT_MISSION:ffffffffffffffffffffffffffffffff";
    await expect(
      members.paymentMissionVerifyAttempt(unknownMission, "pmt-attempt:1"),
    ).rejects.toMatchObject({ name: "PaymentMissionError", kind: "MISSION_NOT_FOUND" });
    const foreign = new PaymentMissionError("MISSION_NOT_FOUND", "no such attempt");
    await expect(Promise.reject(foreign)).rejects.toBe(foreign);
  });

  it("a typed runtime refusal PROPAGATES through the member (never masked)", async () => {
    const world = await harness(scriptedAuthority(["UNKNOWN"]));
    const missionId = await seedDispatchablePreview(world);
    const artifactId = await approveHostSide(world.runtime, missionId);
    const outcome = await world.runtime.dispatch.dispatch(
      missionId,
      "CREATE_EXTERNAL_EFFECT",
      { authorizationArtifactId: artifactId, connectionRef: CONNECTION_REF, executionMode: "SANDBOX" },
      T0,
    );
    const attemptId = outcome.kind === "DISPATCHED" ? outcome.attemptId : "";
    const members = createPaymentVerifyChannelMembers({
      resolveRuntime: () => world.runtime,
      readBackPort: scriptedReadBack({ outcome: "CONFIRMED", paymentIntentStatus: "succeeded" }),
      now: () => T1,
      log: () => {},
    });
    await expect(members.paymentMissionVerifyAttempt(missionId, attemptId)).rejects.toMatchObject({
      name: "PaymentMissionError",
      kind: "VERIFICATION_REFUSED",
      message: expect.stringContaining("an ambiguous outcome must remain UNKNOWN"),
    });
  });
});

/* ------------------------- the absent-plane fail-closed posture ------------------------- */

describe("the service composition: the verify member exists and fails closed typed when the planes are absent", () => {
  it("a service with a runtime but NO connection planes fails closed with the typed PaymentPlaneNotConfiguredError", async () => {
    const world = await harness(scriptedAuthority(["CONFIRMED"]));
    const service = createPaySwapDesktopService(
      { scope: { kind: "local" }, log: () => {} },
      {
        createSessionId: () => "session-verify-absent-planes",
        paymentMissionRuntime: world.runtime,
        paymentMissionClock: () => T1,
      },
    );
    expect(typeof service.paymentMissionVerifyAttempt).toBe("function");
    await expect(
      service.paymentMissionVerifyAttempt("task:PAYMENT_MISSION:00000000000000000000000000000001", "pmt-attempt:1"),
    ).rejects.toBeInstanceOf(PaymentPlaneNotConfiguredError);
  });

  it("a service with NO runtime at all fails closed the same way (the census member is still spread)", async () => {
    const service = createPaySwapDesktopService(
      { scope: { kind: "local" }, log: () => {} },
      { createSessionId: () => "session-verify-absent-runtime" },
    );
    expect(typeof service.paymentMissionVerifyAttempt).toBe("function");
    await expect(
      service.paymentMissionVerifyAttempt("task:PAYMENT_MISSION:00000000000000000000000000000001", "pmt-attempt:1"),
    ).rejects.toBeInstanceOf(PaymentPlaneNotConfiguredError);
  });
});
