/**
 * ConnectedCapabilityInstance — hierarchy layer 3 (P2-W1; ADAPT of
 * payswap.org@8a735bf packages/connectors/src/instances.ts).
 *
 * The capability actually exposed by ONE connected provider account/tenant:
 * the scoped, authorized, eligible EXECUTION SURFACE for an actual
 * connection (CAPABILITY-MODEL). A ProviderCatalogueEntry (what a provider
 * CAN do, platform-wide) is a structurally distinct, NON-ASSIGNABLE type:
 * it deliberately lacks instanceId, implementationId, account/tenant scope,
 * authorization, credential scope and permission state.
 *
 * CATALOGUE/INSTANCE SEPARATION LAW (canonical INV-13: "Provider catalogue
 * capability is not executable connected capability"): a provider catalogue
 * claim NEVER authorizes execution — `assertConnectedInstance` rejects
 * catalogue entries at runtime with a typed CatalogueNotAuthorityError, and
 * the registry refuses to register a catalogue entry as an instance.
 * Catalogue data can seed DISCOVERY (the corridor projection), never
 * execution.
 *
 * Credential boundary (INV-19): `credentialScope` carries an OPAQUE
 * reference to credential material held by the provider-runtime lane
 * (P2-W2). No secret, key, token or cookie value may EVER appear on an
 * instance — only references.
 */

import { CatalogueNotAuthorityError, ValidationError } from './errors.ts';
import { asConnectedInstanceId, asProviderImplementationId } from './identifiers.ts';
import type { ConnectedInstanceId, ProviderImplementationId } from './identifiers.ts';
import {
  cloneAndFreeze,
  isNonEmptyString,
  isNonEmptyStringArray,
  isRecord,
} from './shared.ts';

/** Authorization state of the connected account/tenant credential. */
export interface ConnectorAuthorizationState {
  readonly status: 'ACTIVE' | 'PENDING' | 'REVOKED' | 'EXPIRED' | 'UNKNOWN';
  readonly grantedAt?: string;
  readonly revokedAt?: string;
  readonly authorizationRef?: string;
}

/** Geography scope of a connected instance. */
export interface GeographyScope {
  readonly countries: readonly string[];
  readonly regions?: readonly string[];
}

/** Permission state relative to a capability's required permissions. */
export interface ConnectorPermissionState {
  readonly granted: readonly string[];
  readonly requested: readonly string[];
  readonly missing: readonly string[];
}

/**
 * The credential scope a connected instance is bound to. `credentialRef`
 * is an OPAQUE reference into the credential broker (P2-W2) — the instance
 * NEVER carries credential material itself (INV-19).
 */
export interface CredentialScope {
  readonly credentialRef: string;
  readonly credentialKind:
    | 'API_KEY'
    | 'OAUTH'
    | 'DELEGATED_TOKEN'
    | 'SESSION'
    | 'PROVIDER_DEFINED';
  readonly delegationRef?: string;
}

/** Eligibility of the connected account for this capability. */
export interface InstanceEligibility {
  readonly eligible: boolean;
  /** Empty when eligible; otherwise the disqualifying reasons. */
  readonly reasons: readonly string[];
}

/**
 * ConnectedCapabilityInstance (layer 3): scoped to a REAL provider
 * account/tenant, credential scope, authorization state, geography/currency
 * scope, permission state, eligibility and configuration. This is the
 * primary object for executable discovery (INV-13).
 */
export interface ConnectedCapabilityInstance {
  readonly instanceId: ConnectedInstanceId;
  readonly capabilityId: string;
  readonly implementationId: ProviderImplementationId;
  readonly providerName: string;
  readonly providerVersion: string;
  /** The connected account this instance is scoped to. */
  readonly accountRef: string;
  readonly tenantRef: string;
  readonly authorization: ConnectorAuthorizationState;
  readonly credentialScope: CredentialScope;
  readonly geography: GeographyScope;
  readonly currencies: readonly string[];
  readonly permissionState: ConnectorPermissionState;
  readonly eligibility: InstanceEligibility;
  /** Provider-neutral configuration surface (opaque keys to primitives). */
  readonly configuration: Readonly<Record<string, string | number | boolean>>;
}

/**
 * A platform-wide catalogue entry describing what a provider CAN do
 * (INV-13: catalogue claims alone can never authorize execution).
 * Deliberately non-overlapping with ConnectedCapabilityInstance: no
 * instanceId, no implementationId, no accountRef, no authorization, no
 * credential scope, no permission state, no eligibility.
 */
export interface ProviderCatalogueEntry {
  readonly catalogueEntryId: string;
  readonly providerName: string;
  readonly providerVersion: string;
  readonly capabilityId: string;
  readonly summary: string;
  /** Platform-wide advertised scope — what the provider claims to support. */
  readonly advertisedScope: {
    readonly platformWide: true;
    readonly advertisedGeographies: readonly string[];
    readonly advertisedCurrencies: readonly string[];
  };
}

/** Runtime guard: only genuinely connected instances pass (INV-13). */
export function isConnectedCapabilityInstance(
  value: unknown,
): value is ConnectedCapabilityInstance {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<ConnectedCapabilityInstance>;
  return (
    typeof candidate.instanceId === 'string' &&
    candidate.instanceId !== '' &&
    typeof candidate.accountRef === 'string' &&
    candidate.accountRef !== '' &&
    typeof candidate.tenantRef === 'string' &&
    candidate.tenantRef !== '' &&
    typeof candidate.implementationId === 'string' &&
    candidate.implementationId !== '' &&
    candidate.authorization !== undefined &&
    candidate.authorization !== null &&
    typeof candidate.credentialScope === 'object' &&
    candidate.credentialScope !== null &&
    typeof candidate.permissionState === 'object' &&
    candidate.permissionState !== null &&
    typeof candidate.eligibility === 'object' &&
    candidate.eligibility !== null &&
    typeof candidate.configuration === 'object' &&
    candidate.configuration !== null
  );
}

/** Runtime guard for catalogue entries (an advertisement, never authority). */
export function isProviderCatalogueEntry(
  value: unknown,
): value is ProviderCatalogueEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<ProviderCatalogueEntry>;
  return (
    typeof candidate.catalogueEntryId === 'string' &&
    candidate.catalogueEntryId !== '' &&
    candidate.advertisedScope !== undefined &&
    candidate.advertisedScope !== null &&
    candidate.advertisedScope.platformWide === true
  );
}

/**
 * Runtime assertion for execution paths: the value MUST be a
 * ConnectedCapabilityInstance. A ProviderCatalogueEntry is rejected with an
 * explicit typed error (catalogue -> instance rejection, INV-13).
 */
export function assertConnectedInstance(
  value: unknown,
): asserts value is ConnectedCapabilityInstance {
  if (isProviderCatalogueEntry(value)) {
    throw new CatalogueNotAuthorityError(
      'INV-13: a provider catalogue entry is an advertisement and can never authorize execution — execution requires a ConnectedCapabilityInstance scoped to a real account/tenant, authorization, geography/currency and permission state',
      { catalogueEntryId: value.catalogueEntryId, providerName: value.providerName },
    );
  }
  if (!isConnectedCapabilityInstance(value)) {
    throw new ValidationError(
      'execution requires a ConnectedCapabilityInstance (INV-13): account/tenant scope, authorization, credential scope, permission state, eligibility and configuration must all be present',
    );
  }
}

/**
 * Runtime validation for a connected capability instance arriving from
 * untyped sources. Enforces the full INV-13 scope: real account/tenant,
 * credential scope, authorization, geography/currency, permission state,
 * eligibility and configuration.
 */
export function validateConnectedCapabilityInstance(
  candidate: unknown,
): ConnectedCapabilityInstance {
  const errors: string[] = [];
  if (!isRecord(candidate)) {
    throw new ValidationError('connected capability instance must be an object');
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  for (const field of [
    'instanceId',
    'capabilityId',
    'implementationId',
    'providerName',
    'providerVersion',
    'accountRef',
    'tenantRef',
  ] as const) {
    if (!isNonEmptyString(record[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  const authorization = record.authorization;
  if (
    !isRecord(authorization) ||
    !['ACTIVE', 'PENDING', 'REVOKED', 'EXPIRED', 'UNKNOWN'].includes(
      String(authorization.status),
    )
  ) {
    errors.push(
      'authorization.status must be ACTIVE, PENDING, REVOKED, EXPIRED or UNKNOWN',
    );
  }
  const credentialScope = record.credentialScope;
  if (!isRecord(credentialScope) || !isNonEmptyString(credentialScope.credentialRef)) {
    errors.push('credentialScope.credentialRef must be a non-empty (opaque) string');
  } else if (
    credentialScope.credentialKind !== 'API_KEY' &&
    credentialScope.credentialKind !== 'OAUTH' &&
    credentialScope.credentialKind !== 'DELEGATED_TOKEN' &&
    credentialScope.credentialKind !== 'SESSION' &&
    credentialScope.credentialKind !== 'PROVIDER_DEFINED'
  ) {
    errors.push('credentialScope.credentialKind must be a declared kind');
  }
  const geography = record.geography;
  if (!isRecord(geography) || !isNonEmptyStringArray(geography.countries)) {
    errors.push('geography.countries must be an array of country codes');
  }
  if (
    !isNonEmptyStringArray(record.currencies) ||
    (record.currencies as readonly string[]).length === 0
  ) {
    errors.push('currencies must be a non-empty array of currency codes');
  }
  const permissionState = record.permissionState;
  if (!isRecord(permissionState)) {
    errors.push('permissionState must be a ConnectorPermissionState');
  } else {
    for (const field of ['granted', 'requested', 'missing'] as const) {
      if (!isNonEmptyStringArray(permissionState[field])) {
        errors.push(`permissionState.${field} must be an array of strings`);
      }
    }
  }
  const eligibility = record.eligibility;
  if (
    !isRecord(eligibility) ||
    typeof eligibility.eligible !== 'boolean' ||
    !Array.isArray(eligibility.reasons)
  ) {
    errors.push('eligibility must be { eligible: boolean, reasons: string[] }');
  }
  const configuration = record.configuration;
  if (!isRecord(configuration)) {
    errors.push('configuration must be a provider-neutral record');
  } else {
    for (const [key, value] of Object.entries(configuration)) {
      if (
        typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean'
      ) {
        errors.push(
          `configuration.${key} must be a string, number or boolean (provider-neutral primitives only)`,
        );
      }
    }
  }
  if (errors.length > 0) {
    throw new ValidationError(
      `Invalid connected capability instance: ${errors.join('; ')}`,
      { errors: [...errors] },
    );
  }
  const instance = record as unknown as ConnectedCapabilityInstance;
  asConnectedInstanceId(instance.instanceId);
  asProviderImplementationId(instance.implementationId);
  return cloneAndFreeze(instance);
}

/**
 * Runtime validation for a provider catalogue entry. Catalogue entries are
 * legal discovery seeds — they are advertisements, never authority
 * (INV-13).
 */
export function validateProviderCatalogueEntry(
  candidate: unknown,
): ProviderCatalogueEntry {
  const errors: string[] = [];
  if (!isRecord(candidate)) {
    throw new ValidationError('provider catalogue entry must be an object');
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  for (const field of [
    'catalogueEntryId',
    'providerName',
    'providerVersion',
    'capabilityId',
    'summary',
  ] as const) {
    if (!isNonEmptyString(record[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  const scope = record.advertisedScope;
  if (!isRecord(scope)) {
    errors.push('advertisedScope must be declared');
  } else {
    if (scope.platformWide !== true) {
      errors.push('advertisedScope.platformWide must be true');
    }
    if (!isNonEmptyStringArray(scope.advertisedGeographies)) {
      errors.push('advertisedScope.advertisedGeographies must be an array');
    }
    if (!isNonEmptyStringArray(scope.advertisedCurrencies)) {
      errors.push('advertisedScope.advertisedCurrencies must be an array');
    }
  }
  if (errors.length > 0) {
    throw new ValidationError(`Invalid provider catalogue entry: ${errors.join('; ')}`, {
      errors: [...errors],
    });
  }
  return cloneAndFreeze(record as unknown as ProviderCatalogueEntry);
}
