/**
 * @payswap/command — version pins and the explicit-versioning law (P7-W3).
 *
 * The command surface is EXPLICITLY VERSIONED end to end: there is no
 * implicit/unversioned default. Every request pins an API version (wire
 * header `X-PaySwap-API-Version`), every envelope carries a schema version,
 * and the browser Extension boundary carries its own API version pin so the
 * host page and the extension can negotiate supported surfaces
 * independently of the REST/developer surface.
 *
 * Adapted from the old repository's @payswap/interfaces version pins
 * (`CURRENT_API_VERSION` / `CONTRACT_SCHEMA_VERSION`, date-pinned) —
 * re-pinned as explicit semver-shaped strings per the canonical
 * packages/surface pattern (`SURFACE_API_VERSION = '1.0.0'`).
 */

import { UnsupportedVersionError } from './errors.ts';

/** The API version of the command surface (REST/developer/agent boundary). */
export const COMMAND_SURFACE_API_VERSION = '1.0.0';

/** The API version of the browser Extension boundary (independent pin). */
export const EXTENSION_BOUNDARY_API_VERSION = '1.0.0';

/**
 * The schema version stamped on every command proposal envelope (integer,
 * mirroring the old protocol envelope pin `PROTOCOL_SCHEMA_VERSION = 1`).
 */
export const COMMAND_ENVELOPE_SCHEMA_VERSION = 1;

/** Request header carrying the pinned external API version. */
export const API_VERSION_HEADER = 'X-PaySwap-API-Version';

/** API versions the command surface currently accepts (explicit; no default). */
export const SUPPORTED_COMMAND_API_VERSIONS: readonly string[] = Object.freeze([
  COMMAND_SURFACE_API_VERSION,
]);

/** Extension boundary versions the host currently accepts (explicit; no default). */
export const SUPPORTED_EXTENSION_API_VERSIONS: readonly string[] = Object.freeze([
  EXTENSION_BOUNDARY_API_VERSION,
]);

const API_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/** A validated API version string (semver-shaped, e.g. `1.0.0`). */
export type ApiVersionString = string;

/** Narrow an unknown value to a well-formed API version string. */
export function isApiVersionString(value: unknown): value is ApiVersionString {
  return typeof value === 'string' && API_VERSION_PATTERN.test(value);
}

/** Validate a well-formed API version string or fail closed. */
export function asApiVersionString(value: unknown, subject: string): ApiVersionString {
  if (!isApiVersionString(value)) {
    throw new UnsupportedVersionError(
      `${subject} must be an explicit semver-shaped API version (e.g. '1.0.0'); external versioning is explicit — there is no implicit default`,
      { subject, value },
    );
  }
  return value;
}

/** Is this version accepted by the given supported list (explicit versioning law)? */
export function isSupportedApiVersion(
  version: string,
  supported: readonly string[] = SUPPORTED_COMMAND_API_VERSIONS,
): boolean {
  return supported.includes(version);
}

/**
 * Assert the explicit-versioning law: the version must be well-formed AND
 * accepted. Anything else fails closed with `UNSUPPORTED_API_VERSION`
 * (never a silent fallback to a default version).
 */
export function assertSupportedApiVersion(
  version: unknown,
  subject: string,
  supported: readonly string[] = SUPPORTED_COMMAND_API_VERSIONS,
): ApiVersionString {
  const candidate = asApiVersionString(version, subject);
  if (!isSupportedApiVersion(candidate, supported)) {
    throw new UnsupportedVersionError(
      `${subject} pins unsupported API version ${candidate} (supported: ${supported.join(', ')})`,
      { subject, version: candidate, supported: [...supported] },
    );
  }
  return candidate;
}

/** Validate the integer schema version stamped on command envelopes. */
export function assertEnvelopeSchemaVersion(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new UnsupportedVersionError(
      `envelope schemaVersion must be a positive integer (this surface pins ${COMMAND_ENVELOPE_SCHEMA_VERSION})`,
      { value },
    );
  }
  if (value !== COMMAND_ENVELOPE_SCHEMA_VERSION) {
    throw new UnsupportedVersionError(
      `foreign envelope schemaVersion ${value} is not accepted (this surface pins ${COMMAND_ENVELOPE_SCHEMA_VERSION})`,
      { value },
    );
  }
  return value;
}
