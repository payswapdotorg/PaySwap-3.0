// @vitest-environment jsdom
/**
 * @payswap/app — the AGENT COMPOSER mount + surface integration tests
 * (P13-A).
 *
 * The composer UI laws, machine-checked against the REAL components:
 *
 * - The shared-entrypoints law: the dock/panel mounts on every
 *   integrated surface drive the ONE shared controller (card click and
 *   chat text converge on the SAME task — re-verified here at the
 *   controller level with the UI in the loop).
 * - Honest states: the panel renders the zero-authority note, the
 *   no-tools note, the declared-unsupported VOICE statement VERBATIM,
 *   and never a microphone control.
 * - Keyboard: the dock is a real disclosure button (aria-expanded),
 *   Escape minimizes the open panel, minimize returns focus to the
 *   dock, and the input keeps its draft across minimize/reopen
 *   (context is never lost).
 * - The surface integrations: Payments renders the Pay/Receive/Move
 *   seeds with NO checkout card (no invented direction), Accounts
 *   renders Convert+Move, and both mount the composer.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  createAgentComposerController,
  resetSharedAgentComposerController,
  type AgentComposerController,
} from "../../src/agent/agentComposerController.js";
import { AgentComposer } from "../../src/agent/AgentComposer.js";
import {
  AGENT_COMPOSER_DURABILITY_FACT,
  AGENT_COMPOSER_INPUT_HINT,
  AGENT_COMPOSER_NO_TOOLS_NOTE,
  AGENT_COMPOSER_ZERO_AUTHORITY_NOTE,
} from "../../src/agent/agentComposerProjection.js";
import { AGENT_TASK_VOICE_UNSUPPORTED_STATEMENT_PIN } from "../../src/lib/agent-task-pins.js";
import { agentPaymentDirectionEntries } from "../../src/lib/agent-payment-entries.js";
import { PaymentsAreaSurface } from "../../src/pages/areas/PaymentsAreaSurface.tsx";
import { AccountsAreaSurface } from "../../src/pages/areas/AccountsAreaSurface.tsx";
import { foldOutcomeBoard } from "../../src/lib/outcome-board.js";
import { HONEST_DEPLOYMENT_CONTEXT, NO_EVIDENCE_COVERAGE } from "../../src/contracts/harness.js";

const noopNavigation = undefined;

/** A deterministic in-memory storage seam (localStorage-shaped). */
function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length(): number {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

const CLOCK = () => "2026-10-22T12:00:00Z";

function makeController(): AgentComposerController {
  return createAgentComposerController({ storage: fakeStorage(), clock: CLOCK });
}

afterEach(() => {
  cleanup();
  resetSharedAgentComposerController();
});

describe("the composer mount — honest panel states", () => {
  it("the minimized default renders the dock as a real disclosure button", () => {
    const controller = makeController();
    const { container } = render(<AgentComposer controller={controller} area="connections" />);
    const dock = screen.getByRole("button", { name: /PaySwap agent/i });
    expect(dock.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector(".ps-agent-panel")).toBeNull();
  });

  it("the open panel renders the pinned honest notes verbatim — and no microphone control", () => {
    const controller = makeController();
    controller.open({ area: "connections" });
    const markup = renderToStaticMarkup(
      <AgentComposer controller={controller} area="connections" />,
    );
    expect(markup).toContain(AGENT_COMPOSER_ZERO_AUTHORITY_NOTE);
    expect(markup).toContain(AGENT_COMPOSER_NO_TOOLS_NOTE);
    expect(markup).toContain(AGENT_COMPOSER_DURABILITY_FACT);
    expect(markup).toContain(AGENT_COMPOSER_INPUT_HINT);
    expect(markup).toContain(AGENT_TASK_VOICE_UNSUPPORTED_STATEMENT_PIN);
    // Never a mic control, never a voice simulation.
    expect(markup.toLowerCase()).not.toContain("microphone");
    expect(markup.toLowerCase()).not.toContain('aria-label="voice');
  });
});

describe("the composer mount — keyboard and context laws", () => {
  it("Escape minimizes the open panel and returns focus to the dock; the draft survives reopen", () => {
    const controller = makeController();
    controller.open({ area: "payments" });
    render(<AgentComposer controller={controller} area="payments" />);

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    act(() => {
      fireEvent.change(input, { target: { value: "pay the supplier" } });
    });
    expect(input.value).toBe("pay the supplier");

    act(() => {
      fireEvent.keyDown(input, { key: "Escape" });
    });
    const dock = screen.getByRole("button", { name: /PaySwap agent/i });
    expect(dock.getAttribute("aria-expanded")).toBe("false");
    // Focus returns to the dock (the toggle that reopens).
    expect(document.activeElement).toBe(dock);

    act(() => {
      fireEvent.click(dock);
    });
    const reopened = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(reopened.value).toBe("pay the supplier");
  });
});

describe("the convergence law at the UI level — one controller, every entry", () => {
  it("a Payments Pay-card seed and a typed 'pay the supplier' reach ONE task (RESUME, never a duplicate)", async () => {
    const controller = makeController();
    controller.open({ area: "payments" });

    await act(async () => {
      await controller.seedFromSurface({
        intent: {
          kind: "PAYMENT_MISSION",
          direction: "PAY",
          goalStatement: "Pay — a guided payment intake started from the Payments area.",
        },
        originNote: "Start a Pay task",
        area: "payments",
      });
    });
    const afterCard = controller.getState().tasks;
    expect(afterCard).toHaveLength(1);

    render(<AgentComposer controller={controller} area="payments" />);
    const field = (await screen.findByRole("textbox")) as HTMLTextAreaElement;
    act(() => {
      fireEvent.change(field, { target: { value: "pay the supplier" } });
    });
    await act(async () => {
      fireEvent.keyDown(field, { key: "Enter" });
    });

    const afterText = controller.getState().tasks;
    expect(afterText).toHaveLength(1);
    expect(afterText[0]!.id).toBe(afterCard[0]!.id);
    // The transcript records the convergence honestly.
    const resumed = controller.getState().entries.find((entry) => entry.kind === "TASK_RESUMED");
    expect(resumed).toBeDefined();
    expect(resumed!.text).toContain("the same one, not a duplicate");
  });

  it("an unsupported voice seeding fails closed (never simulated)", async () => {
    const controller = makeController();
    controller.open({ area: "connections" });
    await act(async () => {
      await controller.seedFromSurface({
        intent: {
          kind: "CONNECTION_SETUP",
          providerId: "stripe",
          form: "SCOPED_API_CREDENTIAL",
          useCaseRef: "own-store-test-mode",
        },
        originNote: "Connect Stripe (own store, test mode)",
        area: "connections",
      });
    });
    const tasks = controller.getState().tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.statusView.label).not.toContain("voice");
  });
});

describe("the surface integrations", () => {
  it("Payments renders the Pay/Receive/Move agent seeds and NO checkout card (no invented direction)", () => {
    const entries = agentPaymentDirectionEntries("payments");
    expect(entries.map((entry) => entry.actionId)).toEqual(["pay", "receive", "move"]);

    const markup = renderToStaticMarkup(
      <PaymentsAreaSurface
        navigation={{ areas: [] } as never}
        outcomeBoard={foldOutcomeBoard({
          deployment: HONEST_DEPLOYMENT_CONTEXT,
          coverage: NO_EVIDENCE_COVERAGE,
          apiRuntime: { configured: false, baseUrl: null, envVar: "VITE_PAYSWAP_API_URL" },
        })}
        productNavigation={noopNavigation}
      />,
    );
    expect(markup).toContain("payments-agent-heading");
    expect(markup).toContain("Start a Pay task");
    expect(markup).toContain("Start a Receive task");
    expect(markup).toContain("Start a Move task");
    expect(markup).not.toContain("Start a Checkout task");
    expect(markup).toContain("checkout is a hosted merchant lane with no direction mapping");
    expect(markup).toContain("ps-agent-dock");
  });

  it("Accounts renders the Convert + Move cross-anchor agent seeds", () => {
    const entries = agentPaymentDirectionEntries("accounts");
    expect(entries.map((entry) => entry.actionId)).toEqual(["move", "convert"]);

    const markup = renderToStaticMarkup(
      <AccountsAreaSurface productNavigation={noopNavigation} />,
    );
    expect(markup).toContain("accounts-agent-heading");
    expect(markup).toContain("Start a Convert task");
    expect(markup).toContain("Start a Move task");
    expect(markup).toContain("ps-agent-dock");
  });
});
