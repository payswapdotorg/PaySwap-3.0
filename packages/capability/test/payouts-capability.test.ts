/**
 * @payswap/capability — the P27-B Global-Payouts capability battery (hermetic).
 *
 * WHAT THIS BATTERY ENFORCES:
 * - the D10 dated-evidence contract (every observation carries a strict ISO
 *   retrieval date + an https source URL + a non-empty finding; malformed
 *   observations fail-closed);
 * - the P27-B live-doc re-verification record is complete and dated 2026-11-03;
 * - the rail capability definition validates under the fabric's fail-closed
 *   law and is NON-EXECUTABLE with an explicit reason (INV-13: catalogue
 *   capability is not executable connected capability);
 * - the never-alias surfaces are carried as data (ADR-0020 D4);
 * - the dated corridor restriction sets validate and NARROW the
 *   definition-level set (the restriction-narrowing law), with the dated
 *   recipient markets (107, Ghana absent) and the dated minor-unit bounds;
 * - the Ghana corridor is an honest conditional opportunity (K1), never a
 *   market in any set.
 */

import { describe, expect, it } from 'vitest';
import {
  STRIPE_GLOBAL_PAYOUTS_CORRIDOR_DEFINITION_LEVEL,
  STRIPE_GLOBAL_PAYOUTS_CORRIDOR_IMPLEMENTATION_SETS,
  STRIPE_GLOBAL_PAYOUTS_DATED_RECIPIENT_MARKETS,
  STRIPE_GLOBAL_PAYOUTS_GHANA_CORRIDOR_CONDITIONAL_OPPORTUNITY,
  STRIPE_GLOBAL_PAYOUTS_LIVE_DOC_EVIDENCE,
  STRIPE_GLOBAL_PAYOUTS_NEVER_ALIAS_SURFACES,
  defineStripeGlobalPayoutsRailCapability,
  validateDatedEvidenceObservation,
} from '../src/payouts-capability.ts';
import { validateCapabilityDefinition } from '../src/definition-validation.ts';
import { restrictionWideningViolations } from '../src/restrictions.ts';
import { ValidationError } from '../src/errors.ts';

describe('the D10 dated-evidence contract (fail-closed)', () => {
  it('accepts a well-formed observation', () => {
    const observation = validateDatedEvidenceObservation({
      retrievedAt: '2026-11-03',
      sourceUrl: 'https://docs.stripe.com/global-payouts',
      finding: 'GA origins GB + US',
    });
    expect(observation.retrievedAt).toBe('2026-11-03');
  });

  it('rejects a malformed date, a non-https URL and an empty finding', () => {
    expect(() =>
      validateDatedEvidenceObservation({ retrievedAt: '2026-11-3', sourceUrl: 'https://x.example', finding: 'f' }),
    ).toThrow(ValidationError);
    expect(() =>
      validateDatedEvidenceObservation({ retrievedAt: '2026-11-03', sourceUrl: 'http://insecure.example', finding: 'f' }),
    ).toThrow(ValidationError);
    expect(() =>
      validateDatedEvidenceObservation({ retrievedAt: '2026-11-03', sourceUrl: 'https://x.example', finding: '   ' }),
    ).toThrow(ValidationError);
    expect(() => validateDatedEvidenceObservation(null)).toThrow(ValidationError);
  });

  it('the P27-B re-verification record is complete, all rows dated 2026-11-03', () => {
    expect(STRIPE_GLOBAL_PAYOUTS_LIVE_DOC_EVIDENCE.length).toBeGreaterThanOrEqual(9);
    for (const observation of STRIPE_GLOBAL_PAYOUTS_LIVE_DOC_EVIDENCE) {
      expect(observation.retrievedAt).toBe('2026-11-03');
      expect(observation.sourceUrl).toMatch(/^https:\/\//);
      expect(observation.finding.length).toBeGreaterThan(0);
      expect(Object.isFrozen(observation)).toBe(true);
    }
  });

  it('the record carries the GA/preview origin fact, the K1 Ghana law and the V5 P2P context', () => {
    const origins = STRIPE_GLOBAL_PAYOUTS_LIVE_DOC_EVIDENCE.find((o) => o.sourceUrl === 'https://docs.stripe.com/global-payouts');
    expect(origins?.finding).toContain('United Kingdom, United States');
    expect(origins?.finding).toContain('Slovenia, Spain');
    const ghana = STRIPE_GLOBAL_PAYOUTS_GHANA_CORRIDOR_CONDITIONAL_OPPORTUNITY;
    expect(ghana.finding).toContain('H2 27');
    expect(ghana.finding).toContain('never an available route');
    const p2p = STRIPE_GLOBAL_PAYOUTS_LIVE_DOC_EVIDENCE.find((o) => o.sourceUrl === 'https://stripe.com/payouts');
    expect(p2p?.finding).toContain('peer-to-peer');
  });
});

describe('the Global-Payouts rail capability definition (INV-13 fail-closed)', () => {
  const definition = defineStripeGlobalPayoutsRailCapability();

  it('is a validated, deep-frozen, NON-EXECUTABLE rail_movement definition', () => {
    expect(() => validateCapabilityDefinition(definition)).not.toThrow();
    expect(definition.capabilityClass).toBe('rail_movement');
    expect(definition.executable).toBe(false);
    expect((definition as { nonExecutableReason: string }).nonExecutableReason).toContain('INV-13');
    expect(Object.isFrozen(definition)).toBe(true);
  });

  it('carries the Treasury prerequisite, the origin law, INV-30 and the never-alias law as hard conditions', () => {
    const conditions = definition.conditions.map((c) => c.description).join(' | ');
    expect(conditions).toContain('Global Payouts requires Treasury');
    expect(conditions).toContain('United Kingdom or United States');
    expect(conditions).toContain('INV-30');
    expect(conditions).toContain('never serve a Global-Payouts journey');
    expect(definition.conditions.every((c) => c.hardConstraint)).toBe(true);
    // the P5 proof requirement for the money movement and the P2P class
    const scopes = definition.proofRequirements.map((p) => p.scope ?? '').join(' | ');
    expect(scopes).toContain('third-party outbound payment');
    expect(scopes).toContain('regulated remittance/P2P');
  });

  it('the never-alias surfaces are carried as data (ADR-0020 D4)', () => {
    expect(STRIPE_GLOBAL_PAYOUTS_NEVER_ALIAS_SURFACES.ordinaryPayouts).toContain('PostPayouts');
    expect(STRIPE_GLOBAL_PAYOUTS_NEVER_ALIAS_SURFACES.connectTransfers).toContain('PostTransfers');
    expect(STRIPE_GLOBAL_PAYOUTS_NEVER_ALIAS_SURFACES.commercePayments).toContain('PostPaymentIntents');
    expect(STRIPE_GLOBAL_PAYOUTS_NEVER_ALIAS_SURFACES.law).toContain('ADR-0020 D4');
  });
});

describe('the dated payout corridors (the restriction-set + narrowing laws)', () => {
  it('the definition-level set declares the GA origins and the dated method vocabulary', () => {
    const set = STRIPE_GLOBAL_PAYOUTS_CORRIDOR_DEFINITION_LEVEL;
    expect(set.sourceCountries).toEqual(['GB', 'US']);
    expect(set.destinationCountries).toHaveLength(107);
    expect(set.payoutMethods).toContain('bank_accounts.swift');
    expect(set.payoutMethods).toContain('crypto_wallets');
    expect(set.version).toBe('2026-11-03');
    expect(set.terms?.deliveryEstimateLabel).toBe('INDICATIVE');
  });

  it('every implementation set NARROWS the definition-level set (no widening)', () => {
    expect(STRIPE_GLOBAL_PAYOUTS_CORRIDOR_IMPLEMENTATION_SETS).toHaveLength(7);
    for (const child of STRIPE_GLOBAL_PAYOUTS_CORRIDOR_IMPLEMENTATION_SETS) {
      const violations = restrictionWideningViolations(child, STRIPE_GLOBAL_PAYOUTS_CORRIDOR_DEFINITION_LEVEL);
      expect(violations, `${child.restrictionSetId}: ${violations.join('; ')}`).toEqual([]);
    }
  });

  it('the dated minor-unit bounds ride the per-method sets (verbatim from the 2026-11-03 table)', () => {
    const byId = new Map(STRIPE_GLOBAL_PAYOUTS_CORRIDOR_IMPLEMENTATION_SETS.map((s) => [s.restrictionSetId, s]));
    // The US USD Wire maximum is the live table's own minor-unit parenthetical:
    // 10,000,000 USD = 1,000,000,000 minor units (the 2026-11-03 re-verification
    // diff caught an earlier 10x misread of this cell — the dated page wins).
    expect(byId.get('stripe.global-payouts.corridor.us.usd.wire')?.amountLimits?.max?.minorUnits).toBe('1000000000');
    expect(byId.get('stripe.global-payouts.corridor.us.usd.standard')?.amountLimits?.max?.minorUnits).toBe('100000000');
    expect(byId.get('stripe.global-payouts.corridor.us.usd.instant-cards')?.amountLimits?.max?.minorUnits).toBe('999900');
    expect(byId.get('stripe.global-payouts.corridor.uk.gbp.standard')?.amountLimits?.max?.minorUnits).toBe('100000000');
    expect(byId.get('stripe.global-payouts.corridor.us.usd.wire')?.sourceCountries).toEqual(['US']);
    expect(byId.get('stripe.global-payouts.corridor.uk.eur.standard')?.currencies).toEqual(['EUR']);
  });

  it('the dated recipient markets exclude Ghana and Nigeria (the honest exclusions)', () => {
    expect(STRIPE_GLOBAL_PAYOUTS_DATED_RECIPIENT_MARKETS).not.toContain('GH');
    expect(STRIPE_GLOBAL_PAYOUTS_DATED_RECIPIENT_MARKETS).not.toContain('NG');
    expect(STRIPE_GLOBAL_PAYOUTS_DATED_RECIPIENT_MARKETS).toContain('KE');
    expect(STRIPE_GLOBAL_PAYOUTS_DATED_RECIPIENT_MARKETS).toContain('ZA');
    expect(STRIPE_GLOBAL_PAYOUTS_DATED_RECIPIENT_MARKETS).toContain('GB');
  });
});
