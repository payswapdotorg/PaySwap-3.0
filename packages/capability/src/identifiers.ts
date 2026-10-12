/**
 * @payswap/capability — branded identifiers (P2-W1).
 *
 * Ids across the four hierarchy layers (CapabilityDefinition ->
 * ProviderImplementation -> ConnectedCapabilityInstance -> CapabilityObservation)
 * are branded nominal types: a definition id can never be passed where an
 * implementation id is expected. Branding is compile-time only; runtime
 * validation checks non-empty bounded strings.
 *
 * The same helpers serve the auxiliary subjects: connector packs,
 * certification records, corridor views and restrictions.
 */

import { ValidationError } from './errors.ts';

declare const CapabilityDefinitionIdBrand: unique symbol;
/** Branded id of one CapabilityDefinition (hierarchy layer 1). */
export type CapabilityDefinitionId = string & {
  readonly [CapabilityDefinitionIdBrand]: 'CapabilityDefinitionId';
};

declare const ProviderImplementationIdBrand: unique symbol;
/** Branded id of one ProviderImplementation (hierarchy layer 2). */
export type ProviderImplementationId = string & {
  readonly [ProviderImplementationIdBrand]: 'ProviderImplementationId';
};

declare const ConnectedInstanceIdBrand: unique symbol;
/** Branded id of one ConnectedCapabilityInstance (hierarchy layer 3). */
export type ConnectedInstanceId = string & {
  readonly [ConnectedInstanceIdBrand]: 'ConnectedInstanceId';
};

declare const CatalogueEntryIdBrand: unique symbol;
/** Branded id of one ProviderCatalogueEntry (advertising surface, never authority). */
export type CatalogueEntryId = string & {
  readonly [CatalogueEntryIdBrand]: 'CatalogueEntryId';
};

declare const ConnectorPackIdBrand: unique symbol;
/** Branded id of one connector capability pack node. */
export type ConnectorPackId = string & {
  readonly [ConnectorPackIdBrand]: 'ConnectorPackId';
};

declare const CertificationRecordIdBrand: unique symbol;
/** Branded id of one certification record. */
export type CertificationRecordId = string & {
  readonly [CertificationRecordIdBrand]: 'CertificationRecordId';
};

/** Maximum identifier length (shared guard across all branded ids). */
export const MAX_ID_LENGTH = 256;

/**
 * Runtime validation shared by every branded id: non-empty, bounded,
 * whitespace-trimmed string. Returns the branded type.
 */
function brandId<TBranded extends string>(value: string, kind: string): TBranded {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`${kind} must be a non-empty string`, { kind, value });
  }
  if (value.length > MAX_ID_LENGTH) {
    throw new ValidationError(`${kind} exceeds ${MAX_ID_LENGTH} characters`, { kind, value });
  }
  if (value.trim() !== value) {
    throw new ValidationError(`${kind} must not carry surrounding whitespace`, {
      kind,
      value,
    });
  }
  return value as TBranded;
}

/** Brand a validated string as a `CapabilityDefinitionId`. */
export function asCapabilityDefinitionId(value: string): CapabilityDefinitionId {
  return brandId(value, 'CapabilityDefinitionId');
}

/** Brand a validated string as a `ProviderImplementationId`. */
export function asProviderImplementationId(value: string): ProviderImplementationId {
  return brandId(value, 'ProviderImplementationId');
}

/** Brand a validated string as a `ConnectedInstanceId`. */
export function asConnectedInstanceId(value: string): ConnectedInstanceId {
  return brandId(value, 'ConnectedInstanceId');
}

/** Brand a validated string as a `CatalogueEntryId`. */
export function asCatalogueEntryId(value: string): CatalogueEntryId {
  return brandId(value, 'CatalogueEntryId');
}

/** Brand a validated string as a `ConnectorPackId`. */
export function asConnectorPackId(value: string): ConnectorPackId {
  return brandId(value, 'ConnectorPackId');
}

/** Brand a validated string as a `CertificationRecordId`. */
export function asCertificationRecordId(value: string): CertificationRecordId {
  return brandId(value, 'CertificationRecordId');
}

/**
 * Version strings are non-empty bounded strings (`1`, `2026-01`, `1.2.0`).
 * The capability fabric does NOT interpret semver: version ORDERING is the
 * consumer's concern; the fabric pins exact version STRINGS into lineage
 * (definitions, implementations, packs, restrictions, observations) so any
 * projection can cite precisely which versions it was derived from.
 */
export const MAX_VERSION_LENGTH = 64;

/** A validated version string (unbranded: versions are cited verbatim). */
export type VersionString = string;

/** Validate a version string: non-empty, bounded, trimmed. */
export function asVersionString(value: string, subject: string): VersionString {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`${subject} version must be a non-empty string`, {
      subject,
      value,
    });
  }
  if (value.length > MAX_VERSION_LENGTH) {
    throw new ValidationError(`${subject} version exceeds ${MAX_VERSION_LENGTH} characters`, {
      subject,
      value,
    });
  }
  if (value.trim() !== value) {
    throw new ValidationError(`${subject} version must not carry whitespace`, {
      subject,
      value,
    });
  }
  return value;
}
