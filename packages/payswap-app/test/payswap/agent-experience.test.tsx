// @vitest-environment jsdom
/**
 * @payswap/app — the AGENT EXPERIENCE mount tests (the P15 zcode-shell
 * integration, per the P13 UX reference's shared-entrypoints law).
 *
 * Machine-checked against the REAL component:
 *
 * - The entry rail renders the four payment directions (Pay, Receive,
 *   Move, Convert) and the primary Connect action — as real buttons in
 *   a labelled nav landmark; checkout never appears (no invented
 *   direction).
 * - The convergence law: a chip click seeds the ONE shared controller
 *   and opens the panel (the same task orchestration the composer text
 *   path drives); the seeded surface action is recorded with the entry
 *   area + the honest provenance note.
 * - The rail HIDES while the panel is open (the panel is the entry
 *   context then) and returns when minimized.
 * - The honest-note inheritance: the open panel renders the P13 pinned
 *   statements (zero authority; voice declared-unsupported verbatim).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

import { resetSharedAgentComposerController } from "../../src/agent/agentComposerController.js";
import { PaySwapAgentExperience } from "../../src/agent/AgentExperience.js";
import { AGENT_COMPOSER_ZERO_AUTHORITY_NOTE } from "../../src/agent/agentComposerProjection.js";
import { AGENT_TASK_VOICE_UNSUPPORTED_STATEMENT_PIN } from "../../src/lib/agent-task-pins.js";

/**
 * A deterministic in-memory storage seam (localStorage-shaped). The
 * component binds the shared controller to the AMBIENT localStorage at
 * creation — each test stubs a FRESH fake so the singleton (reset in
 * afterEach) never inherits a previous test's persisted open-panel
 * state (the exact leak the first draft of this file hit).
 */
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

beforeEach(() => {
  vi.stubGlobal("localStorage", fakeStorage());
});

afterEach(() => {
  cleanup();
  resetSharedAgentComposerController();
  vi.unstubAllGlobals();
});

describe("the entry rail (the shared entry actions)", () => {
  it("renders the four payment directions + the primary Connect action as real buttons", () => {
    render(<PaySwapAgentExperience area="zcode-workspace" />);

    const rail = screen.getByRole("navigation", { name: "PaySwap agent entry actions" });
    expect(rail).toBeDefined();

    for (const label of ["Pay", "Receive", "Move", "Convert"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${label}$`) })).toBeDefined();
    }
    expect(screen.getByRole("button", { name: /^Connect Stripe$/ })).toBeDefined();
    // Checkout never appears (the mission vocabulary has exactly four
    // directions — no invented entry).
    expect(screen.queryByRole("button", { name: /^Checkout$/ })).toBeNull();
  });

  it("renders the guided-intake honesty note (nothing here moves money)", () => {
    render(<PaySwapAgentExperience area="zcode-workspace" />);
    expect(
      screen.getByText(/Guided intake — the agent drafts, you authorize/i),
    ).toBeDefined();
  });
});

describe("the convergence law (a chip click seeds the ONE shared orchestration)", () => {
  it("a Pay chip click opens the panel with the seeded surface action + the area provenance", async () => {
    render(<PaySwapAgentExperience area="zcode-workspace" />);

    await act(async () => {
      screen.getByRole("button", { name: /^Pay$/ }).click();
    });

    // The panel is the entry context now (the rail hid).
    expect(screen.queryByRole("navigation", { name: "PaySwap agent entry actions" })).toBeNull();
    // The seeded surface action is recorded with the entry area + note.
    expect(await screen.findByText(/From the zcode-workspace area:/i)).toBeDefined();
    expect(screen.getByText(/Start a Pay task/i)).toBeDefined();
    // The seeded task projects as the Pay request.
    expect(await screen.findByText(/^Pay request$/)).toBeDefined();
  });

  it("a Connect Stripe chip click seeds the connection setup intent on the same orchestration", async () => {
    render(<PaySwapAgentExperience area="zcode-workspace" />);

    await act(async () => {
      screen.getByRole("button", { name: /^Connect Stripe$/ }).click();
    });

    expect(await screen.findByText(/From the zcode-workspace area:/i)).toBeDefined();
    // The payment seed label must NOT appear on the connection task.
    expect(screen.queryByText(/Start a Pay task/i)).toBeNull();
    // The connection task projects as the Stripe own-store setup.
    expect(
      await screen.findByText(/^Stripe setup — own-store payments \(test mode\)$/),
    ).toBeDefined();
  });

  it("the panel inherits the P13 honest states (zero authority; voice declared-unsupported)", async () => {
    render(<PaySwapAgentExperience area="zcode-workspace" />);

    await act(async () => {
      screen.getByRole("button", { name: /^Pay$/ }).click();
    });

    expect(
      await screen.findByText(AGENT_COMPOSER_ZERO_AUTHORITY_NOTE, { exact: false }),
    ).toBeDefined();
    expect(
      screen.getByText(AGENT_TASK_VOICE_UNSUPPORTED_STATEMENT_PIN, { exact: false }),
    ).toBeDefined();
  });

  it("the rail returns when the panel is minimized (the disclosure law inherited)", async () => {
    render(<PaySwapAgentExperience area="zcode-workspace" />);

    await act(async () => {
      screen.getByRole("button", { name: /^Pay$/ }).click();
    });
    expect(await screen.findByText(/From the zcode-workspace area:/i)).toBeDefined();

    await act(async () => {
      screen.getByRole("button", { name: "Minimize" }).click();
    });
    expect(
      screen.getByRole("navigation", { name: "PaySwap agent entry actions" }),
    ).toBeDefined();
  });
});
