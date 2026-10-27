/**
 * @payswap/app — the CONNECTIONS ACTIVATION panel battery (P21-B run 4 /
 * Part E, ADR-0014 D5/D6/D11; failing-first).
 *
 * The real key-entry + verification-probe surface, machine-checked
 * against the REAL component over a scripted port (jsdom; deterministic
 * — no network, no clock):
 *
 * - the honest UNBOUND note renders when no host plane is bound (the
 *   web tier) and NO activation cards render in that tier;
 * - a bound plane renders the three provider cards with the authority's
 *   own state pills (statuses read on mount);
 * - the seed law: Connect seeds the setup (the pinned providerId +
 *   useCaseRef) and a REFUSED outcome renders the reason verbatim;
 * - THE SEAL LAW: the key crosses ONCE through the port member, the
 *   input CLEARS, the receipt renders counts + the opaque handle only,
 *   and NO key material survives anywhere in the DOM after submit;
 * - the probe law: Verify runs the REAL member and renders the outcome
 *   with its PROVIDER_OBSERVATION tier label, the per-connection
 *   results and the honest notes;
 * - the error law: a rejecting member renders the honest error line
 *   (never a mask, never a fake success).
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";

import { ConnectionsActivationPanel } from "../../src/console/sections/ConnectionsActivationPanel.js";
import {
  CONNECTIONS_ACTIVATION_SEAL_NOTE,
  CONNECTIONS_ACTIVATION_TIER_NOTE,
  CONNECTIONS_ACTIVATION_UNBOUND_NOTE,
  type ConnectionsActivationPort,
  type ConnectionsProbeOutcomePin,
  type ConnectionsSealReceiptPin,
} from "../../src/console/connectionsActivationPins.js";
import {
  bindSharedConnectionsActivationPlane,
  resetSharedConnectionsActivationPlane,
} from "../../src/console/connectionsActivationShared.js";

const FAKE_KEY = "sk_test_fixture-key-material-never-real";

afterEach(() => {
  resetSharedConnectionsActivationPlane();
  cleanup();
});

/** A fully scripted port (every call recorded; deterministic outcomes). */
function scriptedPort(overrides?: Partial<ConnectionsActivationPort>): {
  readonly port: ConnectionsActivationPort;
  readonly calls: { readonly kind: string; readonly input: unknown }[];
} {
  const calls: { kind: string; input: unknown }[] = [];
  const receipt: ConnectionsSealReceiptPin = {
    connectionId: "conn:stripe:test-1",
    credentialHandleRef: "handle:opaque-1",
    sealedSecretCount: 1,
    nextState: "PENDING_VERIFICATION",
  };
  const port: ConnectionsActivationPort = {
    statuses: async () => [
      { connectionId: "conn:stripe:test-1", providerId: "stripe", useCaseRef: "own-store-test-mode", state: "PENDING_VERIFICATION", lastTransitionAt: "2026-10-27T12:00:00Z" },
    ],
    seedSetup: async (input) => {
      calls.push({ kind: "seedSetup", input });
      return { kind: "CREATED", connectionId: "conn:stripe:test-1", state: "UNCONFIGURED" };
    },
    submitStripeKey: async (input) => {
      calls.push({ kind: "submitStripeKey", input });
      return receipt;
    },
    submitFlutterwaveSecretKey: async (input) => {
      calls.push({ kind: "submitFlutterwaveSecretKey", input });
      return { ...receipt, connectionId: "conn:flutterwave:test-1" };
    },
    submitPaystackSecretKey: async (input) => {
      calls.push({ kind: "submitPaystackSecretKey", input });
      return { ...receipt, connectionId: "conn:paystack:test-1" };
    },
    runVerificationProbe: async (providerId) => {
      calls.push({ kind: "runVerificationProbe", input: providerId });
      const outcome: ConnectionsProbeOutcomePin = {
        providerId,
        probedOperation: `${providerId}.balances.read`,
        results: [
          {
            connectionId: `conn:${providerId}:test-1`,
            outcome: "CONFIRMED",
            providerReferences: ["wallet:ngn", "wallet:usd"],
            state: "ACTIVE",
            summary: "The provider answered the read-only probe.",
          },
        ],
        evidenceTier: "PROVIDER_OBSERVATION",
        note: "A confirmed probe proves read-only access only.",
      };
      return outcome;
    },
    ...overrides,
  };
  return { port, calls };
}

describe("Part E — the connections activation panel", () => {
  it("renders the honest UNBOUND note VERBATIM when no host plane is bound — and no activation cards", () => {
    const { container } = render(<ConnectionsActivationPanel />);
    expect(container.textContent).toContain(CONNECTIONS_ACTIVATION_UNBOUND_NOTE);
    expect(container.querySelector('[data-testid="ps-connections-activation"]')).toBeNull();
  });

  it("a bound plane renders the three provider cards with the authority's own state pills", async () => {
    const { port } = scriptedPort();
    bindSharedConnectionsActivationPlane(port);
    const { container } = render(<ConnectionsActivationPanel />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="ps-connections-activation"]')).not.toBeNull();
    });
    for (const provider of ["stripe", "flutterwave", "paystack"]) {
      expect(container.querySelector(`[data-testid="ps-connections-activation-${provider}"]`)).not.toBeNull();
    }
    // The statuses read surfaces the authority's own state (never a UI assertion).
    await waitFor(() => {
      expect(screen.getAllByText("PENDING_VERIFICATION").length).toBeGreaterThan(0);
    });
  });

  it("the seed law: Connect seeds the pinned (providerId, useCaseRef); a REFUSED outcome renders the reason", async () => {
    const calls: { kind: string; input: unknown }[] = [];
    const { port } = scriptedPort({
      seedSetup: async (input) => {
        calls.push({ kind: "seedSetup", input });
        return { kind: "REFUSED", reason: "the exact missing operator configuration" };
      },
    });
    bindSharedConnectionsActivationPlane(port);
    const { container } = render(<ConnectionsActivationPanel />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="ps-connections-seed-flutterwave"]')).not.toBeNull();
    });
    fireEvent.click(container.querySelector('[data-testid="ps-connections-seed-flutterwave"]')!);
    await waitFor(() => {
      expect(screen.getByTestId("ps-connections-error-flutterwave").textContent).toContain(
        "the exact missing operator configuration",
      );
    });
    expect(calls[0]?.kind).toBe("seedSetup");
    expect(calls[0]?.input).toEqual({ providerId: "flutterwave", useCaseRef: "own-store-test-mode" });
  });

  it("THE SEAL LAW: the key crosses once, the input clears, the receipt renders counts+handle only, and NO key material survives in the DOM", async () => {
    const { port, calls } = scriptedPort();
    bindSharedConnectionsActivationPlane(port);
    const { container } = render(<ConnectionsActivationPanel />);
    await waitFor(() => {
      expect(screen.getAllByTestId("ps-connections-key-input-stripe").length).toBeGreaterThan(0);
    });
    const input = screen.getByTestId("ps-connections-key-input-stripe") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: FAKE_KEY } });
    });
    fireEvent.click(screen.getByTestId("ps-connections-key-submit-stripe"));
    await waitFor(() => {
      expect(screen.getByTestId("ps-connections-receipt-stripe").textContent).toContain("Sealed 1 secret");
    });
    // The ONE material path: the member carried exactly {connectionId, secretKey}.
    const submitCall = calls.find((call) => call.kind === "submitStripeKey");
    expect(submitCall?.input).toEqual({ connectionId: "conn:stripe:test-1", secretKey: FAKE_KEY });
    // The input CLEARED.
    expect((screen.getByTestId("ps-connections-key-input-stripe") as HTMLInputElement).value).toBe("");
    // NO key material anywhere in the DOM after submit.
    expect(container.innerHTML).not.toContain(FAKE_KEY);
    // The seal note renders with the form.
    expect(container.textContent).toContain(CONNECTIONS_ACTIVATION_SEAL_NOTE);
  });

  it("the probe law: Verify runs the member and renders the tier label + results + the honest notes", async () => {
    const { port, calls } = scriptedPort();
    bindSharedConnectionsActivationPlane(port);
    const { container } = render(<ConnectionsActivationPanel />);
    // The honest flow: seed FIRST (the probe controls render only on a
    // seeded connection), then verify.
    await waitFor(() => {
      expect(container.querySelector('[data-testid="ps-connections-seed-paystack"]')).not.toBeNull();
    });
    fireEvent.click(container.querySelector('[data-testid="ps-connections-seed-paystack"]')!);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="ps-connections-probe-paystack"]')).not.toBeNull();
    });
    fireEvent.click(container.querySelector('[data-testid="ps-connections-probe-paystack"]')!);
    await waitFor(() => {
      expect(screen.getByTestId("ps-connections-probe-outcome-paystack")).not.toBeNull();
    });
    const outcome = screen.getByTestId("ps-connections-probe-outcome-paystack");
    expect(outcome.textContent).toContain("PROVIDER_OBSERVATION");
    expect(outcome.textContent).toContain("CONFIRMED");
    expect(outcome.textContent).toContain("2 provider references");
    expect(outcome.textContent).toContain(CONNECTIONS_ACTIVATION_TIER_NOTE);
    expect(calls.find((call) => call.kind === "runVerificationProbe")?.input).toBe("paystack");
  });

  it("the error law: a rejecting member renders the honest error line — never a fake success", async () => {
    const { port } = scriptedPort({
      runVerificationProbe: async () => {
        throw new Error("PaymentPlaneNotConfiguredError: the probe transport is not configured");
      },
    });
    bindSharedConnectionsActivationPlane(port);
    const { container } = render(<ConnectionsActivationPanel />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="ps-connections-probe-stripe"]')).not.toBeNull();
    });
    fireEvent.click(container.querySelector('[data-testid="ps-connections-probe-stripe"]')!);
    await waitFor(() => {
      expect(screen.getByTestId("ps-connections-error-stripe").textContent).toContain(
        "the probe transport is not configured",
      );
    });
    expect(container.querySelector('[data-testid="ps-connections-probe-outcome-stripe"]')).toBeNull();
  });
});
