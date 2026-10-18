import { describe, expect, it } from 'vitest';
import { validateBridgePackExtension, validateOnchainExtensionPack } from '../src/index.ts';
import { CHAIN, OTHER_CHAIN, fixtureBridgePack, variant } from './fixtures.ts';

/** NET-NEW: the bridge family wire surface (cross-chain corridor model). */
describe('the bridge family surface', () => {
  it('a well-formed bridge extension validates', () => {
    const errors: string[] = [];
    validateBridgePackExtension(
      {
        family: 'bridge',
        bridgeModel: 'LOCK_AND_MINT',
        supportedCorridors: [
          { sourceChain: CHAIN, destinationChain: OTHER_CHAIN, direction: 'TWO_WAY' },
        ],
        destinationFinalityRequirement: 'SOURCE_FINALITY',
        reorgHandling: 'WAIT_FOR_FINALITY',
        messageVerification: 'LIGHT_CLIENT',
        refundModel: 'REFUNDABLE_PRE_CONFIRMATION',
      },
      errors,
    );
    expect(errors).toEqual([]);
  });

  it('every bridge model is accepted', () => {
    for (const bridgeModel of [
      'LOCK_AND_MINT',
      'BURN_AND_MINT',
      'LIQUIDITY_POOL',
      'MESSAGE_PASSING',
    ] as const) {
      const errors: string[] = [];
      validateBridgePackExtension({ family: 'bridge', bridgeModel }, errors);
      expect(errors.join('; ')).not.toMatch(/bridgeModel/);
    }
  });

  it('an unknown bridge model is rejected (closed vocabulary)', () => {
    const errors: string[] = [];
    validateBridgePackExtension({ family: 'bridge', bridgeModel: 'WORMHOLE_STYLE' }, errors);
    expect(errors.join('; ')).toMatch(/bridgeModel/);
  });

  it('a corridor whose source equals its destination is rejected (a corridor spans two chains)', () => {
    const errors: string[] = [];
    validateBridgePackExtension(
      {
        family: 'bridge',
        supportedCorridors: [{ sourceChain: CHAIN, destinationChain: CHAIN, direction: 'TWO_WAY' }],
      },
      errors,
    );
    expect(errors.join('; ')).toMatch(/source and destination must differ/);
  });

  it('non-canonical corridor chain keys are rejected', () => {
    const errors: string[] = [];
    validateBridgePackExtension(
      {
        family: 'bridge',
        supportedCorridors: [
          { sourceChain: 'mainnet', destinationChain: OTHER_CHAIN, direction: 'ONE_WAY' },
        ],
      },
      errors,
    );
    expect(errors.join('; ')).toMatch(/sourceChain must be a canonical/);
  });

  it('an empty corridor list is rejected (a bridge declares at least one corridor)', () => {
    const errors: string[] = [];
    validateBridgePackExtension({ family: 'bridge', supportedCorridors: [] }, errors);
    expect(errors.join('; ')).toMatch(/supportedCorridors/);
  });

  it('the corridor direction is a closed vocabulary', () => {
    const errors: string[] = [];
    validateBridgePackExtension(
      {
        family: 'bridge',
        supportedCorridors: [
          { sourceChain: CHAIN, destinationChain: OTHER_CHAIN, direction: 'ANY' },
        ],
      },
      errors,
    );
    expect(errors.join('; ')).toMatch(/direction/);
  });

  it('finality, reorg, verification and refund models are closed vocabularies', () => {
    const errors: string[] = [];
    validateBridgePackExtension(
      {
        family: 'bridge',
        destinationFinalityRequirement: 'INSTANT',
        reorgHandling: 'IGNORED',
        messageVerification: 'TELEPHONE',
        refundModel: 'NEVER',
      },
      errors,
    );
    const joined = errors.join('; ');
    expect(joined).toMatch(/destinationFinalityRequirement/);
    expect(joined).toMatch(/reorgHandling/);
    expect(joined).toMatch(/messageVerification/);
    expect(joined).toMatch(/refundModel/);
  });

  it('the full-pack validator dispatches to the bridge surface (fail closed end to end)', () => {
    const pack = fixtureBridgePack();
    expect(() => validateOnchainExtensionPack(pack)).not.toThrow();
    expect(() =>
      validateOnchainExtensionPack(
        variant(pack, (draft) => {
          draft.familyExtension = {
            ...(draft.familyExtension as { family: 'bridge' }),
            supportedCorridors: [],
          };
        }),
      ),
    ).toThrow(/supportedCorridors/);
  });
});
