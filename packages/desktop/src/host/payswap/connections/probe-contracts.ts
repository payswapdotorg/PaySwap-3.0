/**
 * PaySwap Desktop (P21-A, ADR-0014 D5/D9) — the connection-ACTIVATION
 * plane contracts: the channel DTOs + the frozen vocabularies for the
 * three new members (the Flutterwave/Paystack key-entry verbs + the
 * host-side REAL verification-probe runner).
 *
 * CHANNEL LAWS (see also ./contracts.ts — the P13-B laws carry over):
 * - NO MATERIAL renderer-ward: the outcome DTOs carry provider
 *   REFERENCES and lifecycle facts only — never key material, never the
 *   broker's sealed payload, never the credential handle. The ONE
 *   material-carrying path stays the key-entry submission (renderer →
 *   host, once, sealed immediately; the receipt carries counts and the
 *   opaque handle ref, never the key).
 * - THE ONLY ACTIVE PATH: a connection reaches ACTIVE exclusively
 *   through the authority's own recordVerificationOutcome with a
 *   probe-CONFIRMED outcome (the caller-trust fix: the probe runs
 *   HOST-SIDE inside the credential seal — the existing
 *   connectionRecordVerificationOutcome member stays for the labeled
 *   scripted/fixture tier only).
 * - THE EVIDENCE-TIER LAW (D9): every derived fact carries its tier.
 *   The probe outcome + the evidence ledger are PROVIDER_OBSERVATION —
 *   what the provider's own read-only endpoints answered, never more
 *   (F3: a Flutterwave probe proves balance-read ONLY; a Stripe probe
 *   proves balance + account read; a Paystack probe proves transactions
 *   read).
 * - INV-25 unchanged: the test-prefix shape checks fail closed; LIVE
 *   keys are refused at the key-entry verbs, never sealed.
 */

/** The providers a REAL verification probe exists for in this deployment. */
export const PAYSWAP_PROBE_PROVIDER_IDS = ["stripe", "flutterwave", "paystack"] as const;
export type PaySwapProbeProviderId = (typeof PAYSWAP_PROBE_PROVIDER_IDS)[number];

/**
 * (P22-H, ADR-0016 D2/D9) The ONCHAIN RAIL provider ref the Stellar
 * account-read probe addresses — NEVER a member of
 * PAYSWAP_PROBE_PROVIDER_IDS (the PSP vocabulary stays closed; the
 * Stellar rail is not a payment provider — ADR-0008 D5).
 */
export const PINNED_STELLAR_RAIL_PROVIDER_REF = "stellar:testnet" as const;

/** The provider refs a probe-evidence record may carry (the PSP triple + the onchain rail). */
export type ConnectionProbeProviderRef = PaySwapProbeProviderId | typeof PINNED_STELLAR_RAIL_PROVIDER_REF;

/** The Stellar account-read probe's operation label (people-facing evidence surface). */
export const STELLAR_ACCOUNT_READ_PROBED_OPERATION = "stellar.account.read" as const;

/**
 * The honest Stellar account-read scope note (rendered verbatim on the
 * outcome — the P22-H D9 law: the probe is the Horizon account read,
 * read-only; an unfunded account is honestly FAILED, never a fabricated
 * CONFIRMED position).
 */
export const STELLAR_ACCOUNT_READ_HONEST_NOTE =
  "A Stellar account read proves the keypair's account is readable on the Stellar testnet through Horizon — nothing more. An unfunded account fails honestly (fund it on testnet before it can ground a corridor relay); asset positions observed are testnet facts, never live-funds claims (INV-25; the pubnet plane is not offered in this deployment).";

/** The probe outcome vocabulary (the result-envelope mirror, reused). */
export const CONNECTION_PROBE_OUTCOME_KINDS = ["CONFIRMED", "UNKNOWN", "FAILED"] as const;
export type ConnectionProbeOutcomeKind = (typeof CONNECTION_PROBE_OUTCOME_KINDS)[number];

/**
 * The evidence-tier vocabulary for every fact this plane derives (D9).
 * The probe facts are PROVIDER_OBSERVATION — the tiers never mix.
 */
export const CONNECTION_PROBE_EVIDENCE_TIERS = ["PROVIDER_OBSERVATION"] as const;
export type ConnectionProbeEvidenceTier = (typeof CONNECTION_PROBE_EVIDENCE_TIERS)[number];

/**
 * The credential-class vocabulary the probe observes INSIDE the seal
 * (structural key facts — public prefix vocabulary, never secret
 * material). The class is the grant-derivation input: only a FULL_TEST
 * Stripe key derives the SANDBOX execution grant; a RESTRICTED_TEST key
 * never does; the Flutterwave/Paystack test keys are READ_ONLY_TEST by
 * construction (F3/C9 — no send operation exists for them at all).
 */
export const CONNECTION_PROBE_KEY_CLASSES = [
  "FULL_TEST",
  "RESTRICTED_TEST",
  "READ_ONLY_TEST",
] as const;
export type ConnectionProbeKeyClass = (typeof CONNECTION_PROBE_KEY_CLASSES)[number];

/** The probed-operation label per provider (people-facing evidence surface). */
export const CONNECTION_PROBE_OPERATIONS: Readonly<Record<PaySwapProbeProviderId, string>> =
  Object.freeze({
    stripe: "stripe.balance.read + stripe.account.read",
    flutterwave: "flutterwave.balances.read",
    paystack: "paystack.transactions.read",
  });

/**
 * The honest per-provider scope note (rendered verbatim on the outcome;
 * the F3 law is stated in the Flutterwave note — a read-only probe is
 * rail-connection evidence, NEVER send-capability evidence).
 */
export const CONNECTION_PROBE_HONEST_NOTES: Readonly<Record<PaySwapProbeProviderId, string>> =
  Object.freeze({
    stripe:
      "A Stripe probe proves balance and account read access on the connected test account — nothing more. Merchant acceptance facts come only from the merchant directory (labeled test data), never from this probe.",
    flutterwave:
      "A Flutterwave probe proves read-only balance access on the connected test account — never a send capability. No Flutterwave send or transfer operation exists in this deployment, so this evidence cannot make any outgoing payment eligible.",
    paystack:
      // P22-H amendment (ADR-0016 D8, disclosed): the payout lane EXISTS
      // now — the note's old claim "no send or transfer operation exists"
      // is honestly amended to name the SANDBOX payout grant's derivation
      // point (the execution kernel at dispatch, never this probe).
      "A Paystack probe proves read-only transaction-list access on the connected test account — never a send capability by itself. The sealed test key may derive the SANDBOX payout grant at dispatch (the corridor's KES off-ramp lane, ADR-0016 D8) — only through the execution kernel's grant law inside the seal, never from this probe's evidence.",
  });

/** One probed connection's secret-free result (the outcome DTO row). */
export interface ConnectionProbeResultDto {
  readonly connectionId: string;
  readonly outcome: ConnectionProbeOutcomeKind;
  /** Provider references the probe read (wallets / account / transactions). */
  readonly providerReferences: readonly string[];
  /** The connection state AFTER the outcome was recorded through the authority. */
  readonly state: string;
  /** People-language summary (no envelope internals, no key material). */
  readonly summary: string;
  /** Present iff FAILED — the provider failure code, never verbatim provider text. */
  readonly failureCode?: string;
}

/** The secret-free outcome of one probe run (the member's answer). */
export interface ConnectionProbeOutcomeDto {
  readonly providerId: PaySwapProbeProviderId;
  readonly probedOperation: string;
  readonly results: readonly ConnectionProbeResultDto[];
  readonly evidenceTier: ConnectionProbeEvidenceTier;
  readonly note: string;
}
