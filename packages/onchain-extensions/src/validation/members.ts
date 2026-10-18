/**
 * @payswap/onchain-extensions — the pack MEMBER validators (Work Order
 * P5-W2, lane R3-W2; ADAPT of the old validateVenueExtensionPack coupling
 * law): the venue surface, the implementation descriptor (with the
 * RE-DERIVED capability binding), sub-pack references, constraints (the
 * authorityCarrier literal law), the certification literals and the
 * family-extension dispatch. Fail closed, accumulate law.
 */

import { isNonEmptyString, isStringRecord } from '../shared.ts';
import { protocolCapabilityId } from '../pins/onchain-domain.ts';
import { isValidChainKey } from '../pins/onchain-domain.ts';
import {
  PACK_CONSTRAINT_KINDS,
  PACK_ID_PATTERN,
  PACK_KEY_PATTERN,
} from '../wire/core.ts';
import {
  validateBridgePackExtension,
  validateOffRampPackExtension,
} from './families-transfer.ts';
import {
  validateLiquidityPackExtension,
  validateLendingStakingPackExtension,
} from './families-yield.ts';
import {
  validateDexPackExtension,
  validateIntentProtocolPackExtension,
} from './families-swap.ts';

export function validateVenueSurface(
  record: Readonly<Record<string, unknown>>,
  errors: string[],
): void {
  const surface = record.venueSurface;
  if (!isStringRecord(surface)) {
    errors.push('venueSurface must be an object');
    return;
  }
  if (typeof surface.venueKey !== 'string' || !PACK_KEY_PATTERN.test(surface.venueKey)) {
    errors.push('venueSurface.venueKey must match /^[a-z0-9][a-z0-9._:-]{0,63}$/');
  }
  if (!isNonEmptyString(surface.displayName)) {
    errors.push('venueSurface.displayName must be a non-empty string');
  }
  const chains = surface.chains;
  if (!Array.isArray(chains) || chains.length === 0) {
    errors.push('venueSurface.chains must be a non-empty array');
  } else {
    chains.forEach((chain, index) => {
      if (!isValidChainKey(chain)) {
        errors.push(
          `venueSurface.chains[${index}] must be a canonical \`\${namespace}:\${network}\` chain key`,
        );
      }
    });
  }
  if (typeof surface.supportsSimulation !== 'boolean') {
    errors.push('venueSurface.supportsSimulation must be a boolean');
  }
  const optimization = surface.nativeOptimization;
  if (optimization !== undefined) {
    if (!isStringRecord(optimization)) {
      errors.push('venueSurface.nativeOptimization must be an object');
    } else {
      if (!isNonEmptyString(optimization.optimizationKind)) {
        errors.push('venueSurface.nativeOptimization.optimizationKind must be a non-empty string');
      }
      if (optimization.benchmarkBaseline !== true) {
        errors.push(
          'venueSurface.nativeOptimization.benchmarkBaseline must be the literal true (a declared optimization IS the incumbent baseline — INV-C08)',
        );
      }
      if (!isNonEmptyString(optimization.description)) {
        errors.push('venueSurface.nativeOptimization.description must be a non-empty string');
      }
    }
  }
}

export function validateImplementation(
  record: Readonly<Record<string, unknown>>,
  protocol: unknown,
  errors: string[],
): void {
  const implementation = record.implementation;
  if (!isStringRecord(implementation)) {
    errors.push('implementation must be an object');
    return;
  }
  const protocolRecord = isStringRecord(protocol) ? protocol : {};
  if (!isNonEmptyString(implementation.implementationId)) {
    errors.push('implementation.implementationId must be a non-empty string');
  }
  if (!isNonEmptyString(implementation.providerName)) {
    errors.push('implementation.providerName must be a non-empty string');
  }
  if (!isNonEmptyString(implementation.providerVersion)) {
    errors.push('implementation.providerVersion must be a non-empty string');
  }
  if (!isNonEmptyString(implementation.adapterRef)) {
    errors.push('implementation.adapterRef must be a non-empty string');
  }
  if (!isNonEmptyString(implementation.implementationNotes)) {
    errors.push('implementation.implementationNotes must be a non-empty string');
  }
  if (!Array.isArray(implementation.knownDeviations)) {
    errors.push('implementation.knownDeviations must be an array');
  } else {
    implementation.knownDeviations.forEach((entry, index) => {
      if (!isNonEmptyString(entry)) {
        errors.push(`implementation.knownDeviations[${index}] must be a non-empty string`);
      }
    });
  }
  const optimization = implementation.nativeOptimization;
  if (!isStringRecord(optimization)) {
    errors.push('implementation.nativeOptimization must be declared (INV-C08 baseline law)');
  } else {
    if (optimization.representableAsCapability !== true) {
      errors.push(
        'implementation.nativeOptimization.representableAsCapability must be the literal true',
      );
    }
    if (!isNonEmptyString(optimization.capabilityId)) {
      errors.push('implementation.nativeOptimization.capabilityId must be a non-empty string');
    }
  }
  if (
    isNonEmptyString(implementation.protocolKey) &&
    isNonEmptyString(protocolRecord.protocolKey)
  ) {
    if (implementation.protocolKey !== protocolRecord.protocolKey) {
      errors.push(
        "the implementation descriptor's protocolKey must match the protocol descriptor — a pack is ONE venue",
      );
    }
  }
  if (isNonEmptyString(implementation.chainKey) && isNonEmptyString(protocolRecord.chainKey)) {
    if (implementation.chainKey !== protocolRecord.chainKey) {
      errors.push(
        "the implementation descriptor's chainKey must match the protocol descriptor — a pack is ONE venue on ONE chain",
      );
    }
  }
  // The capability binding is RE-DERIVED, never accepted as declared (the
  // deterministic addressing law).
  if (isNonEmptyString(protocolRecord.protocolKey) && isNonEmptyString(protocolRecord.chainKey)) {
    const derivedCapabilityId = protocolCapabilityId(
      protocolRecord.protocolKey,
      protocolRecord.chainKey,
    );
    if (implementation.capabilityId !== derivedCapabilityId) {
      errors.push(
        `implementation.capabilityId must be the derived protocol capability id '${derivedCapabilityId}'`,
      );
    }
    if (
      isStringRecord(implementation.nativeOptimization) &&
      implementation.nativeOptimization.capabilityId !== derivedCapabilityId
    ) {
      errors.push(
        `implementation.nativeOptimization.capabilityId must be the derived protocol capability id '${derivedCapabilityId}'`,
      );
    }
  }
}

export function validateSubPacks(record: Readonly<Record<string, unknown>>, errors: string[]): void {
  const subPacks = record.subPacks;
  if (subPacks === undefined) {
    errors.push('subPacks must be declared (an empty array for leaf packs)');
    return;
  }
  if (!Array.isArray(subPacks)) {
    errors.push('subPacks must be an array');
    return;
  }
  const seen = new Set<string>();
  subPacks.forEach((ref, index) => {
    if (!isStringRecord(ref)) {
      errors.push(`subPacks[${index}] must be an object`);
      return;
    }
    if (typeof ref.packId !== 'string' || !PACK_ID_PATTERN.test(ref.packId)) {
      errors.push(
        `subPacks[${index}].packId must be canonical 'onchain-pack/<family>/<packKey>@<semver>'`,
      );
    } else {
      if (ref.packId === record.packId) {
        errors.push(`subPacks[${index}]: a pack can never compose itself`);
      }
      if (seen.has(ref.packId)) {
        errors.push(`subPacks[${index}]: duplicate sub-pack reference '${ref.packId}'`);
      }
      seen.add(ref.packId);
    }
    if (!isNonEmptyString(ref.role)) {
      errors.push(`subPacks[${index}].role must be a non-empty string`);
    }
    if (!Array.isArray(ref.assumptions)) {
      errors.push(`subPacks[${index}].assumptions must be an array`);
    } else {
      ref.assumptions.forEach((entry, assumptionIndex) => {
        if (!isNonEmptyString(entry)) {
          errors.push(
            `subPacks[${index}].assumptions[${assumptionIndex}] must be a non-empty string`,
          );
        }
      });
    }
  });
}

export function validateConstraints(record: Readonly<Record<string, unknown>>, errors: string[]): void {
  const constraints = record.constraints;
  if (!Array.isArray(constraints)) {
    errors.push('constraints must be an array');
    return;
  }
  const seen = new Set<string>();
  constraints.forEach((constraint, index) => {
    if (!isStringRecord(constraint)) {
      errors.push(`constraints[${index}] must be an object`);
      return;
    }
    if (!isNonEmptyString(constraint.constraintId)) {
      errors.push(`constraints[${index}].constraintId must be a non-empty string`);
    } else if (seen.has(constraint.constraintId)) {
      errors.push(`constraints[${index}]: duplicate constraintId '${constraint.constraintId}'`);
    } else {
      seen.add(constraint.constraintId);
    }
    if (
      typeof constraint.kind !== 'string' ||
      !(PACK_CONSTRAINT_KINDS as readonly unknown[]).includes(constraint.kind)
    ) {
      errors.push(
        `constraints[${index}].kind must be one of [${PACK_CONSTRAINT_KINDS.join(', ')}]`,
      );
    }
    if (!isNonEmptyString(constraint.description)) {
      errors.push(`constraints[${index}].description must be a non-empty string`);
    }
    if (constraint.authorityCarrier !== false) {
      errors.push(
        `constraints[${index}].authorityCarrier must be the literal false — a constraint is data, never an authorization carrier`,
      );
    }
  });
}

export function validateCertification(
  record: Readonly<Record<string, unknown>>,
  errors: string[],
): void {
  const certification = record.certification;
  if (!isStringRecord(certification)) {
    errors.push('certification must be declared');
    return;
  }
  if (certification.certificationRequired !== true) {
    errors.push(
      'certification.certificationRequired must be the literal true — no pack can opt out of certification',
    );
  }
  if (certification.statusCarried !== false) {
    errors.push(
      'certification.statusCarried must be the literal false — a pack can never carry its own certification status',
    );
  }
}

export function validateFamilyExtension(
  family: string,
  familyExtension: unknown,
  errors: string[],
): void {
  if (!isStringRecord(familyExtension)) {
    errors.push('familyExtension must be an object');
    return;
  }
  if (familyExtension.family !== family) {
    errors.push(
      `familyExtension.family must equal the pack's family '${family}' (the family extension discriminates on family)`,
    );
    return;
  }
  switch (family) {
    case 'dex':
      validateDexPackExtension(familyExtension, errors);
      return;
    case 'bridge':
      validateBridgePackExtension(familyExtension, errors);
      return;
    case 'off-ramp':
      validateOffRampPackExtension(familyExtension, errors);
      return;
    case 'liquidity':
      validateLiquidityPackExtension(familyExtension, errors);
      return;
    case 'lending-staking':
      validateLendingStakingPackExtension(familyExtension, errors);
      return;
    case 'intent-protocol':
      validateIntentProtocolPackExtension(familyExtension, errors);
      return;
    default:
      errors.push(`familyExtension: unknown family '${family}'`);
  }
}
