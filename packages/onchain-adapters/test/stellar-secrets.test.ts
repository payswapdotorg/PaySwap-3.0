import { describe, expect, it } from 'vitest';
import {
  SecretShapeError,
  assertNoSecretMaterial,
  isMnemonicShape,
  isRawKeyShape,
  isStellarSecretKeyShape,
} from '../src/secrets.ts';

/**
 * P22-A (ADR-0016 D9/D10): the Stellar StrKey SECRET shape law at the
 * ADAPTER boundary (rule 25 — no secrets in agent-facing contracts). A
 * Stellar secret key (`S…` — 56 base32 characters, exactly
 * /^S[A-Z2-7]{55}$/) is SECRET MATERIAL wherever it appears outside a
 * derived-identifier field: every adapter output is secret-scanned and a
 * smuggled key THROWS. The `G…` account and `C…` contract shapes are PUBLIC
 * identifiers — never violations. Secret fixtures are ASSEMBLED AT RUNTIME
 * from fragments (the secrets-module law).
 */

const stellarSecretFixture = (): string => `S${'Q'.repeat(55)}`;
const stellarAccountFixture = (): string => `G${'A'.repeat(55)}`;
const stellarContractFixture = (): string => `C${'B'.repeat(55)}`;

describe('the adapter-side Stellar secret-key shape detector (ADR-0016 D9)', () => {
  it('canonical S… shapes are detected', () => {
    expect(isStellarSecretKeyShape(stellarSecretFixture())).toBe(true);
    expect(isStellarSecretKeyShape(`S${'Z2'.repeat(27)}A`)).toBe(true);
  });

  it('public Stellar shapes are NOT secret material (G accounts, C contracts)', () => {
    expect(isStellarSecretKeyShape(stellarAccountFixture())).toBe(false);
    expect(isStellarSecretKeyShape(stellarContractFixture())).toBe(false);
  });

  it('malformed shapes are not detected (wrong byte, wrong length, lowercase, non-base32)', () => {
    expect(isStellarSecretKeyShape(`G${'A'.repeat(55)}`)).toBe(false);
    expect(isStellarSecretKeyShape(`C${'A'.repeat(55)}`)).toBe(false);
    expect(isStellarSecretKeyShape(`S${'A'.repeat(54)}`)).toBe(false);
    expect(isStellarSecretKeyShape(`S${'A'.repeat(56)}`)).toBe(false);
    expect(isStellarSecretKeyShape(`S${'a'.repeat(55)}`)).toBe(false);
    expect(isStellarSecretKeyShape(`S${'0'.repeat(55)}`)).toBe(false);
    expect(isStellarSecretKeyShape(`S${'9'.repeat(55)}`)).toBe(false);
    expect(isStellarSecretKeyShape('')).toBe(false);
  });

  it('the pre-existing detectors are unchanged (raw 32-byte hex, BIP-39 mnemonic)', () => {
    expect(isRawKeyShape('a'.repeat(64))).toBe(true);
    expect(
      isMnemonicShape(
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      ),
    ).toBe(true);
    // A Stellar secret shape is NOT misreported by the older detectors.
    expect(isRawKeyShape(stellarSecretFixture())).toBe(false);
    expect(isMnemonicShape(stellarSecretFixture())).toBe(false);
  });
});

describe('the adapter boundary scan rejects smuggled Stellar secrets (rule 25)', () => {
  it('assertNoSecretMaterial THROWS on an S… value in a neutral field (the typed boundary error)', () => {
    expect(() =>
      assertNoSecretMaterial(
        { signingPayloadNote: stellarSecretFixture() },
        'stellar signing envelope',
      ),
    ).toThrow(SecretShapeError);
  });

  it('G… accounts and C… contracts under neutral fields are NOT violations (public identifiers)', () => {
    expect(() =>
      assertNoSecretMaterial(
        {
          issuerAccount: stellarAccountFixture(),
          contractId: stellarContractFixture(),
          destination: stellarAccountFixture(),
          deployer: stellarAccountFixture(),
        },
        'stellar deployment record',
      ),
    ).not.toThrow();
  });

  it('the scan stays deep and deterministic (a nested smuggle is caught)', () => {
    const nested = {
      plan: {
        legs: [{ kind: 'deploy', artifactRef: { note: stellarSecretFixture() } }],
      },
    };
    expect(() => assertNoSecretMaterial(nested, 'stellar plan')).toThrow(/Stellar secret/);
  });
});
