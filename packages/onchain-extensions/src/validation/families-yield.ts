/**
 * @payswap/onchain-extensions — the YIELD family validators (liquidity +
 * lending-staking; Work Order P5-W2, lane R3-W2). NET-NEW family surfaces
 * (MMP-23). Fail closed, accumulate law.
 */

import { isNonEmptyString } from '../shared.ts';
import {
  COLLATERAL_MODELS,
  IMPERMANENT_LOSS_DISCLOSURES,
  LENDING_STAKING_POSITION_KINDS,
  LIQUIDITY_LOCKUP_MODELS,
  LIQUIDITY_MODELS,
  RATE_MODELS,
  RATE_VARIABILITY,
  UNBONDING_MODELS,
} from '../wire/families.ts';
import { inVocabulary, isRecord, nonEmptyStringArray } from './helpers.ts';
import { nonNegativeInteger } from './helpers.ts';

/** Validates a liquidity family extension (fail closed, accumulate law). */
export function validateLiquidityPackExtension(candidate: unknown, errors: string[]): void {
  const record = isRecord(candidate) ? candidate : undefined;
  if (record === undefined) {
    errors.push('familyExtension must be an object');
    return;
  }
  inVocabulary(
    LIQUIDITY_MODELS,
    record.liquidityModel,
    'familyExtension.liquidityModel',
    errors,
  );
  nonEmptyStringArray(record.positionShapes, 'familyExtension.positionShapes', errors);
  const tiers = record.feeTiersBasisPoints;
  if (!Array.isArray(tiers) || tiers.length === 0) {
    errors.push('familyExtension.feeTiersBasisPoints must be a non-empty array');
  } else {
    tiers.forEach((tier, index) => {
      if (!nonNegativeInteger(tier) || (tier as number) > 10_000) {
        errors.push(
          `familyExtension.feeTiersBasisPoints[${index}] must be an integer in [0, 10000]`,
        );
      }
    });
    const unique = new Set(tiers.map((tier) => String(tier)));
    if (unique.size !== tiers.length) {
      errors.push('familyExtension.feeTiersBasisPoints must not contain duplicates');
    }
  }
  inVocabulary(
    IMPERMANENT_LOSS_DISCLOSURES,
    record.impermanentLossDisclosure,
    'familyExtension.impermanentLossDisclosure',
    errors,
  );
  inVocabulary(
    LIQUIDITY_LOCKUP_MODELS,
    record.lockupModel,
    'familyExtension.lockupModel',
    errors,
  );
  if (record.lockupModel === 'WITHDRAWAL_DELAY') {
    if (!isNonEmptyString(record.withdrawalDelayDescription)) {
      errors.push(
        'familyExtension.withdrawalDelayDescription is required when lockupModel is WITHDRAWAL_DELAY',
      );
    }
  } else if (record.withdrawalDelayDescription !== undefined) {
    errors.push(
      'familyExtension.withdrawalDelayDescription is only declarable when lockupModel is WITHDRAWAL_DELAY',
    );
  }
}

/** Validates a lending-staking family extension (fail closed, accumulate law). */
export function validateLendingStakingPackExtension(candidate: unknown, errors: string[]): void {
  const record = isRecord(candidate) ? candidate : undefined;
  if (record === undefined) {
    errors.push('familyExtension must be an object');
    return;
  }
  inVocabulary(
    LENDING_STAKING_POSITION_KINDS,
    record.positionKind,
    'familyExtension.positionKind',
    errors,
  );
  inVocabulary(
    COLLATERAL_MODELS,
    record.collateralModel,
    'familyExtension.collateralModel',
    errors,
  );
  inVocabulary(RATE_MODELS, record.rateModel, 'familyExtension.rateModel', errors);
  inVocabulary(
    RATE_VARIABILITY,
    record.rateVariability,
    'familyExtension.rateVariability',
    errors,
  );
  if (!Array.isArray(record.rewardStreams)) {
    errors.push('familyExtension.rewardStreams must be an array (may be empty)');
  } else {
    record.rewardStreams.forEach((entry, index) => {
      if (!isNonEmptyString(entry)) {
        errors.push(`familyExtension.rewardStreams[${index}] must be a non-empty string`);
      }
    });
  }
  inVocabulary(
    UNBONDING_MODELS,
    record.unbondingModel,
    'familyExtension.unbondingModel',
    errors,
  );
  if (record.unbondingModel === 'DELAYED') {
    if (!isNonEmptyString(record.unbondingDelayDescription)) {
      errors.push(
        'familyExtension.unbondingDelayDescription is required when unbondingModel is DELAYED',
      );
    }
  } else if (record.unbondingDelayDescription !== undefined) {
    errors.push(
      'familyExtension.unbondingDelayDescription is only declarable when unbondingModel is DELAYED',
    );
  }
  const stakingPosition =
    record.positionKind === 'STAKE' ||
    record.positionKind === 'NATIVE_STAKING' ||
    record.positionKind === 'LIQUID_STAKING';
  if (stakingPosition) {
    if (!Array.isArray(record.slashingConditions) || record.slashingConditions.length === 0) {
      errors.push(
        'familyExtension.slashingConditions is required (non-empty) for staking position kinds',
      );
    } else {
      record.slashingConditions.forEach((entry, index) => {
        if (!isNonEmptyString(entry)) {
          errors.push(
            `familyExtension.slashingConditions[${index}] must be a non-empty string`,
          );
        }
      });
    }
  } else if (record.slashingConditions !== undefined) {
    errors.push(
      'familyExtension.slashingConditions is only declarable for staking position kinds',
    );
  }
}
