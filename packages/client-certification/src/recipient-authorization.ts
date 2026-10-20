/**
 * @payswap/client-certification — authorized recipient changes + fresh
 * eligibility/quote conditions (P8-W2, hard laws 4 and 5).
 *
 * REAUTHORED from the old-repo disciplines (payswap.org@8a735bf
 * packages/journeys customer-action journey + the W1-007
 * reauthorization law) onto the canonical architecture with the
 * vocabularies PINNED from @payswap/surface (authorization-change
 * kinds, quote freshness) and @payswap/capability (eligibility
 * observations, authorization statuses) and the drift law pinned from
 * @payswap/onchain-security recheck (any drift VOIDS the
 * authorization — re-requested, never auto-repaired).
 *
 * LAW 4: a recipient/beneficiary change after quote/eligibility
 * INVALIDATES the prior authorization — the surface MUST re-verify
 * (fresh eligibility + fresh quote conditions) and never silently
 * carry stale authorization.
 *
 * LAW 5: eligibility and quote freshness are carried WITH the state
 * that displays them; a stale display (old recipient, expired quote,
 * observation predating the change) is a certification failure.
 *
 * Deterministic only: instants are explicit inputs (ISO-8601 strings).
 */

import type { PinnedAuthorizationStatus } from "./pins/capability.ts";
import type {
  PinnedAuthorizationChangeKind,
  PinnedQuoteFreshnessStatus,
} from "./pins/surface.ts";
import { CLIENT_GATE_HALT_ACTION, CLIENT_GATE_SEVERITY } from "./verdict.ts";
import type { ClientGateResult, CertificationViolation } from "./verdict.ts";
import { violationOf } from "./verdict.ts";
import { contentDigest } from "./digest.ts";

const LAW4 = "recipient-authorization" as const;
const LAW5 = "fresh-conditions" as const;

/** The authorization as it was approved (references, never records). */
export interface AuthorizationSnapshot {
  readonly authorizationId: string;
  /** The recipient the authorization is bound to (the binding is the law). */
  readonly boundRecipientId: string;
  /** The quote-conditions record the authorization approved. */
  readonly approvedQuoteRef: string;
  /** The eligibility observation version the authorization was based on. */
  readonly eligibilityObservationVersion: number;
  /** The quote version the authorization was based on. */
  readonly quoteVersion: number;
  readonly status: PinnedAuthorizationStatus;
}

/** An observed recipient change (explicit detection instant). */
export interface RecipientChangeObservation {
  readonly changeId: string;
  readonly kind: PinnedAuthorizationChangeKind;
  readonly newRecipientId: string;
  readonly detectedAt: string;
}

/**
 * The disposition of a recipient change against an authorization.
 * A change to a DIFFERENT recipient always INVALIDATES: fresh
 * eligibility and fresh quote conditions are REQUIRED. Re-issuing the
 * authorization is the only path forward — there is no repair API.
 */
export type RecipientChangeDisposition =
  | {
      readonly outcome: "INVALIDATED";
      readonly freshEligibilityRequired: true;
      readonly freshQuoteConditionsRequired: true;
      readonly reason: string;
    }
  | {
      readonly outcome: "NO_CHANGE";
      readonly freshEligibilityRequired: false;
      readonly freshQuoteConditionsRequired: false;
      readonly reason: string;
    };

/** Fold one change against one authorization (deterministic, pure). */
export function evaluateRecipientChange(input: {
  readonly authorization: AuthorizationSnapshot;
  readonly change: RecipientChangeObservation;
}): RecipientChangeDisposition {
  if (
    input.change.kind !== "RECIPIENT_CHANGED" ||
    input.change.newRecipientId === input.authorization.boundRecipientId
  ) {
    return {
      outcome: "NO_CHANGE",
      freshEligibilityRequired: false,
      freshQuoteConditionsRequired: false,
      reason:
        "the recipient in scope is the recipient the authorization is bound to — the authorization stands",
    };
  }
  return {
    outcome: "INVALIDATED",
    freshEligibilityRequired: true,
    freshQuoteConditionsRequired: true,
    reason:
      "the approved authorization was bound to a specific recipient; a different recipient invalidates it by design — fresh eligibility and fresh quote conditions are required before anything moves",
  };
}

/** The eligibility observation feeding the display. */
export interface DisplayedEligibility {
  readonly observationVersion: number;
  /** The recipient this observation is ABOUT. */
  readonly subjectRecipientId: string;
  /** When the observation was made (explicit input; ISO-8601). */
  readonly observedAt: string;
}

/** The quote conditions feeding the display. */
export interface DisplayedQuoteConditions {
  readonly quoteVersion: number;
  /** The recipient the quote was issued for. */
  readonly subjectRecipientId: string;
  readonly freshness: PinnedQuoteFreshnessStatus;
  /** When the quote was issued (explicit input; ISO-8601). */
  readonly issuedAt: string;
}

/** What the surface displays after the change (the certified fold). */
export interface PostChangeDisplay {
  /** Does the surface still treat the PRIOR authorization as valid? */
  readonly carriesPriorAuthorization: boolean;
  readonly eligibility: DisplayedEligibility;
  readonly quote: DisplayedQuoteConditions;
}

function isoAtOrAfter(candidate: string, floor: string): boolean {
  return candidate >= floor;
}

/**
 * Hard law 4 gate — the recipient-authorization gate: after a recipient
 * change the surface must NOT carry the prior authorization.
 */
export function runRecipientAuthorizationGate(input: {
  readonly authorization: AuthorizationSnapshot;
  readonly change: RecipientChangeObservation;
  readonly display: PostChangeDisplay;
}): ClientGateResult {
  const violations: CertificationViolation[] = [];
  const disposition = evaluateRecipientChange(input);
  if (
    disposition.outcome === "INVALIDATED" &&
    input.display.carriesPriorAuthorization
  ) {
    violations.push(
      violationOf(
        LAW4,
        "stale_authorization_carried",
        `change '${input.change.changeId}' moved the recipient from '${input.authorization.boundRecipientId}' to '${input.change.newRecipientId}' but the surface still carries prior authorization '${input.authorization.authorizationId}' — the change invalidates it`,
      ),
    );
  }
  if (
    disposition.outcome === "INVALIDATED" &&
    input.authorization.status === "ACTIVE"
  ) {
    // The SNAPSHOT may still say ACTIVE (the authority has not observed
    // the change yet); the SURFACE must not rely on it. This is the
    // never-silently-carry law: the display is certified, not the record.
    if (input.display.eligibility.subjectRecipientId !== input.change.newRecipientId) {
      violations.push(
        violationOf(
          LAW4,
          "reverification_not_fresh",
          "the surface displays eligibility observed for the prior recipient — a recipient change forces fresh eligibility for the NEW recipient",
        ),
      );
    }
  }
  return Object.freeze({
    law: LAW4,
    severity: CLIENT_GATE_SEVERITY,
    passed: violations.length === 0,
    violations: Object.freeze(violations),
    checked: 1,
    digest: contentDigest({
      law: LAW4,
      haltAction: CLIENT_GATE_HALT_ACTION,
      disposition,
      violations,
    }),
  });
}

/**
 * Hard law 5 gate — the fresh-conditions gate: eligibility and quote
 * conditions are carried with the display; stale display is a failure.
 */
export function runFreshConditionsGate(input: {
  readonly authorization: AuthorizationSnapshot;
  readonly change: RecipientChangeObservation;
  readonly display: PostChangeDisplay;
}): ClientGateResult {
  const violations: CertificationViolation[] = [];
  const recipientChanged =
    input.change.kind === "RECIPIENT_CHANGED" &&
    input.change.newRecipientId !== input.authorization.boundRecipientId;

  if (
    recipientChanged &&
    input.display.eligibility.subjectRecipientId !== input.change.newRecipientId
  ) {
    violations.push(
      violationOf(
        LAW5,
        "stale_eligibility_displayed",
        `the displayed eligibility (v${input.display.eligibility.observationVersion}) is about recipient '${input.display.eligibility.subjectRecipientId}' — after the change it must be about '${input.change.newRecipientId}'`,
      ),
    );
  }
  if (
    recipientChanged &&
    !isoAtOrAfter(
      input.display.eligibility.observedAt,
      input.change.detectedAt,
    )
  ) {
    violations.push(
      violationOf(
        LAW5,
        "stale_eligibility_displayed",
        `the displayed eligibility was observed at ${input.display.eligibility.observedAt}, before the change was detected at ${input.change.detectedAt} — stale display is a certification failure`,
      ),
    );
  }
  if (
    recipientChanged &&
    input.display.quote.subjectRecipientId !== input.change.newRecipientId
  ) {
    violations.push(
      violationOf(
        LAW5,
        "stale_quote_conditions_displayed",
        `the displayed quote (v${input.display.quote.quoteVersion}) was issued for recipient '${input.display.quote.subjectRecipientId}' — after the change it must be issued for '${input.change.newRecipientId}'`,
      ),
    );
  }
  if (input.display.quote.freshness === "EXPIRED") {
    violations.push(
      violationOf(
        LAW5,
        "expired_quote_displayed",
        "the displayed quote is EXPIRED — the quoted terms are no longer offered; a fresh quote is required before anything moves",
      ),
    );
  }
  return Object.freeze({
    law: LAW5,
    severity: CLIENT_GATE_SEVERITY,
    passed: violations.length === 0,
    violations: Object.freeze(violations),
    checked: 2,
    digest: contentDigest({
      law: LAW5,
      haltAction: CLIENT_GATE_HALT_ACTION,
      recipientChanged,
      violations,
    }),
  });
}
