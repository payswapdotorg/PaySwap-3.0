/**
 * @payswap/onchain-extensions — the SWAP/INTENT family validators (dex +
 * intent-protocol; Work Order P5-W2, lane R3-W2). DEX ADAPTs the old
 * DexCapabilityDeclaration flavor; intent-protocol ADAPTs the old
 * IntentExecutionCapabilityDeclaration flavor. Fail closed, accumulate law.
 */

import {
  DEX_AGGREGATOR_SOURCE_KINDS,
  DEX_FEE_MODELS,
  DEX_PACK_KINDS,
  INTENT_BATCH_CADENCE,
  INTENT_ESCROW_MODELS,
  INTENT_SETTLEMENT_MODELS,
  INTENT_SURPLUS_MODELS,
  QUOTE_SEMANTICS,
  SLIPPAGE_PROTECTION_MODELS,
  SOLVER_COMPETITION_MODELS,
  SWAP_KINDS,
} from '../wire/families.ts';
import {
  canonicalChainKeyArray,
  inVocabulary,
  isRecord,
  memberOfVocabularyArray,
} from './helpers.ts';

/** Validates a DEX family extension (fail closed, accumulate law). */
export function validateDexPackExtension(candidate: unknown, errors: string[]): void {
  const record = isRecord(candidate) ? candidate : undefined;
  if (record === undefined) {
    errors.push('familyExtension must be an object');
    return;
  }
  inVocabulary(DEX_PACK_KINDS, record.dexKind, 'familyExtension.dexKind', errors);
  memberOfVocabularyArray(
    SWAP_KINDS,
    record.supportedSwapKinds,
    'familyExtension.supportedSwapKinds',
    errors,
  );
  canonicalChainKeyArray(record.supportedChains, 'familyExtension.supportedChains', errors);
  inVocabulary(
    QUOTE_SEMANTICS,
    record.quoteSemantics,
    'familyExtension.quoteSemantics',
    errors,
  );
  inVocabulary(
    SLIPPAGE_PROTECTION_MODELS,
    record.slippageProtection,
    'familyExtension.slippageProtection',
    errors,
  );
  inVocabulary(DEX_FEE_MODELS, record.feeModel, 'familyExtension.feeModel', errors);
  if (typeof record.supportsSimulation !== 'boolean') {
    errors.push('familyExtension.supportsSimulation must be a boolean');
  }
  if (record.dexKind === 'AGGREGATOR') {
    memberOfVocabularyArray(
      DEX_AGGREGATOR_SOURCE_KINDS,
      record.aggregatorSources,
      'familyExtension.aggregatorSources',
      errors,
    );
  } else if (record.aggregatorSources !== undefined) {
    errors.push(
      'familyExtension.aggregatorSources is only declarable when dexKind is AGGREGATOR',
    );
  }
}

/** Validates an intent-protocol family extension (fail closed, accumulate law). */
export function validateIntentProtocolPackExtension(candidate: unknown, errors: string[]): void {
  const record = isRecord(candidate) ? candidate : undefined;
  if (record === undefined) {
    errors.push('familyExtension must be an object');
    return;
  }
  inVocabulary(
    INTENT_SETTLEMENT_MODELS,
    record.settlementModel,
    'familyExtension.settlementModel',
    errors,
  );
  inVocabulary(
    SOLVER_COMPETITION_MODELS,
    record.solverCompetition,
    'familyExtension.solverCompetition',
    errors,
  );
  canonicalChainKeyArray(record.supportedDomains, 'familyExtension.supportedDomains', errors);
  inVocabulary(INTENT_ESCROW_MODELS, record.escrowModel, 'familyExtension.escrowModel', errors);
  inVocabulary(
    INTENT_BATCH_CADENCE,
    record.batchCadence,
    'familyExtension.batchCadence',
    errors,
  );
  inVocabulary(
    INTENT_SURPLUS_MODELS,
    record.surplusModel,
    'familyExtension.surplusModel',
    errors,
  );
}
