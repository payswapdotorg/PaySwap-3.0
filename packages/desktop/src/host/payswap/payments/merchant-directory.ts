/**
 * PaySwap Desktop (P21-A, ADR-0014 D6) — the TEST_DATA MERCHANT
 * DIRECTORY: the labeled fixture tier that gives the operator's journey
 * a destination to name ("Pay merchant X").
 *
 * THE LABEL LAW (D6/D9): the directory's facts are TEST_DATA — declared
 * test fixtures, NEVER provider observations. Merchant acceptance for
 * the Stripe side comes ONLY from this directory; the probe evidence
 * (PROVIDER_OBSERVATION) proves balance/account read, never merchant
 * acceptance — the tiers never mix. The entry's receiving context MAPS
 * onto the connected Stripe test account (the connection reference) at
 * bridge time: the mapping is a directory fact (which rail the merchant
 * receives on), the connection's ACTIVE state is provider evidence.
 *
 * THE INTAKE LAW: when the user's intent names a merchant, the
 * destination capture resolves against this directory by EXACT display
 * name; if no merchant matches, the intake ASKS (never invents) — this
 * module only ANSWERS lookups, it never writes captures.
 */

/** The directory's evidence tier (the label law — never a provider observation). */
export const MERCHANT_DIRECTORY_EVIDENCE_TIER = "TEST_DATA" as const;

/** One merchant directory entry (a declared test fixture). */
export interface MerchantDirectoryEntry {
  /** The stable identifier (the journey's "Pay merchant X" reference). */
  readonly merchantId: string;
  /** The display name the destination capture matches EXACTLY. */
  readonly displayName: string;
  readonly evidenceTier: typeof MERCHANT_DIRECTORY_EVIDENCE_TIER;
  /** The merchant's receiving context (which rail the merchant receives on). */
  readonly receivingContext: {
    readonly providerId: "stripe";
    /** The receiving currency (the test corridor's destination currency). */
    readonly receivingCurrency: string;
    readonly summary: string;
  };
}

/**
 * The directory (frozen): one entry this wave — Merchant X, the
 * Stripe-only test merchant of the operator's ordered journey.
 */
const MERCHANT_DIRECTORY: readonly MerchantDirectoryEntry[] = Object.freeze([
  Object.freeze({
    merchantId: "merchant:stripe-only-test",
    displayName: "Merchant X (Stripe-only test)",
    evidenceTier: MERCHANT_DIRECTORY_EVIDENCE_TIER,
    receivingContext: Object.freeze({
      providerId: "stripe" as const,
      receivingCurrency: "USD",
      summary:
        "Merchant X receives on a Stripe test-mode account (labeled TEST_DATA — a declared directory fixture, not a provider observation). The receiving context maps onto the connected Stripe test account; merchant acceptance facts come only from this directory.",
    }),
  }),
]);

/** The directory listing (TEST_DATA — the destination provider's answer). */
export function listMerchantDirectoryEntries(): readonly MerchantDirectoryEntry[] {
  return MERCHANT_DIRECTORY;
}

/**
 * Resolve a destination capture against the directory by EXACT display
 * name (the accounts-gate exactness law): null when no merchant
 * matches — the intake asks, never invents.
 */
export function findMerchantDirectoryEntry(recipient: string): MerchantDirectoryEntry | null {
  const stated = typeof recipient === "string" ? recipient.trim() : "";
  return MERCHANT_DIRECTORY.find((entry) => entry.displayName === stated) ?? null;
}
