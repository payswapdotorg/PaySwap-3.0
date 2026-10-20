import { describe, expect, it } from "vitest";
import {
  OPERATIONS_RUNBOOK,
  OPERATIONS_RUNBOOK_ENTRY_IDS,
  buildOperationsRunbook,
  checkRunbookIntegrity,
  entriesForOperatorAction,
  runbookEntry,
} from "../src/runbook.js";
import { ALERT_RULES } from "../src/alerting.js";
import { OPERATOR_ACTIONS } from "../src/operator-catalog.js";

describe("the assembled runbook (hard law 5 — no orphan alerts)", () => {
  it("the assembled runbook passes its own integrity check", () => {
    const report = checkRunbookIntegrity();
    expect(report.passed).toBe(true);
    expect(report.entryCount).toBe(9);
    expect(report.orphanAlerts).toEqual([]);
    expect(report.danglingActionReferences).toEqual([]);
    expect(report.emptySignals).toEqual([]);
    expect(report.incompleteEntries).toEqual([]);
  });

  it("every alert routes to an existing entry (no orphan alerts)", () => {
    const ids = new Set(OPERATIONS_RUNBOOK_ENTRY_IDS);
    for (const alert of ALERT_RULES) {
      expect(ids.has(alert.runbookEntryId)).toBe(true);
    }
  });

  it("every entry is complete: symptom -> diagnosis -> action -> verification", () => {
    for (const entry of OPERATIONS_RUNBOOK) {
      expect(entry.symptom.length).toBeGreaterThan(10);
      expect(entry.diagnosis.length).toBeGreaterThanOrEqual(2);
      expect(entry.action.length).toBeGreaterThanOrEqual(2);
      expect(entry.verification.length).toBeGreaterThanOrEqual(1);
      expect(entry.signals.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("alert signals are attached to their entries at assembly", () => {
    const rollbackEntry = runbookEntry("rb-rollback-execution");
    if (rollbackEntry === undefined) throw new Error("entry exists");
    expect(rollbackEntry.signals).toContain("alert:rollback-executed");
    const holdEntry = runbookEntry("rb-rollout-hold");
    if (holdEntry === undefined) throw new Error("entry exists");
    expect(holdEntry.signals).toContain("alert:rollout-stage-held");
  });

  it("operator actions resolve to their documenting entries", () => {
    const execute = OPERATOR_ACTIONS.find(
      (action) => action.actionId === "execute-rollback",
    );
    if (execute === undefined) throw new Error("action exists");
    const entries = entriesForOperatorAction(execute);
    expect(entries.map((entry) => entry.entryId)).toEqual([
      "rb-rollback-execution",
    ]);
  });

  it("assembly is deterministic and duplicate-free", () => {
    const again = buildOperationsRunbook();
    expect(again.map((entry) => entry.entryId)).toEqual(
      OPERATIONS_RUNBOOK.map((entry) => entry.entryId),
    );
    expect(new Set(OPERATIONS_RUNBOOK_ENTRY_IDS).size).toBe(
      OPERATIONS_RUNBOOK.length,
    );
  });

  it("integrity check fails closed on orphans, dangling refs and silent entries", () => {
    const orphanAlerts = checkRunbookIntegrity({
      alerts: [
        ...ALERT_RULES,
        {
          alertId: "orphan-alert",
          title: "Orphan",
          condition: "x",
          events: ["outbox.backlog-growing"],
          severity: "ticket",
          routes: [],
          runbookEntryId: "rb-does-not-exist",
        },
      ],
    });
    expect(orphanAlerts.passed).toBe(false);
    expect(orphanAlerts.orphanAlerts).toEqual(["orphan-alert"]);

    const silent = checkRunbookIntegrity({
      entries: [
        ...OPERATIONS_RUNBOOK,
        {
          entryId: "rb-silent",
          title: "Silent",
          symptom: "s",
          diagnosis: ["d"],
          action: ["a"],
          verification: ["v"],
          operatorActionIds: [],
          signals: [],
          source: "OPERATIONS_ENTRY",
        },
      ],
    });
    expect(silent.passed).toBe(false);
    expect(silent.emptySignals).toEqual(["rb-silent"]);

    const incomplete = checkRunbookIntegrity({
      entries: [
        ...OPERATIONS_RUNBOOK,
        {
          entryId: "rb-incomplete",
          title: "Incomplete",
          symptom: "s",
          diagnosis: [],
          action: [],
          verification: [],
          operatorActionIds: [],
          signals: ["outbox.backlog-growing"],
          source: "OPERATIONS_ENTRY",
        },
      ],
    });
    expect(incomplete.passed).toBe(false);
    expect(incomplete.incompleteEntries).toEqual(["rb-incomplete"]);

    const dangling = checkRunbookIntegrity({
      entries: OPERATIONS_RUNBOOK.map((entry) =>
        entry.entryId === "rb-outbox-backlog"
          ? { ...entry, operatorActionIds: ["no-such-action"] }
          : entry,
      ),
    });
    expect(dangling.passed).toBe(false);
    expect(dangling.danglingActionReferences).toContain(
      "rb-outbox-backlog -> no-such-action",
    );
  });
});
