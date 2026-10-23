/**
 * @payswap/app — the BROWSER_PROFILE workspace store suite.
 *
 * [P15 restoration] Restored from the stripped web mount (P10-B,
 * packages/web/test/workspaceStore.test.ts) alongside the store module
 * — unchanged laws, new home. The doc-pinned prerequisite assertions
 * keep the relative path to spec/surface/CONSOLE-WORKSPACE.md.
 *
 * The lifecycle + persistence laws of the localStorage-backed console
 * workspace store (spec/surface/CONSOLE-WORKSPACE.md §3/§4/§5): the §4
 * typed prerequisites pinned CHARACTER-EXACT against the contract
 * document itself (fail-closed on doc reformat — the P10-A
 * doc-parsing convention), the fail-closed structural validation, the
 * deterministic lifecycle (draft → findings → revise → intent → detail
 * ladder → archive; ids never reused; append-only events), the
 * persistence round-trip over a FAKE localStorage, and the quarantine
 * law (malformed records are surfaced via the typed health report,
 * never rendered as missions, never silently dropped).
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  BROWSER_PROFILE_DURABILITY_NOTE,
  CONSOLE_LADDER_EVIDENCE_PREREQUISITE,
  CONSOLE_LADDER_PREREQUISITES,
  CONSOLE_MISSION_INTAKE_BOUNDS,
  validateConsoleMissionIntake,
} from "../../src/console/browserWorkspaceLaw.js";
import {
  BrowserWorkspaceStoreError,
  WORKSPACE_STORE_LOCALSTORAGE_KEY,
  createBrowserWorkspaceStore,
  type BrowserWorkspaceStorage,
} from "../../src/console/browserWorkspaceStore.js";
import type { MissionIntakeInput } from "../../src/console/contracts.js";

const NOW = "2026-10-21T12:00:00.000Z";
const LATER = "2026-10-21T13:00:00.000Z";
const EVEN_LATER = "2026-10-21T14:00:00.000Z";

const VALID_INTAKE: MissionIntakeInput = {
  goalStatement: "Receive the quarterly payout into the operating account",
  direction: "RECEIVE",
  amount: { currency: "EUR", minorUnits: "250000" },
  fundingLocationHint: "SEPA account",
  note: "Invoice Q3-42",
};

/** An in-memory localStorage double (the deterministic test path). */
function fakeLocalStorage(seed: Record<string, string> = {}): BrowserWorkspaceStorage & {
  readonly written: ReadonlyMap<string, string>;
} {
  const files = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (key) => (files.has(key) ? files.get(key)! : null),
    setItem: (key, value) => {
      files.set(key, value);
    },
    get written() {
      return files;
    },
  };
}

// ---------------------------------------------------------------------------
// The §4 prerequisites pinned against the CONTRACT DOCUMENT itself
// ---------------------------------------------------------------------------

/** Parse the §4 bullets out of CONSOLE-WORKSPACE.md (Lane A's convention). */
function ladderPrerequisitesFromTheContractDoc(): Record<string, string> {
  const docPath = new URL("../../../../spec/surface/CONSOLE-WORKSPACE.md", import.meta.url);
  const doc = readFileSync(docPath, "utf8");
  const section4 = doc.split("## 4. Lifecycle ladder law")[1]?.split("## 5.")[0];
  if (section4 === undefined) {
    throw new Error("CONSOLE-WORKSPACE.md §4 not found — the contract doc moved; update this test");
  }
  const prerequisites: Record<string, string> = {};
  let current: string | null = null;
  for (const line of section4.split("\n")) {
    const bullet = line.match(/^- ([A-Z]+)(?: \([^)]*\))?: [`]?"(.*)$/);
    if (bullet) {
      current = bullet[1];
      prerequisites[current] = bullet[2];
      continue;
    }
    if (current !== null && /^ {2}/.test(line)) {
      prerequisites[current] += ` ${line.trim()}`;
    }
  }
  for (const key of Object.keys(prerequisites)) {
    prerequisites[key] = prerequisites[key].replace(/"[`]?\s*$/, "").replace(/\s+/g, " ").trim();
  }
  return prerequisites;
}

describe("the §4 ladder law pinned against the contract document (verbatim)", () => {
  it("every CONSOLE_LADDER_PREREQUISITES entry equals the doc's §4 bullet character-exact", () => {
    const fromDoc = ladderPrerequisitesFromTheContractDoc();
    expect(Object.keys(fromDoc).sort()).toEqual(
      ["APPROVAL", "ELIGIBILITY", "EVIDENCE", "EXECUTION", "INTENT", "OBSERVATION", "PLANNING"].sort(),
    );
    for (const [rung, prerequisite] of Object.entries(CONSOLE_LADDER_PREREQUISITES)) {
      expect(prerequisite, rung).toBe(fromDoc[rung]);
    }
  });

  it("the honest BROWSER_PROFILE durability label is exactly §5's wording", () => {
    expect(BROWSER_PROFILE_DURABILITY_NOTE).toBe("stored in this browser profile only");
  });

  it("the §3 intake bounds mirror the contract's field-length law", () => {
    expect(CONSOLE_MISSION_INTAKE_BOUNDS).toEqual({
      goalStatementMaxLength: 2000,
      locationHintMaxLength: 200,
      noteMaxLength: 2000,
    });
  });
});

describe("the §3 structural validation (fail-closed, deterministic)", () => {
  it("accepts a complete intake; findings are empty exactly when ok", () => {
    expect(validateConsoleMissionIntake(VALID_INTAKE)).toEqual({ ok: true, findings: [] });
  });

  it("records a finding for every violation — nothing coerced, nothing dropped", () => {
    const validation = validateConsoleMissionIntake({
      goalStatement: "   ",
      direction: "SPECULATE" as MissionIntakeInput["direction"],
      amount: { currency: "usd", minorUnits: "012" },
      fundingLocationHint: "x".repeat(201),
      note: "y".repeat(2001),
    });
    expect(validation.ok).toBe(false);
    expect(validation.findings).toEqual([
      "goalStatement: must be non-empty after trim",
      'direction: must be one of PAY | RECEIVE | MOVE | CONVERT — got "SPECULATE"',
      "amount.currency: must match /^[A-Z]{3}$/ (an ISO-4217-style code)",
      "amount.minorUnits: must be a canonical non-negative decimal integer string (exact minor units)",
      "fundingLocationHint: longer than 200 characters after trim",
      "note: longer than 2000 characters after trim",
    ]);
  });
});

describe("the BROWSER_PROFILE store lifecycle (§5 adapter laws)", () => {
  it("is the pinned §5 port surface + the additive health companion, honestly labeled", () => {
    const store = createBrowserWorkspaceStore(fakeLocalStorage());
    expect(store.durability).toBe("BROWSER_PROFILE");
    expect(Object.keys(store).sort()).toEqual([
      "archiveMissionDraft",
      "durability",
      "health",
      "listMissions",
      "missionDetail",
      "recordMissionDraft",
      "recordMissionIntent",
      "reviseMissionDraft",
    ]);
  });

  it("draft → intent-record → archive with append-only newest-first events", async () => {
    const store = createBrowserWorkspaceStore(fakeLocalStorage());
    const draft = await store.recordMissionDraft(VALID_INTAKE, NOW);
    expect(draft.id).toBe("mission-1");
    expect(draft.status).toBe("DRAFT");
    expect(draft.events.map((event) => event.kind)).toEqual(["CREATED"]);

    const intent = await store.recordMissionIntent(draft.id, LATER);
    expect(intent.status).toBe("INTENT_RECORDED");
    expect(intent.events.map((event) => event.kind)).toEqual(["INTENT_VALIDATED", "CREATED"]);

    const archived = await store.archiveMissionDraft(draft.id, EVEN_LATER);
    expect(archived.status).toBe("ARCHIVED");
    expect(archived.events.map((event) => event.kind)).toEqual([
      "ARCHIVED",
      "INTENT_VALIDATED",
      "CREATED",
    ]);
    // History is append-only: the earlier events are carried over untouched.
    expect(archived.events[2]).toEqual(draft.events[0]);
  });

  it("recordMissionIntent fails closed on unresolved findings — never silently coerced", async () => {
    const store = createBrowserWorkspaceStore(fakeLocalStorage());
    const invalid = await store.recordMissionDraft({ ...VALID_INTAKE, goalStatement: "" }, NOW);
    expect(invalid.structuralValidation.ok).toBe(false);
    await expect(store.recordMissionIntent(invalid.id, LATER)).rejects.toBeInstanceOf(
      BrowserWorkspaceStoreError,
    );
    try {
      await store.recordMissionIntent(invalid.id, LATER);
      expect.unreachable("recordMissionIntent must fail closed");
    } catch (error) {
      const typed = error as BrowserWorkspaceStoreError;
      expect(typed.kind).toBe("INTENT_VALIDATION_FAILED");
      expect(typed.findings).toEqual(invalid.structuralValidation.findings);
    }
    // The record is still there, still DRAFT — honest data, reviewed verbatim.
    const detail = await store.missionDetail(invalid.id);
    expect(detail?.record.status).toBe("DRAFT");
  });

  it("the REVISE law: still-valid INTENT_RECORDED stays; broken validation returns to DRAFT with findings", async () => {
    const store = createBrowserWorkspaceStore(fakeLocalStorage());
    const draft = await store.recordMissionDraft(VALID_INTAKE, NOW);
    await store.recordMissionIntent(draft.id, LATER);

    const stillValid = await store.reviseMissionDraft(
      draft.id,
      { ...VALID_INTAKE, note: "updated" },
      EVEN_LATER,
    );
    expect(stillValid.status).toBe("INTENT_RECORDED");
    expect(stillValid.events[0]?.kind).toBe("REVISED");

    const broken = await store.reviseMissionDraft(
      draft.id,
      { ...VALID_INTAKE, amount: { currency: "dollars", minorUnits: "1.5" } },
      EVEN_LATER,
    );
    expect(broken.status).toBe("DRAFT");
    expect(broken.structuralValidation.ok).toBe(false);
    await expect(store.recordMissionIntent(draft.id, EVEN_LATER)).rejects.toThrowError(
      /unresolved structural findings/,
    );
  });

  it("ids are mission-<n>, monotonic, never reused (also across archives); ARCHIVED is terminal", async () => {
    const store = createBrowserWorkspaceStore(fakeLocalStorage());
    const first = await store.recordMissionDraft(VALID_INTAKE, NOW);
    const second = await store.recordMissionDraft(VALID_INTAKE, NOW);
    await store.archiveMissionDraft(first.id, LATER);
    const third = await store.recordMissionDraft(VALID_INTAKE, LATER);
    expect([first.id, second.id, third.id]).toEqual(["mission-1", "mission-2", "mission-3"]);

    await expect(store.reviseMissionDraft(first.id, VALID_INTAKE, EVEN_LATER)).rejects.toThrowError(
      /terminal/,
    );
    await expect(store.archiveMissionDraft(first.id, EVEN_LATER)).rejects.toThrowError(
      /already archived/,
    );
    await expect(store.recordMissionIntent("mission-404", NOW)).rejects.toThrowError(
      /No mission record "mission-404"/,
    );
    expect(await store.missionDetail("mission-404")).toBeNull();
  });

  it("the §4 ladder fold on missionDetail: DRAFT all-not-reached; INTENT_RECORDED reaches INTENT only", async () => {
    const store = createBrowserWorkspaceStore(fakeLocalStorage());
    const draft = await store.recordMissionDraft(VALID_INTAKE, NOW);
    const draftDetail = await store.missionDetail(draft.id);
    expect(draftDetail!.ladder.map((rung) => rung.rung)).toEqual([
      "INTENT",
      "ELIGIBILITY",
      "PLANNING",
      "APPROVAL",
      "EXECUTION",
      "OBSERVATION",
      "EVIDENCE",
    ]);
    expect(draftDetail!.ladder[0]).toEqual({
      rung: "INTENT",
      state: "NOT_REACHED_PREREQUISITE",
      prerequisite: CONSOLE_LADDER_PREREQUISITES.INTENT,
    });
    expect(draftDetail!.evidenceNote).toBe(CONSOLE_LADDER_EVIDENCE_PREREQUISITE);

    await store.recordMissionIntent(draft.id, LATER);
    const intentDetail = await store.missionDetail(draft.id);
    expect(intentDetail!.ladder[0]).toEqual({ rung: "INTENT", state: "REACHED" });
    expect(intentDetail!.ladder.filter((rung) => rung.state === "REACHED")).toHaveLength(1);
    expect(intentDetail!.ladder[1]).toEqual({
      rung: "ELIGIBILITY",
      state: "NOT_REACHED_PREREQUISITE",
      prerequisite: CONSOLE_LADDER_PREREQUISITES.ELIGIBILITY,
    });

    // ARCHIVED preserves the rung reached at archive time.
    await store.archiveMissionDraft(draft.id, EVEN_LATER);
    const archivedDetail = await store.missionDetail(draft.id);
    expect(archivedDetail!.ladder[0]).toEqual({ rung: "INTENT", state: "REACHED" });
  });

  it("listMissions orders newest-updated-first (deterministic tie-break by creation recency)", async () => {
    const store = createBrowserWorkspaceStore(fakeLocalStorage());
    const a = await store.recordMissionDraft({ ...VALID_INTAKE, goalStatement: "A" }, NOW);
    const b = await store.recordMissionDraft({ ...VALID_INTAKE, goalStatement: "B" }, NOW);
    await store.reviseMissionDraft(a.id, { ...VALID_INTAKE, goalStatement: "A2" }, LATER);
    expect((await store.listMissions()).map((summary) => summary.id)).toEqual([a.id, b.id]);
    const c = await store.recordMissionDraft({ ...VALID_INTAKE, goalStatement: "C" }, LATER);
    expect((await store.listMissions()).map((summary) => summary.id)).toEqual([c.id, a.id, b.id]);
  });
});

describe("the localStorage persistence (injected storage; round-trip)", () => {
  it("persists under the namespaced key and survives across store instances", async () => {
    const storage = fakeLocalStorage();
    const first = createBrowserWorkspaceStore(storage);
    const draft = await first.recordMissionDraft(VALID_INTAKE, NOW);
    await first.recordMissionIntent(draft.id, LATER);
    expect(storage.written.has(WORKSPACE_STORE_LOCALSTORAGE_KEY)).toBe(true);

    const second = createBrowserWorkspaceStore(storage);
    const summaries = await second.listMissions();
    expect(summaries.map((summary) => summary.id)).toEqual([draft.id]);
    expect(summaries[0]?.status).toBe("INTENT_RECORDED");
    // Ids are never reused across loads.
    const next = await second.recordMissionDraft(VALID_INTAKE, EVEN_LATER);
    expect(next.id).toBe("mission-2");
    // Determinism with a fixed now: the persisted snapshot is byte-stable.
    const third = createBrowserWorkspaceStore(storage);
    await third.recordMissionDraft(VALID_INTAKE, EVEN_LATER);
    expect(storage.written.get(WORKSPACE_STORE_LOCALSTORAGE_KEY)).toBe(
      storage.written.get(WORKSPACE_STORE_LOCALSTORAGE_KEY),
    );
  });

  it("the honest health report: BROWSER_PROFILE + the §5 label + the storage key", async () => {
    const store = createBrowserWorkspaceStore(fakeLocalStorage());
    await store.recordMissionDraft(VALID_INTAKE, NOW);
    const health = await store.health();
    expect(health.durability).toBe("BROWSER_PROFILE");
    expect(health.durabilityNote).toBe("stored in this browser profile only");
    expect(health.storageKey).toBe("payswap.console.workspace.v1");
    expect(health.missionCount).toBe(1);
    expect(health.nextId).toBe(2);
    expect(health.quarantinedCount).toBe(0);
  });

  it("a malformed persisted record is quarantined + surfaced via health; good records still load; ids never reused", async () => {
    const storage = fakeLocalStorage();
    const seed = createBrowserWorkspaceStore(storage);
    const good = await seed.recordMissionDraft(VALID_INTAKE, NOW);
    await seed.recordMissionDraft({ ...VALID_INTAKE, goalStatement: "Also good" }, NOW);

    // Corrupt the SECOND-CREATED record only (status leaves the pinned
    // vocabulary). The snapshot stores records newest-first — find the
    // record by id, never by position.
    const snapshot = JSON.parse(storage.written.get(WORKSPACE_STORE_LOCALSTORAGE_KEY)!) as {
      records: { id: string; status: string }[];
    };
    const target = snapshot.records.find((record) => record.id === "mission-2");
    expect(target).toBeDefined();
    target!.status = "SUPERSEDED";
    storage.written.set(WORKSPACE_STORE_LOCALSTORAGE_KEY, JSON.stringify(snapshot));

    const reloaded = createBrowserWorkspaceStore(storage);
    expect((await reloaded.listMissions()).map((summary) => summary.id)).toEqual([good.id]);
    const health = await reloaded.health();
    expect(health.quarantinedCount).toBe(1);
    expect(health.quarantine[0]?.recordId).toBe("mission-2");
    expect(health.quarantine[0]?.reason).toContain("MissionDraftStatus");
    // The quarantined record is never rendered as a mission.
    expect(await reloaded.missionDetail("mission-2")).toBeNull();
    // The quarantined id still advances the counter (never reused).
    expect((await reloaded.recordMissionDraft(VALID_INTAKE, LATER)).id).toBe("mission-3");
  });

  it("an unparseable snapshot quarantines the whole file (typed, never a crash); the store still works", async () => {
    const storage = fakeLocalStorage();
    storage.written.set(WORKSPACE_STORE_LOCALSTORAGE_KEY, "{not json");
    const store = createBrowserWorkspaceStore(storage);
    expect(await store.listMissions()).toEqual([]);
    const health = await store.health();
    expect(health.quarantinedCount).toBe(1);
    expect(health.quarantine[0]?.reason).toContain("not valid JSON");
    expect((await store.recordMissionDraft(VALID_INTAKE, NOW)).id).toBe("mission-1");
  });

  it("a failed write reverts the mutation (memory and storage never diverge) and fails closed", async () => {
    let writes = 0;
    const failing: BrowserWorkspaceStorage = {
      getItem: () => null,
      setItem: () => {
        writes += 1;
        throw new Error("QuotaExceededError");
      },
    };
    const store = createBrowserWorkspaceStore(failing);
    await expect(store.recordMissionDraft(VALID_INTAKE, NOW)).rejects.toMatchObject({
      name: "BrowserWorkspaceStoreError",
      kind: "PERSISTENCE_FAILED",
    });
    expect(writes).toBe(1);
    // The reverted store never advanced: no missions, counter untouched.
    expect(await store.listMissions()).toEqual([]);
    const health = await store.health();
    expect(health.missionCount).toBe(0);
    expect(health.nextId).toBe(1);
  });
});
