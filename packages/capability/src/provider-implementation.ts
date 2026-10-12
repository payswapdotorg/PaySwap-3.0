/**
 * ProviderImplementation — hierarchy layer 2 (P2-W1; ADAPT of
 * payswap.org@8a735bf packages/connectors/src/providers.ts).
 *
 * A provider's concrete implementation of a CapabilityDefinition. SDK
 * types, API names, provider states and provider quirks stay on the
 * provider side of the vocabulary (they land in the provider-runtime lane,
 * P2-W2): this contract carries only provider-neutral references —
 * `adapterRef` is an opaque string, deviations are DOCUMENTED declarations,
 * never provider SDK types (INV-16: provider implementations do not leak
 * into provider-neutral domain contracts).
 *
 * Versioning law: an implementation pins the capability definition id and
 * MAY pin the definition version (any registered version when omitted at
 * the type level; the REGISTRY requires an exact pin match for chain
 * resolution). The implementation carries its OWN independent version.
 *
 * Provider-native baseline (INV-15): when the provider exposes native
 * optimization/routing/recovery as executable behavior, it is referenced
 * here as a capability so optimizers can benchmark the incumbent baseline.
 *
 * CorridorScope declarations here are ADVISORY provider-side geography
 * claims; the corridor projection evaluates them alongside the restriction
 * sets (definition-level + implementation-level) — an implementation can
 * never make an unsupported route executable by merely CLAIMING a scope
 * (instance scope + restrictions + observations all still gate).
 */

import { ValidationError } from './errors.ts';
import {
  asCapabilityDefinitionId,
  asProviderImplementationId,
  asVersionString,
} from './identifiers.ts';
import type {
  CapabilityDefinitionId,
  ProviderImplementationId,
  VersionString,
} from './identifiers.ts';
import { validateCorridorRestrictionSet, restrictionWideningViolations } from './restrictions.ts';
import type { CorridorRestrictionSet } from './restrictions.ts';
import { cloneAndFreeze, isNonEmptyString, isNonEmptyStringArray, isRecord } from './shared.ts';

/** Kinds of external systems a connector can face. */
export const PROVIDER_SYSTEM_KINDS = [
  'psp',
  'bank',
  'crm',
  'erp',
  'accounting',
  'healthcare_ehr',
  'fleet_telematics',
  'hospitality_pms',
  'legal_matter',
  'communications',
  'cloud_platform',
  'document_storage',
  'other',
] as const;

export type ProviderSystemKind = (typeof PROVIDER_SYSTEM_KINDS)[number];

export function isProviderSystemKind(value: unknown): value is ProviderSystemKind {
  return (
    typeof value === 'string' &&
    (PROVIDER_SYSTEM_KINDS as readonly unknown[]).includes(value)
  );
}

/** A registered external provider (any system kind). */
export interface ProviderIdentity {
  readonly providerName: string;
  readonly providerVersion: string;
  readonly systemKind: ProviderSystemKind;
  readonly displayName: string;
}

/** A geography/currency corridor an implementation claims it serves (advisory). */
export interface CorridorScope {
  readonly fromCountries?: readonly string[];
  readonly toCountries?: readonly string[];
  readonly currencies?: readonly string[];
  readonly description?: string;
}

/** A query against the implementation corridor scopes (advisory). All filters optional. */
export interface ImplementationCorridorQuery {
  readonly fromCountry?: string;
  readonly toCountry?: string;
  readonly currency?: string;
}

/**
 * A documented deviation of a provider implementation from its
 * CapabilityDefinition. Deviations are DECLARED (provider-neutral text), so
 * certification can prove the catalogue-to-implementation mapping.
 */
export interface ImplementationDeviation {
  readonly aspect: string;
  readonly deviation: string;
  readonly documented: true;
}

/**
 * ProviderImplementation (layer 2). `restrictionSet` is the versioned
 * provider-level corridor restriction set; it may only NARROW the
 * definition-level restrictions (narrowing law, restrictions.ts).
 */
export interface ProviderImplementation {
  readonly implementationId: ProviderImplementationId;
  readonly providerName: string;
  readonly providerVersion: string;
  readonly capabilityId: CapabilityDefinitionId;
  /** Definition version this implementation targets (exact pin required). */
  readonly capabilityVersion: VersionString;
  /** Implementation version (independent of the definition version). */
  readonly version: VersionString;
  /**
   * Opaque, provider-neutral reference to the concrete adapter that will
   * realize this implementation (owned by the provider-runtime lane
   * P2-W2). Deliberately a string.
   */
  readonly adapterRef: string;
  readonly implementationNotes?: string;
  readonly corridors: readonly CorridorScope[];
  readonly knownDeviations: readonly ImplementationDeviation[];
  /**
   * INV-15: when the provider exposes native optimization/routing/recovery
   * as executable behavior, it is referenced here as a capability so the
   * route compiler can benchmark the incumbent baseline.
   */
  readonly nativeOptimization?: {
    readonly representableAsCapability: true;
    readonly capabilityId: string;
  };
  /** Versioned provider-level corridor restrictions (narrowing-only). */
  readonly restrictionSet?: CorridorRestrictionSet;
}

/**
 * Runtime validation for a provider identity (layer-2 supporting record).
 */
export function validateProviderIdentity(candidate: unknown): ProviderIdentity {
  if (!isRecord(candidate)) {
    throw new ValidationError('provider identity must be an object');
  }
  if (
    !isNonEmptyString(candidate.providerName) ||
    !isNonEmptyString(candidate.providerVersion) ||
    !isNonEmptyString(candidate.displayName) ||
    !isProviderSystemKind(candidate.systemKind)
  ) {
    throw new ValidationError(
      'provider identity requires providerName, providerVersion, displayName and a known systemKind',
    );
  }
  return cloneAndFreeze(candidate as unknown as ProviderIdentity);
}

const IMPLEMENTATION_COUNTRY_PATTERN = /^[A-Z]{2}$/;
const IMPLEMENTATION_CURRENCY_PATTERN = /^[A-Z]{3}$/;

function validateCorridorScope(
  scope: Readonly<Record<string, unknown>>,
  index: number,
  errors: string[],
): void {
  for (const field of ['fromCountries', 'toCountries'] as const) {
    const value = scope[field];
    if (
      value !== undefined &&
      !(
        Array.isArray(value) &&
        value.every(
          (item) => typeof item === 'string' && IMPLEMENTATION_COUNTRY_PATTERN.test(item),
        )
      )
    ) {
      errors.push(`corridors[${index}].${field}, when present, must be ISO 3166-1 alpha-2 codes`);
    }
  }
  const currencies = scope['currencies'];
  if (
    currencies !== undefined &&
    !(
      Array.isArray(currencies) &&
      (currencies as readonly unknown[]).every(
        (item) => typeof item === 'string' && IMPLEMENTATION_CURRENCY_PATTERN.test(item),
      )
    )
  ) {
    errors.push(`corridors[${index}].currencies, when present, must be 3-letter currency codes`);
  }
}

/**
 * Runtime validation for a provider implementation. Enforces the version
 * pins (capability id + EXACT capability version + own version), opaque
 * adapter reference, declared corridor scopes and deviations, and — when a
 * restriction set is attached — its validity.
 */
export function validateProviderImplementation(candidate: unknown): ProviderImplementation {
  const errors: string[] = [];
  if (!isRecord(candidate)) {
    throw new ValidationError('provider implementation must be an object');
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  for (const field of [
    'implementationId',
    'providerName',
    'providerVersion',
    'version',
    'adapterRef',
  ] as const) {
    if (!isNonEmptyString(record[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  if (!isNonEmptyString(record.capabilityId)) {
    errors.push('capabilityId must be a non-empty string (the implemented definition)');
  }
  if (!isNonEmptyString(record.capabilityVersion)) {
    errors.push(
      'capabilityVersion is REQUIRED (exact definition-version pin: catalogue resolution must be deterministic)',
    );
  }
  if (!Array.isArray(record.corridors)) {
    errors.push('corridors must be an array of CorridorScope (may be empty)');
  } else {
    for (const [index, scope] of record.corridors.entries()) {
      if (!isRecord(scope)) {
        errors.push(`corridors[${index}] must be an object`);
        continue;
      }
      validateCorridorScope(scope, index, errors);
    }
  }
  if (!Array.isArray(record.knownDeviations)) {
    errors.push('knownDeviations must be an array (may be empty)');
  } else {
    for (const [index, deviation] of record.knownDeviations.entries()) {
      const entry = deviation as Readonly<Record<string, unknown>> | null;
      if (
        entry === null ||
        typeof entry !== 'object' ||
        !isNonEmptyString(entry.aspect) ||
        !isNonEmptyString(entry.deviation) ||
        entry.documented !== true
      ) {
        errors.push(
          `knownDeviations[${index}] must be { aspect, deviation, documented: true }`,
        );
      }
    }
  }
  const native = record.nativeOptimization as Readonly<Record<string, unknown>> | undefined;
  if (
    native !== undefined &&
    (typeof native !== 'object' ||
      native.representableAsCapability !== true ||
      !isNonEmptyString(native.capabilityId))
  ) {
    errors.push(
      'nativeOptimization, when present, must be { representableAsCapability: true, capabilityId } (INV-15 incumbent baseline)',
    );
  }
  const restrictionSet = record.restrictionSet;
  if (restrictionSet !== undefined) {
    try {
      validateCorridorRestrictionSet(restrictionSet);
    } catch (error) {
      errors.push(
        `restrictionSet invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (errors.length > 0) {
    throw new ValidationError(`Invalid provider implementation: ${errors.join('; ')}`, {
      errors: [...errors],
    });
  }
  const implementation = record as unknown as ProviderImplementation;
  asProviderImplementationId(implementation.implementationId);
  asCapabilityDefinitionId(implementation.capabilityId);
  asVersionString(implementation.capabilityVersion, 'implementation capability pin');
  asVersionString(implementation.version, 'provider implementation');
  return cloneAndFreeze(implementation);
}

/**
 * True when an implementation CLAIMS service for the queried corridor
 * (advisory scope check only — never eligibility, never authority).
 */
export function servesCorridor(
  implementation: ProviderImplementation,
  query: ImplementationCorridorQuery,
): boolean {
  if (implementation.corridors.length === 0) {
    return false;
  }
  return implementation.corridors.some((corridor) => {
    const fromOk =
      query.fromCountry === undefined ||
      corridor.fromCountries === undefined ||
      corridor.fromCountries.includes(query.fromCountry);
    const toOk =
      query.toCountry === undefined ||
      corridor.toCountries === undefined ||
      corridor.toCountries.includes(query.toCountry);
    const currencyOk =
      query.currency === undefined ||
      corridor.currencies === undefined ||
      corridor.currencies.includes(query.currency);
    return fromOk && toOk && currencyOk;
  });
}

/**
 * NARROWING LAW bridge: validate that an implementation's restriction set
 * only narrows the definition-level restriction set (see
 * restrictions.ts). Throws ValidationError naming every widened dimension.
 */
export function assertImplementationRestrictionsNarrowDefinition(
  implementation: ProviderImplementation,
  definitionRestrictions: CorridorRestrictionSet,
): void {
  if (implementation.restrictionSet === undefined) {
    return; // no provider-level narrowing declared: lawful no-op
  }
  const violations = restrictionWideningViolations(
    implementation.restrictionSet,
    definitionRestrictions,
  );
  if (violations.length > 0) {
    throw new ValidationError(
      `implementation '${implementation.implementationId}' restriction set widens beyond the definition-level restrictions: ${violations.join('; ')}`,
      { violations: [...violations] },
    );
  }
}
