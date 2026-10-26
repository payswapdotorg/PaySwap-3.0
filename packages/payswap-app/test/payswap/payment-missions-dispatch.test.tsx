// @vitest-environment jsdom
/**
 * @payswap/app — the PAYMENT-MISSIONS DISPATCH battery (P19-B, ADR-0012
 * D1/D2), machine-checked against the REAL mount + panel family over
 * the deterministic dispatch-capable fake port
 * (./payment-missions-dispatch-fixture.ts, composed over the P18 fake):
 *
 * - THE ARMED CARD RENDER: after a granted approval, the section's
 *   entry → the armed card (the scope echo: amount, destination,
 *   digest; the ABSOLUTE expiry instant — no countdown; the
 *   eligible-lane radio + the ineligible lane as a disabled row with
 *   its reason, never hidden; fieldset/legend).
 * - THE TWO-ACT + CALL-ORDER LAW: no lane chosen → the send control is
 *   DISABLED; chosen → the dispatch fires with EXACTLY
 *   (missionId, connectionRef) — and never before the armed-effect
 *   read, the approval and the lane choice.
 * - THE NOT-ARMED STATE: after a sent dispatch, the re-read armed
 *   effect renders the verbatim consumed reason + the path back; the
 *   attempt state lands on the mission record (the detail refresh).
 * - THE NO-LANE STATE: the typed-prerequisite card, never a fabricated
 *   lane (zero lanes, and the all-ineligible variant listing every
 *   disabled row with its reason).
 * - THE REFUSED OUTCOME: the summary verbatim + the return to the lane
 *   choice (the artifact was not consumed) — the re-choice sends.
 * - THE SCAN-CLEAN LAW: the outcome kinds + the flow phases are DATA —
 *   the rendered prose never contains a machine literal; aria-live on
 *   the outcome note ONLY.
 * - THE SEAM LAWS: the dispatch-unavailable note for a P18-only port;
 *   the structural guard; the barrel exports.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { PaymentMissionsMount } from "../../src/agent/PaymentMissionsMount.js";
import type { PaymentMissionsPort } from "../../src/agent/paymentMissionsPins.js";
import {
  PAYMENT_MISSIONS_ARMED_BINDING_NOTE,
  PAYMENT_MISSIONS_DISPATCH_ENTRY_NOTE,
  PAYMENT_MISSIONS_DISPATCH_TWO_ACT_NOTE,
  PAYMENT_MISSIONS_DISPATCH_UNAVAILABLE_NOTE,
  PAYMENT_MISSIONS_NOT_ARMED_PATH_BACK_NOTE,
  PAYMENT_MISSIONS_NO_LANE_NOTE,
  isPaymentMissionsDispatchPort,
} from "../../src/agent/paymentMissionsDispatchPins.js";
import { M1, M1_REQUEST_ID, M1_SCOPE_DIGEST, T5, makeFakeMissionsPort } from "./payment-missions-fixture.js";
import {
  DISPATCHED_SUMMARY,
  DISPATCH_NOT_ELIGIBLE_ERROR,
  DISPATCH_REFUSED_SUMMARY,
  LANE_LIVE_REASON,
  LANE_SANDBOX_LABEL,
  LANE_SANDBOX_REF,
  M1_ATTEMPT_ID,
  M1_REFUSAL_ATTEMPT_ID,
  NOT_ARMED_CONSUMED_REASON,
  makeFakeDispatchMissionsPort,
} from "./payment-missions-dispatch-fixture.js";
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
] as const;

afterEach(() => {
  cleanup();
});

/** The shared prefix: board → detail → preview → the two-act approval (GRANTED). */
async function approveToGranted(port: PaymentMissionsPort): Promise<HTMLElement> {
  const { container } = render(<PaymentMissionsMount port={port} />);
  const open = await screen.findByTestId(`ps-agent-missions-open-${M1}`);
  await act(async () => {
    fireEvent.click(open);
  });
  await act(async () => {
    fireEvent.click(screen.getByTestId("ps-agent-missions-present"));
  });
  await act(async () => {
    fireEvent.click(screen.getByTestId("ps-agent-missions-engage"));
  });
  await act(async () => {
    fireEvent.click(screen.getByTestId("ps-agent-missions-confirm"));
  });
  return container;
}

/** From the granted approval to the ENGAGED armed card (the entry is clicked). */
async function engageArmedCard(container: HTMLElement): Promise<void> {
  const engage = await screen.findByTestId("ps-agent-missions-engage-dispatch");
  await act(async () => {
    fireEvent.click(engage);
  });
  expect(container.querySelector("[data-testid='ps-agent-missions-armed-card']")).not.toBeNull();
}

describe("the armed card's own read + the section's gate", () => {
  it("loads the armed effect when the detail is selected — and the section stays hidden before any approval", async () => {
    const harness = makeFakeDispatchMissionsPort();
    const { container } = render(<PaymentMissionsMount port={harness.port} />);
    const open = await screen.findByTestId(`ps-agent-missions-open-${M1}`);
    await act(async () => {
      fireEvent.click(open);
    });
    expect(harness.calls).toContain(`detail:${M1}`);
    expect(harness.calls).toContain(`armedEffect:${M1}`);
    // Pre-approval the armed section is absent — the preview/approval flow is the path forward.
    expect(container.querySelector("#ps-agent-missions-section-armed")).toBeNull();
    expect(harness.dispatch).not.toHaveBeenCalled();
  });
});

describe("the armed card render (scope echo + expiry + lanes)", () => {
  it("renders the scope echo, the absolute expiry instant, the intent-digest binding and both lane variants", async () => {
    const harness = makeFakeDispatchMissionsPort();
    const container = await approveToGranted(harness.port);
    // A granted approval arms the mission — the effect re-read landed (never a stale flash).
    expect(harness.calls.filter((call) => call === `armedEffect:${M1}`).length).toBeGreaterThanOrEqual(2);
    const section = container.querySelector("#ps-agent-missions-section-armed")!;
    expect(section.textContent).toContain(PAYMENT_MISSIONS_DISPATCH_ENTRY_NOTE);
    await engageArmedCard(container);
    const card = container.querySelector("[data-testid='ps-agent-missions-armed-card']")!;
    expect(card.textContent).toContain("2500 EUR (exact minor units)");
    expect(card.textContent).toContain("the supplier's bank account ending ••33");
    expect(card.textContent).toContain(T5);
    expect(card.textContent).toContain("never outlives this instant");
    expect(card.textContent).toContain(M1_SCOPE_DIGEST);
    expect(card.textContent).toContain(PAYMENT_MISSIONS_ARMED_BINDING_NOTE);
    expect(card.textContent).toContain(PAYMENT_MISSIONS_DISPATCH_TWO_ACT_NOTE);
    // The lane group: a real fieldset/legend with radio inputs; the eligible
    // lane is choosable, the ineligible lane a disabled row with its reason.
    const fieldset = card.querySelector("fieldset")!;
    expect(fieldset.querySelector("legend")!.textContent).toContain("The execution lanes");
    const radios = fieldset.querySelectorAll("input[type='radio']");
    expect(radios).toHaveLength(2);
    const sandbox = container.querySelector(`[data-testid='ps-agent-missions-lane-${LANE_SANDBOX_REF}']`)!;
    expect((sandbox as HTMLInputElement).disabled).toBe(false);
    expect(card.textContent).toContain(LANE_SANDBOX_LABEL);
    const live = container.querySelector("[data-testid='ps-agent-missions-lane-conn:live:flw-02']")!;
    expect((live as HTMLInputElement).disabled).toBe(true);
    expect(card.textContent).toContain(LANE_LIVE_REASON);
    // The send control exists, disabled until a lane is chosen.
    const send = screen.getByTestId("ps-agent-missions-send") as HTMLButtonElement;
    expect(send.disabled).toBe(true);
  });
});

describe("the two-act + call-order law (no dispatch without the armed card + the lane choice)", () => {
  it("keeps the send disabled until a lane is chosen, then fires dispatch with EXACTLY (missionId, connectionRef)", async () => {
    const harness = makeFakeDispatchMissionsPort();
    const container = await approveToGranted(harness.port);
    await engageArmedCard(container);
    // No lane chosen: the send stays disabled and no dispatch call can happen.
    expect((screen.getByTestId("ps-agent-missions-send") as HTMLButtonElement).disabled).toBe(true);
    expect(harness.dispatch).not.toHaveBeenCalled();
    // The two-act approval fired exactly (requestId, "APPROVE") on the way here.
    expect(harness.resolveApproval).toHaveBeenCalledTimes(1);
    expect(harness.resolveApproval).toHaveBeenCalledWith(M1_REQUEST_ID, "APPROVE");
    // The lane choice unlocks the send.
    await act(async () => {
      fireEvent.click(screen.getByTestId(`ps-agent-missions-lane-${LANE_SANDBOX_REF}`));
    });
    expect((screen.getByTestId("ps-agent-missions-send") as HTMLButtonElement).disabled).toBe(false);
    expect(harness.dispatch).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByTestId("ps-agent-missions-send"));
    });
    expect(harness.dispatch).toHaveBeenCalledTimes(1);
    expect(harness.dispatch).toHaveBeenCalledWith(M1, LANE_SANDBOX_REF);
    // The call-ORDER law: the armed-effect read (at detail-select) precedes the
    // approval; the dispatch follows the approval and the lane choice.
    const firstArmedAt = harness.calls.indexOf(`armedEffect:${M1}`);
    const requestAt = harness.calls.indexOf(`requestApproval:${M1}`);
    const dispatchAt = harness.calls.indexOf(`dispatch:${M1}:${LANE_SANDBOX_REF}`);
    expect(firstArmedAt).toBeGreaterThan(-1);
    expect(requestAt).toBeGreaterThan(firstArmedAt);
    expect(dispatchAt).toBeGreaterThan(requestAt);
  });
});

describe("the honest outcome states", () => {
  it("NOT-ARMED after a sent dispatch: the verbatim consumed reason + the path back; the attempt state lands on the detail", async () => {
    const harness = makeFakeDispatchMissionsPort();
    const container = await approveToGranted(harness.port);
    await engageArmedCard(container);
    await act(async () => {
      fireEvent.click(screen.getByTestId(`ps-agent-missions-lane-${LANE_SANDBOX_REF}`));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("ps-agent-missions-send"));
    });
    // The sent outcome note: the label map + the summary verbatim + the attempt-state truth.
    expect(container.textContent).toContain("The payment was sent");
    expect(container.textContent).toContain(DISPATCHED_SUMMARY);
    expect(container.textContent).toContain("the attempt state lands on the mission record");
    // The attempt state landed on the mission record (the detail refresh).
    const attempts = container.querySelector("#ps-agent-missions-section-attempts")!;
    expect(attempts.textContent).toContain(M1_ATTEMPT_ID);
    expect(attempts.textContent).toContain("create an external effect");
    expect(attempts.textContent).toContain("confirmed");
    expect(attempts.textContent).toContain("The sandbox lane confirmed the payment effect.");
    // The re-read armed effect: not armed — the consumed reason VERBATIM + the path back.
    const notArmed = await screen.findByTestId("ps-agent-missions-not-armed");
    expect(notArmed.textContent).toContain(NOT_ARMED_CONSUMED_REASON);
    expect(notArmed.textContent).toContain(PAYMENT_MISSIONS_NOT_ARMED_PATH_BACK_NOTE);
    // aria-live on the outcome note ONLY (the a11y law).
    const section = container.querySelector("#ps-agent-missions-section-armed")!;
    expect(section.querySelectorAll("[role='status'], [aria-live]")).toHaveLength(1);
  });

  it("REFUSED: the summary verbatim, the attempt state lands, and the artifact is consumed — the not-armed card + the path back render", async () => {
    const harness = makeFakeDispatchMissionsPort({ refuseFirstSend: true });
    const container = await approveToGranted(harness.port);
    await engageArmedCard(container);
    await act(async () => {
      fireEvent.click(screen.getByTestId(`ps-agent-missions-lane-${LANE_SANDBOX_REF}`));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("ps-agent-missions-send"));
    });
    expect(container.textContent).toContain("The dispatch was refused");
    expect(container.textContent).toContain(DISPATCH_REFUSED_SUMMARY);
    expect(container.textContent).toContain("never masked");
    // The refusal landed as an attempt state on the mission record (the detail refresh).
    const attempts = container.querySelector("#ps-agent-missions-section-attempts")!;
    expect(attempts.textContent).toContain(M1_REFUSAL_ATTEMPT_ID);
    expect(attempts.textContent).toContain("refused before any effect");
    // The artifact was consumed: the armed truth re-read renders the not-armed
    // card with the verbatim consumed reason + the path back — never a re-choice.
    const notArmed = await screen.findByTestId("ps-agent-missions-not-armed");
    expect(notArmed.textContent).toContain(NOT_ARMED_CONSUMED_REASON);
    expect(notArmed.textContent).toContain(PAYMENT_MISSIONS_NOT_ARMED_PATH_BACK_NOTE);
    expect(container.querySelector("[data-testid='ps-agent-missions-armed-card']")).toBeNull();
    expect(container.querySelector("[data-ps-missions-act='SEND_PAYMENT']")).toBeNull();
    expect(harness.dispatch).toHaveBeenCalledTimes(1);
  });

  it("a THROWN act-time failure surfaces honestly and returns to the chosen lane — the re-choice sends", async () => {
    const harness = makeFakeDispatchMissionsPort({ throwOnFirstSend: true });
    const container = await approveToGranted(harness.port);
    await engageArmedCard(container);
    await act(async () => {
      fireEvent.click(screen.getByTestId(`ps-agent-missions-lane-${LANE_SANDBOX_REF}`));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("ps-agent-missions-send"));
    });
    // The typed failure is surfaced on the honest flow-error line — never masked.
    expect(container.textContent).toContain("The last action was refused");
    expect(container.textContent).toContain(DISPATCH_NOT_ELIGIBLE_ERROR);
    // No attempt was recorded and the artifact stays live: the armed card
    // stands, the chosen lane survives, and the send control re-engages.
    expect(container.querySelector("#ps-agent-missions-section-attempts")).toBeNull();
    const send = screen.getByTestId("ps-agent-missions-send") as HTMLButtonElement;
    expect(send.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(screen.getByTestId("ps-agent-missions-send"));
    });
    expect(harness.dispatch).toHaveBeenCalledTimes(2);
    expect(harness.dispatch).toHaveBeenLastCalledWith(M1, LANE_SANDBOX_REF);
    expect(container.textContent).toContain(DISPATCHED_SUMMARY);
  });

  it("NO-LANE (zero lanes): the typed-prerequisite card — never a fabricated lane, no controls to send", async () => {
    const harness = makeFakeDispatchMissionsPort({ lanes: "no-lanes" });
    const container = await approveToGranted(harness.port);
    const section = container.querySelector("#ps-agent-missions-section-armed")!;
    expect(section.textContent).toContain(PAYMENT_MISSIONS_NO_LANE_NOTE);
    expect(section.textContent).toContain("connect a payment capability first");
    expect(section.querySelector("input[type='radio']")).toBeNull();
    expect(section.querySelector("[data-ps-missions-act='ENGAGE_DISPATCH']")).toBeNull();
    expect(section.querySelector("[data-ps-missions-act='SEND_PAYMENT']")).toBeNull();
    expect(harness.dispatch).not.toHaveBeenCalled();
  });

  it("NO-LANE (all lanes ineligible): every lane stays visible as a disabled row with its reason", async () => {
    const harness = makeFakeDispatchMissionsPort({ lanes: "live-only" });
    const container = await approveToGranted(harness.port);
    const section = container.querySelector("#ps-agent-missions-section-armed")!;
    expect(section.textContent).toContain(PAYMENT_MISSIONS_NO_LANE_NOTE);
    expect(section.textContent).toContain(LANE_LIVE_REASON);
    expect(section.querySelector("input[type='radio']")).toBeNull();
    expect(harness.dispatch).not.toHaveBeenCalled();
  });
});

describe("the scan-clean law (the outcome kinds + phases are DATA, never prose)", () => {
  it("the full dispatch journey's DOM never contains a machine literal", async () => {
    const harness = makeFakeDispatchMissionsPort({ throwOnFirstSend: true });
    const container = await approveToGranted(harness.port);
    await engageArmedCard(container);
    await act(async () => {
      fireEvent.click(screen.getByTestId(`ps-agent-missions-lane-${LANE_SANDBOX_REF}`));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("ps-agent-missions-send"));
    });
    // The FIRST send throws (the typed act-time refusal) — the honest
    // typed-failure line renders NOW, mid-journey (the second send
    // clears it on its way to success, per the flow's onFlowError(null)).
    expect(container.textContent ?? "").toContain("The last action was refused");
    await act(async () => {
      fireEvent.click(screen.getByTestId("ps-agent-missions-send"));
    });
    const prose = container.textContent ?? "";
    for (const literal of MACHINE_LITERALS) {
      expect(prose).not.toContain(literal);
    }
    // The people-language facts DID render (the scan is meaningful, not
    // vacuous): the sent note (the outcome) and the consumed not-armed
    // truth with its path back. (The typed-failure line was asserted
    // mid-journey above — success clears it honestly.)
    expect(prose).toContain("The payment was sent");
    expect(prose).toContain("the attempt state lands on the mission record");
    expect(prose).toContain("A fresh preview and a fresh explicit approval are required");
  });
});

describe("the seam laws (the dispatch-unavailable truth + the guard + the barrel)", () => {
  it("a P18-only port renders the honest dispatch-unavailable note on the armed section — never an error, no send controls", async () => {
    const harness = makeFakeMissionsPort();
    const container = await approveToGranted(harness.port);
    expect(await screen.findByText(PAYMENT_MISSIONS_DISPATCH_UNAVAILABLE_NOTE)).toBeDefined();
    const section = container.querySelector("#ps-agent-missions-section-armed")!;
    expect(section.querySelector("button")).toBeNull();
    expect(section.querySelector("[role='alert']")).toBeNull();
    expect(harness.resolveApproval).toHaveBeenCalledTimes(1);
  });

  it("the structural guard: a P18-only port is NOT dispatch-capable; the dispatch fake is", () => {
    expect(isPaymentMissionsDispatchPort(makeFakeMissionsPort().port)).toBe(false);
    expect(isPaymentMissionsDispatchPort(makeFakeDispatchMissionsPort().port)).toBe(true);
    expect(appBarrel.isPaymentMissionsDispatchPort(makeFakeMissionsPort().port)).toBe(false);
  });

  it("the barrel law: the dispatch surface is exported from the package barrel (src/index.ts)", () => {
    expect(typeof appBarrel.PaymentMissionsArmedCard).toBe("function");
    expect(appBarrel.PAYMENT_MISSIONS_DISPATCH_PHASES).toContain("LANE_CHOSEN");
    expect(appBarrel.PAYMENT_MISSIONS_DISPATCH_OUTCOME_KINDS).toContain("REPLAYED");
    expect(appBarrel.PAYMENT_MISSIONS_DISPATCH_OUTCOME_LABELS.DISPATCHED).toBe("The payment was sent");
    expect(appBarrel.PAYMENT_MISSIONS_DISPATCH_OUTCOME_LABELS.REFUSED).toBe("The dispatch was refused");
    // The typed composition surface compiles through the same barrel.
    const outcome: appBarrel.PaymentMissionsDispatchOutcome = {
      kind: "REPLAYED",
      attemptId: "attempt:x:1",
      summary: "replayed honestly",
    };
    expect(outcome.kind).toBe("REPLAYED");
    const lane: appBarrel.PaymentMissionsExecLane = {
      connectionRef: "conn:sandbox:x",
      label: "A lane",
      providerId: "stripe",
      ineligible: { reason: "not eligible here" },
    };
    expect(lane.ineligible?.reason).toBe("not eligible here");
  });
});
