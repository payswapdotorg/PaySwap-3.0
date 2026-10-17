/**
 * @payswap/command — the permission/confirmation interaction models (P7-W3).
 *
 * Adapted from the old repository's approval contract
 * (@payswap/interfaces approval.ts) and the UX-side interaction contracts
 * (@payswap/ux trusted-approvals.ts + messaging-adapters.ts — the P7-W3
 * share of the ux package).
 *
 * THE RULE ENCODED HERE (the old-repo INV-A03 discipline; canonical
 * analog: INV-9/INV-23 + the authority-firewall law): user approval is a
 * TRUSTED-SURFACE operation that creates a signed authorization artifact;
 * RAW CHAT TEXT IS NEVER AUTHORITY.
 *
 * Structural encoding:
 * - the ONLY constructor of authenticated confirmations is
 *   `createTrustedChannelConfirmation` (the trusted-channel seam standing
 *   in for the out-of-band principal authentication a production channel
 *   performs inside itself). There is deliberately NO entry point that
 *   converts a chat string into authority;
 * - `parseApprovalResponse` / `expressApprovalIntentFromChat` return an
 *   INTENT AT MOST — the return types have no artifact variant:
 *   converting an intent into authority requires the trusted out-of-band
 *   channel. The type system makes chat-as-authority unrepresentable;
 * - rendered approval messages MUST carry a non-empty trusted-surface deep
 *   link — a bare chat reply is never the completion path;
 * - the signed artifact contract lives in src/approval-artifact.ts
 *   (HMAC via the injected port; transports-as-contracts).
 */

import { ValidationError, CommandError } from './errors.ts';
import { canonicalJson } from './canonical.ts';
import { parseStrictIsoUtc, strictIsoUtcFromMs } from './canonical.ts';
import type { RequestHasher } from './ports.ts';
import type { AuthorityScope, ApprovalChannel } from './permission.ts';
import { asApprovalChannel, validateAuthorityScope } from './permission.ts';

/** Raised when an approval/confirmation interaction contract is violated. */
export class ApprovalInteractionError extends CommandError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      code: 'APPROVAL_INTERACTION_VIOLATION',
      category: 'AUTHORIZATION_REQUIRED',
      message,
      details,
    });
  }
}

// ---------------------------------------------------------------------------
// The approval request + message wire shapes
// ---------------------------------------------------------------------------

/**
 * A request for approval. `requestHash` binds the approval to the exact
 * underlying request (proposal/command payload) — see
 * `computeRequestHashVia`.
 */
export interface ApprovalRequest {
  /** The principal whose approval is required (the authority holder). */
  readonly principal: string;
  /** The agent acting on behalf of the principal, when applicable. */
  readonly agentRef?: string;
  readonly requestedAuthorityScope: AuthorityScope;
  /** Hash binding this approval to the underlying request payload. */
  readonly requestHash: string;
  /** RFC 3339 (strict ISO-8601 UTC) expiry of the approval window. */
  readonly expiresAt: string;
  readonly channel: ApprovalChannel;
}

/** A recorded, pending approval request awaiting the principal's decision. */
export interface PendingApproval {
  readonly requestHash: string;
  readonly status: 'PENDING';
  readonly channel: ApprovalChannel;
  readonly expiresAt: string;
}

/**
 * A rendered approval message for a messaging channel. The deep link into
 * the trusted in-app approval surface is REQUIRED and non-empty — a bare
 * chat reply is never the completion path.
 */
export interface ApprovalMessage {
  readonly text: string;
  readonly requestHash: string;
  readonly expiresAt: string;
  /** Deep link into the trusted in-app approval surface (never a bare chat reply). */
  readonly deepLink: string;
}

/** An inbound chat message (untrusted input). */
export interface ChatMessage {
  readonly text: string;
  readonly senderRef: string;
  readonly sentAt: string;
}

// ---------------------------------------------------------------------------
// Request validation + rendering (deterministic)
// ---------------------------------------------------------------------------

/** Validate an ApprovalRequest (fail closed; expiry is validated DATA). */
export function validateApprovalRequest(request: ApprovalRequest): ApprovalRequest {
  if (typeof request.principal !== 'string' || request.principal.length === 0) {
    throw new ValidationError('approval request requires a non-empty principal');
  }
  if (typeof request.requestHash !== 'string' || request.requestHash.length === 0) {
    throw new ValidationError('approval request requires a non-empty requestHash');
  }
  validateAuthorityScope(request.requestedAuthorityScope, 'requestedAuthorityScope');
  asApprovalChannel(request.channel, 'channel');
  parseStrictIsoUtc(request.expiresAt, 'expiresAt');
  if (request.agentRef !== undefined && (typeof request.agentRef !== 'string' || request.agentRef.length === 0)) {
    throw new ValidationError('agentRef, when present, must be a non-empty string');
  }
  return request;
}

/**
 * The deterministic approval-request material: the canonical JSON of the
 * request's authority-bearing content (principal, scope, request hash,
 * expiry) — the binding basis for hashing and signing.
 */
export function approvalRequestMaterial(request: ApprovalRequest): string {
  return canonicalJson([
    'payswap.approval-request.v1',
    request.principal,
    ...(request.agentRef === undefined ? [] : [request.agentRef]),
    request.requestedAuthorityScope.domain,
    [...request.requestedAuthorityScope.actions],
    request.requestHash,
    request.expiresAt,
  ]);
}

/** Render the approval message for a channel (deterministic; deep link REQUIRED). */
export function renderApprovalMessage(
  request: ApprovalRequest,
  options: { readonly deepLinkBaseUrl: string },
): ApprovalMessage {
  validateApprovalRequest(request);
  if (typeof options.deepLinkBaseUrl !== 'string' || options.deepLinkBaseUrl.length === 0) {
    throw new ValidationError('deepLinkBaseUrl must be a non-empty string (the trusted surface path)');
  }
  const actions = request.requestedAuthorityScope.actions.join(',');
  return Object.freeze({
    text:
      `PaySwap approval requested: grant "${request.requestedAuthorityScope.domain}:${actions}"? ` +
      `Reply APPROVE ${request.requestHash} or REJECT ${request.requestHash}. ` +
      'A chat reply expresses intent only; authority is granted exclusively on the trusted approval surface.',
    requestHash: request.requestHash,
    expiresAt: request.expiresAt,
    deepLink: `${options.deepLinkBaseUrl}/approvals/${request.requestHash}`,
  });
}

// ---------------------------------------------------------------------------
// Intent-at-most parsing (raw chat text is never authority)
// ---------------------------------------------------------------------------

/**
 * The result of parsing a chat reply: an INTENT at most. There is
 * deliberately no artifact variant — converting an intent into authority
 * requires the trusted out-of-band channel (an authenticated confirmation).
 */
export type ParsedApprovalResponse =
  | { readonly kind: 'INTENT'; readonly intent: 'APPROVE' | 'REJECT'; readonly requestHash: string }
  | { readonly kind: 'NOT_AN_APPROVAL' };

/**
 * Parse an inbound chat message into an approval intent AT MOST (pure,
 * deterministic). "APPROVE <hash>" / "REJECT <hash>" (case-sensitive
 * keywords, word-boundary anchored, first match wins) — anything else is
 * NOT_AN_APPROVAL.
 */
export function parseApprovalResponse(message: ChatMessage): ParsedApprovalResponse {
  const approve = /\bAPPROVE\s+([A-Za-z0-9_-]+)/.exec(message.text);
  if (approve !== null) {
    const requestHash = approve[1];
    if (requestHash !== undefined) {
      return { kind: 'INTENT', intent: 'APPROVE', requestHash };
    }
  }
  const reject = /\bREJECT\s+([A-Za-z0-9_-]+)/.exec(message.text);
  if (reject !== null) {
    const requestHash = reject[1];
    if (requestHash !== undefined) {
      return { kind: 'INTENT', intent: 'REJECT', requestHash };
    }
  }
  return { kind: 'NOT_AN_APPROVAL' };
}

/**
 * An approval intent expressed through an UNTRUSTED channel (chat): it
 * ALWAYS still requires the trusted-surface confirmation. The constant
 * flag is the law — there is no variant of this type without it.
 */
export interface ChatApprovalIntent {
  readonly kind: 'APPROVAL_INTENT';
  readonly intent: 'APPROVE' | 'REJECT';
  readonly requestHash: string;
  /** Always true — an intent from chat ALWAYS requires the trusted surface. */
  readonly requiresTrustedSurfaceConfirmation: true;
  readonly note: string;
}

export type ChatParseOutcome = ChatApprovalIntent | { readonly kind: 'NOT_AN_APPROVAL' };

/**
 * Express (at most) an approval intent from an inbound chat message. There
 * is NO function in this package whose input is a chat message and whose
 * output is authority — the type system makes chat-as-authority
 * unrepresentable.
 */
export function expressApprovalIntentFromChat(message: ChatMessage): ChatParseOutcome {
  const parsed = parseApprovalResponse(message);
  if (parsed.kind === 'NOT_AN_APPROVAL') {
    return { kind: 'NOT_AN_APPROVAL' };
  }
  return {
    kind: 'APPROVAL_INTENT',
    intent: parsed.intent,
    requestHash: parsed.requestHash,
    requiresTrustedSurfaceConfirmation: true,
    note: 'a chat reply expresses intent only; authority is granted exclusively on the trusted approval surface (authority-firewall law)',
  };
}

// ---------------------------------------------------------------------------
// The trusted-channel confirmation seam (the ONLY constructor)
// ---------------------------------------------------------------------------

const AUTHENTICATION_MARKER = '__payswap_trusted_channel_confirmation__';

interface MarkedConfirmation extends AuthenticatedApprovalConfirmation {
  readonly [AUTHENTICATION_MARKER]: true;
}

/**
 * A confirmation that a trusted channel has AUTHENTICATED the principal's
 * decision out of band. Only `createTrustedChannelConfirmation` constructs
 * one; `isAuthenticatedConfirmation` rejects forgeries.
 */
export interface AuthenticatedApprovalConfirmation {
  readonly principal: string;
  readonly requestHash: string;
  readonly decision: 'APPROVED' | 'REJECTED';
  readonly confirmedAt: string;
  readonly channel: ApprovalChannel;
}

/**
 * Test/production seam for the trusted channel: produces a GENUINELY
 * authenticated confirmation (the out-of-band principal authentication a
 * production channel — SMS OTP verification, hardware-key challenge,
 * in-app trusted surface — performs inside itself). This seam is the ONLY
 * constructor of authenticated confirmations; there is deliberately no
 * entry point that converts a chat string into authority.
 */
export function createTrustedChannelConfirmation(input: {
  readonly principal: string;
  readonly requestHash: string;
  readonly decision: 'APPROVED' | 'REJECTED';
  readonly channel: ApprovalChannel;
  readonly confirmedAtMs: bigint;
}): AuthenticatedApprovalConfirmation {
  if (typeof input.principal !== 'string' || input.principal === '') {
    throw new ValidationError('a trusted-channel confirmation requires a principal');
  }
  if (typeof input.requestHash !== 'string' || input.requestHash === '') {
    throw new ValidationError('a trusted-channel confirmation requires a request hash');
  }
  if (input.decision !== 'APPROVED' && input.decision !== 'REJECTED') {
    throw new ValidationError('a trusted-channel decision is APPROVED or REJECTED');
  }
  asApprovalChannel(input.channel, 'channel');
  if (typeof input.confirmedAtMs !== 'bigint') {
    throw new ValidationError('confirmedAtMs must be bigint DATA (milliseconds)');
  }
  const confirmation: MarkedConfirmation = {
    [AUTHENTICATION_MARKER]: true,
    principal: input.principal,
    requestHash: input.requestHash,
    decision: input.decision,
    confirmedAt: strictIsoUtcFromMs(input.confirmedAtMs),
    channel: input.channel,
  };
  return confirmation;
}

/** Is this confirmation GENUINELY authenticated (produced by the seam)? */
export function isAuthenticatedConfirmation(value: unknown): value is AuthenticatedApprovalConfirmation {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<MarkedConfirmation>;
  return (
    candidate[AUTHENTICATION_MARKER] === true &&
    typeof candidate.principal === 'string' &&
    candidate.principal !== '' &&
    typeof candidate.requestHash === 'string' &&
    candidate.requestHash !== '' &&
    (candidate.decision === 'APPROVED' || candidate.decision === 'REJECTED') &&
    typeof candidate.confirmedAt === 'string' &&
    candidate.confirmedAt !== '' &&
    typeof candidate.channel === 'string'
  );
}

// ---------------------------------------------------------------------------
// The request hash (canonical serialization + injected SHA-256 port)
// ---------------------------------------------------------------------------

/**
 * Compute the request hash binding an approval to its underlying payload:
 * SHA-256 (via the injected hasher port) over the canonical JSON of the
 * payload. Because the hashed bytes are the canonical serialization, JSON
 * key order at the transport layer does not affect the hash.
 */
export function computeRequestHashVia(hasher: RequestHasher, payload: unknown): string {
  return hasher.hashUtf8(canonicalJson(payload));
}
