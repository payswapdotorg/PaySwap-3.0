import { describe, expect, it } from "vitest";
import {
  OPERATOR_AUTHORITY_LEVELS,
  authoritySatisfies,
  checkOperatorActionCatalog,
} from "../src/operator-actions.js";
import { OPERATOR_ACTIONS, operatorAction } from "../src/operator-catalog.js";
import { OPERATIONS_RUNBOOK_ENTRY_IDS } from "../src/runbook.js";

describe("the typed operator-action catalog (hard law 5)", () => {
  it("authority levels attenuate downward (higher may act at lower)", () => {
    expect([...OPERATOR_AUTHORITY_LEVELS]).toEqual([
      "OPERATOR",
      "SENIOR_OPERATOR",
      "SECURITY_OFFICER",
      "PROTOCOL_LEAD",
    ]);
    expect(authoritySatisfies("PROTOCOL_LEAD", "OPERATOR")).toBe(true);
    expect(authoritySatisfies("OPERATOR", "PROTOCOL_LEAD")).toBe(false);
    expect(authoritySatisfies("SENIOR_OPERATOR", "SENIOR_OPERATOR")).toBe(true);
  });

  it("the catalog passes its own check against the assembled runbook", () => {
    const report = checkOperatorActionCatalog(
      OPERATOR_ACTIONS,
      OPERATIONS_RUNBOOK_ENTRY_IDS,
    );
    expect(report.passed).toBe(true);
    expect(OPERATOR_ACTIONS.length).toBe(6);
  });

  it("every action has checkable preconditions, typed effects, evidence, rollback + version", () => {
    for (const action of OPERATOR_ACTIONS) {
      expect(action.version).toBeGreaterThanOrEqual(1);
      expect(action.preconditions.length).toBeGreaterThanOrEqual(1);
      expect(
        action.preconditions.every((p) => p.checkableBy.length >= 3),
      ).toBe(true);
      expect(action.effects.length).toBeGreaterThanOrEqual(1);
      expect(action.evidence.length).toBeGreaterThanOrEqual(1);
      expect(
        action.evidence.every((obligation) => obligation.minimum >= 1),
      ).toBe(true);
      expect(action.rollback.mode).toBeDefined();
    }
  });

  it("compensating references resolve inside the catalog", () => {
    const hold = operatorAction("hold-rollout-stage");
    const resume = operatorAction("resume-rollout");
    if (hold === undefined || resume === undefined) {
      throw new Error("hold/resume actions exist");
    }
    expect(hold.rollback.compensatingActionId).toBe("resume-rollout");
    expect(resume.rollback.compensatingActionId).toBe("hold-rollout-stage");
  });

  it("the checker fails closed on untyped magic, unbacked effects and dangling runbook refs", () => {
    const [first] = OPERATOR_ACTIONS;
    if (first === undefined) throw new Error("catalog is non-empty");

    const untyped = checkOperatorActionCatalog(
      [
        {
          ...first,
          actionId: "bad-magic",
          preconditions: [
            {
              preconditionId: "p",
              description: "operator judgement",
              checkableBy: "",
            },
          ],
        },
      ],
      OPERATIONS_RUNBOOK_ENTRY_IDS,
    );
    expect(untyped.passed).toBe(false);
    expect(untyped.violations.map((v) => v.detail)).toContain(
      "every action needs >= 1 machine-checkable precondition (no untyped magic)",
    );

    const silentEffect = checkOperatorActionCatalog(
      [
        {
          ...first,
          actionId: "bad-effect",
          effects: [
            {
              effectId: "e",
              description: "does something",
              emitsEvent: "not.in.taxonomy",
            },
          ],
        },
      ],
      OPERATIONS_RUNBOOK_ENTRY_IDS,
    );
    expect(silentEffect.passed).toBe(false);

    const dangling = checkOperatorActionCatalog(
      [{ ...first, actionId: "bad-runbook", runbookEntryId: "rb-does-not-exist" }],
      OPERATIONS_RUNBOOK_ENTRY_IDS,
    );
    expect(dangling.passed).toBe(false);
    expect(dangling.violations.map((v) => v.detail)).toContain(
      "runbook entry 'rb-does-not-exist' does not exist (dangling reference)",
    );

    const evidenceless = checkOperatorActionCatalog(
      [{ ...first, actionId: "bad-evidence", evidence: [] }],
      OPERATIONS_RUNBOOK_ENTRY_IDS,
    );
    expect(evidenceless.passed).toBe(false);

    expect(checkOperatorActionCatalog([], OPERATIONS_RUNBOOK_ENTRY_IDS).passed).toBe(
      false,
    );
  });

  it("irreversible-with-audit cannot declare a compensating action", () => {
    const execute = operatorAction("execute-rollback");
    if (execute === undefined) throw new Error("execute-rollback exists");
    expect(execute.rollback.mode).toBe("IRREVERSIBLE_WITH_AUDIT");
    expect(execute.rollback.compensatingActionId).toBeUndefined();
    const bad = checkOperatorActionCatalog(
      [
        {
          ...execute,
          actionId: "bad-irreversible",
          rollback: {
            mode: "IRREVERSIBLE_WITH_AUDIT",
            description: "x",
            compensatingActionId: "trigger-reconciliation",
          },
        },
      ],
      OPERATIONS_RUNBOOK_ENTRY_IDS,
    );
    expect(bad.passed).toBe(false);
  });
});
