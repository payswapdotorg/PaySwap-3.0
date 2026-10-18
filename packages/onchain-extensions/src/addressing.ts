/**
 * @payswap/onchain-extensions — canonical pack addressing (Work Order
 * P5-W2, lane R3-W2; ADAPT of the old venue-pack identity law
 * `venue-pack/${venueId}@${version}` into the family-scoped form).
 *
 * Deterministic identity laws:
 * - packId is canonical: `onchain-pack/${family}/${packKey}@${semver}` and
 *   is DERIVED, never free-form — the family segment must equal the pack's
 *   family, the version segment must equal the pack's version, and the
 *   packKey must equal the venue surface's venueKey (a pack is ONE venue);
 * - the canonical pack projection + content digest give tamper evidence:
 *   validation re-derives provenance.contentDigest over EVERYTHING EXCEPT
 *   the digest field itself, so any silent mutation of pack data breaks
 *   (binding-never-security, the accepted digest local-copy law).
 */

import { contentDigest } from './digest.ts';
import { ValidationError } from './errors.ts';
import { isNonEmptyString } from './shared.ts';
import { PACK_ID_PATTERN, PACK_KEY_PATTERN, SEMVER_PATTERN } from './wire/core.ts';
import type { OnchainExtensionPack } from './wire/core.ts';
import { isPackFamily } from './wire/families.ts';
import type { PackFamily } from './wire/families.ts';

/** The parsed structure of a canonical pack id. */
export interface ParsedPackId {
  readonly family: PackFamily;
  readonly packKey: string;
  readonly version: string;
}

/** Deterministic pack identity: `onchain-pack/${family}/${packKey}@${version}`. */
export function onchainPackId(family: PackFamily, packKey: string, version: string): string {
  if (!isPackFamily(family)) {
    throw new ValidationError(`'${String(family)}' is not a declared pack family`);
  }
  if (typeof packKey !== 'string' || !PACK_KEY_PATTERN.test(packKey)) {
    throw new ValidationError('packKey must match /^[a-z0-9][a-z0-9._:-]{0,63}$/');
  }
  if (typeof version !== 'string' || !SEMVER_PATTERN.test(version)) {
    throw new ValidationError('version must be semantic (e.g. 1.0.0)');
  }
  return `onchain-pack/${family}/${packKey}@${version}`;
}

/**
 * Fail-closed parse of a canonical pack id. Rejects non-canonical forms —
 * the parser never guesses, never repairs, never falls back.
 */
export function parsePackId(packId: unknown): ParsedPackId {
  if (!isNonEmptyString(packId) || !PACK_ID_PATTERN.test(packId)) {
    throw new ValidationError(
      "packId must be canonical 'onchain-pack/<family>/<packKey>@<semver>'",
    );
  }
  const withoutPrefix = packId.slice('onchain-pack/'.length);
  const atSign = withoutPrefix.lastIndexOf('@');
  const familyAndKey = withoutPrefix.slice(0, atSign);
  const version = withoutPrefix.slice(atSign + 1);
  const slash = familyAndKey.indexOf('/');
  const family = familyAndKey.slice(0, slash) as PackFamily;
  const packKey = familyAndKey.slice(slash + 1);
  return { family, packKey, version };
}

/** The family segment of a canonical pack id (fail closed). */
export function packFamilyOf(packId: unknown): PackFamily {
  return parsePackId(packId).family;
}

/**
 * The canonical pack projection: the pack WITHOUT provenance.contentDigest
 * (the digest is computed over this projection, so it can never be part of
 * its own input). Key order is irrelevant — canonicalString sorts keys.
 */
export function canonicalPackProjection(
  pack: OnchainExtensionPack,
): Readonly<Record<string, unknown>> {
  const projection: Record<string, unknown> = { ...pack };
  const provenance: Record<string, unknown> = { ...pack.provenance };
  delete provenance.contentDigest;
  projection.provenance = provenance;
  return projection;
}

/**
 * The content digest of the canonical pack projection (deterministic,
 * binding-never-security). Validation re-derives this and rejects any pack
 * whose provenance disagrees — silent mutation of pack data is detectable.
 */
export function packContentDigest(pack: OnchainExtensionPack): string {
  return contentDigest(canonicalPackProjection(pack));
}
