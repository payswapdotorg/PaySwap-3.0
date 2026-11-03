/**
 * @payswap/app — THE PAYSTACK AFRICA PINS (P27-C, ADR-0020 D10/D11):
 * the app-side structural pins of the Paystack Africa journeys — the
 * AFRICA EXTENDED NETWORK ONBOARDING LINKS (the V6-verified
 * paystack.com/stripe/* URLs) and the honest capability-state
 * declarations of the collection / recipient / payout surfaces.
 *
 * MIRROR DISCIPLINE (the connectionsActivationPins pattern): @payswap/app
 * src never imports the provider runtime or the desktop host — the
 * journey facts are pinned STRUCTURALLY here as typed data, value-mirrored
 * against the dated evidence record (the provider-runtime
 * PAYSTACK_RECIPIENT_FACTS_STATION_RECORD + the capability matrix V6 row;
 * verified test-only, never imported).
 *
 * LAWS:
 * - ZERO FINANCIAL AUTHORITY: these pins are declarations and links, never
 *   connections, never dispatches; a card rendering from them is a
 *   DECLARATION with its honest state (INV-13: a declared capability is
 *   not a dispatchable one).
 * - D10 (dated evidence, never flags): every onboarding link is stamped
 *   with its retrieval date and source; the recipient/payout capability
 *   state is the honest K3/K4 record — the recipient-type facts were
 *   UNVERIFIED at the 2026-11-03 station (the Paystack docs unreachable),
 *   so NO recipient availability is claimed here, and nothing here widens
 *   what the provider-runtime plane's evidence gate admits.
 * - INV-30: the collection journey is the genuine-commerce product; the
 *   payout journey is the business-payout product — a personal
 *   remittance/P2P journey is never offered on either surface.
 */

/** The Africa Extended Network markets with a verified Paystack onboarding link (V6). */
export const PAYSTACK_AFRICA_ONBOARDING_MARKETS = [
  "GH",
  "KE",
  "NG",
  "ZA",
  "CI",
] as const;
export type PaystackAfricaOnboardingMarket =
  (typeof PAYSTACK_AFRICA_ONBOARDING_MARKETS)[number];

/** The dated evidence stamp every onboarding link carries (V6, 2026-11-03). */
export interface PaystackAfricaOnboardingLinkEvidence {
  /** The live page the link fact was re-verified against (retrieved 2026-11-03). */
  readonly sourceUrl: string;
  /** The retrieval date (ISO 8601) — freshness is law (ADR-0020 D10). */
  readonly retrievedAt: string;
}

/** One market's verified onboarding link (the Extended Network → Paystack path). */
export interface PaystackAfricaOnboardingLink {
  /** The market (uppercase ISO alpha-2). */
  readonly market: PaystackAfricaOnboardingMarket;
  /** People-language market label. */
  readonly label: string;
  /** The verified onboarding URL the journey opens (never a guess). */
  readonly onboardingUrl: string;
  /** The dated evidence stamp for the link fact (V6). */
  readonly evidence: PaystackAfricaOnboardingLinkEvidence;
}

/**
 * THE V6 EVIDENCE STAMP (the capability matrix §1 row V6, retrieved
 * 2026-11-03): stripe.com/global's raw HTML carries Ghana, Kenya, Nigeria
 * and South Africa with "Extended network" badges linking to
 * paystack.com/stripe/<market>, and Côte d'Ivoire linking to
 * paystack.com/ci/ — a Paystack onboarding path, never direct Stripe
 * account eligibility.
 */
export const PAYSTACK_AFRICA_ONBOARDING_EVIDENCE: PaystackAfricaOnboardingLinkEvidence =
  Object.freeze({
    sourceUrl: "https://stripe.com/global",
    retrievedAt: "2026-11-03",
  });

/**
 * The verified Africa Extended Network → Paystack onboarding links (V6).
 * Append-only; every row carries the same dated evidence stamp.
 */
export const PAYSTACK_AFRICA_ONBOARDING_LINKS: readonly PaystackAfricaOnboardingLink[] =
  Object.freeze([
    Object.freeze({
      market: "GH",
      label: "Ghana",
      onboardingUrl: "https://paystack.com/stripe/ghana",
      evidence: PAYSTACK_AFRICA_ONBOARDING_EVIDENCE,
    }),
    Object.freeze({
      market: "KE",
      label: "Kenya",
      onboardingUrl: "https://paystack.com/stripe/kenya",
      evidence: PAYSTACK_AFRICA_ONBOARDING_EVIDENCE,
    }),
    Object.freeze({
      market: "NG",
      label: "Nigeria",
      onboardingUrl: "https://paystack.com/stripe/nigeria",
      evidence: PAYSTACK_AFRICA_ONBOARDING_EVIDENCE,
    }),
    Object.freeze({
      market: "ZA",
      label: "South Africa",
      onboardingUrl: "https://paystack.com/stripe/south-africa",
      evidence: PAYSTACK_AFRICA_ONBOARDING_EVIDENCE,
    }),
    Object.freeze({
      market: "CI",
      label: "Côte d'Ivoire",
      onboardingUrl: "https://paystack.com/ci/",
      evidence: PAYSTACK_AFRICA_ONBOARDING_EVIDENCE,
    }),
  ]);

/**
 * Resolve one market's verified onboarding link. TOTAL and fail-closed:
 * an unknown market resolves to undefined — NEVER a guessed link, never a
 * silently bucketed market (the honest absence is the answer).
 */
export function paystackAfricaOnboardingLinkFor(
  market: string,
): PaystackAfricaOnboardingLink | undefined {
  return (
    PAYSTACK_AFRICA_ONBOARDING_LINKS.find(
      (link) => link.market === market,
    ) ?? undefined
  );
}

/**
 * THE HONEST COLLECTION-JOURNEY STATE (the P27-C surface declaration —
 * what the provider-runtime plane implements, mirrored as data):
 * - the connection form is the SAME own-store test-mode sealed key (D4:
 *   the collection grant derives at dispatch inside the seal — never a
 *   connection-scope growth);
 * - a collection initialize is a PAYMENT REQUEST the customer authorizes
 *   on the provider's hosted page — never money movement by itself;
 * - the journey is the genuine-commerce product (INV-30 — the capability
 *   matrix §5 row).
 */
export const PAYSTACK_COLLECTION_JOURNEY_DECLARATION = Object.freeze({
  useCaseRef: "own-store-test-mode" as const,
  capabilityState:
    "Hosted payment pages and transaction initialization/verification are implemented on the provider plane (test mode), each deriving its own sandbox grant at dispatch from the same sealed test key — the connection scope stays read-only. A collection request is a payment request the customer still authorizes on the provider's hosted page; it is never money movement by itself.",
  purposeLaw:
    "Collection is the genuine-commerce product: the typed purpose class is required on every collection path and a remittance/P2P or unclassified purpose is refused (INV-30 — relabeling never changes eligibility).",
});

/**
 * THE HONEST RECIPIENT/POUT-JOURNEY STATE (the K3/K4 record as an
 * app-side declaration): the recipient plane is implemented provider-side
 * with the typed request gate, but NO recipient-type availability fact is
 * encoded anywhere — the Paystack docs were unreachable at the 2026-11-03
 * station (re-verified the same day by this lane), so every recipient
 * create refuses until the live-doc re-verification and the real-account
 * probe land the dated observations. Nothing dispatchable is claimed.
 */
export const PAYSTACK_RECIPIENT_JOURNEY_DECLARATION = Object.freeze({
  useCaseRef: "own-store-test-mode" as const,
  capabilityState:
    "The typed recipient plane is implemented on the provider plane (create/list over the transfer-recipient API), but no recipient-type availability fact is encoded: the registration-claimed candidate types (ghipss/mobile_money/nuban/basa/kepss) were UNVERIFIED at the 2026-11-03 station — paystack.com was unreachable from the station (a Cloudflare managed challenge on every docs page; the docs domain does not resolve). Every recipient create honestly refuses until the live-doc re-verification and the real-account probe land the dated evidence observations.",
  reVerificationStatus: "OPERATOR_GATED" as const,
});

/**
 * THE ONBOARDING-JOURNEY NOTE (rendered with the link cards): the links
 * are the provider's own onboarding paths — opening one never connects an
 * account, and repository work never registers an external account. The
 * operator's path is the run card (distinct per-country business accounts
 * and keys supplied through the station secret channel).
 */
export const PAYSTACK_AFRICA_ONBOARDING_NOTE =
  "These are the provider's own onboarding paths for the markets Stripe lists under its Extended Network — opening one never connects an account, and no repository change registers an external account. Each participating business connects its own Paystack account per country; its test keys reach PaySwap only through the station secret channel, never in chat." as const;

/** The K3/K4 honest gate note (rendered with the recipient-journey card). */
export const PAYSTACK_AFRICA_K34_GATE_NOTE =
  "The recipient-type and country/method facts (ghipss, mobile_money, nuban, basa, kepss; the Bank-of-Ghana exclusion) are pending live-doc re-verification — they were not verifiable at the 2026-11-03 station, and nothing unverified is ever encoded or dispatched. This is the operator-gated evidence path, not a silent pass." as const;
