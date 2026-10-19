import { describe, expect, it } from "vitest";
import {
  activateMerchant,
  assertOnboardingNeverImpliesRailConnectivity,
  draftMerchant,
  mayChangeCountry,
  merchantMayActivateCryptoAcceptance,
  merchantOnboardingStateMachine,
  submitMerchantApplication,
  updateMerchantProfile,
  verifyMerchant,
} from "../src/onboarding.ts";
import type { MerchantProfile } from "../src/onboarding.ts";
import {
  ConnectivityImpliedError,
  InvalidIdentifierError,
  MachineTransitionError,
  ValidationError,
} from "../src/errors.ts";
import type { PinnedMerchantSettlementDestination } from "../src/index.ts";
import {
  DESTINATION,
  T0,
  T1,
  T10,
  T60,
  activeMerchantFixture,
  draftMerchantFixture,
} from "./fixtures.ts";

/**
 * The merchant onboarding suite (PORTED+ADAPTED from old
 * packages/merchant-checkout/test/onboarding.test.ts @ 8a735bf, P4-W2-003
 * §3.1 contracts): fail-closed draft validation, the deterministic
 * DRAFT → SUBMITTED → VERIFIED → ACTIVE machine (ACTIVE terminal and
 * monotonic), the no-onboarding-artifact-may-imply-rail-connectivity
 * guard, and the immutability/acceptance gates. The old suite's 16 sites
 * consolidate to 15 (the three id/now construction-rejection sites regroup
 * into two, and the two old immutability-law sites merge into one).
 */

/** A submitted fixture merchant (complete application, contact present). */
function submittedFixture(): MerchantProfile {
  return submitMerchantApplication(draftMerchantFixture(), T1);
}

/** A verified fixture merchant with recorded verification lineage. */
function verifiedFixture(): MerchantProfile {
  return verifyMerchant(submittedFixture(), {
    verificationRef: "verification:fixture-1",
    now: T10,
  });
}

describe("merchant onboarding — construction validation (fail-closed)", () => {
  // PORTED: old "drafts a fiat-denominated merchant profile" + the old
  // "records are frozen (historical onboarding facts are immutable)" site
  // folded in.
  it("drafts a fiat-denominated merchant profile in DRAFT, frozen at its deterministic instant", () => {
    const profile = draftMerchantFixture();
    expect(profile.state).toBe("DRAFT");
    expect(profile.id).toBe("merchant.fixture.1");
    expect(profile.businessName).toBe("Fixture Coffee Roasters");
    expect(profile.country).toBe("US");
    expect(profile.pricingCurrency).toBe("USD");
    expect(profile.supportContact).toBe("support@fixture.example");
    expect(profile.createdAt).toBe(T0);
    expect(profile.updatedAt).toBe(T0);
    expect(Object.isFrozen(profile)).toBe(true);
    expect(() => {
      (profile as { businessName: string }).businessName = "Rewritten";
    }).toThrow();
  });

  // ADAPTED: old "rejects malformed country and currency codes" carried
  // the empty-business-name case; the 128-character bound is new src law.
  it("bounds the business name at 128 characters and rejects an empty business name", () => {
    const base = {
      id: "merchant.bound.1",
      country: "US",
      pricingCurrency: "USD",
      now: T0,
    };
    const exactlyBound = "N".repeat(128);
    expect(draftMerchant({ ...base, businessName: exactlyBound }).businessName).toBe(
      exactlyBound,
    );
    expect(() => draftMerchant({ ...base, businessName: "N".repeat(129) })).toThrow(
      ValidationError,
    );
    expect(() => draftMerchant({ ...base, businessName: "" })).toThrow(ValidationError);
  });

  // PORTED: old "rejects malformed country and currency codes".
  it("rejects malformed country and fiat currency codes (uppercase 2-letter country, 3-letter currency)", () => {
    const base = { id: "merchant.codes.1", businessName: "B", now: T0 };
    for (const country of ["usa", "us", "Us", "D"]) {
      expect(() =>
        draftMerchant({ ...base, country, pricingCurrency: "USD" }),
      ).toThrow(ValidationError);
    }
    for (const pricingCurrency of ["usd", "USDD", "US", "D0L"]) {
      expect(() =>
        draftMerchant({ ...base, country: "US", pricingCurrency }),
      ).toThrow(ValidationError);
    }
    expect(
      draftMerchant({ ...base, country: "DE", pricingCurrency: "EUR" }).pricingCurrency,
    ).toBe("EUR");
  });

  // PORTED: old "rejects empty ids, whitespace ids and overlong ids" (now
  // through draftMerchant) + old "rejects a non-bigint now".
  it("rejects empty, padded and overlong ids and a non-bigint now (deterministic instants only)", () => {
    const base = { businessName: "B", country: "US", pricingCurrency: "USD", now: T0 };
    expect(() => draftMerchant({ ...base, id: "" })).toThrow(InvalidIdentifierError);
    expect(() => draftMerchant({ ...base, id: " padded " })).toThrow(InvalidIdentifierError);
    expect(() => draftMerchant({ ...base, id: "x".repeat(257) })).toThrow(InvalidIdentifierError);
    expect(() =>
      draftMerchant({ ...base, id: "merchant.now.1", now: 123 as unknown as bigint }),
    ).toThrow(ValidationError);
  });
});

describe("merchant onboarding — no artifact may imply rail connectivity", () => {
  // PORTED+ADAPTED: old "rejects an onboarding record carrying
  // connectivity-implying fields", broadened to probe EVERY pinned
  // fragment of the vocabulary (rail/connector/provider/capability/
  // connected/connection/stripe/chain/wallet).
  it("rejects records carrying any connectivity-implying key fragment, reporting the offending path", () => {
    const offendingKeys = [
      "railId",
      "connectorRef",
      "providerName",
      "capabilityRef",
      "connectedAccount",
      "connectionStatus",
      "stripeAccount",
      "chainRef",
      "walletAddress",
    ];
    for (const key of offendingKeys) {
      const offending = { id: "merchant.offending.1", [key]: "offending-value" };
      expect(() =>
        assertOnboardingNeverImpliesRailConnectivity(offending, "fragment-probe"),
      ).toThrow(ConnectivityImpliedError);
    }
    expect(() =>
      assertOnboardingNeverImpliesRailConnectivity({ stripeAccount: "acct" }, "path-probe"),
    ).toThrow(/\$\.stripeAccount/);
  });

  // PORTED: old "rejects nested connectivity vocabulary
  // (stripeAccountRef)", plus the separator-normalization and deeper
  // nesting cases.
  it("rejects nested connectivity vocabulary, however deep, with separators normalized away", () => {
    const nested = {
      id: "merchant.offending.2",
      businessName: "B",
      country: "US",
      pricingCurrency: "USD",
      state: "DRAFT",
      details: { stripeAccountRef: "acct.stripe.fixture.1" },
      createdAt: T0,
      updatedAt: T0,
    };
    expect(() =>
      assertOnboardingNeverImpliesRailConnectivity(nested, "nested-probe"),
    ).toThrow(ConnectivityImpliedError);
    expect(() =>
      assertOnboardingNeverImpliesRailConnectivity(nested, "nested-probe"),
    ).toThrow(/\$\.details\.stripeAccountRef/);
    expect(() =>
      assertOnboardingNeverImpliesRailConnectivity(
        { payout: { walletAddress: "wallet-ref-1" } },
        "wallet-probe",
      ),
    ).toThrow(ConnectivityImpliedError);
    expect(() =>
      assertOnboardingNeverImpliesRailConnectivity(
        { details: { deep: { chainRef: "chain.eth-mainnet" } } },
        "deep-probe",
      ),
    ).toThrow(ConnectivityImpliedError);
    expect(() =>
      assertOnboardingNeverImpliesRailConnectivity(
        { stripe_account: "acct.stripe.fixture.1" },
        "separator-probe",
      ),
    ).toThrow(ConnectivityImpliedError);
  });

  // PORTED: old "the clean profile passes the guard".
  it("passes clean profiles (and non-object values) — the guard is evidence, never a blanket rejection", () => {
    expect(() =>
      assertOnboardingNeverImpliesRailConnectivity(draftMerchantFixture(), "draft"),
    ).not.toThrow();
    expect(() =>
      assertOnboardingNeverImpliesRailConnectivity(activeMerchantFixture(), "active"),
    ).not.toThrow();
    expect(() =>
      assertOnboardingNeverImpliesRailConnectivity(null, "null-probe"),
    ).not.toThrow();
    expect(() =>
      assertOnboardingNeverImpliesRailConnectivity("text", "string-probe"),
    ).not.toThrow();
    expect(() => assertOnboardingNeverImpliesRailConnectivity(42, "number-probe")).not.toThrow();
  });
});

describe("merchant onboarding — the DRAFT to ACTIVE machine", () => {
  // PORTED: old "refuses submission of an incomplete application (no
  // support contact)" + the SUBMITTED stage of the old deterministic walk.
  it("refuses submission without a public support contact (fail-closed) and submits a complete application", () => {
    const withoutContact = draftMerchant({
      id: "merchant.submit.1",
      businessName: "B",
      country: "US",
      pricingCurrency: "USD",
      now: T0,
    });
    expect(() => submitMerchantApplication(withoutContact, T1)).toThrow(ValidationError);
    expect(() => submitMerchantApplication(withoutContact, T1)).toThrow(/support contact/);

    const submitted = submitMerchantApplication(draftMerchantFixture(), T1);
    expect(submitted.state).toBe("SUBMITTED");
    expect(submitted.createdAt).toBe(T0);
    expect(submitted.updatedAt).toBe(T1);
    expect(Object.isFrozen(submitted)).toBe(true);
  });

  // ADAPTED: the stage-discipline half of the old "refuses out-of-order
  // transitions" site, split per event.
  it("submits only from DRAFT — a SUBMITTED or ACTIVE application can never be resubmitted", () => {
    const submitted = submitMerchantApplication(draftMerchantFixture(), T1);
    expect(() => submitMerchantApplication(submitted, T10)).toThrow(MachineTransitionError);
    expect(() => submitMerchantApplication(submitted, T10)).toThrow(
      /not declared from state 'SUBMITTED'/,
    );
    expect(() => submitMerchantApplication(activeMerchantFixture(), T60)).toThrow(/terminal/);
  });

  // PORTED: old "refuses verification without a verification record
  // reference (lineage)" + the stage discipline for VERIFY.
  it("refuses verification without a record reference (lineage) and verifies only from SUBMITTED", () => {
    const submitted = submittedFixture();
    expect(() =>
      verifyMerchant(submitted, { verificationRef: "", now: T10 }),
    ).toThrow(ValidationError);
    expect(() =>
      verifyMerchant(draftMerchantFixture(), { verificationRef: "verification:fixture-1", now: T1 }),
    ).toThrow(MachineTransitionError);
    expect(() =>
      verifyMerchant(draftMerchantFixture(), { verificationRef: "verification:fixture-1", now: T1 }),
    ).toThrow(/not declared from state 'DRAFT'/);

    const verified = verifyMerchant(submitted, {
      verificationRef: "verification:fixture-1",
      now: T10,
    });
    expect(verified.state).toBe("VERIFIED");
    expect(verified.verificationRef).toBe("verification:fixture-1");
  });

  // PORTED+ADAPTED: old "refuses activation without a settlement
  // destination (fail-closed)", broadened to the well-formedness law
  // (id/externalRef non-empty).
  it("refuses activation without a well-formed settlement destination (id and externalRef non-empty)", () => {
    const verified = verifiedFixture();
    expect(() =>
      activateMerchant(verified, {
        settlementDestination: undefined as unknown as PinnedMerchantSettlementDestination,
        now: T60,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      activateMerchant(verified, {
        settlementDestination: { ...DESTINATION, id: "" },
        now: T60,
      }),
    ).toThrow(/settlement destination id/);
    expect(() =>
      activateMerchant(verified, {
        settlementDestination: { ...DESTINATION, externalRef: "" },
        now: T60,
      }),
    ).toThrow(/externalRef/);
  });

  // PORTED: old "walks draft → submitted → verified → active
  // deterministically" + the stage discipline for ACTIVATE.
  it("activates only from VERIFIED, and the deterministic walk records lineage and destination before ACTIVE", () => {
    const submitted = submittedFixture();
    expect(() =>
      activateMerchant(submitted, { settlementDestination: DESTINATION, now: T10 }),
    ).toThrow(MachineTransitionError);
    expect(() =>
      activateMerchant(submitted, { settlementDestination: DESTINATION, now: T10 }),
    ).toThrow(/not declared from state 'SUBMITTED'/);

    const active = activateMerchant(verifiedFixture(), {
      settlementDestination: DESTINATION,
      now: T60,
    });
    expect(active.state).toBe("ACTIVE");
    expect(active.verificationRef).toBe("verification:fixture-1");
    expect(active.settlementDestination?.id).toBe(DESTINATION.id);
    expect(active.settlementDestination?.externalRef).toBe(DESTINATION.externalRef);
    expect(active.createdAt).toBe(T0);
    expect(active.updatedAt).toBe(T60);
    expect(Object.isFrozen(active)).toBe(true);
    expect(active).toEqual(activeMerchantFixture());
  });

  // PORTED: old "declares exactly the four work-item states with ACTIVE
  // terminal" + the terminal half of the old "refuses out-of-order
  // transitions" site (every declared event from ACTIVE throws).
  it("declares exactly the four states with ACTIVE the single terminal — monotonic, no outgoing events", () => {
    expect([...merchantOnboardingStateMachine.states]).toEqual([
      "DRAFT",
      "SUBMITTED",
      "VERIFIED",
      "ACTIVE",
    ]);
    expect([...merchantOnboardingStateMachine.terminalStates]).toEqual(["ACTIVE"]);
    expect(merchantOnboardingStateMachine.isTerminal("ACTIVE")).toBe(true);
    expect(merchantOnboardingStateMachine.isTerminal("VERIFIED")).toBe(false);

    const active = activeMerchantFixture();
    expect(() => submitMerchantApplication(active, T60)).toThrow(/terminal/);
    expect(() =>
      verifyMerchant(active, { verificationRef: "verification:fixture-1", now: T60 }),
    ).toThrow(/terminal/);
    expect(() =>
      activateMerchant(active, { settlementDestination: DESTINATION, now: T60 }),
    ).toThrow(/terminal/);
  });

  // ADAPTED (NET-NEW positive path): the old suite only probed
  // updateMerchantProfile as the guard carrier; the presentation-only
  // update law is asserted directly here.
  it("updates presentation fields only — business name and support contact, never the structural facts", () => {
    const active = activeMerchantFixture();
    const updated = updateMerchantProfile(active, {
      businessName: "Renamed Roasters",
      supportContact: "help@fixture.example",
      now: T1,
    });
    expect(updated.businessName).toBe("Renamed Roasters");
    expect(updated.supportContact).toBe("help@fixture.example");
    expect(updated.country).toBe("US");
    expect(updated.pricingCurrency).toBe("USD");
    expect(updated.state).toBe("ACTIVE");
    expect(updated.verificationRef).toBe("verification:fixture-1");
    expect(updated.settlementDestination).toEqual(DESTINATION);
    expect(updated.createdAt).toBe(T0);
    expect(updated.updatedAt).toBe(T1);
    expect(Object.isFrozen(updated)).toBe(true);

    const untouched = updateMerchantProfile(draftMerchantFixture(), { now: T1 });
    expect(untouched.businessName).toBe("Fixture Coffee Roasters");
    expect(untouched.state).toBe("DRAFT");
    expect(untouched.updatedAt).toBe(T1);
  });

  // PORTED: old "the origin country is immutable once ACTIVE" + old
  // "crypto acceptance requires a verified merchant" (two sites merged).
  it("locks the country once ACTIVE and admits crypto acceptance only from VERIFIED or ACTIVE", () => {
    const draft = draftMerchantFixture();
    const submitted = submittedFixture();
    const verified = verifiedFixture();
    const active = activeMerchantFixture();
    expect(mayChangeCountry(draft)).toBe(true);
    expect(mayChangeCountry(submitted)).toBe(true);
    expect(mayChangeCountry(verified)).toBe(true);
    expect(mayChangeCountry(active)).toBe(false);
    expect(merchantMayActivateCryptoAcceptance(draft)).toBe(false);
    expect(merchantMayActivateCryptoAcceptance(submitted)).toBe(false);
    expect(merchantMayActivateCryptoAcceptance(verified)).toBe(true);
    expect(merchantMayActivateCryptoAcceptance(active)).toBe(true);
  });
});
