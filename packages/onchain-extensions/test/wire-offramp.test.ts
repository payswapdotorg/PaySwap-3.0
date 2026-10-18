import { describe, expect, it } from 'vitest';
import { validateOffRampPackExtension, validateOnchainExtensionPack } from '../src/index.ts';
import { fixtureOffRampPack, variant } from './fixtures.ts';

/** NET-NEW: the off-ramp family wire surface (onchain-to-fiat handoff). */
describe('the off-ramp family surface', () => {
  it('a well-formed off-ramp extension validates', () => {
    const errors: string[] = [];
    validateOffRampPackExtension(
      {
        family: 'off-ramp',
        payoutHandoffModel: 'DIRECT_TRANSFER',
        supportedPayoutMethods: ['SEPA', 'WIRE'],
        supportedJurisdictions: ['US', 'DE'],
        kycRequirement: 'REQUIRED',
        quoteValidityModel: 'EXPIRING_QUOTE',
        settlementRailHandoff: 'fiat-rail:fixture',
      },
      errors,
    );
    expect(errors).toEqual([]);
  });

  it('every payout handoff model is accepted', () => {
    for (const payoutHandoffModel of [
      'DIRECT_TRANSFER',
      'CUSTODIAL_SETTLEMENT',
      'HYBRID',
    ] as const) {
      const errors: string[] = [];
      validateOffRampPackExtension({ family: 'off-ramp', payoutHandoffModel }, errors);
      expect(errors.join('; ')).not.toMatch(/payoutHandoffModel/);
    }
  });

  it('an unknown payout handoff model is rejected (closed vocabulary)', () => {
    const errors: string[] = [];
    validateOffRampPackExtension(
      { family: 'off-ramp', payoutHandoffModel: 'GIFT_CARD' },
      errors,
    );
    expect(errors.join('; ')).toMatch(/payoutHandoffModel/);
  });

  it('jurisdictions are ISO-3166-1 alpha-2 codes (lowercase and 3-letter forms rejected)', () => {
    const lowercase: string[] = [];
    validateOffRampPackExtension(
      { family: 'off-ramp', supportedJurisdictions: ['us'] },
      lowercase,
    );
    expect(lowercase.join('; ')).toMatch(/supportedJurisdictions\[0\]/);
    const threeLetter: string[] = [];
    validateOffRampPackExtension(
      { family: 'off-ramp', supportedJurisdictions: ['USA'] },
      threeLetter,
    );
    expect(threeLetter.join('; ')).toMatch(/supportedJurisdictions\[0\]/);
  });

  it('an empty jurisdiction list is rejected', () => {
    const errors: string[] = [];
    validateOffRampPackExtension({ family: 'off-ramp', supportedJurisdictions: [] }, errors);
    expect(errors.join('; ')).toMatch(/supportedJurisdictions/);
  });

  it('an empty payout method list is rejected', () => {
    const errors: string[] = [];
    validateOffRampPackExtension({ family: 'off-ramp', supportedPayoutMethods: [] }, errors);
    expect(errors.join('; ')).toMatch(/supportedPayoutMethods/);
  });

  it('the settlement rail handoff is required (the declared fiat rail reference)', () => {
    const errors: string[] = [];
    validateOffRampPackExtension({ family: 'off-ramp', settlementRailHandoff: '' }, errors);
    expect(errors.join('; ')).toMatch(/settlementRailHandoff/);
  });

  it('kyc requirement and quote validity are closed vocabularies', () => {
    const errors: string[] = [];
    validateOffRampPackExtension(
      { family: 'off-ramp', kycRequirement: 'OPTIONAL', quoteValidityModel: 'ETERNAL' },
      errors,
    );
    const joined = errors.join('; ');
    expect(joined).toMatch(/kycRequirement/);
    expect(joined).toMatch(/quoteValidityModel/);
  });

  it('the full-pack validator dispatches to the off-ramp surface (fail closed end to end)', () => {
    const pack = fixtureOffRampPack();
    expect(() => validateOnchainExtensionPack(pack)).not.toThrow();
    expect(() =>
      validateOnchainExtensionPack(
        variant(pack, (draft) => {
          draft.familyExtension = {
            ...(draft.familyExtension as { family: 'off-ramp' }),
            supportedJurisdictions: ['usa'],
          };
        }),
      ),
    ).toThrow(/supportedJurisdictions\[0\]/);
  });
});
