/**
 * @payswap/provider-runtime — connection forms (P2-W2).
 *
 * The connection FORMS vocabulary comes from the Capability Model
 * (spec/architecture/CAPABILITY-MODEL.md): "Connection forms may include
 * delegated OAuth, connected accounts, scoped API credentials, isolated
 * interactive browser sessions and providerless rails."
 *
 * Each form declares:
 * - which credential KINDS it can be activated on (fail-closed consistency:
 *   a browser-session connection cannot activate on an API key, and an API
 *   credential connection cannot activate on a browser session);
 * - whether it requires BROWSER ISOLATION (interactive sessions run in an
 *   isolated browser context whose cookies/storage never cross the
 *   isolation boundary — INV-19);
 * - whether it is interactive-only (cannot be driven headlessly);
 * - whether it is providerless (no external counterparty to call — the
 *   local rail; providerless connections still pass through the same
 *   scope/lifecycle discipline).
 *
 * This mirrors the old repo's AUTHORIZATION_MODES discipline
 * (payswap.org@8a735bf packages/connectors/src/activation.ts) adapted to
 * the canonical CAPABILITY-MODEL wording — Wise-specific mechanics are NOT
 * universalized here.
 */

import { ValidationError } from './errors.ts';

/** The credential material kinds the broker can seal. */
export const CREDENTIAL_KINDS = [
  'OAUTH',
  'DELEGATED_TOKEN',
  'API_KEY',
  'SESSION',
  'PROVIDER_DEFINED',
] as const;

export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];

export function isCredentialKind(value: unknown): value is CredentialKind {
  return (
    typeof value === 'string' && (CREDENTIAL_KINDS as readonly unknown[]).includes(value)
  );
}

/** The five canonical connection forms (CAPABILITY-MODEL). */
export const CONNECTION_FORMS = [
  'DELEGATED_OAUTH',
  'CONNECTED_ACCOUNT',
  'SCOPED_API_CREDENTIAL',
  'ISOLATED_INTERACTIVE_BROWSER_SESSION',
  'PROVIDERLESS_RAIL',
] as const;

export type ConnectionForm = (typeof CONNECTION_FORMS)[number];

export function isConnectionForm(value: unknown): value is ConnectionForm {
  return typeof value === 'string' && (CONNECTION_FORMS as readonly unknown[]).includes(value);
}

/** The declarative profile of one connection form. */
export interface ConnectionFormProfile {
  readonly form: ConnectionForm;
  /** Credential kinds this form can activate on (fail-closed consistency). */
  readonly credentialKinds: readonly CredentialKind[];
  /** True when the form runs in an isolated interactive browser context. */
  readonly requiresBrowserIsolation: boolean;
  /** True when the form can ONLY be exercised interactively (a human in the loop). */
  readonly interactiveOnly: boolean;
  /** True when there is no external provider counterparty (local rail). */
  readonly providerless: boolean;
}

/**
 * The canonical form profiles. Frozen data, not behavior — certification
 * surfaces can diff the table without reading implementation.
 */
export const CONNECTION_FORM_PROFILES: Readonly<Record<ConnectionForm, ConnectionFormProfile>> =
  Object.freeze({
    DELEGATED_OAUTH: Object.freeze({
      form: 'DELEGATED_OAUTH',
      credentialKinds: Object.freeze(['OAUTH', 'DELEGATED_TOKEN'] as const),
      requiresBrowserIsolation: false,
      interactiveOnly: false,
      providerless: false,
    }),
    CONNECTED_ACCOUNT: Object.freeze({
      form: 'CONNECTED_ACCOUNT',
      credentialKinds: Object.freeze(['PROVIDER_DEFINED', 'OAUTH', 'DELEGATED_TOKEN'] as const),
      requiresBrowserIsolation: false,
      interactiveOnly: false,
      providerless: false,
    }),
    SCOPED_API_CREDENTIAL: Object.freeze({
      form: 'SCOPED_API_CREDENTIAL',
      credentialKinds: Object.freeze(['API_KEY'] as const),
      requiresBrowserIsolation: false,
      interactiveOnly: false,
      providerless: false,
    }),
    ISOLATED_INTERACTIVE_BROWSER_SESSION: Object.freeze({
      form: 'ISOLATED_INTERACTIVE_BROWSER_SESSION',
      credentialKinds: Object.freeze(['SESSION'] as const),
      requiresBrowserIsolation: true,
      interactiveOnly: true,
      providerless: false,
    }),
    PROVIDERLESS_RAIL: Object.freeze({
      form: 'PROVIDERLESS_RAIL',
      // A local rail holds no provider API credential; the handle names
      // rail-held local material whose form is rail-defined (keypair, wallet…).
      credentialKinds: Object.freeze([
        'API_KEY',
        'OAUTH',
        'DELEGATED_TOKEN',
        'SESSION',
        'PROVIDER_DEFINED',
      ] as const),
      requiresBrowserIsolation: false,
      interactiveOnly: false,
      providerless: true,
    }),
  } as const);

/**
 * Fail-closed form/credential consistency: the form must exist and the
 * credential kind must be activatable for it. A browser-session connection
 * on an API key (or the reverse) is a validation error BEFORE any
 * activation side effect.
 */
export function validateFormCredentialConsistency(
  form: ConnectionForm,
  credentialKind: CredentialKind,
): ConnectionFormProfile {
  if (!isConnectionForm(form)) {
    throw new ValidationError('connection form must be a canonical CONNECTION_FORMS value', {
      form,
    });
  }
  if (!isCredentialKind(credentialKind)) {
    throw new ValidationError('credential kind must be a canonical CREDENTIAL_KINDS value', {
      credentialKind,
    });
  }
  const profile = CONNECTION_FORM_PROFILES[form];
  if (!profile.credentialKinds.includes(credentialKind)) {
    throw new ValidationError(
      `connection form '${form}' cannot activate on credential kind '${credentialKind}'`,
      { form, credentialKind, allowed: [...profile.credentialKinds] },
    );
  }
  return profile;
}

/** The profile for a form (throws on unknown forms). */
export function connectionFormProfile(form: ConnectionForm): ConnectionFormProfile {
  if (!isConnectionForm(form)) {
    throw new ValidationError('connection form must be a canonical CONNECTION_FORMS value', {
      form,
    });
  }
  return CONNECTION_FORM_PROFILES[form];
}
