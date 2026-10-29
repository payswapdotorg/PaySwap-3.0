import { describe, expect, it } from "vitest";
import {
  SecretShapeError,
  assertNoSecretMaterial,
  isMnemonicShape,
  isRawKeyShape,
  isStellarSecretKeyShape,
  scanForSecretMaterial,
} from "../src/secrets.ts";

/**
 * P22-A (ADR-0016 D9/D10): the Stellar StrKey SECRET shape law. A Stellar
 * secret key (`S…` — 56 base32 characters, exactly /^S[A-Z2-7]{55}$/) is
 * SECRET MATERIAL: wherever one appears in an agent-facing artifact outside
 * a derived-identifier field, the boundary scan rejects it (INV-19). The
 * `G…` account and `C…` contract shapes are PUBLIC identifiers — never
 * violations. Secret fixtures are ASSEMBLED AT RUNTIME from fragments (the
 * secrets-module law: no realistic secret literal ever appears in source).
 */

const stellarSecretFixture = (): string => `S${"Q".repeat(55)}`;
const stellarAccountFixture = (): string => `G${"A".repeat(55)}`;
const stellarContractFixture = (): string => `C${"B".repeat(55)}`;

describe("the Stellar secret-key shape detector (ADR-0016 D9 — ^S[A-Z2-7]{55}$)", () => {
  it("canonical S… shapes are detected", () => {
    expect(isStellarSecretKeyShape(stellarSecretFixture())).toBe(true);
    expect(isStellarSecretKeyShape(`S${"A2Z7".repeat(13)}${"A".repeat(3)}`)).toBe(true);
  });

  it("public Stellar shapes are NOT secret material (G accounts, C contracts)", () => {
    expect(isStellarSecretKeyShape(stellarAccountFixture())).toBe(false);
    expect(isStellarSecretKeyShape(stellarContractFixture())).toBe(false);
  });

  it("malformed shapes are not detected: wrong version byte, wrong length, lowercase, non-base32 digits", () => {
    expect(isStellarSecretKeyShape(`G${"A".repeat(55)}`)).toBe(false);
    expect(isStellarSecretKeyShape(`C${"A".repeat(55)}`)).toBe(false);
    expect(isStellarSecretKeyShape(`S${"A".repeat(54)}`)).toBe(false);
    expect(isStellarSecretKeyShape(`S${"A".repeat(56)}`)).toBe(false);
    expect(isStellarSecretKeyShape(`S${"a".repeat(55)}`)).toBe(false);
    expect(isStellarSecretKeyShape(`S${"0".repeat(55)}`)).toBe(false);
    expect(isStellarSecretKeyShape(`S${"9".repeat(55)}`)).toBe(false);
    expect(isStellarSecretKeyShape("")).toBe(false);
    expect(isStellarSecretKeyShape(undefined)).toBe(false);
    expect(isStellarSecretKeyShape(56)).toBe(false);
  });

  it("the pre-existing detectors are unchanged (raw 32-byte hex, BIP-39 mnemonic)", () => {
    expect(isRawKeyShape("a".repeat(64))).toBe(true);
    expect(isMnemonicShape("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about")).toBe(true);
    // A Stellar secret shape is NOT misreported by the older detectors.
    expect(isRawKeyShape(stellarSecretFixture())).toBe(false);
    expect(isMnemonicShape(stellarSecretFixture())).toBe(false);
  });
});

describe("the boundary scan rejects Stellar secrets smuggled into neutral fields (INV-19 / ADR-0016 D9)", () => {
  it("an S… value under a non-derived field is a secret_shaped_value violation", () => {
    const violations = scanForSecretMaterial({ note: stellarSecretFixture() });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.kind).toBe("secret_shaped_value");
    expect(violations[0]?.path).toBe("$.note");
    expect(violations[0]?.reason).toMatch(/stellar/i);
  });

  it("assertNoSecretMaterial THROWS on a Stellar secret (the typed boundary error)", () => {
    expect(() =>
      assertNoSecretMaterial(
        { label: "stellar deployment plan", memo: stellarSecretFixture() },
        "deployment artifact",
      ),
    ).toThrow(SecretShapeError);
  });

  it("G… accounts and C… contracts under neutral fields are NOT violations (public identifiers)", () => {
    expect(
      scanForSecretMaterial({
        issuerAccount: stellarAccountFixture(),
        contractId: stellarContractFixture(),
        destination: stellarAccountFixture(),
      }),
    ).toEqual([]);
  });

  it("derived-identifier fields stay exempt (a hash-named field is not scanned by value)", () => {
    // The exemption is BY KEY NAME for expected hash shapes; an S… under a
    // non-derived key is still rejected, and a hash field is never a
    // violation even though it carries opaque text.
    expect(scanForSecretMaterial({ txHash: "opaque-hex-text" })).toEqual([]);
    expect(scanForSecretMaterial({ signingPayloadNote: stellarSecretFixture() }).length).toBe(1);
  });

  it("the scan stays deep and deterministic (nested smuggle)", () => {
    const nested = {
      envelope: {
        legs: [{ kind: "deploy", artifactRef: { note: stellarSecretFixture() } }],
      },
    };
    expect(scanForSecretMaterial(nested).map((v) => v.path)).toEqual([
      "$.envelope.legs[0].artifactRef.note",
    ]);
  });
});
