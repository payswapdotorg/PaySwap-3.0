/**
 * @payswap/app — the TYPED INTENT ROUTER tests (P13-A, ADR-0007 D7).
 *
 * The router is DETERMINISTIC PHRASE CLASSIFICATION (never an LLM,
 * never a guess) — these tests pin the classification law on REAL
 * phrases, including the two convergence phrases the work order names
 * ("connect Stripe", "pay the supplier"), ambiguous cases (two
 * directions; a setup verb without a declared provider) and negative
 * cases (never a guessed provider or direction; no task for
 * unresolvable text).
 */
import { describe, expect, it } from "vitest";

import {
  AGENT_INTENT_UNKNOWN_REPLY,
  routeAgentText,
} from "../../src/agent/intentRouter.js";

describe("connection routing — the declared providers", () => {
  it("routes 'connect Stripe' to the Stripe setup intent with the ADR default form", () => {
    expect(routeAgentText("connect Stripe")).toEqual({
      kind: "CONNECTION_SETUP",
      providerId: "stripe",
      providerLabel: "Stripe",
      form: "SCOPED_API_CREDENTIAL",
      useCaseRef: "own-store-test-mode",
    });
  });

  it("is case- and punctuation-insensitive ('Connect STRIPE!')", () => {
    expect(routeAgentText("Connect STRIPE!").kind).toBe("CONNECTION_SETUP");
    expect(routeAgentText("Connect STRIPE!").providerId).toBe("stripe");
  });

  it("routes setup synonyms — link / set up / onboard / grant", () => {
    for (const text of [
      "link my Stripe account",
      "set up stripe for the store",
      "onboard Stripe",
      "grant PaySwap access to my Stripe account",
    ]) {
      const routed = routeAgentText(text);
      expect(routed.kind, text).toBe("CONNECTION_SETUP");
      if (routed.kind === "CONNECTION_SETUP") {
        expect(routed.providerId, text).toBe("stripe");
        expect(routed.form, text).toBe("SCOPED_API_CREDENTIAL");
      }
    }
  });

  it("selects the marketplace integration type from its qualifier phrases", () => {
    for (const text of [
      "set up a Stripe Connect marketplace",
      "connect Stripe to onboard sellers",
      "connect stripe marketplace",
    ]) {
      const routed = routeAgentText(text);
      expect(routed.kind, text).toBe("CONNECTION_SETUP");
      if (routed.kind === "CONNECTION_SETUP") {
        expect(routed.form, text).toBe("CONNECTED_ACCOUNT");
        expect(routed.useCaseRef, text).toBe("marketplace-onboarding");
      }
    }
  });

  it("selects the delegated-OAuth integration type from its qualifier phrases", () => {
    for (const text of [
      "connect my existing Stripe account",
      "connect Stripe via OAuth",
      "authorize my Stripe account for PaySwap",
    ]) {
      const routed = routeAgentText(text);
      expect(routed.kind, text).toBe("CONNECTION_SETUP");
      if (routed.kind === "CONNECTION_SETUP") {
        expect(routed.form, text).toBe("DELEGATED_OAUTH");
        expect(routed.useCaseRef, text).toBe("existing-account-grant");
      }
    }
  });

  it("treats direction words inside a setup request as purpose, not a second intent", () => {
    const routed = routeAgentText("connect Stripe to receive payments");
    expect(routed.kind).toBe("CONNECTION_SETUP");
  });
});

describe("payment routing — the four directions", () => {
  it("routes 'pay the supplier' to the PAY payment mission", () => {
    expect(routeAgentText("pay the supplier")).toEqual({
      kind: "PAYMENT_MISSION",
      direction: "PAY",
      goalStatement: "pay the supplier",
    });
  });

  it("routes each direction from real phrases", () => {
    const cases: readonly [string, "PAY" | "RECEIVE" | "MOVE" | "CONVERT"][] = [
      ["pay the quarterly invoice", "PAY"],
      ["make a payment to the supplier", "PAY"],
      ["send money to the printer", "PAY"],
      ["paying the supplier today", "PAY"],
      ["receive a payment from the shop", "RECEIVE"],
      ["collect the payment from the buyer", "RECEIVE"],
      ["get paid for the invoice", "RECEIVE"],
      ["request money from the client", "RECEIVE"],
      ["move funds to the savings account", "MOVE"],
      ["transfer money to my other account", "MOVE"],
      ["convert USD to EUR", "CONVERT"],
      ["swap dollars for euros", "CONVERT"],
      ["exchange currency for the payout", "CONVERT"],
    ];
    for (const [text, direction] of cases) {
      const routed = routeAgentText(text);
      expect(routed.kind, text).toBe("PAYMENT_MISSION");
      if (routed.kind === "PAYMENT_MISSION") {
        expect(routed.direction, text).toBe(direction);
        expect(routed.goalStatement, text).toBe(text);
      }
    }
  });

  it("a provider mention without a setup verb stays a payment intent (never a connection)", () => {
    const routed = routeAgentText("pay the supplier with Stripe");
    expect(routed.kind).toBe("PAYMENT_MISSION");
    if (routed.kind === "PAYMENT_MISSION") {
      expect(routed.direction).toBe("PAY");
    }
  });

  it("the word PaySwap never triggers the convert stem ('swap')", () => {
    expect(routeAgentText("what can PaySwap do").kind).toBe("UNKNOWN");
  });
});

describe("UNKNOWN — the honest never-guessing law", () => {
  it("answers unresolvable text with the capability reply (names what it can do)", () => {
    for (const text of [
      "",
      "   ",
      "what's the weather tomorrow",
      "write me a poem",
      "payment for the invoice",
    ]) {
      const routed = routeAgentText(text);
      expect(routed.kind, text).toBe("UNKNOWN");
      if (routed.kind === "UNKNOWN") {
        expect(routed.reply, text).toBe(AGENT_INTENT_UNKNOWN_REPLY);
        expect(routed.reply).toContain("I can route payment and connection requests");
      }
    }
  });

  it("never guesses a direction when two directions are named", () => {
    for (const text of [
      "pay and convert",
      "receive a payment or collect and move funds",
      "money in and money out",
    ]) {
      expect(routeAgentText(text).kind, text).toBe("UNKNOWN");
    }
  });

  it("never guesses a provider — undeclared providers stay UNKNOWN", () => {
    for (const text of [
      "connect PayPal",
      "connect Wise",
      "link my MoMo account",
      "set up Adyen",
    ]) {
      const routed = routeAgentText(text);
      expect(routed.kind, text).toBe("UNKNOWN");
      if (routed.kind === "UNKNOWN") {
        expect(routed.reply).toContain("Stripe is the one provider declared in this deployment");
      }
    }
  });

  it("a setup verb without any provider, and a provider mention without a setup verb, stay UNKNOWN", () => {
    expect(routeAgentText("connect a provider").kind).toBe("UNKNOWN");
    expect(routeAgentText("stripe").kind).toBe("UNKNOWN");
    expect(routeAgentText("tell me about Stripe pricing").kind).toBe("UNKNOWN");
  });

  it("is deterministic — the same text always routes identically", () => {
    for (const text of ["connect Stripe", "pay the supplier", "hello there"]) {
      const first = JSON.stringify(routeAgentText(text));
      const second = JSON.stringify(routeAgentText(text));
      expect(second).toBe(first);
    }
  });
});
