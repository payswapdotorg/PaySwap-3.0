import { describe, expect, it } from 'vitest';
import { validateDexPackExtension, validateOnchainExtensionPack } from '../src/index.ts';
import { CHAIN, fixtureDexPack, variant } from './fixtures.ts';

/** NET-NEW: the DEX family wire surface (ADAPT of the old DexCapability flavor). */
describe('the DEX family surface', () => {
  it('a well-formed DEX extension validates (isolated family validator)', () => {
    const errors: string[] = [];
    validateDexPackExtension(
      {
        family: 'dex',
        dexKind: 'AMM',
        supportedSwapKinds: ['EXACT_INPUT'],
        supportedChains: [CHAIN],
        quoteSemantics: 'EXECUTABLE',
        slippageProtection: 'DECLARED_LIMIT',
        feeModel: 'EMBEDDED_POOL_FEE',
        supportsSimulation: true,
      },
      errors,
    );
    expect(errors).toEqual([]);
  });

  it('every dex kind is accepted', () => {
    for (const dexKind of ['AMM', 'ORDER_BOOK', 'RFQ', 'AGGREGATOR'] as const) {
      const errors: string[] = [];
      validateDexPackExtension(
        {
          family: 'dex',
          dexKind,
          supportedSwapKinds: ['EXACT_INPUT'],
          supportedChains: [CHAIN],
          quoteSemantics: 'INDICATIVE',
          slippageProtection: 'PROVIDER_DEFINED',
          feeModel: 'PROVIDER_SCHEDULE',
          supportsSimulation: false,
          ...(dexKind === 'AGGREGATOR' ? { aggregatorSources: ['RFQ_MAKER'] } : {}),
        },
        errors,
      );
      expect(errors).toEqual([]);
    }
  });

  it('an unknown dex kind is rejected (closed vocabulary)', () => {
    const errors: string[] = [];
    validateDexPackExtension({ family: 'dex', dexKind: 'STABLESWAP' }, errors);
    expect(errors.join('; ')).toMatch(/dexKind/);
  });

  it('empty swap kinds are rejected', () => {
    const errors: string[] = [];
    validateDexPackExtension({ family: 'dex', supportedSwapKinds: [] }, errors);
    expect(errors.join('; ')).toMatch(/supportedSwapKinds/);
  });

  it('an unknown swap kind is rejected', () => {
    const errors: string[] = [];
    validateDexPackExtension(
      { family: 'dex', supportedSwapKinds: ['EXACT_INPUT', 'ATOMIC'] },
      errors,
    );
    expect(errors.join('; ')).toMatch(/supportedSwapKinds\[1\]/);
  });

  it('non-canonical supported chains are rejected', () => {
    const errors: string[] = [];
    validateDexPackExtension(
      { family: 'dex', supportedChains: ['Ethereum Mainnet'] },
      errors,
    );
    expect(errors.join('; ')).toMatch(/supportedChains\[0\]/);
  });

  it('quote semantics and slippage protection are closed vocabularies', () => {
    const quoteErrors: string[] = [];
    validateDexPackExtension({ family: 'dex', quoteSemantics: 'BINDING' }, quoteErrors);
    expect(quoteErrors.join('; ')).toMatch(/quoteSemantics/);
    const slippageErrors: string[] = [];
    validateDexPackExtension(
      { family: 'dex', slippageProtection: 'AUTO' },
      slippageErrors,
    );
    expect(slippageErrors.join('; ')).toMatch(/slippageProtection/);
  });

  it('the fee model is a closed vocabulary', () => {
    const errors: string[] = [];
    validateDexPackExtension({ family: 'dex', feeModel: 'ZERO_FEE' }, errors);
    expect(errors.join('; ')).toMatch(/feeModel/);
  });

  it('supportsSimulation must be a boolean', () => {
    const errors: string[] = [];
    validateDexPackExtension({ family: 'dex', supportsSimulation: 'yes' }, errors);
    expect(errors.join('; ')).toMatch(/supportsSimulation/);
  });

  it('the full-pack validator dispatches to the DEX surface (fail closed end to end)', () => {
    const pack = fixtureDexPack();
    expect(() => validateOnchainExtensionPack(pack)).not.toThrow();
    expect(() =>
      validateOnchainExtensionPack(
        variant(pack, (draft) => {
          draft.familyExtension = {
            ...(draft.familyExtension as { family: 'dex' }),
            dexKind: 'CURVE',
          };
        }),
      ),
    ).toThrow(/dexKind/);
  });
});
