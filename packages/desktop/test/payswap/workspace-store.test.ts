/**
 * Workspace store laws (P10-B): the DESKTOP_PROFILE mission-intake store
 * — the pure WorkspaceStoreCore lifecycle (draft → findings → revise →
 * intent-record → detail ladder → archive; determinism with a fixed now;
 * id uniqueness; append-only events), the §4 ladder fold with the
 * VERBATIM prerequisites, and the JSON snapshot persistence over an
 * INJECTED file system (round-trip across two store instances via a
 * temp dir + real node:fs; malformed snapshots → quarantine + typed
 * health report while good records still load).
 */

import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createWorkspaceStoreCore,
  openPersistentWorkspaceStore,
  WorkspaceStoreError,
  WORKSPACE_STORE_NODE_FILE_SYSTEM,
} from "../../src/host/payswap/index.js";
import {
  PINNED_LADDER_PREREQUISITES,
  PINNED_LADDER_EVIDENCE_PREREQUISITE,
} from "../../src/host/payswap/index.js";
import type { PinnedMissionIntakeInput } from "../../src/host/payswap/index.js";

const NOW = "2026-10-21T12:00:00.000Z";
const LATER = "2026-10-21T13:00:00.000Z";
const EVEN_LATER = "2026-10-21T14:00:00.000Z";

const VALID_INTAKE: PinnedMissionIntakeInput = {
  goalStatement: "Pay the spring invoice from the operating account",
  direction: "PAY",
  amount: { currency: "USD", minorUnits: "125000" },
  fundingLocationHint: "operating account",
  note: "Supplier ACME-42",
};

describe("the workspace store core: intake structural validation (§3, fail-closed)", () => {
  it("accepts a complete intake; empty-iff-ok findings", () => {
    const core = createWorkspaceStoreCore();
    const record = core.recordMissionDraft(VALID_INTAKE, NOW);
    expect(record.structuralValidation).toEqual({ ok: true, findings: [] });
  });

  it("records findings for every violation — never coerced, never dropped", () => {
    const core = createWorkspaceStoreCore();
    const record = core.recordMissionDraft(
      {
        goalStatement: "   ",
        direction: "SPECULATE" as PinnedMissionIntakeInput["direction"],
        amount: { currency: "usd", minorUnits: "012" },
        fundingLocationHint: "x".repeat(201),
        payoutLocationHint: "ok",
        note: "y".repeat(2001),
      },
      NOW,
    );
    expect(record.structuralValidation.ok).toBe(false);
    expect(record.structuralValidation.findings).toEqual([
      "goalStatement: must be non-empty after trim",
      'direction: must be one of PAY | RECEIVE | MOVE | CONVERT — got "SPECULATE"',
      "amount.currency: must match /^[A-Z]{3}$/ (an ISO-4217-style code)",
      "amount.minorUnits: must be a canonical non-negative decimal integer string (exact minor units)",
      "fundingLocationHint: longer than 200 characters after trim",
      "note: longer than 2000 characters after trim",
    ]);
  });

  it("an invalid draft is still recorded (honest data, reviewed verbatim) and blocks intent", async () => {
    const core = createWorkspaceStoreCore();
    const record = core.recordMissionDraft({ ...VALID_INTAKE, goalStatement: "" }, NOW);
    expect(record.status).toBe("DRAFT");
    expect(() => core.recordMissionIntent(record.id, LATER)).toThrowError(WorkspaceStoreError);
    try {
      core.recordMissionIntent(record.id, LATER);
    } catch (error) {
      const typed = error as WorkspaceStoreError;
      expect(typed.kind).toBe("INTENT_VALIDATION_FAILED");
      expect(typed.findings).toEqual(record.structuralValidation.findings);
    }
  });
});

describe("the workspace store core: lifecycle laws (§5)", () => {
  it("draft → intent-record → archive with the pinned event vocabulary, newest-first", () => {
    const core = createWorkspaceStoreCore();
    const draft = core.recordMissionDraft(VALID_INTAKE, NOW);
    expect(draft.id).toBe("mission-1");
    expect(draft.status).toBe("DRAFT");
    expect(draft.createdAt).toBe(NOW);
    expect(draft.updatedAt).toBe(NOW);
    expect(draft.events.map((event) => event.kind)).toEqual(["CREATED"]);

    const intent = core.recordMissionIntent(draft.id, LATER);
    expect(intent.status).toBe("INTENT_RECORDED");
    expect(intent.events.map((event) => event.kind)).toEqual([
      "INTENT_VALIDATED",
      "CREATED",
    ]);
    expect(intent.events[0]?.id).toBe("mission-1-ev-2");

    const archived = core.archiveMissionDraft(draft.id, EVEN_LATER);
    expect(archived.status).toBe("ARCHIVED");
    expect(archived.events.map((event) => event.kind)).toEqual([
      "ARCHIVED",
      "INTENT_VALIDATED",
      "CREATED",
    ]);
    // History is append-only: the earlier events are carried over untouched.
    expect(archived.events[2]).toEqual(draft.events[0]);
  });

  it("id uniqueness: ids are mission-<n>, monotonic, never reused (also across archives)", () => {
    const core = createWorkspaceStoreCore();
    const first = core.recordMissionDraft(VALID_INTAKE, NOW);
    const second = core.recordMissionDraft(VALID_INTAKE, NOW);
    core.archiveMissionDraft(first.id, LATER);
    const third = core.recordMissionDraft(VALID_INTAKE, LATER);
    expect([first.id, second.id, third.id]).toEqual([
      "mission-1",
      "mission-2",
      "mission-3",
    ]);
  });

  it("typed fail-closed transitions: unknown ids, double intent, revising/archiving ARCHIVED", () => {
    const core = createWorkspaceStoreCore();
    expect(() => core.recordMissionIntent("mission-404", NOW)).toThrowError(
      /No mission record "mission-404"/,
    );

    const draft = core.recordMissionDraft(VALID_INTAKE, NOW);
    core.recordMissionIntent(draft.id, LATER);
    expect(() => core.recordMissionIntent(draft.id, EVEN_LATER)).toThrowError(
      /can only be recorded from DRAFT/,
    );

    core.archiveMissionDraft(draft.id, EVEN_LATER);
    expect(() => core.reviseMissionDraft(draft.id, VALID_INTAKE, EVEN_LATER)).toThrowError(
      /terminal/,
    );
    expect(() => core.archiveMissionDraft(draft.id, EVEN_LATER)).toThrowError(/already archived/);
  });

  it("the REVISE law: still-valid INTENT_RECORDED stays INTENT_RECORDED; broken validation returns to DRAFT with findings", () => {
    const core = createWorkspaceStoreCore();
    const draft = core.recordMissionDraft(VALID_INTAKE, NOW);
    core.recordMissionIntent(draft.id, LATER);

    const stillValid = core.reviseMissionDraft(
      draft.id,
      { ...VALID_INTAKE, note: "updated note" },
      EVEN_LATER,
    );
    expect(stillValid.status).toBe("INTENT_RECORDED");
    expect(stillValid.structuralValidation.ok).toBe(true);
    expect(stillValid.events[0]?.kind).toBe("REVISED");

    const broken = core.reviseMissionDraft(
      draft.id,
      { ...VALID_INTAKE, amount: { currency: "dollars", minorUnits: "1.5" } },
      EVEN_LATER,
    );
    expect(broken.status).toBe("DRAFT");
    expect(broken.structuralValidation.ok).toBe(false);
    expect(broken.structuralValidation.findings.length).toBe(2);
    // A returned-to-DRAFT mission needs a passing revise before intent again.
    expect(() => core.recordMissionIntent(draft.id, EVEN_LATER)).toThrowError(
      WorkspaceStoreError,
    );
  });

  it("listMissions orders newest-updated-first (deterministic tie-break by creation recency)", () => {
    const core = createWorkspaceStoreCore();
    const a = core.recordMissionDraft({ ...VALID_INTAKE, goalStatement: "A" }, NOW);
    const b = core.recordMissionDraft({ ...VALID_INTAKE, goalStatement: "B" }, NOW);
    core.reviseMissionDraft(a.id, { ...VALID_INTAKE, goalStatement: "A2" }, LATER);
    expect(core.listMissions().map((summary) => summary.id)).toEqual([a.id, b.id]);
    expect(core.listMissions().map((summary) => summary.goalStatement)).toEqual(["A2", "B"]);
    // Same updatedAt (fixed clock): the later-created mission is first.
    const c = core.recordMissionDraft({ ...VALID_INTAKE, goalStatement: "C" }, LATER);
    expect(core.listMissions().map((summary) => summary.id)).toEqual([c.id, a.id, b.id]);
  });

  it("determinism: a fixed now reproduces byte-identical records across cores", () => {
    const runOne = createWorkspaceStoreCore();
    const runTwo = createWorkspaceStoreCore();
    for (const core of [runOne, runTwo]) {
      const draft = core.recordMissionDraft(VALID_INTAKE, NOW);
      core.recordMissionIntent(draft.id, LATER);
      core.recordMissionDraft({ ...VALID_INTAKE, goalStatement: "second" }, LATER);
    }
    expect(runOne.exportState()).toEqual(runTwo.exportState());
  });
});

describe("the §4 ladder fold (typed prerequisites, verbatim)", () => {
  it("a DRAFT mission: every rung NOT_REACHED with the pinned prerequisites, in ladder order", () => {
    const core = createWorkspaceStoreCore();
    const draft = core.recordMissionDraft(VALID_INTAKE, NOW);
    const detail = core.missionDetail(draft.id);
    expect(detail).not.toBeNull();
    expect(detail!.ladder.map((rung) => rung.rung)).toEqual([
      "INTENT",
      "ELIGIBILITY",
      "PLANNING",
      "APPROVAL",
      "EXECUTION",
      "OBSERVATION",
      "EVIDENCE",
    ]);
    expect(detail!.ladder[0]).toEqual({
      rung: "INTENT",
      state: "NOT_REACHED_PREREQUISITE",
      prerequisite: PINNED_LADDER_PREREQUISITES.INTENT,
    });
    for (const rung of detail!.ladder) {
      if (rung.state === "NOT_REACHED_PREREQUISITE") {
        expect(rung.prerequisite).toBe(PINNED_LADDER_PREREQUISITES[rung.rung]);
      }
    }
    expect(detail!.evidenceNote).toBe(PINNED_LADDER_EVIDENCE_PREREQUISITE);
  });

  it("an INTENT_RECORDED mission: INTENT REACHED, everything else still honestly blocked", () => {
    const core = createWorkspaceStoreCore();
    const draft = core.recordMissionDraft(VALID_INTAKE, NOW);
    core.recordMissionIntent(draft.id, LATER);
    const detail = core.missionDetail(draft.id)!;
    expect(detail.ladder[0]).toEqual({ rung: "INTENT", state: "REACHED" });
    expect(detail.ladder.filter((rung) => rung.state === "REACHED")).toHaveLength(1);
    expect(detail.ladder[1]).toEqual({
      rung: "ELIGIBILITY",
      state: "NOT_REACHED_PREREQUISITE",
      prerequisite: PINNED_LADDER_PREREQUISITES.ELIGIBILITY,
    });
  });

  it("ARCHIVED preserves the rungs reached at archive time (a pre-intent archive keeps INTENT unreached)", () => {
    const core = createWorkspaceStoreCore();
    const withoutIntent = core.recordMissionDraft(VALID_INTAKE, NOW);
    core.archiveMissionDraft(withoutIntent.id, LATER);
    expect(core.missionDetail(withoutIntent.id)!.ladder[0]).toEqual({
      rung: "INTENT",
      state: "NOT_REACHED_PREREQUISITE",
      prerequisite: PINNED_LADDER_PREREQUISITES.INTENT,
    });

    const withIntent = core.recordMissionDraft(VALID_INTAKE, NOW);
    core.recordMissionIntent(withIntent.id, LATER);
    core.archiveMissionDraft(withIntent.id, EVEN_LATER);
    expect(core.missionDetail(withIntent.id)!.ladder[0]).toEqual({
      rung: "INTENT",
      state: "REACHED",
    });
  });

  it("missionDetail is null for unknown ids (honest absence, never a throw)", () => {
    const core = createWorkspaceStoreCore();
    expect(core.missionDetail("mission-404")).toBeNull();
  });
});

describe("the DESKTOP_PROFILE persistence (injected fs; real node:fs round-trip)", () => {
  it("survives across store instances: save after each mutation, reload from the snapshot", async () => {
    const directory = await mkdtemp(join(tmpdir(), "payswap-workspace-"));
    try {
      const first = await openPersistentWorkspaceStore({
        fileSystem: WORKSPACE_STORE_NODE_FILE_SYSTEM,
        directory,
      });
      const draft = await first.recordMissionDraft(VALID_INTAKE, NOW);
      await first.recordMissionIntent(draft.id, LATER);
      await first.recordMissionDraft(
        { ...VALID_INTAKE, goalStatement: "Second mission" },
        EVEN_LATER,
      );

      const second = await openPersistentWorkspaceStore({
        fileSystem: WORKSPACE_STORE_NODE_FILE_SYSTEM,
        directory,
      });
      const summaries = await second.listMissions();
      expect(summaries.map((summary) => summary.id)).toEqual(["mission-2", "mission-1"]);
      expect(summaries[0]?.status).toBe("DRAFT");
      expect(summaries[1]?.status).toBe("INTENT_RECORDED");
      const detail = await second.missionDetail(draft.id);
      expect(detail!.ladder[0]).toEqual({ rung: "INTENT", state: "REACHED" });
      expect(detail!.record.events.map((event) => event.kind)).toEqual([
        "INTENT_VALIDATED",
        "CREATED",
      ]);
      // Ids are never reused across loads.
      const third = await second.recordMissionDraft(VALID_INTAKE, EVEN_LATER);
      expect(third.id).toBe("mission-3");

      const health = await second.health();
      expect(health.durability).toBe("DESKTOP_PROFILE");
      expect(health.quarantinedCount).toBe(0);
      expect(health.missionCount).toBe(3);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("a malformed record is quarantined and surfaced via the typed health report; good records still load", async () => {
    const directory = await mkdtemp(join(tmpdir(), "payswap-workspace-"));
    try {
      const seed = await openPersistentWorkspaceStore({
        fileSystem: WORKSPACE_STORE_NODE_FILE_SYSTEM,
        directory,
      });
      const good = await seed.recordMissionDraft(VALID_INTAKE, NOW);
      await seed.recordMissionDraft({ ...VALID_INTAKE, goalStatement: "Also good" }, NOW);

      // Corrupt the SECOND record only (status leaves the pinned vocabulary).
      const snapshotPath = join(directory, "workspace-store.json");
      const snapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as {
        records: unknown[];
      };
      (snapshot.records[1] as { status: string }).status = "SUPERSEDED";
      await writeFile(snapshotPath, JSON.stringify(snapshot), "utf8");

      const reloaded = await openPersistentWorkspaceStore({
        fileSystem: WORKSPACE_STORE_NODE_FILE_SYSTEM,
        directory,
      });
      const summaries = await reloaded.listMissions();
      expect(summaries.map((summary) => summary.id)).toEqual([good.id]);
      const health = await reloaded.health();
      expect(health.quarantinedCount).toBe(1);
      expect(health.quarantine[0]?.recordId).toBe("mission-2");
      expect(health.quarantine[0]?.reason).toContain("MissionDraftStatus");
      expect(health.quarantine[0]?.rawExcerpt.length).toBeGreaterThan(0);
      // The quarantined record is never rendered as a mission.
      expect(await reloaded.missionDetail("mission-2")).toBeNull();
      // Ids never reused: the quarantined id still advances the counter.
      const next = await reloaded.recordMissionDraft(VALID_INTAKE, LATER);
      expect(next.id).toBe("mission-3");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("an unparseable snapshot quarantines the file itself (typed, never a crash)", async () => {
    const directory = await mkdtemp(join(tmpdir(), "payswap-workspace-"));
    try {
      await writeFile(join(directory, "workspace-store.json"), "{not json", "utf8");
      const store = await openPersistentWorkspaceStore({
        fileSystem: WORKSPACE_STORE_NODE_FILE_SYSTEM,
        directory,
      });
      expect(await store.listMissions()).toEqual([]);
      const health = await store.health();
      expect(health.quarantinedCount).toBe(1);
      expect(health.quarantine[0]?.reason).toContain("not valid JSON");
      // The store still works after the quarantine (a fresh snapshot saves).
      const draft = await store.recordMissionDraft(VALID_INTAKE, NOW);
      expect(draft.id).toBe("mission-1");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("a failed write reverts the mutation (memory and disk never diverge) and fails closed", async () => {
    const written: string[] = [];
    let writeCount = 0;
    const failing = {
      readFile: () => Promise.reject(new Error("missing")),
      writeFile: (path: string, data: string) => {
        writeCount += 1;
        if (writeCount > 1) return Promise.reject(new Error("disk full"));
        written.push(data);
        return Promise.resolve();
      },
      mkdir: () => Promise.resolve(),
    };
    const store = await openPersistentWorkspaceStore({
      fileSystem: failing,
      directory: "/tmp/irrelevant",
    });
    await expect(store.recordMissionDraft(VALID_INTAKE, NOW)).rejects.toThrowError(
      /could not persist/,
    );
    expect(await store.listMissions()).toEqual([]);
    // The reverted core also never advanced the id counter.
    await expect(store.recordMissionDraft(VALID_INTAKE, NOW)).rejects.toThrowError(
      /could not persist/,
    );
    const storeAfterReverts = await store.health();
    expect(storeAfterReverts.missionCount).toBe(0);
    expect(storeAfterReverts.nextId).toBe(1);
  });
});
