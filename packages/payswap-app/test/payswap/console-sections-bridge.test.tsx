// @vitest-environment jsdom
/**
 * @payswap/app — the CONSOLE SECTIONS BRIDGE tests (the P15 zcode-shell
 * integration): the host-shell mount that renders the PaySwap Agent
 * Workspace's eight sections inside a host's main content area.
 *
 * Machine-checked against the REAL component:
 *
 * - The sectionId prop drives the rendered section (each of the seven
 *   nav sections renders its identity); an id that names no section
 *   renders the console's honest not-found — never an invented one.
 * - The two-way mirror: an in-section navigation (the overview's New
 *   mission entry → the missions section) calls onSectionChange so the
 *   host nav highlight follows; a NEW sectionId prop switches the
 *   rendered section (the host nav stays the source of truth).
 * - The back affordance: the connections empty-state action (a
 *   product-kind next action) routes to onNavigateBack.
 * - The store is the REAL BROWSER_PROFILE workspace store (the settings
 *   section renders its browser-profile durability fact).
 * - The P13 connections composition (the provider catalogue, the secure
 *   provider setup panel, the setup-draft rail) with the honesty laws:
 *   the registry-declared Stripe cards carry Connect actions; the
 *   declared-UX-surface providers (PayPal, Adyen, blockchain wallet)
 *   render DISABLED setup controls and never a connected state.
 * - The CONVERGENCE LAW: the connections Connect actions seed the ONE
 *   shared typed-intent controller (the same orchestration the entry
 *   rail chips and the composer text path drive) — same provider, same
 *   form, same resume key.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { resetSharedAgentComposerController } from "../../src/agent/agentComposerController.js";
import { PaySwapAgentExperience } from "../../src/agent/AgentExperience.js";
import { PaySwapConsoleSections } from "../../src/console/PaySwapConsoleSections.js";
import { agentProviderSetupCards } from "../../src/lib/agent-provider-entries.js";

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

let storage: Storage;

beforeEach(() => {
  storage = fakeStorage();
  vi.stubGlobal("localStorage", storage);
});

afterEach(() => {
  cleanup();
  resetSharedAgentComposerController();
  vi.unstubAllGlobals();
});

/** Mount the bridge for a section with the host mirrors as spies. */
function mountBridge(sectionId: string): {
  rerender: (nextSectionId: string) => void;
  onSectionChange: ReturnType<typeof vi.fn>;
  onNavigateBack: ReturnType<typeof vi.fn>;
} {
  const onSectionChange = vi.fn();
  const onNavigateBack = vi.fn();
  const view = render(
    <PaySwapConsoleSections
      sectionId={sectionId}
      onSectionChange={onSectionChange}
      onNavigateBack={onNavigateBack}
    />,
  );
  return {
    rerender: (nextSectionId: string) =>
      view.rerender(
        <PaySwapConsoleSections
          sectionId={nextSectionId}
          onSectionChange={onSectionChange}
          onNavigateBack={onNavigateBack}
        />,
      ),
    onSectionChange,
    onNavigateBack,
  };
}

describe("the host-shell bridge (the section rendering)", () => {
  it("renders each nav section for its sectionId", () => {
    for (const [sectionId, title] of [
      ["overview", "Overview"],
      ["missions", "Missions"],
      ["agents", "Agents"],
      ["approvals", "Approvals"],
      ["connections", "Connections"],
      ["activity", "Activity & receipts"],
      ["lab", "Lab"],
    ] as const) {
      const { unmount } = render(<PaySwapConsoleSections sectionId={sectionId} />);
      expect(screen.getByRole("heading", { level: 1, name: title })).toBeDefined();
      unmount();
    }
  });

  it("renders the console's honest not-found for an id that names no section", () => {
    render(<PaySwapConsoleSections sectionId="does-not-exist" />);
    expect(screen.getByRole("heading", { level: 1, name: "Section not found" })).toBeDefined();
    expect(screen.getByText(/No workspace section exists at/)).toBeDefined();
  });

  it("renders the REAL BROWSER_PROFILE store durability on the settings section", () => {
    render(<PaySwapConsoleSections sectionId="settings" />);
    expect(screen.getByText(/stored in this browser profile only/i)).toBeDefined();
  });

  it("a new sectionId prop switches the rendered section", () => {
    const { rerender } = mountBridge("overview");
    expect(screen.getByRole("heading", { level: 1, name: "Overview" })).toBeDefined();
    rerender("activity");
    expect(screen.getByRole("heading", { level: 1, name: "Activity & receipts" })).toBeDefined();
    expect(screen.queryByRole("heading", { level: 1, name: "Overview" })).toBeNull();
  });
});

describe("the host-shell bridge (the two-way mirror)", () => {
  it("an in-section navigation calls onSectionChange (the host nav follows)", async () => {
    const { onSectionChange } = mountBridge("overview");
    const newMission = screen.getByRole("button", { name: "New mission" });
    await act(async () => {
      fireEvent.click(newMission);
    });
    expect(onSectionChange).toHaveBeenCalledWith("missions");
    // The rendered section follows the in-memory navigation too.
    expect(screen.getByRole("heading", { level: 1, name: "Missions" })).toBeDefined();
  });

  it("the connections empty-state product action routes to onNavigateBack", async () => {
    const { onNavigateBack } = mountBridge("connections");
    const action = screen.getByRole("button", {
      name: "Connect capabilities in the PaySwap product",
    });
    await act(async () => {
      fireEvent.click(action);
    });
    expect(onNavigateBack).toHaveBeenCalledTimes(1);
  });
});

describe("the P13 connections composition (honest provider catalogue)", () => {
  it("renders the registry-declared Stripe cards with Connect actions", () => {
    render(<PaySwapConsoleSections sectionId="connections" />);
    const cards = agentProviderSetupCards();
    expect(cards.length).toBeGreaterThanOrEqual(3);
    for (const card of cards) {
      expect(screen.getByText(card.cardTitle)).toBeDefined();
    }
    // The primary card's action + the secure-setup Continue action.
    expect(
      screen.getAllByRole("button", { name: /^Connect Stripe/ }).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: "Continue securely" })).toBeDefined();
  });

  it("renders the declared-UX-surface providers with DISABLED controls — never a connected state", () => {
    render(<PaySwapConsoleSections sectionId="connections" />);
    for (const label of ["PayPal", "Adyen", "Blockchain wallet"]) {
      const card = screen.getByText(label).closest(".ps-connections-card");
      expect(card).not.toBeNull();
      const control = within(card as HTMLElement).getByRole("button", {
        name: "Setup not declared",
      });
      expect((control as HTMLButtonElement).disabled).toBe(true);
    }
    // The honesty line for undeclared providers, verbatim.
    expect(screen.getAllByText(/not declared in the provider registry/i).length).toBe(3);
    // No connected state is ever fabricated for them.
    expect(screen.queryByText(/^Connected$/)).toBeNull();
  });

  it("renders the P13 secure-setup copy (the security laws, verbatim intent)", () => {
    render(<PaySwapConsoleSections sectionId="connections" />);
    expect(screen.getByText(/Expected domain: stripe\.com/)).toBeDefined();
    expect(
      screen.getByText(/You will authenticate directly with the provider\./),
    ).toBeDefined();
    expect(
      screen.getByText(/Credentials and one-time codes must never be entered into agent chat\./),
    ).toBeDefined();
    expect(
      screen.getByText(/Not a real Stripe page or a live auth session/),
    ).toBeDefined();
  });

  it("renders the setup-draft rail (the resumable five-step ladder + the security boundary)", () => {
    render(<PaySwapConsoleSections sectionId="connections" />);
    expect(screen.getByText(/One task, safely resumable/)).toBeDefined();
    for (const step of [
      "Choose integration",
      "Authenticate",
      "Verify permissions",
      "Test in sandbox",
      "Review live enablement",
    ]) {
      expect(screen.getByText(step)).toBeDefined();
    }
    expect(screen.getByText(/open auth ≠ connected; only verified evidence can activate/i)).toBeDefined();
  });

  it("the CONVERGENCE LAW: Connect Stripe seeds the ONE shared typed-intent controller", async () => {
    // The real composition: the console sections bridge seeds the ONE
    // shared controller; the shared composer panel (the same mount the
    // zcode shell rides beside the substrate Root) renders it.
    render(
      <>
        <PaySwapConsoleSections sectionId="connections" />
        <PaySwapAgentExperience area="zcode-workspace" />
      </>,
    );
    // Scope to the connections section: the entry rail's Connect chip
    // (the OTHER entrypoint) matches the same name by design.
    const connectionsSection = document
      .getElementById("ps-console-connections-heading")
      ?.closest("section");
    expect(connectionsSection).not.toBeNull();
    const connect = within(connectionsSection as HTMLElement).getAllByRole("button", {
      name: /^Connect Stripe/,
    })[0]!;
    await act(async () => {
      fireEvent.click(connect);
    });
    // The seeded surface action is recorded with the entry area (the
    // connections surface) + the honest provenance note.
    expect(await screen.findByText(/From the connections area:/i)).toBeDefined();
    // The task projects as the SAME connection setup the entry rail
    // chip and the typed "connect stripe" produce — one orchestration.
    expect(
      await screen.findByText(/^Stripe setup — own-store payments \(test mode\)$/),
    ).toBeDefined();
  });

  it("Continue securely seeds the same shared controller (the same convergence)", async () => {
    render(
      <>
        <PaySwapConsoleSections sectionId="connections" />
        <PaySwapAgentExperience area="zcode-workspace" />
      </>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continue securely" }));
    });
    expect(await screen.findByText(/From the connections area:/i)).toBeDefined();
    expect(
      await screen.findByText(/^Stripe setup — own-store payments \(test mode\)$/),
    ).toBeDefined();
  });
});
