/**
 * @payswap/command — the permission/confirmation interaction vocabulary
 * (P7-W3).
 *
 * The permission and confirmation interaction models for every universal
 * interaction surface (command surface, agent interaction, Extension
 * boundary, developer API):
 *
 * - `AuthorityScope` is the delegated-authority vocabulary (domain +
 *   actions) — adapted from the old repository's approval contract. A
 *   scope REQUESTS authority; it never grants it (granting happens on the
 *   trust lane out of band; this surface only carries references).
 * - `ExtensionPermission` is the Extension-boundary permission vocabulary —
 *   NET-NEW with a structural law: the vocabulary contains NO financial
 *   authority member (no permission can express "execute", "sign",
 *   "settle" or "withdraw"); every effect-bearing Extension call is an
 *   explicit request gated by one of these permissions (no ambient
 *   authority). Machine-checked by tests.
 * - `InteractionModel` names HOW a confirmation is collected: immediate
 *   in-surface, on a trusted surface, or out of band. Raw chat text is
 *   NEVER authority: a chat reply expresses an INTENT at most
 *   (INV-A03 discipline; see src/approval-interaction.ts).
 */

import { ValidationError } from './errors.ts';

// ---------------------------------------------------------------------------
// Delegated authority scope (request vocabulary — never a grant)
// ---------------------------------------------------------------------------

/** Delegated authority being requested, keyed by domain + actions. */
export interface AuthorityScope {
  readonly domain: string;
  readonly actions: readonly string[];
}

/** Validate an AuthorityScope (non-empty domain + non-empty actions). */
export function validateAuthorityScope(value: unknown, subject: string): AuthorityScope {
  if (value === null || typeof value !== 'object') {
    throw new ValidationError(`${subject} must be an AuthorityScope object`, { subject });
  }
  const candidate = value as Partial<AuthorityScope>;
  if (typeof candidate.domain !== 'string' || candidate.domain.length === 0) {
    throw new ValidationError(`${subject}.domain must be a non-empty string`, { subject });
  }
  if (!Array.isArray(candidate.actions) || candidate.actions.length === 0) {
    throw new ValidationError(`${subject}.actions must be a non-empty array of action ids`, { subject });
  }
  const actions: string[] = [];
  for (const action of candidate.actions) {
    if (typeof action !== 'string' || action.length === 0) {
      throw new ValidationError(`${subject}.actions entries must be non-empty strings`, { subject });
    }
    actions.push(action);
  }
  return Object.freeze({ domain: candidate.domain, actions: Object.freeze(actions) });
}

// ---------------------------------------------------------------------------
// Trusted confirmation channels + interaction models
// ---------------------------------------------------------------------------

/** Trusted channels able to authenticate an approving principal out of band. */
export const APPROVAL_CHANNELS = ['SMS', 'EMAIL', 'IN_APP', 'HARDWARE_KEY'] as const;

export type ApprovalChannel = (typeof APPROVAL_CHANNELS)[number];

/** Narrow an unknown value to an ApprovalChannel. */
export function isApprovalChannel(value: unknown): value is ApprovalChannel {
  return typeof value === 'string' && (APPROVAL_CHANNELS as readonly string[]).includes(value);
}

/** Validate an ApprovalChannel or fail closed. */
export function asApprovalChannel(value: unknown, subject: string): ApprovalChannel {
  if (!isApprovalChannel(value)) {
    throw new ValidationError(`${subject} must be one of ${APPROVAL_CHANNELS.join(', ')}`, { subject, value });
  }
  return value;
}

/**
 * How a permission decision is collected:
 * - IMMEDIATE: an in-surface prompt (the asking surface is trusted);
 * - TRUSTED_SURFACE: completion happens exclusively on a trusted surface
 *   that authenticates the principal out of band;
 * - OUT_OF_BAND: a channel such as SMS/hardware key authenticates the
 *   decision inside itself.
 */
export const INTERACTION_MODELS = ['IMMEDIATE', 'TRUSTED_SURFACE', 'OUT_OF_BAND'] as const;

export type InteractionModel = (typeof INTERACTION_MODELS)[number];

/** Narrow an unknown value to an InteractionModel. */
export function isInteractionModel(value: unknown): value is InteractionModel {
  return typeof value === 'string' && (INTERACTION_MODELS as readonly string[]).includes(value);
}

/** The principal's decision vocabulary on a permission request. */
export const PERMISSION_DECISIONS = ['APPROVED', 'REJECTED'] as const;

export type PermissionDecision = (typeof PERMISSION_DECISIONS)[number];

/** Narrow an unknown value to a PermissionDecision. */
export function isPermissionDecision(value: unknown): value is PermissionDecision {
  return typeof value === 'string' && (PERMISSION_DECISIONS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// The Extension permission vocabulary — no ambient authority, no financial member
// ---------------------------------------------------------------------------

/**
 * The Extension boundary permission vocabulary (NET-NEW, P7-W3). THE
 * STRUCTURAL LAW: the vocabulary contains NO financial authority member —
 * no permission can express execute/sign/settle/withdraw/capture. The
 * effect-bearing permissions are:
 * - `COMMAND_PROPOSE`: submit typed PROPOSAL inputs to the command surface
 *   (never authority — the proposal still requires the trust lane);
 * - `OBSERVATION_READ`: read observation projections (evidence, never
 *   authorization);
 * - `SURFACE_RENDER`: render surface projections into the extension UI;
 * - `NOTIFICATION_RECEIVE`: receive notifications (informational only).
 * Machine-checked: test/extension-boundary.test.ts asserts the vocabulary
 * equals exactly this set (no member matches the authority-verb denylist).
 */
export const EXTENSION_PERMISSIONS = [
  'SURFACE_RENDER',
  'OBSERVATION_READ',
  'COMMAND_PROPOSE',
  'NOTIFICATION_RECEIVE',
] as const;

export type ExtensionPermission = (typeof EXTENSION_PERMISSIONS)[number];

/** Narrow an unknown value to an ExtensionPermission. */
export function isExtensionPermission(value: unknown): value is ExtensionPermission {
  return typeof value === 'string' && (EXTENSION_PERMISSIONS as readonly string[]).includes(value);
}

/** Validate a list of Extension permissions (subset of the vocabulary, no duplicates). */
export function validateExtensionPermissions(value: unknown, subject: string): readonly ExtensionPermission[] {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${subject} must be an array of Extension permissions`, { subject });
  }
  const seen = new Set<string>();
  const permissions: ExtensionPermission[] = [];
  for (const entry of value) {
    if (!isExtensionPermission(entry)) {
      throw new ValidationError(
        `${subject} contains '${String(entry)}' — not in the Extension permission vocabulary ${EXTENSION_PERMISSIONS.join(', ')} (the vocabulary has no financial authority member)`,
        { subject, entry },
      );
    }
    if (seen.has(entry)) {
      throw new ValidationError(`${subject} contains duplicate permission '${entry}'`, { subject });
    }
    seen.add(entry);
    permissions.push(entry);
  }
  return Object.freeze(permissions);
}
