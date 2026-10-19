/**
 * @payswap/merchant — merchant onboarding (P5-W3, lane R3-W3; PORT of
 * old packages/merchant-checkout/src/onboarding.ts @ 8a735bf).
 *
 * Typed merchant profile + deterministic onboarding state machine
 * (DRAFT → SUBMITTED → VERIFIED → ACTIVE), fail-closed on incomplete
 * input.
 *
 * Laws encoded here:
 * - the merchant is FIAT-DENOMINATED BY DEFAULT: `pricingCurrency` is
 *   a fiat currency and crypto acceptance is an explicit opt-in
 *   layered on top at the acceptance stage — never a replacement,
 *   never implied here;
 * - no onboarding step may imply rail connectivity: every onboarding
 *   artifact is structurally scanned for connectivity-implying
 *   vocabulary — connection eligibility is an observation against a
 *   connected instance, never an onboarding fact;
 * - settlement destinations are consumed from the canonical payment
 *   vocabulary (the PINNED MerchantSettlementDestination with
 *   provenance) — never re-declared here;
 * - the origin country is immutable after activation (the Stripe
 *   research onboarding law: "origin country immutable after live
 *   activation");
 * - deterministic only: every transition takes an explicit `now`.
 */

import { ValidationError } from "./errors.ts";
import { ConnectivityImpliedError } from "./errors.ts";
import { defineStateMachine } from "./kernel.ts";
import type { StateMachine } from "./kernel.ts";
import { asMerchantId } from "./identifiers.ts";
import type { MerchantId } from "./identifiers.ts";
import type { PinnedTimestampMs } from "./pins/protocol.ts";
import type { PinnedMerchantSettlementDestination } from "./pins/payment.ts";
import { requireNonEmptyString } from "./secrets.ts";

/** Onboarding lifecycle states (the work-item machine). */
export type MerchantOnboardingState = "DRAFT" | "SUBMITTED" | "VERIFIED" | "ACTIVE";

/** Events the onboarding machine declares. */
export type MerchantOnboardingEvent = "SUBMIT" | "VERIFY" | "ACTIVATE";

/** Guard context: injected clock reading. */
export interface MerchantOnboardingMachineContext {
  readonly now: PinnedTimestampMs;
}

/**
 * The deterministic merchant onboarding machine. DRAFT → SUBMITTED
 * requires a complete application (fail-closed before the transition);
 * SUBMITTED → VERIFIED records the verification lineage; VERIFIED →
 * ACTIVE additionally requires a configured settlement destination.
 * ACTIVE is the single terminal state (terminal-state discipline).
 */
export const merchantOnboardingStateMachine: StateMachine<
  MerchantOnboardingState,
  MerchantOnboardingEvent,
  MerchantOnboardingMachineContext
> = defineStateMachine<
  MerchantOnboardingState,
  MerchantOnboardingEvent,
  MerchantOnboardingMachineContext
>({
  name: "merchant-onboarding",
  initial: "DRAFT",
  states: ["DRAFT", "SUBMITTED", "VERIFIED", "ACTIVE"],
  events: ["SUBMIT", "VERIFY", "ACTIVATE"],
  transitions: [
    {
      from: "DRAFT",
      on: "SUBMIT",
      to: "SUBMITTED",
      description: "the application is complete and submitted for verification",
    },
    {
      from: "SUBMITTED",
      on: "VERIFY",
      to: "VERIFIED",
      description: "verification completed with recorded lineage",
    },
    {
      from: "VERIFIED",
      on: "ACTIVATE",
      to: "ACTIVE",
      description: "activation requires a configured settlement destination",
    },
  ],
  terminalStates: ["ACTIVE"],
});

/** The typed merchant profile (fiat-denominated by default). */
export interface MerchantProfile {
  readonly id: MerchantId;
  /** Legal/business name shown to customers. */
  readonly businessName: string;
  /** Public support contact (statement-descriptor evidence chain). */
  readonly supportContact?: string;
  /** Origin country (ISO-3166-style, 2 uppercase letters). Immutable after activation. */
  readonly country: string;
  /**
   * The fiat currency the merchant prices and reports in. Crypto
   * acceptance is an explicit opt-in layered on top — never a
   * replacement for this.
   */
  readonly pricingCurrency: string;
  readonly state: MerchantOnboardingState;
  /** The canonical external settlement destination (required before activation). */
  readonly settlementDestination?: PinnedMerchantSettlementDestination;
  /** Reference of the verification decision record (lineage, required on VERIFIED+). */
  readonly verificationRef?: string;
  readonly createdAt: PinnedTimestampMs;
  readonly updatedAt: PinnedTimestampMs;
}

/** Vocabulary that may never appear on an onboarding artifact. */
export const CONNECTIVITY_IMPLYING_KEY_FRAGMENTS = [
  "rail",
  "connector",
  "provider",
  "capability",
  "connected",
  "connection",
  "stripe",
  "chain",
  "wallet",
  "railid",
] as const;

/**
 * Fail-closed structural guard: NO onboarding artifact may carry a
 * connectivity-implying field (unconstructible otherwise).
 */
export function assertOnboardingNeverImpliesRailConnectivity(
  record: unknown,
  label: string,
): void {
  if (record === null || typeof record !== "object") {
    return;
  }
  const scan = (value: unknown, path: string): string[] => {
    if (value === null || typeof value !== "object") {
      return [];
    }
    const violations: string[] = [];
    for (const key of Object.keys(value as Record<string, unknown>)) {
      const normalized = key.toLowerCase().replace(/[_-]/g, "");
      if (
        (CONNECTIVITY_IMPLYING_KEY_FRAGMENTS as readonly string[]).some((fragment) =>
          normalized.includes(fragment),
        )
      ) {
        violations.push(`${path}.${key}`);
      }
      violations.push(
        ...scan((value as Record<string, unknown>)[key], `${path}.${key}`),
      );
    }
    return violations;
  };
  const violations = scan(record, "$");
  if (violations.length > 0) {
    throw new ConnectivityImpliedError(
      `${label}: onboarding artifacts must never imply rail connectivity ` +
        `(no rail/provider/connector/capability/connection fields; connection eligibility is an observation against a connected instance, not an onboarding fact) — offending fields: ${violations.join(", ")}`,
      { violations: [...violations] },
    );
  }
}

/** Validate an ISO-3166-style uppercase country code. */
function requireCountryCode(value: unknown, label: string): string {
  const country = requireNonEmptyString(value, label);
  if (country.length !== 2 || country !== country.toUpperCase()) {
    throw new ValidationError(`${label} must be an uppercase 2-letter country code`, {
      country,
    });
  }
  return country;
}

/** Validate an ISO-4217-style fiat currency code (3 letters). */
function requireFiatCurrencyCode(value: unknown, label: string): string {
  const currency = requireNonEmptyString(value, label);
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new ValidationError(`${label} must be a 3-letter uppercase currency code`, {
      currency,
    });
  }
  return currency;
}

/**
 * Begin a merchant application in the DRAFT state. Fail-closed:
 * business name, country and a FIAT pricing currency are mandatory —
 * a merchant is fiat-denominated from the very first artifact.
 */
export function draftMerchant(input: {
  readonly id: string;
  readonly businessName: string;
  readonly country: string;
  /** FIAT pricing currency (crypto acceptance is a later explicit opt-in). */
  readonly pricingCurrency: string;
  readonly supportContact?: string;
  readonly now: PinnedTimestampMs;
}): MerchantProfile {
  const id = asMerchantId(input.id);
  const businessName = requireNonEmptyString(input.businessName, "businessName");
  if (businessName.length > 128) {
    throw new ValidationError("businessName exceeds 128 characters", { id });
  }
  const country = requireCountryCode(input.country, "country");
  const pricingCurrency = requireFiatCurrencyCode(input.pricingCurrency, "pricingCurrency");
  if (input.supportContact !== undefined) {
    requireNonEmptyString(input.supportContact, "supportContact");
  }
  if (typeof input.now !== "bigint") {
    throw new ValidationError("now must be a bigint TimestampMs", { id });
  }
  const profile: MerchantProfile = Object.freeze({
    id,
    businessName,
    country,
    pricingCurrency,
    ...(input.supportContact !== undefined ? { supportContact: input.supportContact } : {}),
    state: "DRAFT",
    createdAt: input.now,
    updatedAt: input.now,
  });
  assertOnboardingNeverImpliesRailConnectivity(profile, "draftMerchant");
  return profile;
}

/**
 * Submit the application. Fail-closed on incomplete input: business
 * name, country, pricing currency AND a public support contact are all
 * required before submission (the public-business-info
 * dispute-prevention chain). Only legal from DRAFT.
 */
export function submitMerchantApplication(
  profile: MerchantProfile,
  now: PinnedTimestampMs,
): MerchantProfile {
  if (profile === null || typeof profile !== "object" || typeof profile.id !== "string" || profile.id.length === 0) {
    throw new ValidationError("submitMerchantApplication requires a MerchantProfile");
  }
  if (typeof now !== "bigint") {
    throw new ValidationError("now must be a bigint TimestampMs", { merchantId: profile.id });
  }
  if (profile.supportContact === undefined) {
    throw new ValidationError(
      "an application cannot be submitted without a public support contact (fail-closed on incomplete input)",
      { merchantId: profile.id },
    );
  }
  const record = merchantOnboardingStateMachine.transition(profile.state, "SUBMIT", { now });
  const submitted: MerchantProfile = Object.freeze({
    ...profile,
    state: record.to,
    updatedAt: now,
  });
  assertOnboardingNeverImpliesRailConnectivity(submitted, "submitMerchantApplication");
  return submitted;
}

/**
 * Record verification. Only legal from SUBMITTED; the verification
 * decision reference is MANDATORY lineage (a verified merchant without
 * a verification record reference is unrepresentable).
 */
export function verifyMerchant(
  profile: MerchantProfile,
  input: { readonly verificationRef: string; readonly now: PinnedTimestampMs },
): MerchantProfile {
  if (profile === null || typeof profile !== "object" || typeof profile.id !== "string" || profile.id.length === 0) {
    throw new ValidationError("verifyMerchant requires a MerchantProfile");
  }
  const verificationRef = requireNonEmptyString(input.verificationRef, "verificationRef");
  if (typeof input.now !== "bigint") {
    throw new ValidationError("now must be a bigint TimestampMs", { merchantId: profile.id });
  }
  const record = merchantOnboardingStateMachine.transition(profile.state, "VERIFY", {
    now: input.now,
  });
  const verified: MerchantProfile = Object.freeze({
    ...profile,
    state: record.to,
    verificationRef,
    updatedAt: input.now,
  });
  assertOnboardingNeverImpliesRailConnectivity(verified, "verifyMerchant");
  return verified;
}

/**
 * Activate the merchant. Only legal from VERIFIED and ONLY with a
 * canonical external settlement destination (with provenance)
 * configured — activation without a settlement destination is
 * unrepresentable (fail-closed). The destination is consumed from the
 * payment plane (constructed upstream); this layer only checks it is a
 * well-formed destination belonging to this merchant's record.
 */
export function activateMerchant(
  profile: MerchantProfile,
  input: {
    readonly settlementDestination: PinnedMerchantSettlementDestination;
    readonly now: PinnedTimestampMs;
  },
): MerchantProfile {
  if (profile === null || typeof profile !== "object" || typeof profile.id !== "string" || profile.id.length === 0) {
    throw new ValidationError("activateMerchant requires a MerchantProfile");
  }
  if (typeof input.now !== "bigint") {
    throw new ValidationError("now must be a bigint TimestampMs", { merchantId: profile.id });
  }
  const destination = input.settlementDestination;
  if (destination === null || typeof destination !== "object") {
    throw new ValidationError("merchant activation requires a MerchantSettlementDestination", {
      merchantId: profile.id,
    });
  }
  if (typeof destination.id !== "string" || destination.id.length === 0) {
    throw new ValidationError("settlement destination id must be a non-empty string", {
      merchantId: profile.id,
    });
  }
  if (typeof destination.externalRef !== "string" || destination.externalRef.length === 0) {
    throw new ValidationError("settlement destination externalRef must be non-empty", {
      merchantId: profile.id,
    });
  }
  const record = merchantOnboardingStateMachine.transition(profile.state, "ACTIVATE", {
    now: input.now,
  });
  const activated: MerchantProfile = Object.freeze({
    ...profile,
    state: record.to,
    settlementDestination: destination,
    updatedAt: input.now,
  });
  assertOnboardingNeverImpliesRailConnectivity(activated, "activateMerchant");
  return activated;
}

/**
 * Edit profile presentation fields (business name, support contact).
 * The origin country is IMMUTABLE once the merchant is ACTIVE, and the
 * pricing currency is immutable from VERIFIED on — a country change
 * after activation requires a new merchant record, never a silent
 * rewrite.
 */
export function updateMerchantProfile(
  profile: MerchantProfile,
  input: {
    readonly businessName?: string;
    readonly supportContact?: string;
    readonly now: PinnedTimestampMs;
  },
): MerchantProfile {
  if (profile === null || typeof profile !== "object" || typeof profile.id !== "string" || profile.id.length === 0) {
    throw new ValidationError("updateMerchantProfile requires a MerchantProfile");
  }
  if (typeof input.now !== "bigint") {
    throw new ValidationError("now must be a bigint TimestampMs", { merchantId: profile.id });
  }
  if (input.businessName !== undefined) {
    requireNonEmptyString(input.businessName, "businessName");
  }
  if (input.supportContact !== undefined) {
    requireNonEmptyString(input.supportContact, "supportContact");
  }
  const updated: MerchantProfile = Object.freeze({
    ...profile,
    ...(input.businessName !== undefined ? { businessName: input.businessName } : {}),
    ...(input.supportContact !== undefined ? { supportContact: input.supportContact } : {}),
    updatedAt: input.now,
  });
  assertOnboardingNeverImpliesRailConnectivity(updated, "updateMerchantProfile");
  return updated;
}

/**
 * Deterministic immutable-country law: may a profile transition to a
 * new country? FALSE once the merchant is ACTIVE (the
 * origin-country immutability law); TRUE before that.
 */
export function mayChangeCountry(profile: MerchantProfile): boolean {
  if (profile === null || typeof profile !== "object") {
    throw new ValidationError("mayChangeCountry requires a MerchantProfile");
  }
  return profile.state !== "ACTIVE";
}

/** Whether the merchant may activate crypto acceptance (verified or active). */
export function merchantMayActivateCryptoAcceptance(profile: MerchantProfile): boolean {
  if (profile === null || typeof profile !== "object") {
    throw new ValidationError("merchantMayActivateCryptoAcceptance requires a MerchantProfile");
  }
  return profile.state === "VERIFIED" || profile.state === "ACTIVE";
}
