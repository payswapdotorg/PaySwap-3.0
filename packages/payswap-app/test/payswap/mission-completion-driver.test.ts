/**
 * @payswap/app — the PRODUCT TASK-COMPLETION PROJECTION battery, part 2:
 * the DRIVER + the LINK RESOLUTION (P21-D Gap B; failing-first).
 *
 * Machine-checked over the REAL browser task-session adapter (the
 * composer's ONE port — never a second adapter) + the scripted link
 * lookups (./mission-completion-fixture.ts):
 *
 * - (a) the driver projects EXACTLY ONCE with the exact arguments —
 *   status, event kind, the INJECTED now (never ambient), the VERBATIM
 *   summary, correlationRef = missionId;
 * - (b) IDEMPOTENCE: a second observation of the same completed mission
 *   is a no-op — check-first, never a second event (the real adapter's
 *   monotonic-terminal law would throw; it is never tripped), including
 *   through a FRESH projection over the same persisted store (the
 *   reload path);
 * - (c)/(d)/(e)/(f) through the driver: the honest no-projection paths
 *   never touch the mutation member;
 * - the link resolution: the composer session's live mission-intake
 *   link (primary) → the persisted correlation scan (fallback — the
 *   task whose events carry correlationRef = missionId); an ambiguous
 *   live link resolves to null, never a guess.
 */

import { describe, expect, it } from "vitest";

import {
  createMissionCompletionProjection,
  createMissionTaskLinkLookup,
  createPersistedMissionTaskLinkLookup,
} from "../../src/agent/missionCompletionProjection.js";
import {
  MISSION_ID,
  T1,
  T4,
  fakeStorage,
  missionDetail,
  recordedSession,
  seedLinkedTask,
} from "./mission-completion-fixture.js";

/** The standard driver over a recorded session (persisted-scan lookup + the fixed clock). */
function standardDriver(harness: ReturnType<typeof recordedSession>) {
  return createMissionCompletionProjection({
    session: harness.session,
    resolveLinkedTask: createPersistedMissionTaskLinkLookup(harness.session),
    clock: () => T4,
  });
}

describe("the driver (createMissionCompletionProjection) over the REAL session adapter", () => {
  it("(a) projects EXACTLY ONCE with the exact arguments — status, event kind, injected now, verbatim summary, correlationRef = missionId", async () => {
    const harness = recordedSession(fakeStorage());
    const taskId = await seedLinkedTask(harness.session);
    const outcome = await standardDriver(harness).observeDetail(missionDetail({}));
    expect(outcome).toEqual({ kind: "PROJECTED", taskId, missionId: MISSION_ID });
    expect(harness.updateCalls).toHaveLength(1);
    expect(harness.updateCalls[0]).toEqual({
      id: taskId,
      toStatus: "COMPLETED",
      eventKind: "ATTEMPT_CONFIRMED",
      now: T4,
      summary:
        "The mission's dispatch attempt confirmed through the execution authority — the task completes with the mission.",
      correlationRef: MISSION_ID,
    });
    // The task record itself: COMPLETED with exactly ONE ATTEMPT_CONFIRMED
    // event carrying the mission correlation.
    const record = await harness.session.taskDetail(taskId);
    expect(record?.status).toBe("COMPLETED");
    const confirmed = record?.events.filter((event) => event.kind === "ATTEMPT_CONFIRMED") ?? [];
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]?.correlationRef).toBe(MISSION_ID);
    expect(confirmed[0]?.at).toBe(T4);
  });

  it("(b) IDEMPOTENT: a second observation of the same completed mission is a NO_PROJECTION — never a second event, never a thrown terminal-escape", async () => {
    const harness = recordedSession(fakeStorage());
    await seedLinkedTask(harness.session);
    const projection = standardDriver(harness);
    await projection.observeDetail(missionDetail({}));
    const second = await projection.observeDetail(missionDetail({}));
    expect(second).toEqual({ kind: "NO_PROJECTION", reason: "TASK_ALREADY_TERMINAL" });
    expect(harness.updateCalls).toHaveLength(1);
  });

  it("(b) the same no-op through a FRESH projection instance (the reload path — the persisted record is the guard)", async () => {
    const storage = fakeStorage();
    const first = recordedSession(storage);
    await seedLinkedTask(first.session);
    await standardDriver(first).observeDetail(missionDetail({}));
    // A fresh projection over the SAME persisted store (a reloaded
    // composition): the task is already terminal — a no-op, not a throw.
    const second = recordedSession(storage);
    const outcome = await standardDriver(second).observeDetail(missionDetail({}));
    expect(outcome).toEqual({ kind: "NO_PROJECTION", reason: "TASK_ALREADY_TERMINAL" });
    expect(second.updateCalls).toHaveLength(0);
  });

  it("(c) a mission that is not COMPLETED never calls the session port's mutation member", async () => {
    const harness = recordedSession(fakeStorage());
    await seedLinkedTask(harness.session);
    const outcome = await standardDriver(harness).observeDetail(missionDetail({ status: "ACTIVE" }));
    expect(outcome).toEqual({ kind: "NO_PROJECTION", reason: "MISSION_NOT_COMPLETED" });
    expect(harness.updateCalls).toHaveLength(0);
  });

  it("(d) a COMPLETED mission without a CONFIRMED attempt never calls the mutation member", async () => {
    const harness = recordedSession(fakeStorage());
    await seedLinkedTask(harness.session);
    const outcome = await standardDriver(harness).observeDetail(
      missionDetail({ attemptOutcomes: ["OUTCOME_UNKNOWN"] }),
    );
    expect(outcome).toEqual({ kind: "NO_PROJECTION", reason: "NO_CONFIRMED_ATTEMPT" });
    expect(harness.updateCalls).toHaveLength(0);
  });

  it("(e) a linked task already terminal is a no-op — never a thrown terminal-escape", async () => {
    const harness = recordedSession(fakeStorage());
    await seedLinkedTask(harness.session, { terminal: "FAILED" });
    // The seed's own terminal transition is recorded; the projection must
    // add NOTHING on top of it.
    const callsAfterSeed = harness.updateCalls.length;
    expect(callsAfterSeed).toBeGreaterThan(0);
    const outcome = await standardDriver(harness).observeDetail(missionDetail({}));
    expect(outcome).toEqual({ kind: "NO_PROJECTION", reason: "TASK_ALREADY_TERMINAL" });
    expect(harness.updateCalls).toHaveLength(callsAfterSeed);
  });

  it("(f) no linked task anywhere → the honest no-op, never a guessed task", async () => {
    const harness = recordedSession(fakeStorage());
    // A task exists but carries NO mission correlation — never a guess.
    await seedLinkedTask(harness.raw);
    const unlinked = { ...missionDetail({}), id: "task:PAYMENT_MISSION:zzzz" };
    const outcome = await standardDriver(harness).observeDetail(unlinked);
    expect(outcome).toEqual({ kind: "NO_PROJECTION", reason: "NO_LINKED_TASK" });
    expect(harness.updateCalls).toHaveLength(0);
  });
});

describe("the mission↔task link resolution", () => {
  it("the persisted correlation scan finds the task whose events carry correlationRef = missionId (the mission-intake binding's own writes)", async () => {
    const harness = recordedSession(fakeStorage());
    const taskId = await seedLinkedTask(harness.session);
    const lookup = createPersistedMissionTaskLinkLookup(harness.session);
    expect((await lookup(MISSION_ID))?.id).toBe(taskId);
    expect(await lookup("task:PAYMENT_MISSION:unlinked")).toBeNull();
  });

  it("the primary live link (the composer session's mission-intake state) wins; a live link naming ANOTHER mission falls back to the persisted scan", async () => {
    const harness = recordedSession(fakeStorage());
    const taskId = await seedLinkedTask(harness.session);
    const lookup = createMissionTaskLinkLookup({
      session: harness.session,
      liveLink: () => ({ missionId: MISSION_ID, taskId }),
    });
    expect((await lookup(MISSION_ID))?.id).toBe(taskId);
    // The live link points elsewhere → the persisted scan still resolves.
    const other = createMissionTaskLinkLookup({
      session: harness.session,
      liveLink: () => ({ missionId: "task:PAYMENT_MISSION:other", taskId: "task:PAYMENT_MISSION:99" }),
    });
    expect((await other(MISSION_ID))?.id).toBe(taskId);
  });

  it("a live link whose task no longer exists falls back to the persisted scan (never a dead reference)", async () => {
    const harness = recordedSession(fakeStorage());
    const taskId = await seedLinkedTask(harness.session);
    const lookup = createMissionTaskLinkLookup({
      session: harness.session,
      liveLink: () => ({ missionId: MISSION_ID, taskId: "task:PAYMENT_MISSION:gone" }),
    });
    expect((await lookup(MISSION_ID))?.id).toBe(taskId);
  });

  it("an AMBIGUOUS persisted link (several non-terminal tasks carrying the same mission correlation) resolves to null — never a guessed task", async () => {
    const harness = recordedSession(fakeStorage());
    // Two live tasks both carrying the mission correlation.
    await seedLinkedTask(harness.session);
    const secondSeed = await harness.session.seedOrResume({
      intent: { kind: "PAYMENT_MISSION", direction: "RECEIVE", goalStatement: "receive from the buyer" },
      origin: "COMPOSER_TEXT",
      now: T1,
      originNote: "receive from the buyer",
    });
    await harness.session.appendTaskEvent(
      secondSeed.task.id, "MISSING_FIELD_ASKED", T1, "Mission intake asked (amountAndCurrency)", MISSION_ID,
    );
    const lookup = createPersistedMissionTaskLinkLookup(harness.session);
    expect(await lookup(MISSION_ID)).toBeNull();
  });

  it("when every candidate is terminal, the scan returns the first — the decision no-ops with the honest TASK_ALREADY_TERMINAL reason", async () => {
    const harness = recordedSession(fakeStorage());
    await seedLinkedTask(harness.session, { terminal: "CANCELLED" });
    const lookup = createPersistedMissionTaskLinkLookup(harness.session);
    expect((await lookup(MISSION_ID))?.status).toBe("CANCELLED");
  });
});
