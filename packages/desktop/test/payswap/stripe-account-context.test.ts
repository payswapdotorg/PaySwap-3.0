/**
 * PaySwap Desktop (P24-2, ADR-0017 D5 + handoff §2.3/§3.4/§9.4) — the
 * VERIFIED-EVIDENCE ACCOUNT-CONTEXT resolver battery: account context
 * resolves ONLY from a persisted ACTIVE U1 connection with CONFIRMED
 * probe evidence — never from model/user text, never for U2/U3
 * (UNCONFIGURED, honestly declared), never LIVE (INV-25), never from
 * evidence that predates the credential seal (the rotation freshness
 * law).
 */

import { describe, expect, it } from "vitest";
import { accountContextResolverOver, connectionRecordOf, probeEvidenceOf } from "./stripe-action-fixtures.js";

describe("the account-context resolver (verified evidence ONLY)", () => {
  it("resolves the U1 SANDBOX context from CONFIRMED evidence", async () => {
    const resolver = accountContextResolverOver();
    const outcome = await resolver.resolve("conn:fake-stripe-1");
    expect(outcome).toEqual({
      ok: true,
      accountContext: {
        connectionId: "conn:fake-stripe-1",
        stripeAccountId: "acct_fake51stripeTestAcct1",
        accountModel: "OWN_ACCOUNT_RESTRICTED_KEY",
        environment: "SANDBOX",
      },
    });
  });

  it("refuses an empty connection id", async () => {
    const resolver = accountContextResolverOver();
    expect((await resolver.resolve("")).ok).toBe(false);
  });

  it("refuses a non-ACTIVE connection", async () => {
    const resolver = accountContextResolverOver({
      records: [connectionRecordOf({ state: "PENDING_VERIFICATION" })],
    });
    const outcome = await resolver.resolve("conn:fake-stripe-1");
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toContain("only an ACTIVE connection");
  });

  it("refuses a non-Stripe connection and an unknown one", async () => {
    const resolver = accountContextResolverOver({
      records: [connectionRecordOf({ providerId: "flutterwave" })],
    });
    expect((await resolver.resolve("conn:fake-stripe-1")).ok).toBe(false);
    expect((await resolver.resolve("conn:never-existed")).ok).toBe(false);
  });

  it("refuses U2/U3 honestly (declared UNCONFIGURED — never simulated)", async () => {
    const u2 = accountContextResolverOver({
      records: [connectionRecordOf({ useCaseRef: "existing-account-grant" })],
    });
    const u2Outcome = await u2.resolve("conn:fake-stripe-1");
    expect(u2Outcome.ok === false && u2Outcome.reason).toContain("U2 (delegated OAuth) is declared UNCONFIGURED");
    expect(u2Outcome.ok === false && u2Outcome.reason).toContain("client_id");
    const u3 = accountContextResolverOver({
      records: [connectionRecordOf({ useCaseRef: "marketplace-connected-accounts" })],
    });
    const u3Outcome = await u3.resolve("conn:fake-stripe-1");
    expect(u3Outcome.ok === false && u3Outcome.reason).toContain(
      "U3 (Connect platform/connected accounts) is declared UNCONFIGURED",
    );
  });

  it("refuses an undeclared use case (never guessed)", async () => {
    const resolver = accountContextResolverOver({
      records: [connectionRecordOf({ useCaseRef: "some-future-form" })],
    });
    const outcome = await resolver.resolve("conn:fake-stripe-1");
    expect(outcome.ok === false && outcome.reason).toContain("not a declared Stripe account model");
  });

  it("refuses unconfirmed evidence, a missing account id and a live-mode flag (INV-25)", async () => {
    const unknownEvidence = accountContextResolverOver({ evidence: [probeEvidenceOf({ outcome: "UNKNOWN" })] });
    expect((await unknownEvidence.resolve("conn:fake-stripe-1")).ok).toBe(false);
    const noAccount = accountContextResolverOver({ evidence: [probeEvidenceOf({ accountRef: null })] });
    expect((await noAccount.resolve("conn:fake-stripe-1")).ok).toBe(false);
    const liveFlag = accountContextResolverOver({ evidence: [probeEvidenceOf({ providerLiveMode: true })] });
    const liveOutcome = await liveFlag.resolve("conn:fake-stripe-1");
    expect(liveOutcome.ok === false && liveOutcome.reason).toContain("INV-25");
  });

  it("refuses evidence that predates the credential seal (the rotation freshness law)", async () => {
    const resolver = accountContextResolverOver({
      credentialSealedAt: () => "2026-10-31T12:00:00Z",
    });
    const outcome = await resolver.resolve("conn:fake-stripe-1");
    expect(outcome.ok === false && outcome.reason).toContain("rotated and a re-probe is required");
  });

  it("evidence at or after the seal resolves (the freshness boundary)", async () => {
    const resolver = accountContextResolverOver({
      credentialSealedAt: () => "2026-10-31T10:05:00Z",
    });
    const outcome = await resolver.resolve("conn:fake-stripe-1");
    expect(outcome.ok).toBe(true);
  });

  it("refuses a LIVE connection (this deployment is SANDBOX-only)", async () => {
    const resolver = accountContextResolverOver({
      records: [connectionRecordOf({ executionMode: "LIVE" })],
    });
    const outcome = await resolver.resolve("conn:fake-stripe-1");
    expect(outcome.ok === false && outcome.reason).toContain("SANDBOX-only");
  });

  it("refuses a non-acct_ account ref (never a fabricated context)", async () => {
    const resolver = accountContextResolverOver({
      evidence: [probeEvidenceOf({ accountRef: "not-an-acct-ref" })],
    });
    const outcome = await resolver.resolve("conn:fake-stripe-1");
    expect(outcome.ok === false && outcome.reason).toContain("acct_");
  });
});
