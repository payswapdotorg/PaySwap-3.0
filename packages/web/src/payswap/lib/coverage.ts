/**
 * @zcode/web/payswap — the honest coverage fold.
 *
 * ADAPT of payswap.org@8a735bf packages/web/src/lib/coverage.ts (244L)
 * (MMP-36 content/IA evidence): the honest provider-coverage view law.
 * The old module imported the old repo's recorded probe/rollout JSONs at
 * build time; the canonical PaySwap 3.0 repository has NO committed
 * provider-probe evidence yet, so this fold consumes the recorded evidence
 * as an EXPLICIT INPUT (CoverageSource — data via props/contracts, never
 * a network call and never an ambient import) and the deployment default
 * is the honest no-evidence state (contracts/harness.ts NO_EVIDENCE_COVERAGE).
 *
 * PORTED LAW: the fold never invents a provider, never upgrades a status,
 * and never renders a provider as connected when the record says
 * otherwise. Statuses partition VERBATIM (BLOCKED / NO_CREDENTIAL_HELD /
 * NOT_ACTIVATED are rendered exactly as recorded). When no evidence is
 * recorded at all, the view says so — an empty evidence base is a FACT,
 * not a failure tone and never silently hidden.
 */

import type {
  CoverageSource,
  CoverageView,
  NonConnectionRecord,
} from "../contracts/view-models.js";

/** Human display labels for provider identifiers used by the records. */
const PROVIDER_LABELS: Readonly<Record<string, string>> = {
  stripe: "Stripe",
  paystack: "Paystack",
  flutterwave: "Flutterwave",
  mtn_momo: "MTN MoMo",
  "paypal-direct": "PayPal Direct",
  rapyd: "Rapyd",
  dlocal: "dLocal",
  thunes: "Thunes",
  adyen: "Adyen",
  airwallex: "Airwallex",
  ebanx: "EBANX",
  stellar: "Stellar (local rail)",
  stellar_testnet: "Stellar testnet (local rail)",
  whatsapp: "WhatsApp Cloud API",
  resend: "Resend",
  opensanctions: "OpenSanctions",
};

/** Display label for a provider id — unknown ids render verbatim (honest). */
export function providerLabel(providerName: string): string {
  return PROVIDER_LABELS[providerName] ?? providerName;
}

/** "2026-10-02T06:37:38Z" -> "2026-10-02 06:37 UTC" (deterministic, no locale). */
export function formatUtcTimestamp(iso: string): string {
  const date = iso.slice(0, 10);
  const time = iso.slice(11, 16);
  return time.length === 5 ? `${date} ${time} UTC` : date;
}

/** The recorded non-connection statuses the fold partitions on (verbatim). */
export const BLOCKED_STATUS = "BLOCKED" as const;
export const NO_CREDENTIAL_STATUS = "NO_CREDENTIAL_HELD" as const;
export const NOT_ACTIVATED_STATUS = "NOT_ACTIVATED" as const;

/** Raised when a non-connection record carries an unrecorded status (fail-closed). */
export class InvalidCoverageSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCoverageSourceError";
  }
}

/**
 * Fold the recorded evidence into the honest coverage view.
 *
 * Deterministic and pure: same source, same view. No status is upgraded,
 * no provider is invented, and an empty evidence base surfaces as
 * `noEvidenceRecorded: true` (the honest fact). An unrecognized
 * non-connection status fails CLOSED — the old module's "fail the build
 * loudly instead of silently rendering wrong truth" law, kept: a drifted
 * evidence record must never be silently bucketed or silently dropped.
 */
export function foldCoverage(source: CoverageSource): CoverageView {
  const blocked: NonConnectionRecord[] = [];
  const awaitingCredentials: NonConnectionRecord[] = [];
  const localRail: NonConnectionRecord[] = [];
  for (const entry of source.nonConnections) {
    if (entry.status === BLOCKED_STATUS) {
      blocked.push(entry);
    } else if (entry.status === NO_CREDENTIAL_STATUS) {
      awaitingCredentials.push(entry);
    } else if (entry.status === NOT_ACTIVATED_STATUS) {
      localRail.push(entry);
    } else {
      throw new InvalidCoverageSourceError(
        `coverage: non-connection record for '${entry.providerName}' carries an unrecorded status '${entry.status}' — refusing to render a guessed bucket`,
      );
    }
  }
  const noEvidenceRecorded =
    source.probedAt === "" &&
    source.connected.length === 0 &&
    source.nonConnections.length === 0;
  return {
    probedAt: source.probedAt,
    releaseId: source.releaseId,
    connected: source.connected,
    blocked,
    awaitingCredentials,
    localRail,
    supportingServices: source.supportingServices,
    noEvidenceRecorded,
  };
}
