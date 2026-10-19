import { describe, expect, it } from "vitest";
import {
  attachMethodToIntent,
  cancelMerchantCheckoutSession,
  completeMerchantCheckoutSession,
  defineMerchantCryptoAcceptancePolicy,
  expireMerchantCheckoutSession,
  openMerchantCheckoutSession,
} from "../src/index.ts";
import type {
  CryptoAssetAcceptance,
  MerchantCheckoutSession,
  MerchantCryptoAcceptancePolicy,
  MerchantPaymentIntent,
  MerchantPaymentIntentState,
} from "../src/index.ts";
import { MachineGuardError, MachineTransitionError, ValidationError } from "../src/errors.ts";
import { BASE_POLICY, CRYPTO_POLICY, ETH, T60, USDC } from "./fixtures.ts";
import { intentFixture } from "./journey-fixtures.ts";

/**
 * The merchant checkout SESSION suite (P5-W3, lane R3-W3; PORT of old
 * packages/merchant-crypto/test/checkout.test.ts @ 8a735bf — its 10
 * sites consolidated into 7 here): the offered-asset snapshot at open
 * (a later policy edit can never rewrite a historical fact), the
 * session's expiry being exactly the intent's expiry, completion only
 * on the session's OWN SUCCEEDED intent and only from OPEN, the
 * declarative expiry guard (`now >= expiresAt`), and the monotonic
 * terminal states COMPLETED/EXPIRED/CANCELLED.
 */

/**
 * TEST-ONLY CAST (ported verbatim in spirit from old
 * merchant-crypto/test/checkout.test.ts): `defineMerchantPaymentIntent`
 * fixes the initial state, so intents in other lifecycle states are
 * produced by spreading a frozen copy with an overridden `state` —
 * simulating records returned by the intent-advancing lifecycle
 * functions.
 */
function intentInState(
  state: MerchantPaymentIntentState,
  id: string = "intent:fixture-1",
): MerchantPaymentIntent {
  return { ...intentFixture(), id, state } as MerchantPaymentIntent;
}

/** The canonical open session over the fixtures (opened at T60). */
function openFixture(): MerchantCheckoutSession {
  return openMerchantCheckoutSession({
    id: "session:fixture-1",
    intent: intentFixture(),
    cryptoPolicy: CRYPTO_POLICY,
    now: T60,
  });
}

describe("openMerchantCheckoutSession", () => {
  it("opens an OPEN session snapshotting the offered assets at open; the session's expiry IS the intent's expiry", () => {
    const intent = intentFixture();
    const session = openMerchantCheckoutSession({
      id: "session:fixture-1",
      intent,
      cryptoPolicy: CRYPTO_POLICY,
      now: T60,
    });
    expect(session.id).toBe("session:fixture-1");
    expect(session.intentId).toBe(intent.id);
    expect(session.acceptancePolicyId).toBe(BASE_POLICY.id);
    expect(session.cryptoAcceptancePolicyId).toBe(CRYPTO_POLICY.id);
    // The offered assets are snapshotted from the crypto policy at open.
    expect(session.offeredAssets.map((asset) => asset.assetId)).toEqual([USDC.id, ETH.id]);
    expect(session.state).toBe("OPEN");
    expect(session.createdAt).toBe(T60);
    // A session never outlives its intent: the session's expiry IS the
    // intent's expiry.
    expect(session.expiresAt).toBe(intent.expiresAt);
    expect(Object.isFrozen(session)).toBe(true);
    expect(Object.isFrozen(session.offeredAssets)).toBe(true);
  });

  it("a later policy edit can never rewrite an open session's offered assets", () => {
    const session = openFixture();
    // The merchant later EDITS the policy (same id) down to a single asset
    // through the real constructor — a legitimate policy mutation.
    const narrowed = defineMerchantCryptoAcceptancePolicy(
      {
        id: CRYPTO_POLICY.id,
        merchantRef: CRYPTO_POLICY.merchantRef,
        basePolicyId: CRYPTO_POLICY.basePolicyId,
        assets: [CRYPTO_POLICY.assets[0] as CryptoAssetAcceptance],
        quoteValidityMs: CRYPTO_POLICY.quoteValidityMs,
      },
      BASE_POLICY,
    );
    // The edit really happened — the policy now offers one asset...
    expect(narrowed.assets.map((asset) => asset.assetId)).toEqual([USDC.id]);
    expect(narrowed.id).toBe(session.cryptoAcceptancePolicyId);
    // ...but the open session's snapshot is a frozen historical fact that
    // later policy edits can never rewrite.
    expect(session.offeredAssets.map((asset) => asset.assetId)).toEqual([USDC.id, ETH.id]);
    // The snapshot entries are fresh copies — never identity-shared with
    // any policy's asset entries.
    expect(session.offeredAssets[0]).not.toBe(CRYPTO_POLICY.assets[0]);
  });

  it("opens only on an intent awaiting payment — a SUCCEEDED intent is rejected", () => {
    // A SUCCEEDED intent is not awaiting payment (the session opened too
    // late — it can never complete what already completed).
    expect(() =>
      openMerchantCheckoutSession({
        id: "session:rejected",
        intent: intentInState("SUCCEEDED"),
        cryptoPolicy: CRYPTO_POLICY,
        now: T60,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      openMerchantCheckoutSession({
        id: "session:rejected",
        intent: intentInState("SUCCEEDED"),
        cryptoPolicy: CRYPTO_POLICY,
        now: T60,
      }),
    ).toThrow(/awaiting payment/);
    // A PROCESSING intent is not awaiting payment either.
    expect(() =>
      openMerchantCheckoutSession({
        id: "session:rejected",
        intent: intentInState("PROCESSING"),
        cryptoPolicy: CRYPTO_POLICY,
        now: T60,
      }),
    ).toThrow(ValidationError);
    // REQUIRES_CONFIRMATION IS awaiting payment (through the real
    // lifecycle walk — a method was attached but nothing was paid yet).
    const awaitingConfirmation = attachMethodToIntent(intentFixture(), T60 + 1_000n);
    expect(awaitingConfirmation.state).toBe("REQUIRES_CONFIRMATION");
    const session = openMerchantCheckoutSession({
      id: "session:fixture-2",
      intent: awaitingConfirmation,
      cryptoPolicy: CRYPTO_POLICY,
      now: T60 + 2_000n,
    });
    expect(session.state).toBe("OPEN");
  });

  it("requires a MerchantCryptoAcceptancePolicy (and a MerchantPaymentIntent)", () => {
    expect(() =>
      openMerchantCheckoutSession({
        id: "session:rejected",
        intent: intentFixture(),
        cryptoPolicy: null as unknown as MerchantCryptoAcceptancePolicy,
        now: T60,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      openMerchantCheckoutSession({
        id: "session:rejected",
        intent: intentFixture(),
        cryptoPolicy: null as unknown as MerchantCryptoAcceptancePolicy,
        now: T60,
      }),
    ).toThrow(/MerchantCryptoAcceptancePolicy/);
    expect(() =>
      openMerchantCheckoutSession({
        id: "session:rejected",
        intent: null as unknown as MerchantPaymentIntent,
        cryptoPolicy: CRYPTO_POLICY,
        now: T60,
      }),
    ).toThrow(ValidationError);
  });
});

describe("completeMerchantCheckoutSession", () => {
  it("completes an OPEN session once its own intent has SUCCEEDED", () => {
    const session = openFixture();
    const completed = completeMerchantCheckoutSession(
      session,
      intentInState("SUCCEEDED"),
      T60 + 60_000n,
    );
    expect(completed.state).toBe("COMPLETED");
    expect(completed.intentId).toBe(session.intentId);
    // The offered-asset snapshot travels with the record (identity
    // preserved — completion never re-derives the offer).
    expect(completed.offeredAssets).toBe(session.offeredAssets);
    expect(Object.isFrozen(completed)).toBe(true);
    // A NEW frozen record was returned; the OPEN session is untouched.
    expect(session.state).toBe("OPEN");
  });

  it("refuses to complete on a different intent, a FAILED intent, or a session no longer OPEN", () => {
    const session = openFixture();
    // Only its OWN intent:
    expect(() =>
      completeMerchantCheckoutSession(
        session,
        intentInState("SUCCEEDED", "intent:fixture-2"),
        T60 + 60_000n,
      ),
    ).toThrow(ValidationError);
    expect(() =>
      completeMerchantCheckoutSession(
        session,
        intentInState("SUCCEEDED", "intent:fixture-2"),
        T60 + 60_000n,
      ),
    ).toThrow(/own intent/);
    // Only when the intent has SUCCEEDED:
    expect(() =>
      completeMerchantCheckoutSession(session, intentInState("FAILED"), T60 + 60_000n),
    ).toThrow(ValidationError);
    expect(() =>
      completeMerchantCheckoutSession(session, intentInState("FAILED"), T60 + 60_000n),
    ).toThrow(/SUCCEEDED/);
    // Only from OPEN (the machine declares COMPLETE solely from OPEN; a
    // CANCELLED session is terminal and can never complete).
    const cancelled = cancelMerchantCheckoutSession(session, T60 + 1_000n);
    expect(() =>
      completeMerchantCheckoutSession(cancelled, intentInState("SUCCEEDED"), T60 + 60_000n),
    ).toThrow(MachineTransitionError);
  });
});

describe("cancel / expire / terminal monotonicity", () => {
  it("cancels while OPEN, expires only at/after the boundary, and never rewrites a terminal state", () => {
    const intent = intentFixture();
    const session = openMerchantCheckoutSession({
      id: "session:fixture-1",
      intent,
      cryptoPolicy: CRYPTO_POLICY,
      now: T60,
    });
    // Cancel while OPEN: a NEW frozen CANCELLED record.
    const cancelled = cancelMerchantCheckoutSession(session, T60 + 1_000n);
    expect(cancelled.state).toBe("CANCELLED");
    expect(Object.isFrozen(cancelled)).toBe(true);
    // Expiry is declarative: strictly before the boundary the guard
    // throws (now >= expiresAt is the only expiry law).
    expect(() => expireMerchantCheckoutSession(session, intent.expiresAt - 1n)).toThrow(
      MachineGuardError,
    );
    // At/after the boundary the session expires.
    const expired = expireMerchantCheckoutSession(session, intent.expiresAt);
    expect(expired.state).toBe("EXPIRED");
    // COMPLETED/EXPIRED/CANCELLED are terminal and monotonic: no event
    // ever rewrites them (a retry mints a NEW record).
    const completed = completeMerchantCheckoutSession(
      session,
      intentInState("SUCCEEDED"),
      T60 + 60_000n,
    );
    expect(() => cancelMerchantCheckoutSession(completed, T60 + 61_000n)).toThrow(
      MachineTransitionError,
    );
    expect(() => expireMerchantCheckoutSession(expired, intent.expiresAt + 1n)).toThrow(
      MachineTransitionError,
    );
    expect(() =>
      completeMerchantCheckoutSession(cancelled, intentInState("SUCCEEDED"), T60 + 62_000n),
    ).toThrow(MachineTransitionError);
  });
});
