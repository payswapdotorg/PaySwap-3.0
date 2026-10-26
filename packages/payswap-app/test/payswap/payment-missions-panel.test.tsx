// @vitest-environment jsdom
/**
 * @payswap/app — the PAYMENT-MISSIONS PANEL battery (P18-B, ADR-0011
 * D1/D2/D3), machine-checked against the REAL mount + panel family over
 * the deterministic fake port (./payment-missions-fixture.ts):
 *
 * - THE HONEST STATES: no port bound → the not-wired note (never an
 *   error); the typed plane-not-configured rejection (both the class and
 *   the channel-mapped duck-typed shape) → its pinned note — never an
 *   error mask; the empty board → the designed-empty contract; a failed
 *   read → the surfaced error card.
 * - THE GOLDEN PATH: board (2 missions, newest-updated-first — the fake
 *   returns them oldest-first) → detail → ask-next-field → capture (the
 *   fake records; the detail refreshes) → presentPreview (BLOCKED with
 *   the six REAL reasons VERBATIM, dispatchable false) → the two-act
 *   approve: engage → the scope card (scopeSummary + amount + expiry) →
 *   confirm → resolveApproval called with EXACTLY (requestId,
 *   "APPROVE") → the granted + ARMED note; the detail refreshes.
 * - THE DECLINE PATH.
 * - THE TWO-ACT LAW: the Confirm control does not exist before the
 *   scope card; no resolveApproval call without requestApproval first.
 * - THE SCAN-CLEAN LAW: the rendered prose never contains an
 *   authority-surface machine literal.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { PaymentMissionsMount } from "../../src/agent/PaymentMissionsMount.js";
import {
  PAYMENT_MISSIONS_ARMED_NOTE,
  PAYMENT_MISSIONS_DECLINED_NOTE,
  PAYMENT_MISSIONS_EMPTY_NOTE,
  PAYMENT_MISSIONS_NOT_DISPATCHABLE_NOTE,
  PAYMENT_MISSIONS_NOT_WIRED_NOTE,
  PAYMENT_MISSIONS_PLANE_NOT_CONFIGURED_NOTE,
  PAYMENT_MISSIONS_SCOPE_BINDING_NOTE,
  PAYMENT_MISSIONS_TWO_ACT_NOTE,
  PaymentMissionsPlaneNotConfiguredError,
  type PaymentMissionsPort,
} from "../../src/agent/paymentMissionsPins.js";
import {
  M1,
  M1_REQUEST_ID,
  M1_SCOPE_SUMMARY,
  M2,
  M1_SCOPE_DIGEST,
  SIX_BLOCK_REASONS,
  T2,
  T3,
  T5,
  makeFakeMissionsPort,
} from "./payment-missions-fixture.js";

/** The authority-surface machine literals that must NEVER reach the rendered prose. */
const MACHINE_LITERALS = [
  "AUTHORIZATION_GRANTED", "AUTHORIZATION_DECLINED", "PLAN_SELECTION_RECORDED",
  "PREVIEW_PRESENTED", "FIELD_CAPTURED", "MISSING_FIELD_ASKED", "VALIDATED",
  "ATTEMPT_STARTED", "ATTEMPT_CONFIRMED", "ATTEMPT_FAILED", "OUTCOME_UNKNOWN",
  "RECONCILED", "OPPORTUNITY_MATCHED", "WAIT_STARTED", "WAIT_CRITERIA_RECORDED",
  "WAIT_EXPIRED", "EXTERNAL_RETURN_VALIDATED", "EXTERNAL_RETURN_REJECTED",
  "CREATED", "RESUMED", "CANCELLED", "EXPIRED",
] as const;

afterEach(() => {
  cleanup();
});

describe("the honest states", () => {
  it("renders the not-wired note when no port is bound — no rows, no controls, never an error", () => {
    const { container } = render(<PaymentMissionsMount />);
    const section = container.querySelector(".ps-agent-missions")!;
    expect(section.textContent).toContain(PAYMENT_MISSIONS_NOT_WIRED_NOTE);
    expect(container.querySelector(".ps-agent-missions-list")).toBeNull();
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelector("[role='alert']")).toBeNull();
  });

  it("renders the pinned plane-not-configured note for the typed class rejection — never an error mask", async () => {
    const port: PaymentMissionsPort = {
      ...makeRejectingPort(),
      board: async () => {
        throw new PaymentMissionsPlaneNotConfiguredError(
          "The payment-mission plane is not configured in this host (no payment-mission runtime on the seam)",
        );
      },
    };
    const { container } = render(<PaymentMissionsMount port={port} />);
    expect(await screen.findByText(PAYMENT_MISSIONS_PLANE_NOT_CONFIGURED_NOTE)).toBeDefined();
    expect(container.querySelector("[role='alert']")).toBeNull();
    expect(container.querySelector(".ps-agent-missions-list")).toBeNull();
    expect(container.textContent).not.toContain("could not be read");
  });

  it("recognizes the channel-mapped duck-typed plane rejection (a plain object carrying the typed name)", async () => {
    const port: PaymentMissionsPort = {
      ...makeRejectingPort(),
      board: async () => {
        throw {
          name: "PaymentMissionsPlaneNotConfiguredError",
          message: "the bridge mapped the channel rejection",
        };
      },
    };
    const { container } = render(<PaymentMissionsMount port={port} />);
    expect(await screen.findByText(PAYMENT_MISSIONS_PLANE_NOT_CONFIGURED_NOTE)).toBeDefined();
    expect(container.querySelector("[role='alert']")).toBeNull();
  });

  it("renders the designed-empty contract for the empty board", async () => {
    const harness = makeFakeMissionsPort();
    const emptyPort: PaymentMissionsPort = { ...harness.port, board: async () => [] };
    const { container } = render(<PaymentMissionsMount port={emptyPort} />);
    const section = container.querySelector(".ps-agent-missions")!;
    expect(await screen.findByText(PAYMENT_MISSIONS_EMPTY_NOTE)).toBeDefined();
    expect(section.textContent).toContain(
      "No payment missions yet — missions are seeded from the composer or the entry actions",
    );
    expect(container.querySelector(".ps-agent-missions-list")).toBeNull();
  });

  it("surfaces a failed read as the honest error card — never a mask, never fabricated rows", async () => {
    const port: PaymentMissionsPort = {
      ...makeRejectingPort(),
      board: async () => {
        throw new Error("the payments store is quarantined");
      },
    };
    const { container } = render(<PaymentMissionsMount port={port} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("the payments store is quarantined");
    expect(alert.textContent).toContain("never masked");
    expect(container.querySelector(".ps-agent-missions-list")).toBeNull();
  });

  it("renders the honest mission-not-found state when the detail read returns null", async () => {
    const harness = makeFakeMissionsPort();
    const nullDetailPort: PaymentMissionsPort = { ...harness.port, detail: async () => null };
    const { container } = render(<PaymentMissionsMount port={nullDetailPort} />);
    const open = await screen.findByTestId(`ps-agent-missions-open-${M1}`);
    await act(async () => {
      fireEvent.click(open);
    });
    expect(container.textContent).toContain("exists anymore");
    expect(container.textContent).toContain(M1);
  });
});

/** A port whose every member rejects (tests override the member under test). */
function makeRejectingPort(): PaymentMissionsPort {
  const reject = async (): Promise<never> => {
    throw new Error("not wired in this harness");
  };
  return {
    board: reject,
    detail: reject,
    askNextField: reject,
    capture: reject,
    presentPreview: reject,
    requestApproval: reject,
    resolveApproval: reject,
  };
}

describe("the golden path (board → detail → ask → capture → preview → the two-act approve)", () => {
  it("walks the whole observation + approval journey honestly", async () => {
    const harness = makeFakeMissionsPort();
    const { container } = render(<PaymentMissionsMount port={harness.port} />);

    // THE BOARD — newest-updated-first (the fake returns them oldest-first).
    await screen.findByTestId(`ps-agent-missions-open-${M1}`);
    const rows = container.querySelectorAll(".ps-agent-missions-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain("PAY");
    expect(rows[0]!.textContent).toContain("Pay the supplier invoice INV-42");
    expect(rows[0]!.textContent).toContain("ACTIVE");
    expect(rows[0]!.textContent).toContain("no compiled intent");
    expect(rows[0]!.textContent).toContain("no preview yet");
    expect(rows[0]!.textContent).toContain(`updated ${T2}`);
    expect(rows[1]!.textContent).toContain("MOVE");
    expect(rows[1]!.textContent).toContain("intent compiled");
    expect(rows[1]!.textContent).toContain("preview presented");
    expect(rows[1]!.textContent).toContain("plan selected: plan:mixed-dex-offramp");

    // THE DETAIL — the timeline in people language, the nine fields, the meta.
    await act(async () => {
      fireEvent.click(rows[0]!.querySelector("button")!);
    });
    const detail = container.querySelector(".ps-agent-missions-detail")!;
    expect(detail.textContent).toContain("Pay the supplier invoice INV-42");
    expect(detail.textContent).toContain(M1);
    expect(detail.textContent).toContain("Mission created from the composer text");
    expect(container.querySelectorAll(".ps-agent-missions-fields li")).toHaveLength(9);
    expect(detail.textContent).toContain("missing");

    // ASK-NEXT-FIELD — the question renders verbatim.
    await act(async () => {
      fireEvent.click(screen.getByTestId("ps-agent-missions-ask"));
    });
    expect(container.textContent).toContain(
      "How much should move, and in which currency? (exact amount — PaySwap works in exact money, never approximations)",
    );

    // CAPTURE — the answer records; the detail refreshes.
    const form = container.querySelector(".ps-agent-missions-ask")!;
    fireEvent.change(container.querySelector(".ps-agent-missions-answer")!, {
      target: { value: "2500 EUR" },
    });
    await act(async () => {
      fireEvent.submit(form);
    });
    expect(harness.calls).toContain(`capture:${M1}:amountAndCurrency`);
    expect(container.textContent).toContain("2500 EUR");
    expect(container.textContent).toContain("Answer for amountAndCurrency recorded.");
    expect(container.querySelectorAll(".ps-agent-missions-missing")).toHaveLength(8);

    // PRESENT-PREVIEW — BLOCKED, the six REAL reasons VERBATIM, dispatchable false.
    await act(async () => {
      fireEvent.click(screen.getByTestId("ps-agent-missions-present"));
    });
    const preview = container.querySelector("#ps-agent-missions-section-preview")!;
    expect(preview.textContent).toContain("gates BLOCK");
    expect(preview.textContent).toContain("dispatchable: false");
    expect(preview.textContent).toContain(PAYMENT_MISSIONS_NOT_DISPATCHABLE_NOTE);
    for (const reason of SIX_BLOCK_REASONS) {
      expect(preview.textContent).toContain(reason);
    }
    expect(preview.textContent).toContain("ACCOUNTS");
    expect(preview.textContent).toContain("POLICY");

    // ACT ONE — the scope card.
    await act(async () => {
      fireEvent.click(screen.getByTestId("ps-agent-missions-engage"));
    });
    const scopeCard = container.querySelector("[data-testid='ps-agent-missions-scope-card']")!;
    expect(scopeCard.textContent).toContain(M1_SCOPE_SUMMARY);
    expect(scopeCard.textContent).toContain("2500 EUR (exact minor units)");
    expect(scopeCard.textContent).toContain("the supplier's bank account ending ••33");
    expect(scopeCard.textContent).toContain(T5);
    expect(scopeCard.textContent).toContain(M1_SCOPE_DIGEST);
    expect(scopeCard.textContent).toContain(PAYMENT_MISSIONS_TWO_ACT_NOTE);
    expect(scopeCard.textContent).toContain(PAYMENT_MISSIONS_SCOPE_BINDING_NOTE);

    // ACT TWO — Confirm calls resolveApproval with EXACTLY (requestId, "APPROVE").
    await act(async () => {
      fireEvent.click(screen.getByTestId("ps-agent-missions-confirm"));
    });
    expect(harness.resolveApproval).toHaveBeenCalledTimes(1);
    expect(harness.resolveApproval).toHaveBeenCalledWith(M1_REQUEST_ID, "APPROVE");
    const requestAt = harness.calls.indexOf(`requestApproval:${M1}`);
    const resolveAt = harness.calls.indexOf(`resolveApproval:${M1_REQUEST_ID}:APPROVE`);
    expect(requestAt).toBeGreaterThan(-1);
    expect(resolveAt).toBeGreaterThan(requestAt);

    // The granted + ARMED outcome; the detail refreshes with the timeline event.
    expect(container.textContent).toContain(PAYMENT_MISSIONS_ARMED_NOTE);
    expect(container.textContent).toContain(`armed until ${T5}`);
    expect(container.textContent).toContain("Scoped approval granted — the mission is armed");
    expect(container.textContent).not.toContain(PAYMENT_MISSIONS_DECLINED_NOTE);
  });

  it("the decline path resolves DECLINE and renders the declined note", async () => {
    const harness = makeFakeMissionsPort();
    const { container } = render(<PaymentMissionsMount port={harness.port} />);
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
      fireEvent.click(screen.getByTestId("ps-agent-missions-decline"));
    });
    expect(harness.resolveApproval).toHaveBeenCalledTimes(1);
    expect(harness.resolveApproval).toHaveBeenCalledWith(M1_REQUEST_ID, "DECLINE");
    expect(container.textContent).toContain(PAYMENT_MISSIONS_DECLINED_NOTE);
    expect(container.textContent).toContain("Scoped approval declined — nothing was approved");
    expect(container.textContent).not.toContain(PAYMENT_MISSIONS_ARMED_NOTE);
  });

  it("the M2 detail renders the intent's 11 keys, the plan-selection record and the attempt states", async () => {
    const harness = makeFakeMissionsPort();
    const { container } = render(<PaymentMissionsMount port={harness.port} />);
    const open = await screen.findByTestId(`ps-agent-missions-open-${M2}`);
    await act(async () => {
      fireEvent.click(open);
    });
    const intent = container.querySelector("#ps-agent-missions-section-intent")!;
    expect(intent.textContent).toContain("pmt-intent:e5f6a7b8:1");
    expect(intent.textContent).toContain("acct:checking:de-01");
    expect(intent.textContent).toContain("90000 EUR (exact minor units)");
    expect(intent.textContent).toContain("settle within 86400000ms");
    expect(intent.querySelectorAll("li")).toHaveLength(11);
    const plan = container.querySelector("#ps-agent-missions-section-plan")!;
    expect(plan.textContent).toContain("plan:mixed-dex-offramp");
    expect(plan.textContent).toContain("a record, never an authorization");
    const attempts = container.querySelector("#ps-agent-missions-section-attempts")!;
    expect(attempts.textContent).toContain("create an external effect");
    expect(attempts.textContent).toContain("sandbox mode");
    expect(attempts.textContent).toContain("outcome not yet known");
    // The captured values render in people language (the defensive formatter).
    expect(container.textContent).toContain("DE → FR, arrival EUR");
    expect(container.textContent).toContain("capped at 2500 EUR (exact minor units)");
    expect(container.textContent).toContain("full settlement required");
  });

  it("the Refresh control re-reads the board through the port", async () => {
    const harness = makeFakeMissionsPort();
    render(<PaymentMissionsMount port={harness.port} />);
    await screen.findByTestId(`ps-agent-missions-open-${M1}`);
    expect(harness.calls.filter((call) => call === "board")).toHaveLength(1);
    await act(async () => {
      fireEvent.click(screen.getByTestId("ps-agent-missions-refresh"));
    });
    expect(harness.calls.filter((call) => call === "board")).toHaveLength(2);
  });
});

describe("the two-act law (no resolve without the scope card)", () => {
  it("the Confirm control does not exist before the scope card — and no resolve call can happen", async () => {
    const harness = makeFakeMissionsPort();
    const { container } = render(<PaymentMissionsMount port={harness.port} />);
    const open = await screen.findByTestId(`ps-agent-missions-open-${M1}`);
    await act(async () => {
      fireEvent.click(open);
    });
    // No preview yet: no approve entry, no confirm, no resolve.
    expect(container.querySelector("[data-ps-missions-act='ENGAGE_APPROVAL']")).toBeNull();
    expect(container.querySelector("[data-ps-missions-act='CONFIRM']")).toBeNull();
    expect(harness.resolveApproval).not.toHaveBeenCalled();
    // The preview exists: the entry renders, the confirm STILL does not.
    await act(async () => {
      fireEvent.click(screen.getByTestId("ps-agent-missions-present"));
    });
    expect(container.querySelector("[data-ps-missions-act='ENGAGE_APPROVAL']")).not.toBeNull();
    expect(container.querySelector("[data-ps-missions-act='CONFIRM']")).toBeNull();
    expect(harness.calls).not.toContain(`requestApproval:${M1}`);
    expect(harness.resolveApproval).not.toHaveBeenCalled();
    // Act one: the scope card renders — only now the confirm exists.
    await act(async () => {
      fireEvent.click(screen.getByTestId("ps-agent-missions-engage"));
    });
    expect(container.querySelector("[data-testid='ps-agent-missions-scope-card']")).not.toBeNull();
    expect(container.querySelector("[data-ps-missions-act='CONFIRM']")).not.toBeNull();
    expect(harness.calls).toContain(`requestApproval:${M1}`);
    expect(harness.resolveApproval).not.toHaveBeenCalled();
  });
});

describe("the scan-clean law (no authority-surface machine literal in the rendered prose)", () => {
  it("the full golden-path DOM never contains a machine literal", async () => {
    const harness = makeFakeMissionsPort();
    const { container } = render(<PaymentMissionsMount port={harness.port} />);
    const open = await screen.findByTestId(`ps-agent-missions-open-${M1}`);
    await act(async () => {
      fireEvent.click(open);
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("ps-agent-missions-ask"));
    });
    const form = container.querySelector(".ps-agent-missions-ask")!;
    fireEvent.change(container.querySelector(".ps-agent-missions-answer")!, {
      target: { value: "2500 EUR" },
    });
    await act(async () => {
      fireEvent.submit(form);
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
    const prose = container.textContent ?? "";
    for (const literal of MACHINE_LITERALS) {
      expect(prose).not.toContain(literal);
    }
    // The people-language facts DID render (the scan is meaningful, not vacuous).
    expect(prose).toContain(T3);
    expect(prose).toContain("Scoped approval granted");
  });
});
