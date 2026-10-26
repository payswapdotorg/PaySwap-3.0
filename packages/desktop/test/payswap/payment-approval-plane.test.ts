/**
 * PaySwap Desktop (P18-A, ADR-0011 D2/D3) — the approval-plane CHANNEL
 * battery (fixtures + the artifact/lineage scanner live in
 * ./payment-approval-plane-harness.ts, split for the ≤400-line file law).
 *
 * Composes the REAL service with the REAL payment-mission runtime over
 * an in-memory file system (the P17-A battery precedent) and drives the
 * two edge-pinned approval members end-to-end:
 *
 * - REQUEST over the PERSISTED preview: the scope echoes the preview
 *   verbatim (mission, direction, exact amount, destination summary,
 *   intent digest); typed failures for no-mission / no-preview /
 *   blocked-preview (the honest empty-environment posture);
 * - RESOLVE with the ORIGIN PINNED AT THE EDGE: the renderer supplies
 *   ONLY requestId + APPROVE|DECLINE (the compile-time signature law);
 *   a grant through the member PROVES the pin (the gate rejects every
 *   non-PREVIEW_UI_ACT origin with no effect);
 * - THE ARTIFACT NEVER CROSSES: every DTO returned by every member in
 *   the battery is deep-scanned — no artifact key, no artifact-id
 *   token, no consumed-artifact lineage (idempotency/command/
 *   correlation ids, connection refs);
 * - THE ATTEMPT-STATE PROJECTION (D3): every outcome derivable —
 *   REFUSED, FAILED, CONFIRMED, OUTCOME_UNKNOWN → RECONCILED, STARTED
 *   (the persisted write-ahead) — outcome facts only;
 * - FAIL-CLOSED: both members throw the typed
 *   PaymentPlaneNotConfiguredError when the runtime is not injected.
 *
 * A DISPATCHABLE persisted preview cannot be produced through the
 * channel (the channel's presentPreview composes the HONEST EMPTY gate
 * environment by law — INV-7 blocks), so the golden path seeds it
 * through the RUNTIME over a clearly-labeled scripted passing
 * environment (the runtime battery's own fixture) and then exercises
 * the channel members over that persisted preview. Attempt records are
 * seeded the same honest way — host-side dispatch over the REAL
 * runtime, the artifact never touching the channel.
 */

import { describe, expect, it } from "vitest";

import { createPaySwapDesktopService } from "../../src/host/payswap/shell/service.js";
import { PaymentPlaneNotConfiguredError } from "../../src/host/payswap/shell/service.js";
import { PaymentMissionError } from "../../src/host/payswap/payments/contracts.js";
import type { IPaySwapDesktopService } from "../../src/host/payswap/shell/contracts.js";
import {
  T0,
  T1,
  UNKNOWN_MISSION,
  approveHostSide,
  assertNoArtifactOrLineage,
  completeIntakeOverChannel,
  expectedScopeFor,
  harness,
  neverSettlingAuthority,
  scriptedAuthority,
  seedDispatchablePreview,
  type HostPrincipalDecision,
} from "./payment-approval-plane-harness.js";

// ---------------------------------------------------------------------------
// COMPILE-TIME LAWS: the resolve member accepts ONLY (requestId,
// decision) and the request member ONLY (missionId) — no origin and no
// principal is representable through either signature (the edge pin's
// type-level face; asserted behaviorally below).
// ---------------------------------------------------------------------------

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type ResolveTakesOnlyRequestAndDecision = Equal<
  Parameters<IPaySwapDesktopService["paymentMissionResolveApproval"]>,
  [string, "APPROVE" | "DECLINE"]
>;
type RequestTakesOnlyMissionId = Equal<
  Parameters<IPaySwapDesktopService["paymentMissionRequestApproval"]>,
  [string]
>;
const resolveTakesOnlyRequestAndDecision: ResolveTakesOnlyRequestAndDecision = true;
const requestTakesOnlyMissionId: RequestTakesOnlyMissionId = true;

describe("the approval channel: requestApproval over the persisted preview (ADR-0011 D2)", () => {
  it("mints the scoped request with the preview's scope VERBATIM (no artifact fields anywhere)", async () => {
    const world = await harness();
    const missionId = await seedDispatchablePreview(world);
    const persisted = await world.runtime.getMission(missionId);
    const request = await world.service.paymentMissionRequestApproval(missionId);
    expect(request.requestId).toMatch(/^pmt-auth-req-\d+$/);
    expect(request.previewId).toBe(persisted?.previewId);
    expect(request.missionId).toBe(missionId);
    expect(request.createdAt).toBe(T0);
    expect(request.expiresAt).toBe("2026-10-22T12:10:00Z"); // +600s (the artifact lifetime pin)
    expect(request.scope).toEqual(await expectedScopeFor(world.service, missionId));
    expect(request.scopeSummary).toContain("1500 minor units of USD");
    expect(request.scopeSummary).toContain("observed destination (Test recipient)");
    expect(request.scopeSummary).toContain("Text, voice and NLP input can never mint this approval");
    assertNoArtifactOrLineage(request);
  });

  it("fails typed on no mission, no presented preview, and a BLOCKED (non-dispatchable) preview", async () => {
    const world = await harness();
    const noMission = await world.service.paymentMissionRequestApproval(UNKNOWN_MISSION).catch((e: unknown) => e);
    expect(noMission).toBeInstanceOf(PaymentMissionError);
    expect((noMission as PaymentMissionError).kind).toBe("MISSION_NOT_FOUND");

    const missionId = await completeIntakeOverChannel(world.service);
    const noPreview = await world.service.paymentMissionRequestApproval(missionId).catch((e: unknown) => e);
    expect(noPreview).toBeInstanceOf(PaymentMissionError);
    expect((noPreview as PaymentMissionError).kind).toBe("PREVIEW_REQUIRED");
    expect((noPreview as PaymentMissionError).message).toContain("no presented preview");

    // The channel's own preview posture: the HONEST EMPTY gate
    // environment BLOCKS (INV-7 — no intent compiled, nothing
    // fabricated) — a blocked preview can never arm authorization,
    // surfaced typed, never fabricated away.
    const blocked = await world.service.paymentMissionPresentPreview(missionId);
    expect(blocked?.gates.decision).toBe("BLOCK");
    expect(blocked?.dispatchable).toBe(false);
    const blockedPreview = await world.service.paymentMissionRequestApproval(missionId).catch((e: unknown) => e);
    expect(blockedPreview).toBeInstanceOf(PaymentMissionError);
    expect((blockedPreview as PaymentMissionError).kind).toBe("GATES_BLOCKED");
    expect((blockedPreview as PaymentMissionError).message).toMatch(/compiled intent|dispatchable preview/);
  });
});

describe("the approval channel: the APPROVE golden path (the edge pin proven)", () => {
  it("request → resolve APPROVE → GRANTED echoes the scope + expiry; the timeline carries the grant; NO artifact on ANY wire", async () => {
    const world = await harness();
    const missionId = await seedDispatchablePreview(world);
    const request = await world.service.paymentMissionRequestApproval(missionId);
    const resolution = await world.service.paymentMissionResolveApproval(request.requestId, "APPROVE");

    // GRANTED-shaped: the scope echo + expiry, NEVER the artifactId.
    expect(resolution.outcome.kind).toBe("GRANTED");
    if (resolution.outcome.kind !== "GRANTED") throw new Error("unreachable");
    expect(resolution.outcome.scope).toEqual(request.scope);
    expect(resolution.outcome.expiresAt).toBe(request.expiresAt);
    expect(resolution.missionId).toBe(missionId);
    expect(resolution.previewId).toBe(request.previewId);

    // The observable truth: the timeline's AUTHORIZATION_GRANTED event,
    // with NO artifact-id lineage (the correlationRef on that host event
    // IS the artifact id — it never crosses) and the channel-edge
    // people-language summary.
    const detail = await world.service.paymentMissionDetail(missionId);
    const granted = detail?.events[0];
    expect(granted?.kind).toBe("AUTHORIZATION_GRANTED");
    expect(granted?.at).toBe(T0);
    expect(granted?.correlationRef).toBeUndefined();
    expect(granted?.summary).toContain("explicit user act");
    // The mission is ARMED, not completed — no dispatch member exists (D3).
    expect(detail?.status).toBe("ACTIVE");
    expect(detail?.attempts).toEqual([]);
    expect(detail?.attemptCount).toBe(0);

    // EVERY DTO returned by every member in this battery, deep-scanned:
    // no artifact key, no artifact-id token, no lineage.
    const board = await world.service.paymentMissionBoard();
    assertNoArtifactOrLineage([request, resolution, detail, board]);
  });

  it("the DECLINE path: DECLINED + the timeline event; requests are single-use", async () => {
    const world = await harness();
    const missionId = await seedDispatchablePreview(world);
    const request = await world.service.paymentMissionRequestApproval(missionId);
    const resolution = await world.service.paymentMissionResolveApproval(request.requestId, "DECLINE");
    expect(resolution.outcome.kind).toBe("DECLINED");
    if (resolution.outcome.kind !== "DECLINED") throw new Error("unreachable");
    expect(resolution.outcome.reason).toContain("declined");
    expect(resolution.missionId).toBe(missionId);

    const detail = await world.service.paymentMissionDetail(missionId);
    expect(detail?.events[0]?.kind).toBe("AUTHORIZATION_DECLINED");
    expect(detail?.events[0]?.summary).toContain("declined");
    expect(detail?.status).toBe("ACTIVE");
    assertNoArtifactOrLineage([request, resolution, detail]);

    // Single-use: a second decision on the resolved request fails typed.
    const again = await world.service.paymentMissionResolveApproval(request.requestId, "APPROVE").catch((e: unknown) => e);
    expect(again).toBeInstanceOf(PaymentMissionError);
    expect((again as PaymentMissionError).kind).toBe("AUTHORIZATION_REQUIRED");
    expect((again as PaymentMissionError).message).toContain("already resolved");
  });

  it("an unknown requestId fails typed (requests are minted only over a dispatchable preview)", async () => {
    const world = await harness();
    const unknown = await world.service.paymentMissionResolveApproval("pmt-auth-req-999", "APPROVE").catch((e: unknown) => e);
    expect(unknown).toBeInstanceOf(PaymentMissionError);
    expect((unknown as PaymentMissionError).kind).toBe("AUTHORIZATION_REQUIRED");
  });
});

describe("the origin-pin law (the renderer cannot supply, forge or see an origin)", () => {
  it("the members accept ONLY (missionId) / (requestId, decision) — by type structure and by arity", async () => {
    const world = await harness();
    // The compile-time laws (see the module-level Equal assertions).
    expect(requestTakesOnlyMissionId).toBe(true);
    expect(resolveTakesOnlyRequestAndDecision).toBe(true);
    // The runtime arity law: the resolve member declares exactly two
    // parameters — there is no third slot an origin could ride in on.
    expect(world.service.paymentMissionResolveApproval.length).toBe(2);
    expect(world.service.paymentMissionRequestApproval.length).toBe(1);
  });

  it("a non-PREVIEW_UI_ACT origin is REJECTED by the gate; a grant through the member PROVES the pin", async () => {
    const world = await harness();
    const missionId = await seedDispatchablePreview(world);
    // A text-origin decision (minted host-side over the SAME runtime) is
    // rejected with NO effect: no artifact, no mission event — and the
    // request stays decidable (the rejection consumes nothing).
    const request = await world.runtime.requestAuthorization(missionId, T0);
    const textOriginDecision: HostPrincipalDecision = {
      requestId: request.requestId,
      decision: "APPROVE",
      origin: "COMPOSER_TEXT",
      principalRef: "principal:test",
    };
    const textOrigin = await world.runtime.resolveAuthorization(textOriginDecision, T1);
    expect(textOrigin.outcome.kind).toBe("REJECTED");
    const afterRejection = await world.service.paymentMissionDetail(missionId);
    expect(afterRejection?.events.some((event) => event.kind === "AUTHORIZATION_GRANTED")).toBe(false);

    // The channel member takes NO origin parameter — the ONLY way its
    // call can reach a grant is the edge-pinned PREVIEW_UI_ACT.
    const resolution = await world.service.paymentMissionResolveApproval(request.requestId, "APPROVE");
    expect(resolution.outcome.kind).toBe("GRANTED");
    const detail = await world.service.paymentMissionDetail(missionId);
    expect(detail?.events[0]?.kind).toBe("AUTHORIZATION_GRANTED");
  });
});

describe("the attempt-state projection (ADR-0011 D3 — outcome facts only)", () => {
  it("REFUSED derives from the authority refusal (the honest unwired default)", async () => {
    const world = await harness(); // the unwired authority refuses NO_AUTHORITY_WIRED
    const missionId = await seedDispatchablePreview(world);
    const artifactId = await approveHostSide(world.runtime, missionId);
    const outcome = await world.runtime.dispatch.dispatch(
      missionId,
      "CREATE_EXTERNAL_EFFECT",
      { connectionRef: "conn:fake", executionMode: "SANDBOX", authorizationArtifactId: artifactId },
      T1,
    );
    expect(outcome.kind).toBe("REFUSED");
    const detail = await world.service.paymentMissionDetail(missionId);
    expect(detail?.attempts).toHaveLength(1);
    const attempt = detail?.attempts[0];
    expect(attempt?.outcome).toBe("REFUSED");
    expect(attempt?.operation).toBe("CREATE_EXTERNAL_EFFECT");
    expect(attempt?.executionMode).toBe("SANDBOX");
    expect(attempt?.startedAt).toBe(T1);
    expect(attempt?.summary).toContain("refused");
    expect(Object.keys(attempt ?? {}).sort()).toEqual(
      ["attemptId", "executionMode", "operation", "outcome", "startedAt", "summary"],
    );
    expect(detail?.attemptCount).toBe(1);
    assertNoArtifactOrLineage(detail, "conn:fake");
  });

  it("FAILED and CONFIRMED derive from the envelope outcomes (in start order)", async () => {
    const world = await harness(scriptedAuthority(["FAILED", "CONFIRMED"]));
    const missionId = await seedDispatchablePreview(world);
    const first = await world.runtime.dispatch.dispatch(
      missionId,
      "CREATE_EXTERNAL_EFFECT",
      { connectionRef: "conn:fake", executionMode: "SANDBOX", authorizationArtifactId: await approveHostSide(world.runtime, missionId) },
      T1,
    );
    expect(first.kind).toBe("DISPATCHED");
    // A definitive failure is retryable under a FRESH authorization.
    const second = await world.runtime.dispatch.dispatch(
      missionId,
      "CREATE_EXTERNAL_EFFECT",
      { connectionRef: "conn:fake", executionMode: "SANDBOX", authorizationArtifactId: await approveHostSide(world.runtime, missionId) },
      T1,
    );
    expect(second.kind).toBe("DISPATCHED");

    const detail = await world.service.paymentMissionDetail(missionId);
    expect(detail?.attempts.map((attempt) => attempt.outcome)).toEqual(["FAILED", "CONFIRMED"]);
    expect(detail?.attempts[0]?.summary).toContain("definitively failed");
    expect(detail?.attempts[1]?.summary).toContain("confirmed");
    expect(detail?.attemptCount).toBe(2);
    // The confirmed create-effect completes the mission (monotonic).
    expect(detail?.status).toBe("COMPLETED");
    assertNoArtifactOrLineage(detail, "conn:fake");
  });

  it("OUTCOME_UNKNOWN reconciles to RECONCILED (provider evidence is the only closer)", async () => {
    const world = await harness(scriptedAuthority(["UNKNOWN"]));
    const missionId = await seedDispatchablePreview(world);
    await world.runtime.dispatch.dispatch(
      missionId,
      "CREATE_EXTERNAL_EFFECT",
      { connectionRef: "conn:fake", executionMode: "SANDBOX", authorizationArtifactId: await approveHostSide(world.runtime, missionId) },
      T1,
    );
    let detail = await world.service.paymentMissionDetail(missionId);
    expect(detail?.attempts[0]?.outcome).toBe("OUTCOME_UNKNOWN");
    expect(detail?.attempts[0]?.summary).toContain("unknown");

    const attemptId = detail?.attempts[0]?.attemptId ?? "";
    await world.runtime.dispatch.reconcile(
      missionId,
      attemptId,
      { resolvedTo: "FAILED", source: "EXTERNAL_PROVIDER_STATEMENT", evidenceRefs: ["ev:fake-1"] },
      T1,
    );
    detail = await world.service.paymentMissionDetail(missionId);
    expect(detail?.attempts[0]?.outcome).toBe("RECONCILED");
    expect(detail?.attempts[0]?.summary).toContain("failed");
    assertNoArtifactOrLineage(detail, "conn:fake");
  });

  it("STARTED derives from the persisted write-ahead (the answer never recorded)", async () => {
    const world = await harness(neverSettlingAuthority());
    const missionId = await seedDispatchablePreview(world);
    const artifactId = await approveHostSide(world.runtime, missionId);
    // Fire the dispatch and never await it: phase 1 (the write-ahead)
    // persists the attempt BEFORE the authority call, and this authority
    // never answers — the honest in-flight/interrupted record.
    void world.runtime.dispatch
      .dispatch(
        missionId,
        "CREATE_EXTERNAL_EFFECT",
        { connectionRef: "conn:fake", executionMode: "SANDBOX", authorizationArtifactId: artifactId },
        T1,
      )
      .catch(() => {});
    let detail = await world.service.paymentMissionDetail(missionId);
    for (let tick = 0; tick < 200 && detail?.attempts.length === 0; tick += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      detail = await world.service.paymentMissionDetail(missionId);
    }
    expect(detail?.attempts).toHaveLength(1);
    expect(detail?.attempts[0]?.outcome).toBe("STARTED");
    expect(detail?.attempts[0]?.summary).toContain("no answer is recorded yet");
    assertNoArtifactOrLineage(detail!, "conn:fake");
  });
});

describe("the approval channel: fail-closed without a composed runtime", () => {
  it("both approval members throw the typed PaymentPlaneNotConfiguredError", async () => {
    const service = createPaySwapDesktopService(
      { scope: { kind: "local" }, log: () => {} },
      { createSessionId: () => "session-p18a-bare" },
    );
    await expect(service.paymentMissionRequestApproval(UNKNOWN_MISSION)).rejects.toBeInstanceOf(
      PaymentPlaneNotConfiguredError,
    );
    await expect(service.paymentMissionResolveApproval("pmt-auth-req-1", "APPROVE")).rejects.toBeInstanceOf(
      PaymentPlaneNotConfiguredError,
    );
    const error = await service.paymentMissionRequestApproval(UNKNOWN_MISSION).catch((caught: unknown) => caught);
    expect((error as PaymentPlaneNotConfiguredError).kind).toBe("PAYMENT_PLANE_NOT_CONFIGURED");
  });
});
