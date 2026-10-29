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

describe("the P13 connections composition (the operator's concept, honest)", () => {
  it("renders the concept's four provider cards — Stripe highlighted + the catalogue entries", () => {
    render(<PaySwapConsoleSections sectionId="connections" />);
    // The four concept cards, by name.
    for (const label of [
      "Stripe",
      "Paystack",
      "Stellar testnet (onchain rail)",
      "PayPal",
      "Adyen",
      "Blockchain wallet",
    ]) {
      expect(screen.getByRole("heading", { level: 3, name: label })).toBeDefined();
    }
    // The concept card lines, verbatim.
    expect(screen.getByText("Create or connect an account, then verify it.")).toBeDefined();
    expect(screen.getByText("Shown as catalogue entry until verified.")).toBeDefined();
    expect(screen.getByText("Provider-specific prerequisites shown.")).toBeDefined();
    expect(screen.getByText("Separate wallet and signing permissions.")).toBeDefined();
    // The highlighted Stripe card + its primary action.
    expect(document.querySelector(".ps-connections-card--primary")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Connect Stripe" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Continue securely" })).toBeDefined();
    // The P22-B declared-provider cards: the honest typed-prerequisite
    // connect cards (never a connected state).
    expect(
      screen.getByRole("button", { name: "Connect Paystack" }),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Connect Stellar testnet" }),
    ).toBeDefined();
    expect(
      screen.getByText(/verified by a read-only transactions probe/i),
    ).toBeDefined();
    expect(
      screen.getByText(/verified by a read-only Horizon account read/i),
    ).toBeDefined();
    // The registry honesty note.
    expect(
      screen.getByText(/registry declares Stripe \(ADR-0007 D5\), Paystack/),
    ).toBeDefined();
  });

  it("the declared-UX-surface providers Explore honestly — the router never guesses", async () => {
    render(<PaySwapConsoleSections sectionId="connections" />);
    // All three Explore controls are real, enabled buttons.
    const exploreButtons = screen.getAllByRole("button", { name: "Explore setup" });
    expect(exploreButtons.length).toBe(3);
    for (const button of exploreButtons) {
      expect((button as HTMLButtonElement).disabled).toBe(false);
    }
    // No connected state is ever fabricated.
    expect(screen.queryByText(/^Connected$/)).toBeNull();
    // Exploring PayPal puts the provider mention in the EMBEDDED panel's
    // draft (visible, editable — never a fabricated user utterance).
    await act(async () => {
      fireEvent.click(exploreButtons[0]!);
    });
    const input = screen.getByLabelText("Ask the PaySwap agent") as HTMLTextAreaElement;
    expect(input.value).toBe("connect PayPal");
    // Sending yields the HONEST undeclared-provider reply.
    await act(async () => {
      fireEvent.submit(input.closest("form")!);
    });
    expect(
      await screen.findByText(
        /the declared providers are Stripe, Paystack and the Stellar testnet rail/i,
      ),
    ).toBeDefined();
    expect(screen.getByText(/I never guess a provider or a direction/i)).toBeDefined();
  });

  it("renders the concept's embedded PaySwap agent panel with the standing guidance", () => {
    render(<PaySwapConsoleSections sectionId="connections" />);
    expect(screen.getByRole("heading", { name: "PaySwap Agent" })).toBeDefined();
    // The concept's guided integration-type question, verbatim intent.
    expect(
      screen.getByText(/are you connecting an existing Stripe account, or creating a marketplace using Stripe Connect\?/i),
    ).toBeDefined();
    // The concept's input placeholder.
    expect(
      screen.getByPlaceholderText("Reply with text or describe your goal…"),
    ).toBeDefined();
  });

  it("renders the P13 secure-setup copy (the security laws, verbatim intent)", () => {
    render(<PaySwapConsoleSections sectionId="connections" />);
    expect(screen.getByText(/Expected domain: stripe\.com/)).toBeDefined();
    expect(screen.getByText("Stripe-hosted onboarding")).toBeDefined();
    expect(screen.getByText("Illustrative authorized session area")).toBeDefined();
    expect(screen.getByRole("heading", { level: 3, name: "Continue with Stripe" })).toBeDefined();
    expect(
      screen.getByText(/PaySwap will guide you through the provider.s official onboarding steps\./),
    ).toBeDefined();
    expect(
      screen.getByText(/You will authenticate directly with the provider/),
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
    // shared controller; the EMBEDDED panel (the concept's in-page
    // agent) renders it — the floating composer stays docked.
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
    // The embedded panel is the surface: the floating composer stays
    // docked (the entry rail remains visible — nothing covers the page).
    expect(
      screen.getByRole("navigation", { name: "PaySwap agent entry actions" }),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: "Minimize" })).toBeNull();
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
