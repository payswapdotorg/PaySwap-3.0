/**
 * @payswap/onchain-extensions — the pack validator core (Work Order P5-W2,
 * lane R3-W2; ADAPT of the old validateVenueExtensionPack coupling law,
 * made total over the six families and the declarative-law literals).
 *
 * The deterministic coupling rules (a pack is ONE venue):
 * - packId is canonical and DERIVED: the family segment equals the pack's
 *   family, the version segment equals the pack's version, and the packKey
 *   equals the venue surface's venueKey;
 * - the protocol descriptor validates through the pin validator, its
 *   protocolClass satisfies the family coupling law, and every INV-SC01
 *   contract's chainRef equals the protocol's chainKey;
 * - the venue surface's chains include the protocol's chainKey (the venue
 *   touches the chain its contracts live on);
 * - the implementation descriptor's protocolKey/chainKey match the protocol
 *   descriptor EXACTLY, and its capabilityId is the RE-DERIVED protocol
 *   capability id (never accepted as declared);
 * - sub-pack references are shape-valid, duplicate-free and self-free
 *   (resolvability + family compatibility are registry laws);
 * - constraints carry authorityCarrier === false (LITERAL) and the
 *   certification declaration carries its two LITERALS — anything else is
 *   rejected (the declarative law, machine-enforced);
 * - provenance.contentDigest is RE-DERIVED over the canonical pack
 *   projection and must agree (tamper evidence, binding-never-security).
 *
 * On success the pack is deep-cloned-then-frozen (validate-then-freeze).
 */

import { packContentDigest, parsePackId } from '../addressing.ts';
import { ValidationError } from '../errors.ts';
import { cloneAndFreeze, isNonEmptyString, isStringRecord } from '../shared.ts';
import { validateProtocolDescriptor } from '../pins/smart-contract.ts';
import { PACK_ID_PATTERN, SEMVER_PATTERN } from '../wire/core.ts';
import type { OnchainExtensionPack } from '../wire/core.ts';
import { allowedProtocolClasses } from '../wire/family-semantics.ts';
import { PACK_FAMILIES, isPackFamily } from '../wire/families.ts';
import {
  validateCertification,
  validateConstraints,
  validateFamilyExtension,
  validateImplementation,
  validateSubPacks,
  validateVenueSurface,
} from './members.ts';

/**
 * Validates an onchain extension pack (fail closed, accumulate law).
 * Returns a deep-frozen copy; throws ValidationError carrying EVERY defect.
 */
export function validateOnchainExtensionPack(candidate: unknown): Readonly<OnchainExtensionPack> {
  if (!isStringRecord(candidate)) {
    throw new ValidationError('an onchain extension pack must be an object');
  }
  const record = candidate;
  const errors: string[] = [];

  // packId + family + version: the canonical identity law.
  let family = '';
  let parsedPackKey: string | undefined;
  if (typeof record.packId !== 'string' || !PACK_ID_PATTERN.test(record.packId)) {
    errors.push(
      "packId must be canonical 'onchain-pack/<family>/<packKey>@<semver>'",
    );
  } else {
    const parsed = parsePackId(record.packId);
    family = parsed.family;
    parsedPackKey = parsed.packKey;
    if (!isPackFamily(record.family)) {
      errors.push(`family must be one of [${PACK_FAMILIES.join(', ')}]`);
    } else if (record.family !== parsed.family) {
      errors.push(
        `packId family segment '${parsed.family}' must equal the pack's family '${record.family}'`,
      );
      family = record.family;
    } else if (typeof record.version !== 'string' || !SEMVER_PATTERN.test(record.version)) {
      errors.push('version must be semantic (e.g. 1.0.0)');
    } else if (record.version !== parsed.version) {
      errors.push("packId version segment must equal the pack's version field");
    }
  }

  // Protocol descriptor + the family coupling law.
  let protocol: Readonly<Record<string, unknown>> | undefined;
  try {
    const validatedProtocol = validateProtocolDescriptor(record.protocol);
    protocol = validatedProtocol as unknown as Readonly<Record<string, unknown>>;
    if (isPackFamily(family)) {
      const allowed = allowedProtocolClasses(family);
      if (!(allowed as readonly unknown[]).includes(validatedProtocol.protocolClass)) {
        errors.push(
          `protocol.protocolClass '${validatedProtocol.protocolClass}' is not allowed for family '${family}' (allowed: [${allowed.join(', ')}])`,
        );
      }
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  validateVenueSurface(record, errors);

  // The pack id's packKey segment is the venue identity (a pack is ONE
  // venue — the old venueId coupling law).
  if (
    parsedPackKey !== undefined &&
    isStringRecord(record.venueSurface) &&
    typeof record.venueSurface.venueKey === 'string' &&
    record.venueSurface.venueKey !== parsedPackKey
  ) {
    errors.push(
      `packId packKey segment '${parsedPackKey}' must equal the venue surface's venueKey '${record.venueSurface.venueKey}'`,
    );
  }

  // The venue touches the chain its contracts live on.
  if (protocol !== undefined && isStringRecord(record.venueSurface)) {
    const chains = record.venueSurface.chains;
    if (Array.isArray(chains) && !chains.includes(protocol.chainKey)) {
      errors.push(
        `venueSurface.chains must include the protocol's chainKey '${String(protocol.chainKey)}'`,
      );
    }
  }

  validateImplementation(record, record.protocol, errors);
  validateSubPacks(record, errors);
  validateConstraints(record, errors);
  validateCertification(record, errors);

  if (isNonEmptyString(family)) {
    validateFamilyExtension(family, record.familyExtension, errors);
  } else if (record.familyExtension !== undefined) {
    validateFamilyExtension(String(record.familyExtension), record.familyExtension, errors);
  }

  // Provenance: declared + the re-derived content digest (tamper evidence).
  const provenance = record.provenance;
  if (!isStringRecord(provenance)) {
    errors.push('provenance must be declared');
  } else {
    if (!isNonEmptyString(provenance.declaredBy)) {
      errors.push('provenance.declaredBy must be a non-empty string');
    }
    if (!isNonEmptyString(provenance.artifactRef)) {
      errors.push('provenance.artifactRef must be a non-empty string');
    }
    if (
      typeof provenance.contentDigest !== 'string' ||
      !/^fnv1a64:[0-9a-f]{16}$/.test(provenance.contentDigest)
    ) {
      errors.push('provenance.contentDigest must be a fnv1a64:<16-hex> digest');
    } else if (errors.length === 0) {
      // The digest comparison is meaningful only when the rest of the pack
      // is well-formed (a malformed pack's projection digest is noise).
      const derived = packContentDigest(candidate as unknown as OnchainExtensionPack);
      if (provenance.contentDigest !== derived) {
        errors.push(
          `provenance.contentDigest '${provenance.contentDigest}' disagrees with the canonical pack projection digest '${derived}' — pack data was mutated after declaration`,
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(`Invalid onchain extension pack: ${errors.join('; ')}`, {
      errors: [...errors],
    });
  }
  return cloneAndFreeze(candidate) as Readonly<OnchainExtensionPack>;
}
