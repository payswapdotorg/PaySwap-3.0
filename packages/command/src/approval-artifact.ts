/**
 * @payswap/command — the signed approval artifact contract (P7-W3).
 *
 * The trusted-surface side of the permission/confirmation interaction
 * model: the SIGNED authorization artifact a trusted approval surface
 * mints from an authenticated confirmation. Adapted from the old
 * repository's @payswap/interfaces ApprovalArtifact + the @payswap/api
 * ApprovalService signing/verification semantics, re-authored onto the
 * injected-port doctrine:
 *
 * - signatures are REAL HMAC-SHA256 hex digests produced through the
 *   injected `HmacPort` over the canonical signing payload (the wire
 *   contract: `approvalSigningPayload` — canonical JSON, so key order at
 *   the transport layer does not affect verification). Key material is
 *   INJECTED by the composition root (INV-19);
 * - verification is PURE: constant-time hex comparison, request-hash
 *   binding, expiry as bigint DATA — no trusted store required;
 * - `adjudicateConfirmation` is the fail-closed issue-time gate: a REJECTED
 *   decision never issues an artifact; expired windows never issue;
 *   principal/request-hash mismatches never issue;
 * - artifacts are single-reference opaque values: `approvalArtifactRef`
 *   preserves the old repository's `approval:<requestHash>` reference
 *   format (an opaque REFERENCE — the artifact itself never rides a
 *   command proposal payload; the authority-firewall scan rejects it).
 */

import { ValidationError, CommandError } from './errors.ts';
import { canonicalJson } from './canonical.ts';
import { strictIsoUtcFromMs, strictIsoUtcToMs } from './canonical.ts';
import type { HmacPort, Hex64 } from './ports.ts';
import { asHex64, constantTimeHexEquals } from './ports.ts';
import type { AuthorityScope } from './permission.ts';
import { validateAuthorityScope } from './permission.ts';
import type { ApprovalRequest, AuthenticatedApprovalConfirmation } from './approval-interaction.ts';
import { validateApprovalRequest } from './approval-interaction.ts';
import { isAuthenticatedConfirmation } from './approval-interaction.ts';

/** Raised when the artifact contract is violated (fail closed). */
export class ApprovalArtifactError extends CommandError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      code: 'APPROVAL_ARTIFACT_REJECTED',
      category: 'AUTHORIZATION_REQUIRED',
      message,
      details,
    });
  }
}

/**
 * The signed authorization artifact a trusted approval surface mints:
 * identifies principal, agent, scope, expiry and request hash, and carries
 * a real signature (hex HMAC-SHA256 via the injected port). This artifact —
 * never a chat message — is what downstream authorization references.
 */
export interface ApprovalArtifact {
  readonly principal: string;
  readonly agentRef?: string;
  readonly scope: AuthorityScope;
  /** Strict ISO-8601 UTC expiry (DATA). */
  readonly expiry: string;
  readonly requestHash: string;
  readonly signature: string;
  readonly issuedAt: string;
}

/** The canonical signing payload of an artifact (signature excluded). */
export function approvalSigningPayload(artifact: Omit<ApprovalArtifact, 'signature'>): string {
  return canonicalJson([
    'payswap.approval-artifact.v1',
    artifact.principal,
    ...(artifact.agentRef === undefined ? [] : [artifact.agentRef]),
    artifact.scope.domain,
    [...artifact.scope.actions],
    strictIsoUtcToMs(artifact.expiry, 'artifact.expiry').toString(),
    artifact.requestHash,
    strictIsoUtcToMs(artifact.issuedAt, 'artifact.issuedAt').toString(),
  ]);
}

/**
 * Build the UNSIGNED artifact from a validated request (the trusted
 * surface signs it next). `issuedAtMs` is bigint DATA; the scope is the
 * request's requested authority scope.
 */
export function buildUnsignedApprovalArtifact(
  request: ApprovalRequest,
  options: { readonly issuedAtMs: bigint },
): Omit<ApprovalArtifact, 'signature'> {
  validateApprovalRequest(request);
  if (typeof options.issuedAtMs !== 'bigint') {
    throw new ValidationError('issuedAtMs must be bigint DATA (milliseconds)');
  }
  return Object.freeze({
    principal: request.principal,
    ...(request.agentRef === undefined ? {} : { agentRef: request.agentRef }),
    scope: validateAuthorityScope(request.requestedAuthorityScope, 'requestedAuthorityScope'),
    expiry: request.expiresAt,
    requestHash: request.requestHash,
    issuedAt: strictIsoUtcFromMs(options.issuedAtMs),
  });
}

/**
 * Sign an unsigned artifact with the injected HMAC port (deterministic:
 * same unsigned artifact + same key => same signature — the old
 * repository's deterministic re-issue law).
 */
export function signApprovalArtifact(
  unsigned: Omit<ApprovalArtifact, 'signature'>,
  deps: { readonly mac: HmacPort; readonly signingKey: string },
): ApprovalArtifact {
  const signature = deps.mac.signUtf8(deps.signingKey, approvalSigningPayload(unsigned));
  return Object.freeze({ ...unsigned, signature });
}

export type ArtifactVerification =
  | { readonly valid: true; readonly scope: AuthorityScope }
  | {
      readonly valid: false;
      readonly reason: 'UNKNOWN_ARTIFACT' | 'SIGNATURE_INVALID' | 'EXPIRED' | 'REQUEST_HASH_MISMATCH';
    };

/**
 * Verify a signed approval artifact against an expected request hash (pure
 * given the injected MAC port): request-hash binding first, then
 * constant-time signature comparison, then expiry as DATA. Fail closed on
 * every mismatch — the UI consumes authenticated provenance, never
 * manufactures it.
 */
export function verifyApprovalArtifact(
  artifact: ApprovalArtifact,
  expectedRequestHash: string,
  deps: { readonly mac: HmacPort; readonly signingKey: string; readonly nowMs: bigint },
): ArtifactVerification {
  if (artifact.requestHash !== expectedRequestHash) {
    return { valid: false, reason: 'REQUEST_HASH_MISMATCH' };
  }
  const unsigned: Omit<ApprovalArtifact, 'signature'> = {
    principal: artifact.principal,
    ...(artifact.agentRef === undefined ? {} : { agentRef: artifact.agentRef }),
    scope: artifact.scope,
    expiry: artifact.expiry,
    requestHash: artifact.requestHash,
    issuedAt: artifact.issuedAt,
  };
  const expected = deps.mac.signUtf8(deps.signingKey, approvalSigningPayload(unsigned));
  let presentedDigest: Hex64;
  try {
    presentedDigest = asHex64(artifact.signature, 'artifact.signature');
  } catch {
    return { valid: false, reason: 'SIGNATURE_INVALID' };
  }
  if (!constantTimeHexEquals(expected, presentedDigest)) {
    return { valid: false, reason: 'SIGNATURE_INVALID' };
  }
  const expiryMs = strictIsoUtcToMs(artifact.expiry, 'artifact.expiry');
  if (expiryMs <= deps.nowMs) {
    return { valid: false, reason: 'EXPIRED' };
  }
  return { valid: true, scope: artifact.scope };
}

/**
 * The reference an approved artifact is referenced by when re-submitting
 * the authorized command (`approval:<requestHash>` — the old repository's
 * artifact reference format, preserved).
 */
export function approvalArtifactRef(requestHash: string): string {
  if (typeof requestHash !== 'string' || requestHash.length === 0) {
    throw new ApprovalArtifactError('a request hash is required to derive an artifact reference');
  }
  return `approval:${requestHash}`;
}

/**
 * THE ISSUE-TIME GATE (fail closed): may this authenticated confirmation
 * issue an artifact for this recorded request? Pure decision shape so any
 * trusted-surface implementation inherits the law:
 * - the confirmation must be GENUINELY authenticated (produced by the
 *   trusted-channel seam — raw chat text or forged foreign objects are
 *   rejected);
 * - the confirmation must come from the authority holder (principal
 *   match) and bind to THIS request (request-hash match);
 * - a REJECTED decision NEVER issues an artifact;
 * - the approval window must still be open at confirmation time.
 */
export function adjudicateConfirmation(
  confirmation: AuthenticatedApprovalConfirmation,
  request: ApprovalRequest,
): { readonly mayIssue: true } | { readonly mayIssue: false; readonly reason: string } {
  if (!isAuthenticatedConfirmation(confirmation)) {
    return { mayIssue: false, reason: 'unauthenticated confirmation (raw input is never authority)' };
  }
  if (request.principal !== confirmation.principal) {
    return { mayIssue: false, reason: 'principal mismatch (the confirmation must come from the authority holder)' };
  }
  if (request.requestHash !== confirmation.requestHash) {
    return { mayIssue: false, reason: 'request hash mismatch (confirmations bind to their recorded request)' };
  }
  if (confirmation.decision === 'REJECTED') {
    return { mayIssue: false, reason: 'a REJECTED decision never issues an authorization artifact' };
  }
  const windowEndMs = strictIsoUtcToMs(request.expiresAt, 'request.expiresAt');
  const confirmedAtMs = strictIsoUtcToMs(confirmation.confirmedAt, 'confirmation.confirmedAt');
  if (windowEndMs <= confirmedAtMs) {
    return { mayIssue: false, reason: 'the approval window expired before the confirmation' };
  }
  return { mayIssue: true };
}
