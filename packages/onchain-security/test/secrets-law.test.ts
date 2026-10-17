import { describe, expect, expectTypeOf, it } from "vitest";
import {
  assertNoSecretMaterial,
  isOpaqueCredentialRef,
  isRawKeyShape,
  opaqueCredentialRef,
  redactSecretShapedValues,
  scanForSecretMaterial,
  SecretShapeError,
} from "../src/index.ts";
import type { OpaqueCredentialRef, SecretFree } from "../src/index.ts";

/**
 * The secrets NON-CUSTODY law (R2-W2 net-new; NON-CUSTODY.md + INV-19):
 * secrets handling in this package is SHAPES + POLICY ONLY — redaction
 * and opaque vault references — NEVER key material custody. No API in
 * the secrets surface accepts, stores, wraps, encrypts or returns key
 * material; the scan makes a secret-bearing artifact UNCONSTRUCTIBLE.
 *
 * Every fixture in this file is assembled at RUNTIME from fragments (no
 * realistic secret literal ever appears in source).
 */

/** Runtime-assembled raw-key-shaped fixture (64 hex chars, no literal). */
function rawKeyFixture(): string {
  return ["0x", "a1", "b2", "c3", "d4", "e5", "f6", "17"].concat(
    Array.from({ length: 26 }, (_, i) => (i % 16).toString(16).repeat(2)),
  ).join("").slice(0, 66);
}

/** Runtime-assembled mnemonic-shaped fixture (12 lowercase words). */
function mnemonicFixture(): string {
  const words = ["abandon", "ability", "able", "about", "above", "absent", "absorb", "abstract", "absurd", "abuse", "access", "accident"];
  return words.join(" ");
}

describe("the non-custody law: no custody API exists on the secrets surface", () => {
  it("no API accepts or returns key material — the module surface is scan + policy only", async () => {
    const moduleSource = await import("../src/secrets.ts");
    const exportedNames = Object.keys(moduleSource).sort();
    // The custody-bearing verbs a key-holding API would need. NONE of
    // them may appear on the surface (NON-CUSTODY: shapes + policy only).
    const forbiddenVerbs = [
      "encrypt",
      "decrypt",
      "importKey",
      "exportKey",
      "generateKey",
      "deriveKey",
      "signTransaction",
      "storeKey",
      "wrapKey",
    ];
    for (const verb of forbiddenVerbs) {
      expect(exportedNames.some((name) => name.toLowerCase().includes(verb.toLowerCase()))).toBe(false);
    }
    // And the lawful surface is present:
    for (const lawful of ["assertNoSecretMaterial", "scanForSecretMaterial", "SecretShapeError"]) {
      expect(exportedNames).toContain(lawful);
    }
  });

  it("an opaque vault ref never carries material and passes the secret scan", () => {
    const ref = opaqueCredentialRef({ vault: "vault:wallet-1", ref: "cred-42", purpose: "session signing" });
    expect(() => assertNoSecretMaterial(ref, "opaque credential ref")).not.toThrow();
    expect(isOpaqueCredentialRef(ref)).toBe(true);
    expect(isOpaqueCredentialRef({ kind: "not_a_ref" })).toBe(false);
    expect(isOpaqueCredentialRef("vault:wallet-1")).toBe(false);
  });

  it("the OpaqueCredentialRef type is structurally key-free (compile-time)", () => {
    expectTypeOf<OpaqueCredentialRef>().toHaveProperty("kind").toEqualTypeOf<"vault_ref">();
    expectTypeOf<OpaqueCredentialRef>().toHaveProperty("vault").toEqualTypeOf<string>();
    expectTypeOf<OpaqueCredentialRef>().toHaveProperty("ref").toEqualTypeOf<string>();
  });
});

describe("redaction policy (display/log safety — the material never transits)", () => {
  it("replaces secret-shaped VALUES with opaque markers in a deep copy", () => {
    const fixture = rawKeyFixture();
    const doc = {
      label: "wallet connection",
      connectionId: fixture, // smuggled raw-key shape under a neutral key
      nested: { note: mnemonicFixture() },
      safe: "0x1111111111111111111111111111111111111111",
    };
    const redacted = redactSecretShapedValues(doc) as typeof doc;
    expect(redacted.connectionId).toBe("[redacted:raw_key]");
    expect(redacted.nested.note).toBe("[redacted:mnemonic]");
    // Everything else survives untouched:
    expect(redacted.label).toBe("wallet connection");
    expect(redacted.safe).toBe(doc.safe);
    // The ORIGINAL is never mutated:
    expect(doc.connectionId).toBe(fixture);
  });

  it("replaces forbidden KEY NAMES entirely (the name alone is a violation)", () => {
    const doc = { note: "config", walletPassword: "hunter2" };
    const redacted = redactSecretShapedValues(doc) as typeof doc;
    expect(redacted.walletPassword).toBe("[redacted:forbidden_key]");
    expect(redacted.note).toBe("config");
  });

  it("derived-identifier fields keep their values (hashes/digests are not secrets)", () => {
    const fixture = rawKeyFixture();
    const doc = { writeDigest: `fnv1a64:${fixture.slice(2)}`, txHash: fixture };
    const redacted = redactSecretShapedValues(doc) as typeof doc;
    expect(redacted.writeDigest).toBe(doc.writeDigest);
    expect(redacted.txHash).toBe(doc.txHash);
  });

  it("handles cycles and arrays without losing structure", () => {
    const fixture = rawKeyFixture();
    const nested: Record<string, unknown> = { smuggled: fixture };
    const doc = { items: [nested, nested], self: {} as unknown };
    doc.self = doc;
    const redacted = redactSecretShapedValues(doc) as { items: Array<{ smuggled: string }> };
    expect(redacted.items[0]?.smuggled).toBe("[redacted:raw_key]");
    expect(redacted.items[1]?.smuggled).toBe("[redacted:raw_key]");
  });
});

describe("the scan law stays exact (regression anchors for the split)", () => {
  it("raw-key and mnemonic shapes are detected under neutral keys", () => {
    const violations = scanForSecretMaterial({ neutral: rawKeyFixture(), words: mnemonicFixture() });
    expect(violations.length).toBe(2);
    expect(violations.every((v) => v.kind === "secret_shaped_value")).toBe(true);
  });

  it("isRawKeyShape stays structural (32-byte hex, optional 0x)", () => {
    expect(isRawKeyShape(rawKeyFixture())).toBe(true);
    expect(isRawKeyShape(rawKeyFixture().slice(2))).toBe(true);
    expect(isRawKeyShape("not-a-key")).toBe(false);
  });

  it("the SecretFree compile-time proof accepts the opaque-ref policy shape", () => {
    // The policy type layer: a vault-ref-carrying contract is still
    // secret-free (the ref names custody, it does not carry it).
    expectTypeOf<SecretFree<{ vaultRef: OpaqueCredentialRef }>>().not.toBeNever();
    expectTypeOf<
      SecretFree<{ walletPassword: string }>
    >().not.toEqualTypeOf<{ walletPassword: string }>();
  });

  it("a secret-bearing artifact is unconstructible through the kernel factories", () => {
    expect(() => assertNoSecretMaterial({ note: "x", seedPhrase: mnemonicFixture() }, "artifact")).toThrow(
      SecretShapeError,
    );
  });
});
