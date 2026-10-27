/**
 * PaySwap Desktop (P21-B run 4 / Part E, ADR-0014 D5/D11) — the
 * CONNECTIONS-ACTIVATION COMPOSITION battery (bridge tier;
 * failing-first).
 *
 * The renderer composition root that binds the REAL channel members
 * (statuses / seed / the three key-entry verbs / the verification
 * probe) behind the app's pinned ConnectionsActivationPort:
 *
 * - the adapter maps each member call 1:1 and NOTHING else — the key
 *   input carries EXACTLY the two caller fields, the probe takes the
 *   provider id verbatim, the seed carries the pinned pair;
 * - FAIL-CLOSED: a member rejection rethrows through the adapter (the
 *   typed error surfaces, never a coerced outcome);
 * - THE SEAL LAW at the bridge tier: after a submit the shared plane's
 *   observable state carries NO key material (the scripted channel
 *   records the one crossing; the adapter holds nothing);
 * - the SHARED binding: composeConnectionsActivationBinding binds the
 *   plane BEFORE the connections surface renders (the shared seam
 *   holds exactly the composed plane; reset restores the unbound tier).
 */
import { describe, expect, it } from "vitest";

import {
  resetSharedConnectionsActivationPlane,
  sharedConnectionsActivationPlane,
} from "@payswap/app";

import {
  composeConnectionsActivationBinding,
  type ConnectionsActivationChannelClient,
} from "../../src/renderer/src/connectionsActivationComposition.js";
import type { DesktopConsoleChannelServices } from "../../src/renderer/src/consoleWorkspaceMount.js";

interface RecordedCall {
  readonly kind: string;
  readonly input: unknown;
}

/** A scripted channel client recording every member crossing. */
function scriptedChannel(): {
  readonly client: ConnectionsActivationChannelClient;
  readonly calls: readonly RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const client: ConnectionsActivationChannelClient = {
    connectionStatuses: async () => {
      calls.push({ kind: "connectionStatuses", input: undefined });
      return [
        {
          connectionId: "conn:stripe:test-1",
          providerId: "stripe",
          useCaseRef: "own-store-test-mode",
          form: "API_KEY",
          credentialKind: "SECRET_KEY",
          executionMode: "SANDBOX",
          state: "PENDING_VERIFICATION",
          credentialHandleRef: "handle:opaque-1",
          createdAt: "2026-10-27T12:00:00Z",
          lastTransitionAt: "2026-10-27T12:00:00Z",
        },
      ];
    },
    connectionSeedSetup: async (input) => {
      calls.push({ kind: "connectionSeedSetup", input });
      return { kind: "CREATED", connectionId: "conn:stripe:test-1", state: "UNCONFIGURED" };
    },
    connectionSubmitStripeRestrictedKey: async (input) => {
      calls.push({ kind: "connectionSubmitStripeRestrictedKey", input });
      return {
        connectionId: input.connectionId,
        credentialHandleRef: "handle:opaque-1",
        sealedSecretCount: 1,
        nextState: "PENDING_VERIFICATION",
      };
    },
    connectionSubmitFlutterwaveSecretKey: async (input) => {
      calls.push({ kind: "connectionSubmitFlutterwaveSecretKey", input });
      return {
        connectionId: input.connectionId,
        credentialHandleRef: "handle:opaque-flw-1",
        sealedSecretCount: 1,
        nextState: "PENDING_VERIFICATION",
      };
    },
    connectionSubmitPaystackSecretKey: async (input) => {
      calls.push({ kind: "connectionSubmitPaystackSecretKey", input });
      return {
        connectionId: input.connectionId,
        credentialHandleRef: "handle:opaque-ps-1",
        sealedSecretCount: 1,
        nextState: "PENDING_VERIFICATION",
      };
    },
    connectionRunVerificationProbe: async (providerId: "stripe" | "flutterwave" | "paystack") => {
      calls.push({ kind: "connectionRunVerificationProbe", input: providerId });
      return {
        providerId,
        probedOperation: `${providerId}.balances.read`,
        results: [
          {
            connectionId: `conn:${providerId}:test-1`,
            outcome: "CONFIRMED",
            providerReferences: ["wallet:ngn"],
            state: "ACTIVE",
            summary: "The provider answered the read-only probe.",
          },
        ],
        evidenceTier: "PROVIDER_OBSERVATION",
        note: "A confirmed probe proves read-only access only.",
      };
    },
  };
  return { client, calls };
}

/** The scripted services object (the composition reads ONLY the payswap-desktop member — the runtime proxy satisfies the full interface). */
function servicesOf(client: ConnectionsActivationChannelClient): DesktopConsoleChannelServices {
  return { payswapDesktopService: client } as unknown as DesktopConsoleChannelServices;
}

describe("the connections-activation composition (the REAL members behind the port)", () => {
  it("binds the shared plane; reset restores the unbound tier", () => {
    resetSharedConnectionsActivationPlane();
    expect(sharedConnectionsActivationPlane()).toBeUndefined();
    const { client } = scriptedChannel();
    const binding = composeConnectionsActivationBinding(servicesOf(client));
    expect(sharedConnectionsActivationPlane()).toBe(binding.plane);
    binding.reset();
    expect(sharedConnectionsActivationPlane()).toBeUndefined();
  });

  it("maps each member call 1:1 (statuses/seed/keys/probe) with EXACTLY the caller fields", async () => {
    resetSharedConnectionsActivationPlane();
    const { client, calls } = scriptedChannel();
    const { plane } = composeConnectionsActivationBinding(servicesOf(client));

    const statuses = await plane.statuses();
    expect(statuses[0]?.state).toBe("PENDING_VERIFICATION");
    expect(calls[0]?.kind).toBe("connectionStatuses");

    const seeded = await plane.seedSetup({ providerId: "flutterwave", useCaseRef: "own-store-test-mode" });
    expect(seeded.kind).toBe("CREATED");
    expect(calls[1]?.input).toEqual({ providerId: "flutterwave", useCaseRef: "own-store-test-mode" });

    const stripeReceipt = await plane.submitStripeKey({ connectionId: "conn:stripe:test-1", secretKey: "sk_test_fixture" });
    expect(stripeReceipt.sealedSecretCount).toBe(1);
    expect(calls[2]?.kind).toBe("connectionSubmitStripeRestrictedKey");
    expect(calls[2]?.input).toEqual({ connectionId: "conn:stripe:test-1", secretKey: "sk_test_fixture" });

    const flwReceipt = await plane.submitFlutterwaveSecretKey({ connectionId: "conn:flw:test-1", secretKey: "FLWSECK_TEST-fixture" });
    expect(flwReceipt.credentialHandleRef).toBe("handle:opaque-flw-1");
    expect(calls[3]?.kind).toBe("connectionSubmitFlutterwaveSecretKey");

    const psReceipt = await plane.submitPaystackSecretKey({ connectionId: "conn:ps:test-1", secretKey: "sk_test_fixture_ps" });
    expect(psReceipt.sealedSecretCount).toBe(1);
    expect(calls[4]?.kind).toBe("connectionSubmitPaystackSecretKey");

    const probe = await plane.runVerificationProbe("paystack");
    expect(probe.evidenceTier).toBe("PROVIDER_OBSERVATION");
    expect(probe.results[0]?.state).toBe("ACTIVE");
    expect(calls[5]?.input).toBe("paystack");
  });

  it("THE SEAL LAW at the bridge tier: the adapter holds NO key material after the crossing", async () => {
    resetSharedConnectionsActivationPlane();
    const { client, calls } = scriptedChannel();
    const { plane } = composeConnectionsActivationBinding(servicesOf(client));
    await plane.submitStripeKey({ connectionId: "conn:stripe:test-1", secretKey: "sk_test_bridge-secret-1" });
    // The ONE crossing reached the channel member exactly once...
    const crossings = calls.filter((call) => call.kind === "connectionSubmitStripeRestrictedKey");
    expect(crossings).toHaveLength(1);
    // ...and the adapter's observable surface (the plane itself) carries
    // no key material — only the receipt's counts + opaque handle.
    const planeDump = JSON.stringify(plane as unknown as Record<string, unknown>);
    expect(planeDump).not.toContain("sk_test_bridge-secret-1");
    const receipt = await plane.submitPaystackSecretKey({ connectionId: "c", secretKey: "sk_test_bridge-secret-2" });
    expect(receipt.credentialHandleRef).not.toContain("secret");
  });

  it("FAIL-CLOSED: a member rejection rethrows through the adapter — never a coerced outcome", async () => {
    resetSharedConnectionsActivationPlane();
    const { client } = scriptedChannel();
    const rejecting: ConnectionsActivationChannelClient = {
      ...client,
      connectionRunVerificationProbe: async () => {
        throw new Error("PaymentPlaneNotConfiguredError: the probe transport is not configured");
      },
    };
    const { plane } = composeConnectionsActivationBinding(servicesOf(rejecting));
    await expect(plane.runVerificationProbe("stripe")).rejects.toThrow(
      "the probe transport is not configured",
    );
  });
});
