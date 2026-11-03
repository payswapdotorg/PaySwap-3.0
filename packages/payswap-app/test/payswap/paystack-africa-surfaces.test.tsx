// @vitest-environment jsdom
/**
 * The Paystack Africa journey surfaces (P27-C, net-new): the Africa
 * Extended Network onboarding links (the V6-verified paystack.com/stripe/*
 * URLs), the collection-journey declaration, the K3/K4-gated recipient
 * declaration, the router's Paystack qualifier resolution (the collection
 * and Africa local-rails journeys route through the SAME connection form
 * — never a dead button), and the activation panel's Africa card (its one
 * action seeds the same own-store test-mode connection journey; the
 * onboarding links are external anchors that never connect anything).
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";

import { PaystackAfricaCollectionCard } from "../../src/console/sections/PaystackAfricaCollectionCard.js";
import { ConnectionsActivationPanel } from "../../src/console/sections/ConnectionsActivationPanel.js";
import { routeAgentText } from "../../src/agent/intentRouter.js";
import {
  agentProviderEntry,
  agentProviderSetupCards,
} from "../../src/lib/agent-provider-entries.js";
import {
  PAYSTACK_AFRICA_ONBOARDING_LINKS,
  PAYSTACK_AFRICA_ONBOARDING_NOTE,
  PAYSTACK_AFRICA_K34_GATE_NOTE,
  PAYSTACK_COLLECTION_JOURNEY_DECLARATION,
  PAYSTACK_RECIPIENT_JOURNEY_DECLARATION,
  paystackAfricaOnboardingLinkFor,
} from "../../src/lib/paystack-africa-pins.js";
import {
  bindSharedConnectionsActivationPlane,
  resetSharedConnectionsActivationPlane,
} from "../../src/console/connectionsActivationShared.js";
import type { ConnectionsActivationPort } from "../../src/console/connectionsActivationPins.js";

afterEach(() => {
  resetSharedConnectionsActivationPlane();
  cleanup();
});

describe("the Africa Extended Network onboarding links (P27-C — the V6 facts)", () => {
  it("carries exactly the five verified markets with the V6 URLs and the dated evidence stamp", () => {
    expect(PAYSTACK_AFRICA_ONBOARDING_LINKS.map((link) => [link.market, link.onboardingUrl])).toEqual([
      ["GH", "https://paystack.com/stripe/ghana"],
      ["KE", "https://paystack.com/stripe/kenya"],
      ["NG", "https://paystack.com/stripe/nigeria"],
      ["ZA", "https://paystack.com/stripe/south-africa"],
      ["CI", "https://paystack.com/ci/"],
    ]);
    for (const link of PAYSTACK_AFRICA_ONBOARDING_LINKS) {
      expect(link.evidence.sourceUrl).toBe("https://stripe.com/global");
      expect(link.evidence.retrievedAt).toBe("2026-11-03");
    }
  });

  it("resolves a known market's link and refuses an unknown market (never a guessed link)", () => {
    expect(paystackAfricaOnboardingLinkFor("KE")?.onboardingUrl).toBe(
      "https://paystack.com/stripe/kenya",
    );
    expect(paystackAfricaOnboardingLinkFor("US")).toBeUndefined();
    expect(paystackAfricaOnboardingLinkFor("")).toBeUndefined();
  });

  it("the collection and recipient declarations carry the honest capability states", () => {
    expect(PAYSTACK_COLLECTION_JOURNEY_DECLARATION.useCaseRef).toBe("own-store-test-mode");
    expect(PAYSTACK_COLLECTION_JOURNEY_DECLARATION.capabilityState).toContain(
      "never money movement by itself",
    );
    expect(PAYSTACK_COLLECTION_JOURNEY_DECLARATION.purposeLaw).toContain("INV-30");
    expect(PAYSTACK_RECIPIENT_JOURNEY_DECLARATION.reVerificationStatus).toBe("OPERATOR_GATED");
    expect(PAYSTACK_RECIPIENT_JOURNEY_DECLARATION.capabilityState).toContain("UNVERIFIED");
    expect(PAYSTACK_AFRICA_K34_GATE_NOTE).toContain("not a silent pass");
  });
});

describe("the router's Paystack qualifiers (P27-C — the journey routes, never a dead button)", () => {
  it("the collection journey routes through the SAME connection form and use case", () => {
    const routed = routeAgentText("connect paystack collection");
    expect(routed.kind).toBe("CONNECTION_SETUP");
    if (routed.kind !== "CONNECTION_SETUP") {
      return;
    }
    expect(routed.providerId).toBe("paystack");
    expect(routed.form).toBe("SCOPED_API_CREDENTIAL");
    expect(routed.useCaseRef).toBe("own-store-test-mode");
  });

  it("the hosted-page phrasing routes to the collection journey too", () => {
    const routed = routeAgentText("set up paystack payment page");
    expect(routed.kind).toBe("CONNECTION_SETUP");
  });

  it("the Africa local-rails journey routes through the same form (ghana phrasing)", () => {
    const routed = routeAgentText("connect paystack ghana");
    expect(routed.kind).toBe("CONNECTION_SETUP");
    if (routed.kind !== "CONNECTION_SETUP") {
      return;
    }
    expect(routed.providerId).toBe("paystack");
    expect(routed.form).toBe("SCOPED_API_CREDENTIAL");
    expect(routed.useCaseRef).toBe("own-store-test-mode");
  });

  it("the mobile-money phrasing routes to the Africa local-rails journey", () => {
    const routed = routeAgentText("connect paystack mobile money");
    expect(routed.kind).toBe("CONNECTION_SETUP");
  });

  it("a plain paystack connect still routes to the default own-store journey", () => {
    const routed = routeAgentText("connect paystack");
    expect(routed.kind).toBe("CONNECTION_SETUP");
  });

  it("the qualifier cards exist as declarations (the entry carries both new journeys)", () => {
    const entry = agentProviderEntry("paystack");
    expect(entry).toBeDefined();
    const cards = agentProviderSetupCards().filter((card) => card.providerId === "paystack");
    expect(cards.map((card) => card.cardTitle)).toEqual([
      "Paystack — own-store payments (test mode)",
      "Paystack — local collection (test mode)",
      "Paystack — Africa local rails (per-country business)",
    ]);
  });
});

describe("the Paystack Africa collection card (P27-C — the render surface)", () => {
  it("renders the collection declaration, the K3/K4 gate note and the onboarding links as anchors", () => {
    const seeds: readonly { readonly providerId: string; readonly useCaseRef: string }[] = [];
    render(
      <PaystackAfricaCollectionCard
        onSeedConnection={() => {
          seeds.push({ providerId: "recorded-by-panel", useCaseRef: "own-store-test-mode" });
        }}
      />,
    );
    expect(screen.getByTestId("ps-connections-activation-paystack-africa")).toBeTruthy();
    expect(screen.getByTestId("ps-connections-paystack-africa-k34-note").textContent).toContain(
      "UNVERIFIED",
    );
    const ghana = screen.getByTestId("ps-connections-paystack-africa-link-GH");
    expect(ghana.getAttribute("href")).toBe("https://paystack.com/stripe/ghana");
    expect(ghana.getAttribute("target")).toBe("_blank");
    const ci = screen.getByTestId("ps-connections-paystack-africa-link-CI");
    expect(ci.getAttribute("href")).toBe("https://paystack.com/ci/");
    expect(screen.getByText(PAYSTACK_AFRICA_ONBOARDING_NOTE)).toBeTruthy();
    fireEvent.click(screen.getByTestId("ps-connections-seed-paystack-africa"));
    expect(seeds.length).toBe(1);
  });
});

describe("the activation panel's Africa card (P27-C — the seed law over the shared plane)", () => {
  /** A scripted port recording every seedSetup call. */
  function scriptedPort(): { calls: { readonly providerId: string; readonly useCaseRef: string }[] } {
    const calls: { providerId: string; useCaseRef: string }[] = [];
    const port: ConnectionsActivationPort = {
      statuses: async () => [],
      seedSetup: async (input) => {
        calls.push({ providerId: input.providerId, useCaseRef: input.useCaseRef });
        return { kind: "CREATED", connectionId: "conn:paystack:test-1", state: "UNCONFIGURED" };
      },
      submitStripeKey: async () => {
        throw new Error("not used by this test");
      },
      submitFlutterwaveSecretKey: async () => {
        throw new Error("not used by this test");
      },
      submitPaystackSecretKey: async () => {
        throw new Error("not used by this test");
      },
      runVerificationProbe: async () => {
        throw new Error("not used by this test");
      },
    };
    bindSharedConnectionsActivationPlane(port);
    return { calls };
  }

  it("seeds the Paystack own-store test-mode journey through the shared port (never a dead button)", async () => {
    const { calls } = scriptedPort();
    render(<ConnectionsActivationPanel />);
    const seedButton = screen.getByTestId("ps-connections-seed-paystack-africa");
    expect(seedButton).toBeTruthy();
    await act(async () => {
      fireEvent.click(seedButton);
    });
    await waitFor(() => {
      expect(calls.length).toBe(1);
    });
    expect(calls[0]).toEqual({ providerId: "paystack", useCaseRef: "own-store-test-mode" });
  });
});
