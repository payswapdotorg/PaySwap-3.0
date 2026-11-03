/**
 * @payswap/provider-runtime — the Paystack recipient FACTS registry
 * (P27-C, ADR-0020 D10/D11): the registration-claimed candidate
 * recipient-type vocabulary, the DATED-EVIDENCE observation shape that
 * ALONE carries a recipient-type availability fact, the empty registry
 * this deployment ships, and the honest station record of the K3/K4
 * re-verification attempts. Split from recipient-plane.ts per the
 * <=400-line file law (facts vs execution — the Stripe
 * webhook-signature/webhook-verification split precedent).
 *
 * THE K3/K4 LAW (the binding constraint): every recipient-type x
 * country x currency fact is an EVIDENCE-STAMPED OBSERVATION with a
 * retrieval date and source URL, re-verified against LIVE provider
 * documentation AND the actual account before it is encoded — never a
 * flag. paystack.com was UNREACHABLE at both the P27-0 station and
 * this lane's 2026-11-03 re-verification attempts (the record below
 * carries the attempt URLs and outcomes). THEREFORE the registry ships
 * EMPTY: the candidate names are the registration's CLAIMED vocabulary
 * only, and recipient-plane.ts's builder REFUSES every request whose
 * (type, country, currency) triple has no VERIFIED evidence entry.
 * Populating the registry is the standing OPERATOR_GATED action; the
 * operator-gated harness receipt (a REAL account probe) is the
 * evidence path — a fixture observation is NEVER promoted here.
 */

import { ValidationError } from '../../errors.ts';

// ---------------------------------------------------------------------------
// The candidate recipient-type vocabulary (the registration's K3 claim —
// UNVERIFIED AT STATION; names only, never availability facts).
// ---------------------------------------------------------------------------

/**
 * The registration-claimed candidate recipient types (K3): Ghana
 * `ghipss`/`mobile_money` (GHS), Kenya `kepss`/`mobile_money` (KES),
 * Nigeria `nuban` (NGN), South Africa `basa` (ZAR). These are CANDIDATE
 * NAMES ONLY — the dated-evidence registry below decides which of them
 * are real, for which account and market, and it ships EMPTY until the
 * live-doc + real-account re-verification lands (D10).
 */
export const PAYSTACK_RECIPIENT_TYPE_CANDIDATES = [
  'ghipss',
  'mobile_money',
  'nuban',
  'basa',
  'kepss',
] as const;
export type PaystackRecipientTypeCandidate = (typeof PAYSTACK_RECIPIENT_TYPE_CANDIDATES)[number];

export function isPaystackRecipientTypeCandidate(
  value: unknown,
): value is PaystackRecipientTypeCandidate {
  return (
    typeof value === 'string' &&
    (PAYSTACK_RECIPIENT_TYPE_CANDIDATES as readonly unknown[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// The dated-evidence registry (D10 — the ONLY source of recipient facts).
// ---------------------------------------------------------------------------

/** The evidence tier that stamped a fact (never promotable from fixtures). */
export const PAYSTACK_RECIPIENT_EVIDENCE_TIERS = [
  'LIVE_PROVIDER_DOC',
  'REAL_ACCOUNT_PROBE',
] as const;
export type PaystackRecipientEvidenceTier = (typeof PAYSTACK_RECIPIENT_EVIDENCE_TIERS)[number];

/** What a verified observation established about one (type, country, currency) triple. */
export const PAYSTACK_RECIPIENT_FACT_STATUSES = [
  'VERIFIED_AVAILABLE',
  'VERIFIED_EXCLUDED',
] as const;
export type PaystackRecipientFactStatus = (typeof PAYSTACK_RECIPIENT_FACT_STATUSES)[number];

/**
 * ONE dated evidence observation (ADR-0020 D10): a recipient type's
 * real-world availability for one country × currency, stamped with the
 * retrieval date, the source URL and the tier that verified it. Nothing
 * else in this adapter may encode a recipient-type availability fact.
 */
export interface PaystackRecipientTypeEvidence {
  /** The candidate recipient type the observation is about. */
  readonly recipientType: PaystackRecipientTypeCandidate;
  /** Uppercase ISO 3166-1 alpha-2 market (e.g. 'GH', 'KE', 'NG', 'ZA'). */
  readonly country: string;
  /** Uppercase ISO 4217 currency (e.g. 'GHS', 'KES', 'NGN', 'ZAR'). */
  readonly currency: string;
  readonly status: PaystackRecipientFactStatus;
  /** The live provider documentation page the fact was re-verified against. */
  readonly sourceUrl: string;
  /** Retrieval date (ISO 8601 date, e.g. '2026-11-03') — freshness is law. */
  readonly retrievedAt: string;
  readonly evidenceTier: PaystackRecipientEvidenceTier;
  /**
   * The wire fields the re-verified docs require for this type (the
   * builder enforces exactly these; a fixture list is never encoded).
   */
  readonly requiredFields: readonly string[];
  /**
   * Present when the docs verified an institution-level exclusion (e.g.
   * the registration's claimed Bank-of-Ghana transfer exclusion):
   * opaque institution references refused at validation time.
   */
  readonly excludedInstitutionRefs?: readonly string[];
}

/** The wire-field names the builder knows (the generic API surface candidates). */
const KNOWN_REQUEST_FIELDS: ReadonlySet<string> = new Set([
  'name',
  'account_number',
  'bank_code',
  'phone_number',
  'description',
]);

/** Fail-closed validation of ONE evidence observation (shape + datedness). */
export function validatePaystackRecipientTypeEvidence(record: unknown): PaystackRecipientTypeEvidence {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    throw new ValidationError('a Paystack recipient-type evidence observation must be an object');
  }
  const candidate = record as Record<string, unknown>;
  if (!isPaystackRecipientTypeCandidate(candidate['recipientType'])) {
    throw new ValidationError(
      'a recipient-type evidence observation must name a candidate type from the registration vocabulary (ghipss/mobile_money/nuban/basa/kepss)',
      { recipientType: candidate['recipientType'] },
    );
  }
  if (typeof candidate['country'] !== 'string' || !/^[A-Z]{2}$/.test(candidate['country'])) {
    throw new ValidationError('recipient-type evidence requires an uppercase ISO alpha-2 country');
  }
  if (typeof candidate['currency'] !== 'string' || !/^[A-Z]{3}$/.test(candidate['currency'])) {
    throw new ValidationError('recipient-type evidence requires an uppercase ISO currency code');
  }
  const status = candidate['status'];
  if (
    typeof status !== 'string' ||
    !(PAYSTACK_RECIPIENT_FACT_STATUSES as readonly unknown[]).includes(status)
  ) {
    throw new ValidationError('recipient-type evidence requires a canonical fact status');
  }
  if (typeof candidate['sourceUrl'] !== 'string' || !candidate['sourceUrl'].startsWith('https://')) {
    throw new ValidationError('recipient-type evidence requires the live source URL it was verified against');
  }
  if (typeof candidate['retrievedAt'] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(candidate['retrievedAt'])) {
    throw new ValidationError('recipient-type evidence requires an ISO retrieval date (retrievedAt)');
  }
  const tier = candidate['evidenceTier'];
  if (
    typeof tier !== 'string' ||
    !(PAYSTACK_RECIPIENT_EVIDENCE_TIERS as readonly unknown[]).includes(tier)
  ) {
    throw new ValidationError('recipient-type evidence requires a canonical evidence tier');
  }
  if (!Array.isArray(candidate['requiredFields']) || candidate['requiredFields'].length === 0) {
    throw new ValidationError('recipient-type evidence must list the re-verified required wire fields');
  }
  for (const field of candidate['requiredFields']) {
    if (typeof field !== 'string' || !KNOWN_REQUEST_FIELDS.has(field)) {
      throw new ValidationError('a required field is not one of the known request wire fields', {
        field,
      });
    }
  }
  if (candidate['excludedInstitutionRefs'] !== undefined) {
    if (
      !Array.isArray(candidate['excludedInstitutionRefs']) ||
      candidate['excludedInstitutionRefs'].length === 0
    ) {
      throw new ValidationError('excludedInstitutionRefs, when present, must be a non-empty list');
    }
    for (const ref of candidate['excludedInstitutionRefs']) {
      if (typeof ref !== 'string' || ref.length === 0) {
        throw new ValidationError('an excluded institution reference must be a non-empty string');
      }
    }
  }
  return candidate as unknown as PaystackRecipientTypeEvidence;
}

/**
 * THE STATION RECORD of the K3/K4 re-verification attempts (2026-11-03,
 * the P27-C station — D10's honest record; a station-environment fact,
 * not a failure): every path below was attempted with a real
 * browser-like User-Agent and found blocked —
 * - `docs.paystack.com/transfer-recipient` + `/transfers` — DNS does not
 *   resolve at this station (NXDOMAIN; curl error 6);
 * - `paystack.com/docs/transfers/`, `paystack.com/docs/transfer-recipient`,
 *   `paystack.com/developers`, `developer.paystack.com` — Cloudflare
 *   "Just a moment…" managed challenge (HTTP 403; a real headless
 *   Chromium via agent-browser did not pass it either);
 * - the Wayback availability API reports NO archived snapshot for
 *   docs.paystack.com/transfers; direct web.archive.org fetches time out;
 * - the r.jina.ai reader proxy answers that it cannot resolve the domain;
 * - `api.paystack.co` IS reachable (it answers 401 without credentials —
 *   the honest no-credential answer), but no account credentials exist
 *   at this station (D11 — the operator-gated harness is the path).
 * NO recipient/country/method fact is encoded from the registration
 * claim. The encoding gate is the OPERATOR_GATED harness receipt plus a
 * reachable-docs re-verification, landed as dated observations here.
 */
export const PAYSTACK_RECIPIENT_FACTS_STATION_RECORD = Object.freeze({
  attemptedAt: '2026-11-03',
  lane: 'P27-C',
  conclusion: 'UNVERIFIED_AT_STATION' as const,
  attempts: Object.freeze([
    Object.freeze({ url: 'https://docs.paystack.com/transfer-recipient', outcome: 'DNS_NXDOMAIN' }),
    Object.freeze({ url: 'https://docs.paystack.com/transfers', outcome: 'DNS_NXDOMAIN' }),
    Object.freeze({ url: 'https://paystack.com/docs/transfers/', outcome: 'CLOUDFLARE_MANAGED_CHALLENGE_403' }),
    Object.freeze({ url: 'https://paystack.com/docs/transfer-recipient', outcome: 'CLOUDFLARE_MANAGED_CHALLENGE_403' }),
    Object.freeze({ url: 'https://developer.paystack.com/', outcome: 'DNS_NXDOMAIN' }),
    Object.freeze({ url: 'https://web.archive.org/web/2026/https://docs.paystack.com/transfers', outcome: 'CONNECTION_TIMEOUT' }),
    Object.freeze({ url: 'https://archive.org/wayback/available?url=docs.paystack.com/transfers', outcome: 'RATE_LIMITED_429' }),
    Object.freeze({ url: 'https://api.paystack.co/transaction', outcome: 'REACHABLE_HTTP_401_WITHOUT_CREDENTIALS' }),
  ]),
});

/**
 * THE DATED-EVIDENCE REGISTRY (D10/D11) — **ships EMPTY**. Every
 * recipient-type availability fact is encoded here ONLY after the live-
 * doc re-verification AND the real-account probe (the K3/K4 obligation).
 * Until then the builder below refuses every typed recipient request.
 * THIS ARRAY IS THE OPERATOR_GATED ITEM: populating it is the standing
 * operator action recorded in the P27-C lane report (the harness receipt
 * is the evidence path; a fixture observation is NEVER promoted here).
 */
export const PAYSTACK_RECIPIENT_TYPE_EVIDENCE: readonly PaystackRecipientTypeEvidence[] =
  Object.freeze([]);

/**
 * The evidence lookup (fail-closed): the VERIFIED observation for one
 * (type, country, currency) triple, or undefined. The registry is
 * injectable so the composition edge can supply fresher evidence at
 * dispatch (the D10 freshness seam) — never guessed, never defaulted.
 */
export function paystackRecipientTypeEvidenceFor(
  registry: readonly PaystackRecipientTypeEvidence[],
  recipientType: PaystackRecipientTypeCandidate,
  country: string,
  currency: string,
): PaystackRecipientTypeEvidence | undefined {
  for (const record of registry) {
    const validated = validatePaystackRecipientTypeEvidence(record);
    if (
      validated.recipientType === recipientType &&
      validated.country === country &&
      validated.currency === currency &&
      validated.status === 'VERIFIED_AVAILABLE'
    ) {
      return validated;
    }
  }
  return undefined;
}

