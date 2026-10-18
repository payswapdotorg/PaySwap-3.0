import { describe, expect, it } from 'vitest';
import {
  validateLendingStakingPackExtension,
  validateOnchainExtensionPack,
} from '../src/index.ts';
import { fixtureLendingStakingPack, variant } from './fixtures.ts';

/** NET-NEW: the lending/staking family wire surface (yield-bearing positions). */
describe('the lending-staking family surface', () => {
  it('a well-formed lending-staking extension validates', () => {
    const errors: string[] = [];
    validateLendingStakingPackExtension(
      {
        family: 'lending-staking',
        positionKind: 'SUPPLY',
        collateralModel: 'OVER_COLLATERALIZED',
        rateModel: 'VARIABLE',
        rateVariability: 'DETERMINISTIC_FORMULA',
        rewardStreams: ['incentive-emissions'],
        unbondingModel: 'INSTANT',
      },
      errors,
    );
    expect(errors).toEqual([]);
  });

  it('every position kind is accepted (with the staking slashing law satisfied where required)', () => {
    for (const positionKind of [
      'SUPPLY',
      'BORROW',
      'STAKE',
      'NATIVE_STAKING',
      'LIQUID_STAKING',
    ] as const) {
      const errors: string[] = [];
      const staking =
        positionKind === 'STAKE' ||
        positionKind === 'NATIVE_STAKING' ||
        positionKind === 'LIQUID_STAKING';
      validateLendingStakingPackExtension(
        {
          family: 'lending-staking',
          positionKind,
          collateralModel: 'NONE',
          rateModel: 'VARIABLE',
          rateVariability: 'DETERMINISTIC_FORMULA',
          rewardStreams: [],
          unbondingModel: 'INSTANT',
          ...(staking ? { slashingConditions: ['declared slashing exposure'] } : {}),
        },
        errors,
      );
      expect(errors).toEqual([]);
    }
  });

  it('an unknown position kind is rejected (closed vocabulary)', () => {
    const errors: string[] = [];
    validateLendingStakingPackExtension(
      { family: 'lending-staking', positionKind: 'LP_FARM' },
      errors,
    );
    expect(errors.join('; ')).toMatch(/positionKind/);
  });

  it('staking position kinds REQUIRE disclosed slashing conditions', () => {
    const errors: string[] = [];
    validateLendingStakingPackExtension(
      { family: 'lending-staking', positionKind: 'NATIVE_STAKING' },
      errors,
    );
    expect(errors.join('; ')).toMatch(/slashingConditions is required/);
  });

  it('non-staking position kinds FORBID slashing conditions', () => {
    const errors: string[] = [];
    validateLendingStakingPackExtension(
      {
        family: 'lending-staking',
        positionKind: 'SUPPLY',
        slashingConditions: ['not a staking position'],
      },
      errors,
    );
    expect(errors.join('; ')).toMatch(
      /slashingConditions is only declarable for staking position kinds/,
    );
  });

  it('DELAYED unbonding REQUIRES a delay description; other models FORBID it', () => {
    const missing: string[] = [];
    validateLendingStakingPackExtension(
      { family: 'lending-staking', unbondingModel: 'DELAYED' },
      missing,
    );
    expect(missing.join('; ')).toMatch(
      /unbondingDelayDescription is required when unbondingModel is DELAYED/,
    );
    const forbidden: string[] = [];
    validateLendingStakingPackExtension(
      { family: 'lending-staking', unbondingModel: 'INSTANT', unbondingDelayDescription: 'none' },
      forbidden,
    );
    expect(forbidden.join('; ')).toMatch(
      /unbondingDelayDescription is only declarable when unbondingModel is DELAYED/,
    );
  });

  it('reward streams may be empty but entries must be non-empty strings', () => {
    const empty: string[] = [];
    validateLendingStakingPackExtension(
      { family: 'lending-staking', rewardStreams: [] },
      empty,
    );
    expect(empty.join('; ')).not.toMatch(/rewardStreams must be an array/);
    const badEntry: string[] = [];
    validateLendingStakingPackExtension(
      { family: 'lending-staking', rewardStreams: [''] },
      badEntry,
    );
    expect(badEntry.join('; ')).toMatch(/rewardStreams\[0\]/);
  });

  it('collateral, rate and rate-variability models are closed vocabularies', () => {
    const errors: string[] = [];
    validateLendingStakingPackExtension(
      {
        family: 'lending-staking',
        collateralModel: 'FLASH',
        rateModel: 'NEGOTIATED',
        rateVariability: 'RANDOM',
      },
      errors,
    );
    const joined = errors.join('; ');
    expect(joined).toMatch(/collateralModel/);
    expect(joined).toMatch(/rateModel/);
    expect(joined).toMatch(/rateVariability/);
  });

  it('the full-pack validator dispatches to the lending-staking surface (fail closed end to end)', () => {
    const pack = fixtureLendingStakingPack();
    expect(() => validateOnchainExtensionPack(pack)).not.toThrow();
    expect(() =>
      validateOnchainExtensionPack(
        variant(pack, (draft) => {
          const extension = draft.familyExtension as { family: 'lending-staking' } & Record<string, unknown>;
          delete extension.slashingConditions;
          draft.familyExtension = extension;
        }),
      ),
    ).toThrow(/slashingConditions is required/);
  });
});
