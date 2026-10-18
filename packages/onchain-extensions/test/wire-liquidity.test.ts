import { describe, expect, it } from 'vitest';
import { validateLiquidityPackExtension, validateOnchainExtensionPack } from '../src/index.ts';
import { fixtureLiquidityPack, variant } from './fixtures.ts';

/** NET-NEW: the liquidity family wire surface (provision positions). */
describe('the liquidity family surface', () => {
  it('a well-formed liquidity extension validates', () => {
    const errors: string[] = [];
    validateLiquidityPackExtension(
      {
        family: 'liquidity',
        liquidityModel: 'CONCENTRATED_LIQUIDITY',
        positionShapes: ['RANGE_POSITION'],
        feeTiersBasisPoints: [5, 30],
        impermanentLossDisclosure: 'DISCLOSED',
        lockupModel: 'NO_LOCKUP',
      },
      errors,
    );
    expect(errors).toEqual([]);
  });

  it('every liquidity model is accepted', () => {
    for (const liquidityModel of [
      'CONSTANT_PRODUCT_AMM',
      'CONCENTRATED_LIQUIDITY',
      'ORDER_BOOK',
      'PEER_POOL',
    ] as const) {
      const errors: string[] = [];
      validateLiquidityPackExtension({ family: 'liquidity', liquidityModel }, errors);
      expect(errors.join('; ')).not.toMatch(/liquidityModel/);
    }
  });

  it('an unknown liquidity model is rejected (closed vocabulary)', () => {
    const errors: string[] = [];
    validateLiquidityPackExtension({ family: 'liquidity', liquidityModel: 'YIELD_BOX' }, errors);
    expect(errors.join('; ')).toMatch(/liquidityModel/);
  });

  it('fee tiers are integers in [0, 10000] (negative, oversized and fractional rejected)', () => {
    const negative: string[] = [];
    validateLiquidityPackExtension({ family: 'liquidity', feeTiersBasisPoints: [-1] }, negative);
    expect(negative.join('; ')).toMatch(/feeTiersBasisPoints\[0\]/);
    const oversized: string[] = [];
    validateLiquidityPackExtension(
      { family: 'liquidity', feeTiersBasisPoints: [10_001] },
      oversized,
    );
    expect(oversized.join('; ')).toMatch(/feeTiersBasisPoints\[0\]/);
    const fractional: string[] = [];
    validateLiquidityPackExtension(
      { family: 'liquidity', feeTiersBasisPoints: [30.5] },
      fractional,
    );
    expect(fractional.join('; ')).toMatch(/feeTiersBasisPoints\[0\]/);
  });

  it('duplicate fee tiers are rejected', () => {
    const errors: string[] = [];
    validateLiquidityPackExtension(
      { family: 'liquidity', feeTiersBasisPoints: [30, 30] },
      errors,
    );
    expect(errors.join('; ')).toMatch(/must not contain duplicates/);
  });

  it('an empty fee tier list is rejected', () => {
    const errors: string[] = [];
    validateLiquidityPackExtension({ family: 'liquidity', feeTiersBasisPoints: [] }, errors);
    expect(errors.join('; ')).toMatch(/feeTiersBasisPoints/);
  });

  it('an empty position shape list is rejected', () => {
    const errors: string[] = [];
    validateLiquidityPackExtension({ family: 'liquidity', positionShapes: [] }, errors);
    expect(errors.join('; ')).toMatch(/positionShapes/);
  });

  it('WITHDRAWAL_DELAY lockups REQUIRE a delay description; other lockups FORBID it', () => {
    const missing: string[] = [];
    validateLiquidityPackExtension({ family: 'liquidity', lockupModel: 'WITHDRAWAL_DELAY' }, missing);
    expect(missing.join('; ')).toMatch(
      /withdrawalDelayDescription is required when lockupModel is WITHDRAWAL_DELAY/,
    );
    const forbidden: string[] = [];
    validateLiquidityPackExtension(
      {
        family: 'liquidity',
        lockupModel: 'NO_LOCKUP',
        withdrawalDelayDescription: 'not applicable',
      },
      forbidden,
    );
    expect(forbidden.join('; ')).toMatch(/only declarable when lockupModel is WITHDRAWAL_DELAY/);
  });

  it('impermanent-loss disclosure is a closed vocabulary', () => {
    const errors: string[] = [];
    validateLiquidityPackExtension(
      { family: 'liquidity', impermanentLossDisclosure: 'HIDDEN' },
      errors,
    );
    expect(errors.join('; ')).toMatch(/impermanentLossDisclosure/);
  });

  it('the full-pack validator dispatches to the liquidity surface (fail closed end to end)', () => {
    const pack = fixtureLiquidityPack();
    expect(() => validateOnchainExtensionPack(pack)).not.toThrow();
    expect(() =>
      validateOnchainExtensionPack(
        variant(pack, (draft) => {
          draft.familyExtension = {
            ...(draft.familyExtension as { family: 'liquidity' }),
            feeTiersBasisPoints: [30, 30, 100],
          };
        }),
      ),
    ).toThrow(/must not contain duplicates/);
  });
});
