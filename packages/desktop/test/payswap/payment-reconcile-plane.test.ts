/**
 * PaySwap Desktop (P20-A, ADR-0013 D1/D2/D3) — the reconcile-plane
 * CHANNEL battery (the shared approval harness in
 * ./payment-approval-plane-harness.ts; the connection fixtures in
 * ./payment-dispatch-plane-fixtures.ts; the lane's own fixtures in
 * ./payment-reconcile-plane-fixtures.ts — the P19-A file-law splits).
 *
 * Composes the REAL service with the REAL payment-mission runtime and
 * the REAL connection session authority (in-memory fs) and drives the
 * two reconciliation members end-to-end: the pending-derivation
 * honesty (D3 — healthy/UNKNOWN/never-answered listed, refused and
 * reconciled never listed, malformed ids typed); the act-time choice
 * validation (D1 — an outside attemptId is the typed
 * INVALID_FIELD_VALUE refusal, "no reconciliation was recorded", the
 * record byte-identical; a known-but-closed attempt delegates to the
 * runtime's own honest typed refusal — the single-shot law); the edge
 * evidence validation (D2 — bad direction/source/refs typed BEFORE
 * any runtime call, order proven); the GOLDEN PATH over the labeled
 * scripted authority (an UNKNOWN dispatch → the pending card → the
 * evidence submission → RECONCILED + the mission state side effects;
 * the FAILED variant stays open); the double-reconcile typed refusal
 * (the append-only law); the scanner laws (no artifactId, no
 * connectionRef, no idempotency/command/correlation ids, the exact
 * DTO key sets, the evidence refs never echoing as structure); the
 * edge-pin law (the origin/principal constants never appear as
 * inputs); and the fail-closed PaymentPlaneNotConfiguredError paths.
 */

import { describe, expect, it } from "vitest";

import { createPaySwapDesktopService } from "../../src/host/payswap/shell/service.js";
import { PaymentPlaneNotConfiguredError } from "../../src/host/payswap/shell/service.js";
import { PaymentMissionError } from "../../src/host/payswap/payments/contracts.js";
import {
  CHANNEL_RECONCILIATION_ORIGIN,
  CHANNEL_RECONCILIATION_PRINCIPAL,
} from "../../src/host/payswap/shell/reconcile-members.js";
import {
  PAYMENT_RECONCILIATION_SOURCE_KINDS,
  type PaymentMissionReconcileEvidenceDto,
} from "../../src/host/payswap/shell/reconcile-contracts.js";
import type { IPaySwapDesktopService } from "../../src/host/payswap/shell/contracts.js";
import {
  T0,
  UNKNOWN_MISSION,
  approveHostSide,
  assertNoArtifactOrLineage,
  harness,
  neverSettlingAuthority,
  scriptedAuthority,
  seedDispatchablePreview,
} from "./payment-approval-plane-harness.js";
import {
  connectionWorld,
  seedActiveSandboxConnection,
} from "./payment-dispatch-plane-fixtures.js";
import {
  EDGE_PIN_LITERALS,
  FOREIGN_ATTEMPT_ID,
  STATEMENT_REF,
  aritySurface,
  seedUnknownAttempt,
  snapshotOf,
} from "./payment-reconcile-plane-fixtures.js";

// ---------------------------------------------------------------------------
// COMPILE-TIME LAWS: the read accepts ONLY (missionId); the act is
// EXACTLY (missionId, attemptId, evidence) — no origin, no principal
// and no artifact/lane/mode key is representable through either
// signature (the edge-pin law's type-level face; asserted behaviorally
// below).
// ---------------------------------------------------------------------------

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type ReadTakesOnlyMissionId = Equal<
  Parameters<IPaySwapDesktopService["paymentMissionPendingReconciliation"]>,
  [string]
>;
type ActTakesMissionAttemptEvidence = Equal<
  Parameters<IPaySwapDesktopService["paymentMissionReconcile"]>,
  [string, string, PaymentMissionReconcileEvidenceDto]
>;
const readTakesOnlyMissionId: ReadTakesOnlyMissionId = true;
const actTakesMissionAttemptEvidence: ActTakesMissionAttemptEvidence = true;

describe("the pending-reconciliation read (ADR-0013 D1/D3 — the derivation honesty)", () => {
  it("nothing pending on a healthy mission; the accepted-sources echo + the honest note; unknown/malformed missionId typed", async () => {
    const world = await harness();
    const missionId = await seedDispatchablePreview(world);
    const card = await world.service.paymentMissionPendingReconciliation(missionId);
    expect(card.pending).toEqual([]);
    expect(card.acceptedSources).toEqual([...PAYMENT_RECONCILIATION_SOURCE_KINDS]);
    expect(card.acceptedSources).toEqual(["EXTERNAL_PROVIDER_STATEMENT", "EXTERNAL_PROVIDER_RETRIEVAL"]);
    expect(card.note).toContain("provider evidence");
    expect(card.note).toContain("never guesses");
    expect(Object.keys(card).sort()).toEqual(["acceptedSources", "note", "pending"]);
    assertNoArtifactOrLineage(card);

    for (const malformed of [UNKNOWN_MISSION, "", "x".repeat(200)]) {
      const refusal = await world.service.paymentMissionPendingReconciliation(malformed).catch((e: unknown) => e);
      expect(refusal).toBeInstanceOf(PaymentMissionError);
      expect((refusal as PaymentMissionError).kind).toBe("MISSION_NOT_FOUND");
    }
  });

  it("a refused attempt is NEVER listed (definitively no-effect — nothing to reconcile)", async () => {
    const connections = connectionWorld();
    const world = await harness(undefined, connections.authority);
    const connectionId = await seedActiveSandboxConnection(connections.authority);
    const missionId = await seedDispatchablePreview(world);
    await approveHostSide(world.runtime, missionId);
    const outcome = await world.service.paymentMissionDispatch(missionId, connectionId);
    expect(outcome.kind).toBe("REFUSED");
    const card = await world.service.paymentMissionPendingReconciliation(missionId);
    expect(card.pending).toEqual([]);
    assertNoArtifactOrLineage(card, connectionId);
  });

  it("a never-answered (interruption-style) attempt IS listed — the write-ahead truth", async () => {
    const connections = connectionWorld();
    const world = await harness(neverSettlingAuthority(), connections.authority);
    const connectionId = await seedActiveSandboxConnection(connections.authority);
    const missionId = await seedDispatchablePreview(world);
    await approveHostSide(world.runtime, missionId);
    void world.service.paymentMissionDispatch(missionId, connectionId).catch(() => {});
    let card = await world.service.paymentMissionPendingReconciliation(missionId);
    for (let tick = 0; tick < 200 && card.pending.length === 0; tick += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      card = await world.service.paymentMissionPendingReconciliation(missionId);
    }
    expect(card.pending).toHaveLength(1);
    expect(card.pending[0]).toEqual({
      attemptId: expect.stringMatching(/^pmt-attempt:/),
      startedAt: T0,
      operation: "CREATE_EXTERNAL_EFFECT",
      executionMode: "SANDBOX",
      summary: expect.stringContaining("no answer is recorded yet"),
    });
    expect(Object.keys(card.pending[0]!).sort()).toEqual([
      "attemptId", "executionMode", "operation", "startedAt", "summary",
    ]);
    assertNoArtifactOrLineage(card, connectionId, ...EDGE_PIN_LITERALS);
  });
});

describe("the reconcile act: the act-time choice validation (ADR-0013 D1)", () => {
  it("an attemptId outside the pending set → typed INVALID_FIELD_VALUE, 'no reconciliation was recorded', the record BYTE-IDENTICAL and the attempt still reconcilable", async () => {
    const connections = connectionWorld();
    const world = await harness(scriptedAuthority(["UNKNOWN"]), connections.authority);
    const connectionId = await seedActiveSandboxConnection(connections.authority);
    const seeded = await seedUnknownAttempt(world, connectionId);

    const before = await snapshotOf(world, seeded.missionId);
    const refusal = await world.service
      .paymentMissionReconcile(seeded.missionId, FOREIGN_ATTEMPT_ID, {
        resolvedTo: "CONFIRMED",
        source: "EXTERNAL_PROVIDER_STATEMENT",
        evidenceRefs: [STATEMENT_REF],
      })
      .catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(PaymentMissionError);
    expect((refusal as PaymentMissionError).kind).toBe("INVALID_FIELD_VALUE");
    expect((refusal as PaymentMissionError).message).toContain("no reconciliation was recorded");
    expect(await snapshotOf(world, seeded.missionId)).toBe(before);

    // The strongest nothing-changed proof: the pending attempt is still
    // reconcilable after the refused act.
    const outcome = await world.service.paymentMissionReconcile(seeded.missionId, seeded.attemptId, {
      resolvedTo: "FAILED",
      source: "EXTERNAL_PROVIDER_RETRIEVAL",
      evidenceRefs: ["acct-retrieval-ref-002"],
    });
    expect(outcome.resolvedTo).toBe("FAILED");
  });

  it("a KNOWN-but-closed attempt delegates to the runtime's own honest typed refusal (the single-shot law)", async () => {
    const connections = connectionWorld();
    const world = await harness(undefined, connections.authority);
    const connectionId = await seedActiveSandboxConnection(connections.authority);
    const missionId = await seedDispatchablePreview(world);
    await approveHostSide(world.runtime, missionId);
    const refused = await world.service.paymentMissionDispatch(missionId, connectionId);
    expect(refused.kind).toBe("REFUSED");

    const before = await snapshotOf(world, missionId);
    const refusal = await world.service
      .paymentMissionReconcile(missionId, refused.attemptId, {
        resolvedTo: "CONFIRMED",
        source: "EXTERNAL_PROVIDER_STATEMENT",
        evidenceRefs: [STATEMENT_REF],
      })
      .catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(PaymentMissionError);
    expect((refusal as PaymentMissionError).kind).toBe("RECONCILIATION_NOT_PENDING");
    expect((refusal as PaymentMissionError).message).toContain("refused before any effect");
    expect(await snapshotOf(world, missionId)).toBe(before);
  });
});

describe("the reconcile act: the edge evidence validation (ADR-0013 D2 — BEFORE any runtime call)", () => {
  const badEvidenceCases: readonly [string, unknown][] = [
    ["a bad direction", { resolvedTo: "MAYBE", source: "EXTERNAL_PROVIDER_STATEMENT", evidenceRefs: [STATEMENT_REF] }],
    ["a bad source", { resolvedTo: "CONFIRMED", source: "SOMEWHERE_ELSE", evidenceRefs: [STATEMENT_REF] }],
    ["empty refs", { resolvedTo: "CONFIRMED", source: "EXTERNAL_PROVIDER_STATEMENT", evidenceRefs: [] }],
    ["an empty-string ref", { resolvedTo: "CONFIRMED", source: "EXTERNAL_PROVIDER_STATEMENT", evidenceRefs: [""] }],
    ["an over-long ref", { resolvedTo: "CONFIRMED", source: "EXTERNAL_PROVIDER_STATEMENT", evidenceRefs: ["x".repeat(513)] }],
    ["a non-string ref", { resolvedTo: "CONFIRMED", source: "EXTERNAL_PROVIDER_STATEMENT", evidenceRefs: [42] }],
    ["a missing evidence object", undefined],
  ];

  it("every bad evidence shape is the typed INVALID_FIELD_VALUE refusal, and the ORDER proof: the evidence refusal wins over an unknown mission id", async () => {
    const connections = connectionWorld();
    const world = await harness(scriptedAuthority(["UNKNOWN"]), connections.authority);
    const connectionId = await seedActiveSandboxConnection(connections.authority);
    const seeded = await seedUnknownAttempt(world, connectionId);
    const before = await snapshotOf(world, seeded.missionId);

    for (const [label, evidence] of badEvidenceCases) {
      const refusal = await world.service
        .paymentMissionReconcile(seeded.missionId, seeded.attemptId, evidence as PaymentMissionReconcileEvidenceDto)
        .catch((e: unknown) => e);
      expect(refusal, label).toBeInstanceOf(PaymentMissionError);
      expect((refusal as PaymentMissionError).kind, label).toBe("INVALID_FIELD_VALUE");
    }
    // Nothing recorded: the record is byte-identical, the attempt still
    // pending (the runtime closer was never reached).
    expect(await snapshotOf(world, seeded.missionId)).toBe(before);
    const card = await world.service.paymentMissionPendingReconciliation(seeded.missionId);
    expect(card.pending).toHaveLength(1);

    // THE ORDER PROOF: with an UNKNOWN mission id the evidence refusal
    // still wins — the mission lookup (a runtime call) never happened.
    // (The bad source is deliberately outside the typed vocabulary —
    // the RPC boundary carries no types, so the edge must refuse it;
    // cast through unknown to hand the untyped shape to the member.)
    const badSourceEvidence = {
      resolvedTo: "CONFIRMED",
      source: "SOMEWHERE_ELSE",
      evidenceRefs: [STATEMENT_REF],
    } as unknown as PaymentMissionReconcileEvidenceDto;
    const order = await world.service
      .paymentMissionReconcile(UNKNOWN_MISSION, seeded.attemptId, badSourceEvidence)
      .catch((e: unknown) => e);
    expect(order).toBeInstanceOf(PaymentMissionError);
    expect((order as PaymentMissionError).kind).toBe("INVALID_FIELD_VALUE");
    expect((order as PaymentMissionError).message).toContain("source");
  });
});

describe("the golden path over the labeled scripted authority (ADR-0013 D1 — CONFIRMED-of-a-create)", () => {
  it("UNKNOWN dispatch → the pending card lists the attempt → the evidence submission → RECONCILED, the mission COMPLETED, the detail carries the RECONCILED attempt", async () => {
    const connections = connectionWorld();
    const world = await harness(scriptedAuthority(["UNKNOWN"]), connections.authority);
    const connectionId = await seedActiveSandboxConnection(connections.authority);
    const seeded = await seedUnknownAttempt(world, connectionId);

    // THE PENDING CARD: the UNKNOWN-envelope attempt, people-language facts only.
    const card = await world.service.paymentMissionPendingReconciliation(seeded.missionId);
    expect(card.pending).toHaveLength(1);
    expect(card.pending[0]).toEqual({
      attemptId: seeded.attemptId,
      startedAt: T0,
      operation: "CREATE_EXTERNAL_EFFECT",
      executionMode: "SANDBOX",
      summary: expect.stringContaining("The outcome is unknown"),
    });
    assertNoArtifactOrLineage(card, connectionId, seeded.artifactId, STATEMENT_REF, ...EDGE_PIN_LITERALS);

    // THE ACT: the operator's evidence submission (the full input DTO
    // composes the addressing key + the evidence triple).
    const input = {
      attemptId: seeded.attemptId,
      resolvedTo: "CONFIRMED",
      source: "EXTERNAL_PROVIDER_STATEMENT",
      evidenceRefs: [STATEMENT_REF],
    } as const;
    expect(Object.keys(input).sort()).toEqual(["attemptId", "evidenceRefs", "resolvedTo", "source"]);
    const outcome = await world.service.paymentMissionReconcile(
      seeded.missionId,
      input.attemptId,
      input,
    );
    expect(outcome).toEqual({
      attemptId: seeded.attemptId,
      resolvedTo: "CONFIRMED",
      summary: expect.stringContaining("closed the unknown outcome to confirmed"),
    });
    expect(outcome.summary).toContain("Provider statement evidence");
    // The evidence refs NEVER echo as structure or prose on the outcome.
    assertNoArtifactOrLineage(outcome, connectionId, seeded.artifactId, STATEMENT_REF, ...EDGE_PIN_LITERALS);

    // CONFIRMED-of-a-create COMPLETES the mission; the detail carries
    // the RECONCILED attempt (facts only — the timeline prose carries
    // the evidence refs lawfully, the existing law).
    const detail = await world.service.paymentMissionDetail(seeded.missionId);
    expect(detail?.status).toBe("COMPLETED");
    expect(detail?.attempts[0]?.outcome).toBe("RECONCILED");
    expect(detail?.attempts[0]?.summary).toContain("closed the unknown outcome to confirmed");
    assertNoArtifactOrLineage(detail!, connectionId, seeded.artifactId, ...EDGE_PIN_LITERALS);

    // The pending card is empty again (the reconciled attempt is never listed).
    const after = await world.service.paymentMissionPendingReconciliation(seeded.missionId);
    expect(after.pending).toEqual([]);
    assertNoArtifactOrLineage(after, connectionId, STATEMENT_REF);
  });

  it("the FAILED variant: the mission stays open, the detail carries the RECONCILED-to-failed attempt", async () => {
    const connections = connectionWorld();
    const world = await harness(scriptedAuthority(["UNKNOWN"]), connections.authority);
    const connectionId = await seedActiveSandboxConnection(connections.authority);
    const seeded = await seedUnknownAttempt(world, connectionId);

    const outcome = await world.service.paymentMissionReconcile(seeded.missionId, seeded.attemptId, {
      resolvedTo: "FAILED",
      source: "EXTERNAL_PROVIDER_RETRIEVAL",
      evidenceRefs: ["acct-retrieval-ref-003"],
    });
    expect(outcome.resolvedTo).toBe("FAILED");
    expect(outcome.summary).toContain("closed the unknown outcome to failed");
    expect(outcome.summary).toContain("Provider retrieval evidence");
    assertNoArtifactOrLineage(outcome, connectionId, seeded.artifactId, "acct-retrieval-ref-003");

    const detail = await world.service.paymentMissionDetail(seeded.missionId);
    expect(detail?.status).toBe("ACTIVE"); // a definitively-failed attempt leaves the retry path open
    expect(detail?.attempts[0]?.outcome).toBe("RECONCILED");
    expect(detail?.attempts[0]?.summary).toContain("closed the unknown outcome to failed");
    const after = await world.service.paymentMissionPendingReconciliation(seeded.missionId);
    expect(after.pending).toEqual([]);
  });
});

describe("the double-reconcile typed refusal (the append-only law)", () => {
  it("a re-send against the closed attempt is the runtime's typed RECONCILIATION_NOT_PENDING with the honest reason; nothing changes", async () => {
    const connections = connectionWorld();
    const world = await harness(scriptedAuthority(["UNKNOWN"]), connections.authority);
    const connectionId = await seedActiveSandboxConnection(connections.authority);
    const seeded = await seedUnknownAttempt(world, connectionId);
    const first = await world.service.paymentMissionReconcile(seeded.missionId, seeded.attemptId, {
      resolvedTo: "CONFIRMED",
      source: "EXTERNAL_PROVIDER_STATEMENT",
      evidenceRefs: [STATEMENT_REF],
    });
    expect(first.resolvedTo).toBe("CONFIRMED");

    const before = await snapshotOf(world, seeded.missionId);
    const again = await world.service
      .paymentMissionReconcile(seeded.missionId, seeded.attemptId, {
        resolvedTo: "FAILED",
        source: "EXTERNAL_PROVIDER_RETRIEVAL",
        evidenceRefs: ["acct-retrieval-ref-004"],
      })
      .catch((e: unknown) => e);
    expect(again).toBeInstanceOf(PaymentMissionError);
    expect((again as PaymentMissionError).kind).toBe("RECONCILIATION_NOT_PENDING");
    expect((again as PaymentMissionError).message).toContain("already reconciled");
    expect((again as PaymentMissionError).message).toContain("append-only");
    expect(await snapshotOf(world, seeded.missionId)).toBe(before);

    // The detail re-read shows the RECONCILED facts (refusal-honesty,
    // never a rewrite of history).
    const detail = await world.service.paymentMissionDetail(seeded.missionId);
    expect(detail?.attempts[0]?.outcome).toBe("RECONCILED");
    expect(detail?.attempts[0]?.summary).toContain("confirmed");
    expect(detail?.status).toBe("COMPLETED");
  });
});

describe("the edge-pin law + the fail-closed paths (ADR-0013 D1)", () => {
  it("the origin/principal constants are the pinned literals, the signatures have no slot for either, and neither literal ever appears on a wire shape", async () => {
    expect(CHANNEL_RECONCILIATION_ORIGIN).toBe("OPERATOR_EVIDENCE_ACT");
    expect(CHANNEL_RECONCILIATION_PRINCIPAL).toBe("principal:operator");
    // The compile-time laws (see the module-level Equal assertions).
    expect(readTakesOnlyMissionId).toBe(true);
    expect(actTakesMissionAttemptEvidence).toBe(true);
    // The runtime arity law: no third-or-fourth slot an origin or a
    // principal could ride in on (the read declares 1 parameter, the
    // act exactly 3); the wire-shape side is the EDGE_PIN_LITERALS scans.
    expect(aritySurface.reference.length).toBe(1);
    expect(aritySurface.act.length).toBe(3);
  });

  it("both members throw the typed PaymentPlaneNotConfiguredError without a runtime", async () => {
    const service = createPaySwapDesktopService(
      { scope: { kind: "local" }, log: () => {} },
      { createSessionId: () => "session-p20a-bare" },
    );
    await expect(service.paymentMissionPendingReconciliation(UNKNOWN_MISSION)).rejects.toBeInstanceOf(
      PaymentPlaneNotConfiguredError,
    );
    await expect(
      service.paymentMissionReconcile(UNKNOWN_MISSION, FOREIGN_ATTEMPT_ID, {
        resolvedTo: "CONFIRMED",
        source: "EXTERNAL_PROVIDER_STATEMENT",
        evidenceRefs: [STATEMENT_REF],
      }),
    ).rejects.toBeInstanceOf(PaymentPlaneNotConfiguredError);
    const error = await service.paymentMissionPendingReconciliation(UNKNOWN_MISSION).catch((caught: unknown) => caught);
    expect((error as PaymentPlaneNotConfiguredError).kind).toBe("PAYMENT_PLANE_NOT_CONFIGURED");
  });
});
