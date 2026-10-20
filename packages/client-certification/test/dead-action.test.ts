import { describe, expect, it } from "vitest";
import {
  EFFECT_KINDS,
  resolveActionLineage,
  runDeadActionAudit,
} from "../src/index.ts";
import type {
  ContractDeclaration,
  CustomerVisibleAction,
  EffectDeclaration,
} from "../src/index.ts";

/**
 * Hard law 2 — the dead-action audit: every customer-visible action is
 * backed by a machine-checkable action -> contract -> effect lineage;
 * a dead action (renders, accepts input, does nothing) or a
 * fake-success action is a certification FAILURE.
 */
function liveRegistries(): {
  actions: CustomerVisibleAction[];
  contracts: ContractDeclaration[];
  effects: EffectDeclaration[];
} {
  return {
    actions: [
      {
        actionId: "payments.submit",
        area: "payments",
        label: "Send payment",
        contractRefs: ["contract:payment.execute"],
        acceptsInput: true,
        promisesOutcome: "success",
      },
      {
        actionId: "pay.outcome",
        area: "pay",
        label: "Pay",
        contractRefs: ["contract:payment.execute"],
        acceptsInput: true,
        promisesOutcome: "acknowledgement",
      },
    ],
    contracts: [
      { contractId: "contract:payment.execute", effectRefs: ["effect:settlement.dispatch"] },
    ],
    effects: [
      {
        effectId: "effect:settlement.dispatch",
        kind: "payment-execution",
        evidenceRefs: ["evidence:settlement-1"],
      },
    ],
  };
}

describe("hard law 2: the dead-action audit", () => {
  it("a live registry passes with the full lineage table resolved", () => {
    const report = runDeadActionAudit(liveRegistries());
    expect(report.passed).toBe(true);
    expect(report.violations).toEqual([]);
    expect(report.law).toBe("dead-action-audit");
    expect(report.checked).toBe(2);
    expect(report.lineage).toHaveLength(2);
    const entry = report.lineage[0];
    expect(entry?.actionId).toBe("payments.submit");
    expect(entry?.resolvedContracts).toEqual(["contract:payment.execute"]);
    expect(entry?.resolvedEffects).toEqual(["effect:settlement.dispatch"]);
    expect(entry?.dead).toBe(false);
    expect(entry?.fakeSuccess).toBe(false);
  });

  it("a DEAD action — rendered, input-accepting, no backing contract — is a certification failure", () => {
    const report = runDeadActionAudit({
      ...liveRegistries(),
      actions: [
        {
          actionId: "accounts.export",
          area: "accounts",
          label: "Export statement",
          contractRefs: [],
          acceptsInput: true,
        },
      ],
    });
    expect(report.passed).toBe(false);
    expect(
      report.violations.some((violation) => violation.code === "unbacked_action"),
    ).toBe(true);
    expect(report.lineage[0]?.dead).toBe(true);
  });

  it("a contract that dispatches to nothing is a broken lineage (the seam that does nothing)", () => {
    const report = runDeadActionAudit({
      ...liveRegistries(),
      contracts: [{ contractId: "contract:payment.execute", effectRefs: [] }],
    });
    expect(report.passed).toBe(false);
    expect(
      report.violations.some(
        (violation) => violation.code === "contract_without_effect",
      ),
    ).toBe(true);
  });

  it("unknown contract/effect references are fail-closed lineage breaks", () => {
    const report = runDeadActionAudit({
      ...liveRegistries(),
      actions: [
        {
          actionId: "reports.download",
          area: "reports",
          label: "Download report",
          contractRefs: ["contract:does.not.exist"],
          acceptsInput: true,
        },
      ],
    });
    expect(report.passed).toBe(false);
    expect(
      report.violations.some(
        (violation) => violation.code === "unknown_contract_reference",
      ),
    ).toBe(true);

    const report2 = runDeadActionAudit({
      ...liveRegistries(),
      contracts: [
        { contractId: "contract:payment.execute", effectRefs: ["effect:ghost"] },
      ],
    });
    expect(report2.passed).toBe(false);
    expect(
      report2.violations.some(
        (violation) => violation.code === "unknown_effect_reference",
      ),
    ).toBe(true);
  });

  it("a FAKE-SUCCESS action — promises success, backed by a simulated effect — is a certification failure", () => {
    const report = runDeadActionAudit({
      ...liveRegistries(),
      effects: [
        {
          effectId: "effect:settlement.dispatch",
          kind: "payment-execution",
          evidenceRefs: ["evidence:sim-1"],
          simulated: true,
        },
      ],
    });
    expect(report.passed).toBe(false);
    expect(
      report.violations.some((violation) => violation.code === "fake_success_action"),
    ).toBe(true);
    expect(report.lineage[0]?.fakeSuccess).toBe(true);
  });

  it("an action outside the pinned area/outcome vocabularies is rejected (closed surface vocabulary)", () => {
    const report = runDeadActionAudit({
      ...liveRegistries(),
      actions: [
        {
          actionId: "misc.mystery",
          area: "mystery-zone",
          label: "Do something",
          contractRefs: ["contract:payment.execute"],
          acceptsInput: false,
        },
      ],
    });
    expect(report.passed).toBe(false);
    expect(
      report.violations.some(
        (violation) => violation.code === "action_outside_surface_vocabulary",
      ),
    ).toBe(true);
  });

  it("resolveActionLineage gives the machine-checkable single-action view; the audit is deterministic", () => {
    const entry = resolveActionLineage("payments.submit", liveRegistries());
    expect(entry?.resolvedEffects).toEqual(["effect:settlement.dispatch"]);
    expect(resolveActionLineage("no.such.action", liveRegistries())).toBeUndefined();
    const first = runDeadActionAudit(liveRegistries());
    expect(runDeadActionAudit(liveRegistries()).digest).toBe(first.digest);
    expect(EFFECT_KINDS).toEqual([
      "onchain-write",
      "payment-execution",
      "record-write",
      "provider-call",
    ]);
  });
});
