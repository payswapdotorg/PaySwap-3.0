import { describe, expect, it } from "vitest";
import {
  evaluateRecipientChange,
  runFreshConditionsGate,
  runRecipientAuthorizationGate,
} from "../src/index.ts";
import type {
  AuthorizationSnapshot,
  PostChangeDisplay,
  RecipientChangeObservation,
} from "../src/index.ts";
import { FIXTURE_NOW } from "./fixtures.ts";

/**
 * Hard laws 4 + 5 — a recipient change after quote/eligibility
 * invalidates prior authorization and forces fresh eligibility + fresh
 * quote conditions; eligibility/quote freshness is carried with the
 * state that displays it (stale display is a certification failure).
 */
function authorizationFixture(): AuthorizationSnapshot {
  return {
    authorizationId: "auth:payment-1",
    boundRecipientId: "recipient:original",
    approvedQuoteRef: "quote:conditions-1",
    eligibilityObservationVersion: 3,
    quoteVersion: 5,
    status: "ACTIVE",
  };
}

function recipientChangeFixture(): RecipientChangeObservation {
  return {
    changeId: "change:recipient-1",
    kind: "RECIPIENT_CHANGED",
    newRecipientId: "recipient:new",
    detectedAt: FIXTURE_NOW,
  };
}

function honestDisplayFixture(): PostChangeDisplay {
  return {
    carriesPriorAuthorization: false,
    eligibility: {
      observationVersion: 4,
      subjectRecipientId: "recipient:new",
      observedAt: "2026-10-20T12:05:00Z",
    },
    quote: {
      quoteVersion: 6,
      subjectRecipientId: "recipient:new",
      freshness: "VALID",
      issuedAt: "2026-10-20T12:06:00Z",
    },
  };
}

describe("hard law 4: authorized recipient changes invalidate prior authorization", () => {
  it("a change to a DIFFERENT recipient always INVALIDATES — fresh eligibility + fresh quote conditions required", () => {
    const disposition = evaluateRecipientChange({
      authorization: authorizationFixture(),
      change: recipientChangeFixture(),
    });
    expect(disposition.outcome).toBe("INVALIDATED");
    if (disposition.outcome === "INVALIDATED") {
      expect(disposition.freshEligibilityRequired).toBe(true);
      expect(disposition.freshQuoteConditionsRequired).toBe(true);
    }
  });

  it("the same recipient is NO_CHANGE — the authorization stands", () => {
    const disposition = evaluateRecipientChange({
      authorization: authorizationFixture(),
      change: { ...recipientChangeFixture(), newRecipientId: "recipient:original" },
    });
    expect(disposition.outcome).toBe("NO_CHANGE");
  });

  it("a surface that still carries prior authorization after the change FAILS (never silently carry)", () => {
    const result = runRecipientAuthorizationGate({
      authorization: authorizationFixture(),
      change: recipientChangeFixture(),
      display: { ...honestDisplayFixture(), carriesPriorAuthorization: true },
    });
    expect(result.passed).toBe(false);
    expect(result.law).toBe("recipient-authorization");
    expect(
      result.violations.some(
        (violation) => violation.code === "stale_authorization_carried",
      ),
    ).toBe(true);
  });

  it("a surface displaying eligibility for the PRIOR recipient fails reverification", () => {
    const result = runRecipientAuthorizationGate({
      authorization: authorizationFixture(),
      change: recipientChangeFixture(),
      display: {
        carriesPriorAuthorization: false,
        eligibility: {
          ...honestDisplayFixture().eligibility,
          subjectRecipientId: "recipient:original",
        },
        quote: honestDisplayFixture().quote,
      },
    });
    expect(result.passed).toBe(false);
    expect(
      result.violations.some(
        (violation) => violation.code === "reverification_not_fresh",
      ),
    ).toBe(true);
  });

  it("an honest post-change display passes; determinism holds", () => {
    const input = {
      authorization: authorizationFixture(),
      change: recipientChangeFixture(),
      display: honestDisplayFixture(),
    };
    const result = runRecipientAuthorizationGate(input);
    expect(result.passed).toBe(true);
    expect(result.digest).toBe(runRecipientAuthorizationGate(input).digest);
  });
});

describe("hard law 5: fresh eligibility and quote conditions carried with the display", () => {
  it("an honest fresh display passes; determinism holds", () => {
    const input = {
      authorization: authorizationFixture(),
      change: recipientChangeFixture(),
      display: honestDisplayFixture(),
    };
    const result = runFreshConditionsGate(input);
    expect(result.passed).toBe(true);
    expect(result.digest).toBe(runFreshConditionsGate(input).digest);
  });

  it("eligibility about the OLD recipient is a stale display — a certification failure", () => {
    const result = runFreshConditionsGate({
      authorization: authorizationFixture(),
      change: recipientChangeFixture(),
      display: {
        ...honestDisplayFixture(),
        eligibility: {
          ...honestDisplayFixture().eligibility,
          subjectRecipientId: "recipient:original",
        },
      },
    });
    expect(result.passed).toBe(false);
    expect(
      result.violations.filter(
        (violation) => violation.code === "stale_eligibility_displayed",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("eligibility observed BEFORE the change was detected is stale (freshness is carried)", () => {
    const result = runFreshConditionsGate({
      authorization: authorizationFixture(),
      change: recipientChangeFixture(),
      display: {
        ...honestDisplayFixture(),
        eligibility: {
          observationVersion: 3,
          subjectRecipientId: "recipient:new",
          observedAt: "2026-10-20T11:00:00Z",
        },
      },
    });
    expect(result.passed).toBe(false);
    expect(
      result.violations.some(
        (violation) => violation.code === "stale_eligibility_displayed",
      ),
    ).toBe(true);
  });

  it("a quote issued for the OLD recipient is a stale display", () => {
    const result = runFreshConditionsGate({
      authorization: authorizationFixture(),
      change: recipientChangeFixture(),
      display: {
        ...honestDisplayFixture(),
        quote: {
          ...honestDisplayFixture().quote,
          subjectRecipientId: "recipient:original",
        },
      },
    });
    expect(result.passed).toBe(false);
    expect(
      result.violations.some(
        (violation) => violation.code === "stale_quote_conditions_displayed",
      ),
    ).toBe(true);
  });

  it("an EXPIRED quote is never displayed as current terms (the expiry arm is pinned)", () => {
    const result = runFreshConditionsGate({
      authorization: authorizationFixture(),
      change: recipientChangeFixture(),
      display: {
        ...honestDisplayFixture(),
        quote: { ...honestDisplayFixture().quote, freshness: "EXPIRED" },
      },
    });
    expect(result.passed).toBe(false);
    expect(
      result.violations.some(
        (violation) => violation.code === "expired_quote_displayed",
      ),
    ).toBe(true);
  });

  it("no recipient change: the prior display stands (freshness law scoped to the change)", () => {
    const result = runFreshConditionsGate({
      authorization: authorizationFixture(),
      change: { ...recipientChangeFixture(), newRecipientId: "recipient:original" },
      display: {
        carriesPriorAuthorization: true,
        eligibility: {
          observationVersion: 3,
          subjectRecipientId: "recipient:original",
          observedAt: "2026-10-20T11:00:00Z",
        },
        quote: {
          quoteVersion: 5,
          subjectRecipientId: "recipient:original",
          freshness: "VALID",
          issuedAt: "2026-10-20T11:00:00Z",
        },
      },
    });
    expect(result.passed).toBe(true);
  });
});
