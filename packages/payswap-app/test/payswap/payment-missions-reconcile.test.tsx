// @vitest-environment jsdom
/**
 * @payswap/app — the PAYMENT-MISSIONS RECONCILE battery (P20-B, ADR-0013
 * D1/D2), machine-checked against the REAL mount + panel family over
 * the deterministic reconciliation-capable fake port
 * (./payment-missions-reconcile-fixture.ts, composed over the P18 fake):
 *
 * - THE PENDING CARD: loaded when the detail is selected; NOTHING-PENDING
 *   renders the designed empty card (the host's own honest note — for
 *   when an unknown appears; never a dead control).
 * - THE TWO-ACT + CALL-ORDER LAW: the engage control renders only over
 *   pending attempts; the confirm stays DISABLED until a direction + a
 *   source + a non-empty trimmed reference all exist; the submit fires
 *   reconcile with EXACTLY (missionId, attemptId, {resolvedTo, source,
 *   evidenceRefs}) — the entered facts, refs trimmed — and never before
 *   the pending read and the evidence entry.
 * - THE GOLDEN PATH: the outcome note announces the reconciled direction
 *   in people language; the pending card re-reads (the empty card shows)
 *   and the reconciliation facts land on the mission record (the detail
 *   refresh: the reconciled attempt state, the completed mission on a
 *   confirmed create).
 * - THE TYPED-FAILURE RETURN: a thrown typed failure returns to the
 *   entry with every fact intact + the honest error prose; the
 *   corrected re-submit fires.
 * - THE NEVER-GUESS BRANCH: a read listing two pending attempts requires
 *   the explicit attempt choice (the confirm stays locked without it).
 * - THE SCAN-CLEAN LAW: the directions, the source kinds and the flow
 *   phases are DATA — the rendered prose never contains a machine
 *   literal; aria-live on the outcome note ONLY.
 * - THE SEAM LAWS: the reconciliation-unavailable note for a port
 *   without the members (gated by the mission's unresolved-looking
 *   attempts); the structural guard; the barrel exports.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { PaymentMissionsMount } from "../../src/agent/PaymentMissionsMount.js";
import type { PaymentMissionsPort } from "../../src/agent/paymentMissionsPins.js";
import {
  PAYMENT_MISSIONS_RECONCILIATION_UNAVAILABLE_NOTE,
  isPaymentMissionsReconciliationPort,
} from "../../src/agent/paymentMissionsReconcilePins.js";
import { M1, M2, makeFakeMissionsPort } from "./payment-missions-fixture.js";
import {
  M2_ATTEMPT_ID,
  M2_ATTEMPT_ID_2,
  PENDING_NOTE,
  RECONCILED_CONFIRMED_SUMMARY,
  TYPED_SUBMIT_FAILURE,
  makeFakeReconcileMissionsPort,
} from "./payment-missions-reconcile-fixture.js";
import * as appBarrel from "../../src/index.js";

/** The authority-surface machine literals that must NEVER reach the rendered prose. */
const MACHINE_LITERALS = [
  "AUTHORIZATION_GRANTED", "AUTHORIZATION_DECLINED", "PLAN_SELECTION_RECORDED",
  "PREVIEW_PRESENTED", "FIELD_CAPTURED", "MISSING_FIELD_ASKED", "VALIDATED",
  "ATTEMPT_STARTED", "ATTEMPT_CONFIRMED", "ATTEMPT_FAILED", "OUTCOME_UNKNOWN",
  "RECONCILED", "OPPORTUNITY_MATCHED", "WAIT_STARTED", "WAIT_CRITERIA_RECORDED",
  "WAIT_EXPIRED", "EXTERNAL_RETURN_VALIDATED", "EXTERNAL_RETURN_REJECTED",
  "CREATED", "RESUMED", "CANCELLED", "EXPIRED",
  // The P19 dispatch vocabulary (the outcome kinds + the flow phases) — DATA only.
  "DISPATCHED", "REPLAYED", "REFUSED", "ARMED_CARD", "LANE_CHOSEN",
  "DISPATCHING", "RESOLVED", "IDLE",
  // The P20 reconciliation vocabulary (the directions, the sources, the
  // flow phases) — DATA only, rendered through the frozen label maps.
  "CONFIRMED", "FAILED", "EXTERNAL_PROVIDER_STATEMENT", "EXTERNAL_PROVIDER_RETRIEVAL",
  "PENDING_CARD", "EVIDENCE_ENTRY", "SUBMITTING",
] as const;

afterEach(() => {
  cleanup();
});

/** Open a mission detail over the given port (the board → detail step). */
async function openDetail(port: PaymentMissionsPort, missionId: string): Promise<HTMLElement> {
  const { container } = render(<PaymentMissionsMount port={port} />);
  const open = await screen.findByTestId(`ps-agent-missions-open-${missionId}`);
  await act(async () => {
    fireEvent.click(open);
  });
  return container;
}

/** Engage the reconcile control over a loaded pending card (act one). */
async function engageEntry(container: HTMLElement): Promise<void> {
  const engage = await screen.findByTestId("ps-agent-missions-engage-reconcile");
  await act(async () => {
    fireEvent.click(engage);
  });
  expect(container.querySelector("[data-testid='ps-agent-missions-reconcile-entry']")).not.toBeNull();
}

/** Fill the evidence entry: the direction, the source and the references. */
async function fillEvidence(refs: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByTestId("ps-agent-missions-reconcile-direction-CONFIRMED"));
  });
  await act(async () => {
    fireEvent.click(screen.getByTestId("ps-agent-missions-reconcile-source-EXTERNAL_PROVIDER_STATEMENT"));
  });
  await act(async () => {
    fireEvent.change(screen.getByTestId("ps-agent-missions-reconcile-refs"), {
      target: { value: refs },
    });
  });
}

describe("the pending card's own read + the nothing-pending designed state", () => {
  it("loads the pending card when the detail is selected; nothing pending renders the honest empty card — never a dead control", async () => {
    const harness = makeFakeReconcileMissionsPort();
    const container = await openDetail(harness.port, M1);
    expect(harness.calls).toContain(`detail:${M1}`);
    expect(harness.calls).toContain(`pendingReconciliation:${M1}`);
    const empty = await screen.findByTestId("ps-agent-missions-reconcile-empty");
    expect(empty.textContent).toContain("Nothing pending reconciliation on this mission.");
    expect(empty.textContent).toContain(PENDING_NOTE);
    const section = container.querySelector("#ps-agent-missions-section-reconcile")!;
    expect(section.querySelector("button")).toBeNull();
    expect(harness.reconcile).not.toHaveBeenCalled();
  });
});

describe("the golden path (the two-act evidence entry)", () => {
  it("engage → the entry → the evidence → the submit fires reconcile with EXACTLY the entered facts → the outcome note + the re-read", async () => {
    const harness = makeFakeReconcileMissionsPort();
    const container = await openDetail(harness.port, M2);
    // The pending card lists the attempt facts (never envelope internals).
    const pending = await screen.findByTestId("ps-agent-missions-reconcile-pending");
    expect(pending.textContent).toContain(M2_ATTEMPT_ID);
    expect(pending.textContent).toContain("create an external effect");
    expect(pending.textContent).toContain("sandbox mode");
    expect(pending.textContent).toContain("reconciliation evidence will close it");
    await engageEntry(container);
    // The entered evidence: direction + source + references (trimmed).
    await fillEvidence("  pay-ref-001 \n pay-ref-002 \n\n   ");
    await act(async () => {
      fireEvent.click(screen.getByTestId("ps-agent-missions-reconcile-submit"));
    });
    expect(harness.reconcile).toHaveBeenCalledTimes(1);
    expect(harness.reconcile).toHaveBeenCalledWith(M2, M2_ATTEMPT_ID, {
      resolvedTo: "CONFIRMED",
      source: "EXTERNAL_PROVIDER_STATEMENT",
      evidenceRefs: ["pay-ref-001", "pay-ref-002"],
    });
    // The outcome note — the ONLY aria-live region — announces the
    // reconciled direction in people language with the summary verbatim.
    expect(container.textContent).toContain("Reconciled: confirmed — the effect stands, as the provider evidence records it");
    expect(container.textContent).toContain(RECONCILED_CONFIRMED_SUMMARY);
    expect(container.textContent).toContain("the reconciliation facts land on the mission record");
    const section = container.querySelector("#ps-agent-missions-section-reconcile")!;
    expect(section.querySelectorAll("[role='status'], [aria-live]")).toHaveLength(1);
    // The flow re-reads the pending card: nothing pending any more.
    expect(harness.pendingReconciliation.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(await screen.findByTestId("ps-agent-missions-reconcile-empty")).toBeDefined();
    // The reconciliation facts land on the mission record (the detail refresh):
    // the reconciled attempt state + the completed mission (a confirmed create).
    const attempts = container.querySelector("#ps-agent-missions-section-attempts")!;
    expect(attempts.textContent).toContain("reconciled");
    expect(attempts.textContent).toContain("Provider evidence closed the unknown outcome to confirmed");
    expect(container.textContent).toContain("Reconciliation recorded — provider evidence closed the unknown outcome.");
  });

  it("the pending card's own read precedes the act (the call-order ledger)", async () => {
    const harness = makeFakeReconcileMissionsPort();
    const container = await openDetail(harness.port, M2);
    // No engage yet: the act NEVER fires without the pending card + the
    // evidence entry (the two-act proof).
    expect(harness.reconcile).not.toHaveBeenCalled();
    await engageEntry(container);
    expect(harness.reconcile).not.toHaveBeenCalled();
    await fillEvidence("ref-a\nref-b");
    await act(async () => {
      fireEvent.click(screen.getByTestId("ps-agent-missions-reconcile-submit"));
    });
    const readAt = harness.calls.indexOf(`pendingReconciliation:${M2}`);
    const actAt = harness.calls.indexOf(`reconcile:${M2}:${M2_ATTEMPT_ID}`);
    expect(readAt).toBeGreaterThan(-1);
    expect(actAt).toBeGreaterThan(readAt);
  });
});

describe("the disabled-until-valid law (never a guess)", () => {
  it("the confirm stays disabled until a direction + a source + a non-empty trimmed reference all exist — a click on the locked control never fires", async () => {
    const harness = makeFakeReconcileMissionsPort();
    const container = await openDetail(harness.port, M2);
    await engageEntry(container);
    const submit = () => screen.getByTestId("ps-agent-missions-reconcile-submit") as HTMLButtonElement;
    // Nothing chosen: locked — and a click attempt fires nothing.
    expect(submit().disabled).toBe(true);
    await act(async () => {
      fireEvent.click(submit());
    });
    expect(harness.reconcile).not.toHaveBeenCalled();
    // A direction alone is not enough.
    await act(async () => {
      fireEvent.click(screen.getByTestId("ps-agent-missions-reconcile-direction-CONFIRMED"));
    });
    expect(submit().disabled).toBe(true);
    await act(async () => {
      fireEvent.click(submit());
    });
    expect(harness.reconcile).not.toHaveBeenCalled();
    // A direction + a source, but only whitespace references: still locked.
    await act(async () => {
      fireEvent.click(screen.getByTestId("ps-agent-missions-reconcile-source-EXTERNAL_PROVIDER_RETRIEVAL"));
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId("ps-agent-missions-reconcile-refs"), {
        target: { value: "   \n \n\t" },
      });
    });
    expect(submit().disabled).toBe(true);
    await act(async () => {
      fireEvent.click(submit());
    });
    expect(harness.reconcile).not.toHaveBeenCalled();
    // One real, trimmed reference unlocks the confirm.
    await act(async () => {
      fireEvent.change(screen.getByTestId("ps-agent-missions-reconcile-refs"), {
        target: { value: "  pay-ref-001  " },
      });
    });
    expect(submit().disabled).toBe(false);
  });
});

describe("the typed-failure return (the entry survives with the facts intact)", () => {
  it("a thrown typed failure returns to the entry state, surfaces the honest error prose, and the corrected re-submit fires", async () => {
    const harness = makeFakeReconcileMissionsPort({ throwOnFirstSubmit: true });
    const container = await openDetail(harness.port, M2);
    await engageEntry(container);
    await fillEvidence("ref-one\nref-two");
    await act(async () => {
      fireEvent.click(screen.getByTestId("ps-agent-missions-reconcile-submit"));
    });
    // The typed failure is surfaced on the honest flow-error line — never masked.
    expect(container.textContent).toContain("The last action was refused");
    expect(container.textContent).toContain(TYPED_SUBMIT_FAILURE);
    // The entry state is PRESERVED with every fact intact: the direction
    // and the source stay chosen, the references stay typed.
    expect(
      (screen.getByTestId("ps-agent-missions-reconcile-direction-CONFIRMED") as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByTestId("ps-agent-missions-reconcile-source-EXTERNAL_PROVIDER_STATEMENT") as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect((screen.getByTestId("ps-agent-missions-reconcile-refs") as HTMLTextAreaElement).value).toBe(
      "ref-one\nref-two",
    );
    const submit = screen.getByTestId("ps-agent-missions-reconcile-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    // The corrected re-submit fires with the SAME entered facts.
    await act(async () => {
      fireEvent.click(submit);
    });
    expect(harness.reconcile).toHaveBeenCalledTimes(2);
    expect(harness.reconcile).toHaveBeenLastCalledWith(M2, M2_ATTEMPT_ID, {
      resolvedTo: "CONFIRMED",
      source: "EXTERNAL_PROVIDER_STATEMENT",
      evidenceRefs: ["ref-one", "ref-two"],
    });
    expect(container.textContent).toContain("Reconciled: confirmed");
  });
});

describe("the never-guess branch (a read listing several pending attempts)", () => {
  it("requires the explicit attempt choice — the confirm stays locked until the operator picks, then fires over the CHOSEN attempt", async () => {
    const harness = makeFakeReconcileMissionsPort({ pending: "two" });
    const container = await openDetail(harness.port, M2);
    const pending = await screen.findByTestId("ps-agent-missions-reconcile-pending");
    expect(pending.textContent).toContain(M2_ATTEMPT_ID);
    expect(pending.textContent).toContain(M2_ATTEMPT_ID_2);
    expect(pending.textContent).toContain("no answer is recorded yet");
    await engageEntry(container);
    // The attempt radio renders (the wire shape is a list); the confirm
    // stays locked even with a direction, a source and a reference.
    await fillEvidence("ref-single");
    const submit = screen.getByTestId("ps-agent-missions-reconcile-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByTestId(`ps-agent-missions-reconcile-attempt-${M2_ATTEMPT_ID_2}`));
    });
    expect(submit.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(submit);
    });
    // The CHOSEN attempt — never a guess, never the first by default.
    expect(harness.reconcile).toHaveBeenCalledTimes(1);
    expect(harness.reconcile).toHaveBeenCalledWith(M2, M2_ATTEMPT_ID_2, {
      resolvedTo: "CONFIRMED",
      source: "EXTERNAL_PROVIDER_STATEMENT",
      evidenceRefs: ["ref-single"],
    });
  });
});

describe("the scan-clean law (the directions, sources and phases are DATA, never prose)", () => {
  it("the full reconcile journey's DOM never contains a machine literal", async () => {
    const harness = makeFakeReconcileMissionsPort({ throwOnFirstSubmit: true });
    const container = await openDetail(harness.port, M2);
    await engageEntry(container);
    await fillEvidence("ref-one\nref-two");
    await act(async () => {
      fireEvent.click(screen.getByTestId("ps-agent-missions-reconcile-submit"));
    });
    // The FIRST submit throws the typed failure — the honest typed-
    // failure line renders NOW, mid-journey (the second submit clears
    // it on its way to success, per the flow's onFlowError(null)).
    expect(container.textContent ?? "").toContain("The last action was refused");
    await act(async () => {
      fireEvent.click(screen.getByTestId("ps-agent-missions-reconcile-submit"));
    });
    const prose = container.textContent ?? "";
    for (const literal of MACHINE_LITERALS) {
      expect(prose).not.toContain(literal);
    }
    // The people-language facts DID render (the scan is meaningful, not
    // vacuous): the reconciled note, the attempt facts, the designed
    // empty card after the re-read.
    expect(prose).toContain("Reconciled: confirmed — the effect stands, as the provider evidence records it");
    expect(prose).toContain("Nothing pending reconciliation on this mission.");
    expect(prose).toContain("a provider statement");
  });
});

describe("the seam laws (the unavailable truth + the guard + the barrel)", () => {
  it("a port without the members renders the honest unavailable note when the mission shows unresolved-looking attempts — never an error, no controls", async () => {
    const harness = makeFakeMissionsPort();
    const container = await openDetail(harness.port, M2);
    expect(await screen.findByText(PAYMENT_MISSIONS_RECONCILIATION_UNAVAILABLE_NOTE)).toBeDefined();
    const section = container.querySelector("#ps-agent-missions-section-reconcile")!;
    expect(section.querySelector("button")).toBeNull();
    expect(section.querySelector("[role='alert']")).toBeNull();
    // A mission with nothing unresolved keeps the section absent (the
    // gate — the unavailable note is not noise on healthy missions).
    const back = screen.getByTestId("ps-agent-missions-back");
    await act(async () => {
      fireEvent.click(back);
    });
    const open = await screen.findByTestId(`ps-agent-missions-open-${M1}`);
    await act(async () => {
      fireEvent.click(open);
    });
    await screen.findByText(/a1b2c3d4 · created/);
    expect(container.querySelector("#ps-agent-missions-section-reconcile")).toBeNull();
  });

  it("the structural guard: a port WITHOUT the reconcile members fails isPaymentMissionsReconciliationPort; the reconcile fake passes", () => {
    expect(isPaymentMissionsReconciliationPort(makeFakeMissionsPort().port)).toBe(false);
    expect(isPaymentMissionsReconciliationPort(makeFakeReconcileMissionsPort().port)).toBe(true);
    expect(appBarrel.isPaymentMissionsReconciliationPort(makeFakeMissionsPort().port)).toBe(false);
    // EACH member is required — a port carrying only one of the two fails.
    const readOnly = {
      ...makeFakeMissionsPort().port,
      pendingReconciliation: async () => ({ pending: [], acceptedSources: [], note: "" }),
    } as unknown as PaymentMissionsPort;
    expect(isPaymentMissionsReconciliationPort(readOnly)).toBe(false);
    const actOnly = {
      ...makeFakeMissionsPort().port,
      reconcile: async () => ({ attemptId: "attempt:x:1", resolvedTo: "CONFIRMED", summary: "" }),
    } as unknown as PaymentMissionsPort;
    expect(isPaymentMissionsReconciliationPort(actOnly)).toBe(false);
  });

  it("the barrel law: the reconciliation surface is exported from the package barrel (src/index.ts)", () => {
    expect(typeof appBarrel.PaymentMissionsReconcileCard).toBe("function");
    expect(appBarrel.PAYMENT_MISSIONS_RECONCILE_PHASES).toContain("EVIDENCE_ENTRY");
    expect(appBarrel.PAYMENT_MISSIONS_RECONCILIATION_SOURCES).toContain("EXTERNAL_PROVIDER_RETRIEVAL");
    expect(appBarrel.PAYMENT_MISSIONS_RECONCILIATION_DIRECTION_LABELS.CONFIRMED).toBe(
      "confirmed — the effect stands, as the provider evidence records it",
    );
    expect(appBarrel.PAYMENT_MISSIONS_RECONCILIATION_SOURCE_LABELS.EXTERNAL_PROVIDER_STATEMENT).toBe(
      "a provider statement",
    );
    // The typed composition surface compiles through the same barrel.
    const evidence: appBarrel.PaymentMissionsReconcileEvidence = {
      resolvedTo: "FAILED",
      source: "EXTERNAL_PROVIDER_RETRIEVAL",
      evidenceRefs: ["pay-ref-009"],
    };
    expect(evidence.evidenceRefs[0]).toBe("pay-ref-009");
    const pending: appBarrel.PaymentMissionsPendingReconciliation = {
      pending: [],
      acceptedSources: ["EXTERNAL_PROVIDER_STATEMENT"],
      note: "the honest note",
    };
    expect(pending.pending).toHaveLength(0);
  });
});
