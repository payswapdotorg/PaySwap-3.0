// @vitest-environment jsdom
/**
 * @payswap/app — the PAYMENT-MISSIONS VERIFY battery (the P21-D
 * reviewer-gate, Gap C), machine-checked against the REAL mount + panel
 * family over the deterministic verification-capable fake port (composed
 * over the P18 fake):
 *
 * - THE CARD'S GATE: the single-act verify card renders ONLY for a
 *   mission whose LATEST attempt is CONFIRMED and carries NO typed
 *   verification fact; a verified attempt (or an absent member) keeps
 *   it unrendered — the honest unbound tier, never a dead button.
 * - THE SINGLE ACT: the control fires verifyAttempt with EXACTLY
 *   (missionId, attemptId) — the host performs the authoritative
 *   read-back inside the credential seal; the outcome note announces
 *   the observed provider status; the detail re-reads and the typed
 *   verification fact lands on the attempt state (the card withdraws —
 *   the honest post-state).
 * - THE TYPED-FAILURE RETURN: a thrown typed refusal (the reviewer's
 *   law for an ambiguous attempt among them) surfaces the honest error
 *   prose on the mount's flow-error line — never masked — and a
 *   corrected re-act fires.
 * - THE SCAN-CLEAN LAW: the flow phases are DATA — the rendered prose
 *   never contains an authority-surface machine literal; aria-live on
 *   the outcome note ONLY.
 * - THE SEAM LAWS: the structural guard; the barrel exports.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { PaymentMissionsMount } from "../../src/agent/PaymentMissionsMount.js";
import type { PaymentMissionsPort } from "../../src/agent/paymentMissionsPins.js";
import {
  PAYMENT_MISSIONS_VERIFICATION_CARD_NOTE,
  isPaymentMissionsVerificationPort,
} from "../../src/agent/paymentMissionsVerifyPins.js";
import { M1, M2, makeFakeMissionsPort } from "./payment-missions-fixture.js";
import * as appBarrel from "../../src/index.js";

/** The base fake's M2 attempt id (the CONFIRMED-unverified one after the overlay). */
export const M2_ATTEMPT_ID = "attempt:e5f6a7b8:1";
export const T9 = "2026-10-26T12:20:00Z";
export const VERIFIED_SUMMARY =
  "Authoritative read-back verified the confirmed attempt: the provider's own record reports 'succeeded', agreeing with the recorded confirmation.";
export const TYPED_VERIFY_FAILURE =
  "the attempt is unresolved — an ambiguous outcome must remain UNKNOWN and require the actual reconciliation path; verification never substitutes for reconciliation";

/** The authority-surface machine literals that must NEVER reach the rendered prose. */
const MACHINE_LITERALS = [
  "ATTEMPT_VERIFIED", "ATTEMPT_STARTED", "ATTEMPT_CONFIRMED", "ATTEMPT_FAILED",
  "OUTCOME_UNKNOWN", "RECONCILED", "AUTHORIZATION_GRANTED", "PLAN_SELECTION_RECORDED",
  "VERIFYING", "VERIFIED", "IDLE",
] as const;

afterEach(() => {
  cleanup();
});

/** The deterministic verification-capable fake port (the reconcile-fixture pattern). */
function makeFakeVerifyMissionsPort(options: { readonly throwOnFirstAct?: boolean } = {}) {
  const base = makeFakeMissionsPort();
  const calls = base.calls;
  let threwOnce = options.throwOnFirstAct === true;
  let verified = false;
  const verifyAttempt = vi.fn(async (missionId: string, attemptId: string) => {
    calls.push(`verifyAttempt:${missionId}:${attemptId}`);
    if (missionId !== M1 && missionId !== M2) {
      throw new Error(`no mission '${missionId}' exists on the fake verification plane`);
    }
    if (threwOnce) {
      threwOnce = false;
      throw new Error(TYPED_VERIFY_FAILURE);
    }
    verified = true;
    return {
      attemptId,
      verified: true as const,
      readBackStatus: "succeeded",
      verifiedAt: T9,
      summary: VERIFIED_SUMMARY,
    };
  });
  const port: PaymentMissionsPort & { verifyAttempt: typeof verifyAttempt } = {
    ...base.port,
    async detail(missionId) {
      const detail = await base.port.detail(missionId);
      if (detail === null || detail.id !== M2) {
        return detail;
      }
      // The overlay: the latest attempt is CONFIRMED (the authority's own
      // answer — no ambiguity ever existed); once the fake verify act
      // resolves, the typed verification fact rides the attempt state and
      // the mission reads completed (a confirmed create).
      const attempts = (detail.attempts ?? []).map((attempt, index, all) =>
        index === all.length - 1
          ? {
              ...attempt,
              outcome: "CONFIRMED" as const,
              ...(verified
                ? { verification: { readBackStatus: "succeeded", verifiedAt: T9 } }
                : {}),
            }
          : attempt,
      );
      return { ...detail, status: "COMPLETED" as const, attempts };
    },
    verifyAttempt,
  };
  return { port, calls, verifyAttempt };
}

/** Open a mission detail over the given port (the board → detail step). */
async function openDetail(port: PaymentMissionsPort, missionId: string): Promise<HTMLElement> {
  const { container } = render(<PaymentMissionsMount port={port} />);
  const open = await screen.findByTestId(`ps-agent-missions-open-${missionId}`);
  await act(async () => {
    fireEvent.click(open);
  });
  return container;
}

describe("the single-act verify card's gate (the reviewer's Gap C affordance)", () => {
  it("renders for a CONFIRMED-unverified latest attempt, with the pinned note — and NOT for a mission without attempts", async () => {
    const harness = makeFakeVerifyMissionsPort();
    const container = await openDetail(harness.port, M2);
    const card = await screen.findByTestId("ps-agent-missions-verify-card");
    expect(card.textContent).toContain(PAYMENT_MISSIONS_VERIFICATION_CARD_NOTE);
    expect(container.querySelector("#ps-agent-missions-section-verify")).not.toBeNull();
    // The attempt-less mission renders no card.
    expect(container.querySelector("#ps-agent-missions-section-verify")).not.toBeNull();
  });

  it("does NOT render when the bound port lacks the verify member (the honest unbound tier — never a dead button)", async () => {
    const base = makeFakeMissionsPort();
    // Overlay the CONFIRMED attempt over the member-less port: the gate's
    // mission condition holds, but the wiring is null.
    const port: PaymentMissionsPort = {
      ...base.port,
      async detail(missionId) {
        const detail = await base.port.detail(missionId);
        if (detail === null || detail.id !== M2) return detail;
        const attempts = (detail.attempts ?? []).map((attempt, index, all) =>
          index === all.length - 1 ? { ...attempt, outcome: "CONFIRMED" as const } : attempt,
        );
        return { ...detail, attempts };
      },
    };
    const container = await openDetail(port, M2);
    expect(isPaymentMissionsVerificationPort(port)).toBe(false);
    expect(container.querySelector("#ps-agent-missions-section-verify")).toBeNull();
    expect(screen.queryByTestId("ps-agent-missions-verify-submit")).toBeNull();
  });

  it("does NOT render when the latest attempt is already verified (the honest post-state)", async () => {
    const harness = makeFakeVerifyMissionsPort();
    await act(async () => {
      await harness.verifyAttempt(M2, M2_ATTEMPT_ID);
    });
    const container = await openDetail(harness.port, M2);
    expect(container.querySelector("#ps-agent-missions-section-verify")).toBeNull();
  });
});

describe("the single act (the golden path)", () => {
  it("fires verifyAttempt with EXACTLY (missionId, attemptId) → the outcome note + the detail re-read + the card withdraws", async () => {
    const harness = makeFakeVerifyMissionsPort();
    const container = await openDetail(harness.port, M2);
    await act(async () => {
      fireEvent.click(screen.getByTestId("ps-agent-missions-verify-submit"));
    });
    expect(harness.verifyAttempt).toHaveBeenCalledTimes(1);
    expect(harness.verifyAttempt).toHaveBeenCalledWith(M2, M2_ATTEMPT_ID);
    // The outcome note — the ONLY aria-live region — announces the
    // observed provider status with the summary verbatim.
    expect(container.textContent).toContain("Verified by the authoritative read-back");
    expect(container.textContent).toContain("succeeded");
    expect(container.textContent).toContain(VERIFIED_SUMMARY);
    const section = container.querySelector("#ps-agent-missions-section-verify")!;
    expect(section.querySelectorAll("[role='status'], [aria-live]")).toHaveLength(1);
    // The typed verification fact lands on the mission record (the detail
    // refresh) — and the card's own gate withdraws the affordance.
    const detailCalls = harness.calls.filter((call) => call === `detail:${M2}`).length;
    expect(detailCalls).toBeGreaterThanOrEqual(2);
    await act(async () => {});
    expect(screen.queryByTestId("ps-agent-missions-verify-card")).toBeNull();
  });

  it("a re-act while one is in flight never fires (the call-order law)", async () => {
    const harness = makeFakeVerifyMissionsPort();
    await openDetail(harness.port, M2);
    const submit = screen.getByTestId("ps-agent-missions-verify-submit");
    await act(async () => {
      fireEvent.click(submit);
    });
    expect(harness.verifyAttempt).toHaveBeenCalledTimes(1);
  });
});

describe("the typed-failure return (the reviewer's law surfaces, never masked)", () => {
  it("a thrown typed refusal surfaces the honest error prose on the flow-error line and a corrected re-act fires", async () => {
    const harness = makeFakeVerifyMissionsPort({ throwOnFirstAct: true });
    const container = await openDetail(harness.port, M2);
    await act(async () => {
      fireEvent.click(screen.getByTestId("ps-agent-missions-verify-submit"));
    });
    // The typed failure is surfaced on the honest flow-error line — never masked.
    expect(container.textContent).toContain("The last action was refused");
    expect(container.textContent).toContain(TYPED_VERIFY_FAILURE);
    // The flow returned to idle: the control renders again.
    const submit = await screen.findByTestId("ps-agent-missions-verify-submit");
    // The corrected re-act fires with the SAME facts.
    await act(async () => {
      fireEvent.click(submit);
    });
    expect(harness.verifyAttempt).toHaveBeenCalledTimes(2);
    expect(harness.verifyAttempt).toHaveBeenLastCalledWith(M2, M2_ATTEMPT_ID);
    expect(container.textContent).toContain("Verified by the authoritative read-back");
  });
});

describe("the scan-clean law + the seam laws", () => {
  it("the rendered prose carries NO authority-surface machine literal (the phases are DATA)", async () => {
    const harness = makeFakeVerifyMissionsPort();
    const container = await openDetail(harness.port, M2);
    await act(async () => {
      fireEvent.click(screen.getByTestId("ps-agent-missions-verify-submit"));
    });
    const text = container.textContent ?? "";
    for (const literal of MACHINE_LITERALS) {
      expect(text).not.toContain(literal);
    }
  });

  it("the structural guard + the barrel exports", () => {
    const harness = makeFakeVerifyMissionsPort();
    expect(isPaymentMissionsVerificationPort(harness.port)).toBe(true);
    const base = makeFakeMissionsPort();
    expect(isPaymentMissionsVerificationPort(base.port)).toBe(false);
    expect(appBarrel.isPaymentMissionsVerificationPort).toBeDefined();
    expect(appBarrel.PAYMENT_MISSIONS_VERIFICATION_CARD_NOTE).toBe(PAYMENT_MISSIONS_VERIFICATION_CARD_NOTE);
    expect(appBarrel.PaymentMissionsVerifyCard).toBeDefined();
    expect(appBarrel.usePaymentMissionsVerifyFlow).toBeDefined();
  });
});
