/**
 * @payswap/onchain-extensions — the CROSS-RAIL family validators (bridge +
 * off-ramp; Work Order P5-W2, lane R3-W2). NET-NEW family surfaces (the
 * old repo modelled DEX/aggregator/intent venues only — MMP-23). Fail
 * closed, accumulate law.
 */

import { isNonEmptyString } from '../shared.ts';
import { isValidChainKey } from '../pins/onchain-domain.ts';
import {
  BRIDGE_FINALITY_REQUIREMENTS,
  BRIDGE_MESSAGE_VERIFICATION,
  BRIDGE_MODELS,
  BRIDGE_REORG_HANDLING,
  BRIDGE_REFUND_MODELS,
  OFFRAMP_KYC_REQUIREMENTS,
  OFFRAMP_PAYOUT_HANDOFF_MODELS,
  OFFRAMP_QUOTE_VALIDITY_MODELS,
} from '../wire/families.ts';
import { inVocabulary, isRecord, nonEmptyStringArray } from './helpers.ts';

/** Validates a bridge family extension (fail closed, accumulate law). */
export function validateBridgePackExtension(candidate: unknown, errors: string[]): void {
  const record = isRecord(candidate) ? candidate : undefined;
  if (record === undefined) {
    errors.push('familyExtension must be an object');
    return;
  }
  inVocabulary(BRIDGE_MODELS, record.bridgeModel, 'familyExtension.bridgeModel', errors);
  inVocabulary(
    BRIDGE_FINALITY_REQUIREMENTS,
    record.destinationFinalityRequirement,
    'familyExtension.destinationFinalityRequirement',
    errors,
  );
  inVocabulary(
    BRIDGE_REORG_HANDLING,
    record.reorgHandling,
    'familyExtension.reorgHandling',
    errors,
  );
  inVocabulary(
    BRIDGE_MESSAGE_VERIFICATION,
    record.messageVerification,
    'familyExtension.messageVerification',
    errors,
  );
  inVocabulary(BRIDGE_REFUND_MODELS, record.refundModel, 'familyExtension.refundModel', errors);
  const corridors = record.supportedCorridors;
  if (!Array.isArray(corridors) || corridors.length === 0) {
    errors.push('familyExtension.supportedCorridors must be a non-empty array');
  } else {
    corridors.forEach((corridor, index) => {
      if (!isRecord(corridor)) {
        errors.push(`familyExtension.supportedCorridors[${index}] must be an object`);
        return;
      }
      if (!isValidChainKey(corridor.sourceChain)) {
        errors.push(
          `familyExtension.supportedCorridors[${index}].sourceChain must be a canonical chain key`,
        );
      }
      if (!isValidChainKey(corridor.destinationChain)) {
        errors.push(
          `familyExtension.supportedCorridors[${index}].destinationChain must be a canonical chain key`,
        );
      }
      if (
        isNonEmptyString(corridor.sourceChain) &&
        corridor.sourceChain === corridor.destinationChain
      ) {
        errors.push(
          `familyExtension.supportedCorridors[${index}] source and destination must differ (a corridor spans two chains)`,
        );
      }
      if (corridor.direction !== 'ONE_WAY' && corridor.direction !== 'TWO_WAY') {
        errors.push(
          `familyExtension.supportedCorridors[${index}].direction must be 'ONE_WAY' or 'TWO_WAY'`,
        );
      }
      if (corridor.assetRef !== undefined && !isNonEmptyString(corridor.assetRef)) {
        errors.push(
          `familyExtension.supportedCorridors[${index}].assetRef, when present, must be a non-empty string`,
        );
      }
    });
  }
}

/** Validates an off-ramp family extension (fail closed, accumulate law). */
export function validateOffRampPackExtension(candidate: unknown, errors: string[]): void {
  const record = isRecord(candidate) ? candidate : undefined;
  if (record === undefined) {
    errors.push('familyExtension must be an object');
    return;
  }
  inVocabulary(
    OFFRAMP_PAYOUT_HANDOFF_MODELS,
    record.payoutHandoffModel,
    'familyExtension.payoutHandoffModel',
    errors,
  );
  nonEmptyStringArray(
    record.supportedPayoutMethods,
    'familyExtension.supportedPayoutMethods',
    errors,
  );
  const jurisdictions = record.supportedJurisdictions;
  if (!Array.isArray(jurisdictions) || jurisdictions.length === 0) {
    errors.push('familyExtension.supportedJurisdictions must be a non-empty array');
  } else {
    jurisdictions.forEach((entry, index) => {
      if (typeof entry !== 'string' || !/^[A-Z]{2}$/.test(entry)) {
        errors.push(
          `familyExtension.supportedJurisdictions[${index}] must be an ISO-3166-1 alpha-2 code (e.g. 'US')`,
        );
      }
    });
  }
  inVocabulary(
    OFFRAMP_KYC_REQUIREMENTS,
    record.kycRequirement,
    'familyExtension.kycRequirement',
    errors,
  );
  inVocabulary(
    OFFRAMP_QUOTE_VALIDITY_MODELS,
    record.quoteValidityModel,
    'familyExtension.quoteValidityModel',
    errors,
  );
  if (!isNonEmptyString(record.settlementRailHandoff)) {
    errors.push(
      'familyExtension.settlementRailHandoff must be a non-empty string (the declared fiat rail handoff)',
    );
  }
}
