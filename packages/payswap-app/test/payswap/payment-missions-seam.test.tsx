// @vitest-environment jsdom
/**
 * @payswap/app — the PAYMENT-MISSIONS COMPOSITION-SEAM laws (P18-B;
 * ADR-0011 D1 — the P17-B seam pattern, machine-checked against the
 * REAL mount + the REAL agent experience):
 *
 * - THE HONEST DEFAULTS: with NO composition root bound, there is NO
 *   shared payment-missions port — the mount renders the honest
 *   not-wired note, never fabricated missions, never an error.
 * - THE COMPOSITION ROOT: bindPaymentMissionsPort actually wires the
 *   mount — with NO port prop, the board renders over the bound port.
 * - THE PROP OVERRIDE LAW: an explicit port prop wins over the shared
 *   binding (the injectable seam stays injectable).
 * - THE RESET LAW: resetSharedPaymentMissionsPort restores the honest
 *   default (the seams never leak between laws).
 * - THE BARREL LAW: the missions composition surface is exported from
 *   the package barrel (src/index.ts) — the platform host binds through
 *   the public API.
 * - THE RAIL LAW: the agent experience's Missions entry is a real
 *   toggle (aria-pressed) that shows the observation surface with the
 *   honest not-wired note when no port is bound, and the surface
 *   follows the rail's own hiding law (it hides while the composer
 *   panel is open).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import {
  bindPaymentMissionsPort,
  PaymentMissionsMount,
  resetSharedPaymentMissionsPort,
  sharedPaymentMissionsPort,
} from "../../src/agent/PaymentMissionsMount.js";
import { PaySwapAgentExperience } from "../../src/agent/AgentExperience.js";
import { resetSharedAgentComposerController } from "../../src/agent/agentComposerController.js";
import {
  PAYMENT_MISSIONS_NOT_WIRED_NOTE,
  type PaymentMissionsPort,
} from "../../src/agent/paymentMissionsPins.js";
import { M1, makeFakeMissionsPort } from "./payment-missions-fixture.js";
import * as appBarrel from "../../src/index.js";

/** A deterministic in-memory storage seam (localStorage-shaped, jsdom). */
function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length(): number {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
}

/** A minimal board-only fake (the seam laws need no mission journey). */
function boardOnlyPort(goal: string): PaymentMissionsPort {
  const reject = async (): Promise<never> => {
    throw new Error("not wired in this harness");
  };
  return {
    board: async () => [
      {
        missionId: M1,
        direction: "PAY",
        goalStatement: goal,
        status: "ACTIVE",
        hasCompiledIntent: false,
        hasPreview: false,
        updatedAt: "2026-10-26T11:00:00Z",
      },
    ],
    detail: reject,
    askNextField: reject,
    capture: reject,
    presentPreview: reject,
    requestApproval: reject,
    resolveApproval: reject,
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", fakeStorage());
});

afterEach(() => {
  cleanup();
  resetSharedPaymentMissionsPort();
  resetSharedAgentComposerController();
  vi.unstubAllGlobals();
});

describe("the honest defaults (no composition root bound)", () => {
  it("there is NO shared port — and an unbound mount renders the not-wired note, never fabricated missions", () => {
    expect(sharedPaymentMissionsPort()).toBeUndefined();
    const { container } = render(<PaymentMissionsMount />);
    expect(container.textContent).toContain(PAYMENT_MISSIONS_NOT_WIRED_NOTE);
    expect(container.querySelector(".ps-agent-missions-list")).toBeNull();
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });
});

describe("the composition root (bindPaymentMissionsPort wires the mount)", () => {
  it("a bound port renders the board with NO port prop — through the seam", async () => {
    bindPaymentMissionsPort(makeFakeMissionsPort().port);
    const { container } = render(<PaymentMissionsMount />);
    await screen.findByTestId(`ps-agent-missions-open-${M1}`);
    expect(container.querySelectorAll(".ps-agent-missions-row")).toHaveLength(2);
    expect(container.textContent).not.toContain(PAYMENT_MISSIONS_NOT_WIRED_NOTE);
  });

  it("the prop override law: an explicit port prop wins over the shared binding", async () => {
    bindPaymentMissionsPort(boardOnlyPort("the shared port's goal"));
    const { container } = render(
      <PaymentMissionsMount port={boardOnlyPort("the prop port's goal")} />,
    );
    await screen.findByTestId(`ps-agent-missions-open-${M1}`);
    expect(container.textContent).toContain("the prop port's goal");
    expect(container.textContent).not.toContain("the shared port's goal");
  });
});

describe("the reset law (the seam never leaks between laws)", () => {
  it("resetSharedPaymentMissionsPort restores the honest default", async () => {
    bindPaymentMissionsPort(boardOnlyPort("a bound goal"));
    expect(sharedPaymentMissionsPort()).toBeDefined();
    resetSharedPaymentMissionsPort();
    expect(sharedPaymentMissionsPort()).toBeUndefined();
    render(<PaymentMissionsMount />);
    expect(await screen.findByText(PAYMENT_MISSIONS_NOT_WIRED_NOTE)).toBeDefined();
  });
});

describe("the barrel law (the composition surface is the public API — src/index.ts)", () => {
  it("exports the seam functions, the mount, the typed error + guard and the DTO pin types", () => {
    for (const seam of [
      appBarrel.bindPaymentMissionsPort,
      appBarrel.sharedPaymentMissionsPort,
      appBarrel.resetSharedPaymentMissionsPort,
    ] as const) {
      expect(typeof seam).toBe("function");
    }
    expect(typeof appBarrel.PaymentMissionsMount).toBe("function");
    expect(new appBarrel.PaymentMissionsPlaneNotConfiguredError("seam").kind).toBe(
      "PLANE_NOT_CONFIGURED",
    );
    expect(appBarrel.isPaymentMissionsPlaneNotConfigured(new Error("other"))).toBe(false);
    // The typed composition surface compiles through the same barrel.
    const board: appBarrel.PaymentMissionsBoardItem = {
      missionId: M1,
      direction: "PAY",
      goalStatement: "Pay the supplier invoice INV-42",
      status: "ACTIVE",
      hasCompiledIntent: false,
      hasPreview: false,
      updatedAt: "2026-10-26T11:00:00Z",
    };
    const view: appBarrel.PaymentMissionsView = { kind: "BOARD", items: [board] };
    expect(view.kind).toBe("BOARD");
    const resolution: appBarrel.PaymentMissionsApprovalResolution = { outcome: "DECLINED", reason: "no" };
    expect(resolution.outcome).toBe("DECLINED");
    const port: appBarrel.PaymentMissionsPort = boardOnlyPort("the barrel law's goal");
    expect(typeof port.board).toBe("function");
  });
});

describe("the rail law (the agent experience's Missions observation entry)", () => {
  it("renders the Missions toggle as a real button with aria-pressed", () => {
    render(<PaySwapAgentExperience area="zcode-workspace" />);
    const missions = screen.getByRole("button", { name: /^Missions$/ });
    expect(missions.getAttribute("aria-pressed")).toBe("false");
  });

  it("toggling shows the observation surface — the honest not-wired note when no port is bound, never an error", async () => {
    render(<PaySwapAgentExperience area="zcode-workspace" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Missions$/ }));
    });
    expect(screen.getByRole("button", { name: /^Missions$/ }).getAttribute("aria-pressed")).toBe("true");
    const surface = screen.getByRole("region", { name: "Payment missions — the observation board" });
    expect(surface.textContent).toContain(PAYMENT_MISSIONS_NOT_WIRED_NOTE);
    expect(surface.querySelector("[role='alert']")).toBeNull();
    // Toggling again unmounts the surface.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Missions$/ }));
    });
    expect(screen.queryByRole("region", { name: "Payment missions — the observation board" })).toBeNull();
  });

  it("the surface follows the rail's own hiding law: it hides while the composer panel is open", async () => {
    render(<PaySwapAgentExperience area="zcode-workspace" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Missions$/ }));
    });
    expect(
      screen.getByRole("region", { name: "Payment missions — the observation board" }),
    ).toBeDefined();
    // Opening the composer (a Pay chip seeds the shared task and opens the panel)
    // hides the rail — and the missions surface hides with it.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Pay$/ }));
    });
    expect(screen.queryByRole("navigation", { name: "PaySwap agent entry actions" })).toBeNull();
    expect(
      screen.queryByRole("region", { name: "Payment missions — the observation board" }),
    ).toBeNull();
  });

  it("a bound port wires the rail's missions surface through the seam (the board renders)", async () => {
    bindPaymentMissionsPort(makeFakeMissionsPort().port);
    render(<PaySwapAgentExperience area="zcode-workspace" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Missions$/ }));
    });
    const surface = screen.getByRole("region", { name: "Payment missions — the observation board" });
    expect(await screen.findByTestId(`ps-agent-missions-open-${M1}`)).toBeDefined();
    expect(surface.querySelectorAll(".ps-agent-missions-row")).toHaveLength(2);
  });
});
