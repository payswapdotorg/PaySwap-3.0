import { describe, expect, it } from "vitest";
import {
  SECRET_KEY_NAME_PATTERNS,
  SECRET_VALUE_PATTERNS,
  SecretMaterialError,
  assertNoSecretMaterial,
  discoverOpportunity,
  isSecretFree,
  scanForSecretMaterial,
} from "../src/index.ts";
import type {
  FinancialOpportunity,
  OpportunityFamilyCapability,
  OpportunityObservationInput,
  ResolvedOpportunity,
  DiscoveryPolicyEvaluation,
  SupportingObservation,
  ArbitrageLeg,
  ExpectedReturnEstimate,
} from "../src/index.ts";
import { NOW, discoveryCatalog } from "./fixtures-catalog.ts";

/**
 * THE SECRET-FREE LAW (P6-W2, hard law 5; ADAPTED from the old
 * secret-free.test.ts 5 titled type-level sites onto the local law + the
 * NET-NEW runtime scrubber sites). The runtime detection fixtures are
 * ASSEMBLED AT RUNTIME from fragments — no complete secret shape ever
 * appears in this source (GitHub push protection blocks literal shapes).
 */

/** Type-level proof helpers (the local law, no sibling imports). */
type ForbiddenKeys =
  | "privateKey"
  | "seedPhrase"
  | "mnemonic"
  | "password"
  | "apiKey"
  | "apiSecret"
  | "secret"
  | "clientSecret"
  | "accessToken"
  | "refreshToken"
  | "credential"
  | "credentials"
  | "keystore"
  | "walletFile";

type FindForbiddenSecretKeys<T> = T extends readonly unknown[]
  ? FindForbiddenSecretKeys<T[number]>
  : T extends object
    ? {
        [K in keyof T]-?: K extends ForbiddenKeys
          ? K
          : FindForbiddenSecretKeys<T[K]>;
      }[keyof T]
    : never;

type IsNever<T> = [T] extends [never] ? true : false;
type Check<A extends true> = A;

describe("the secret-free law (type-level + runtime scrubber)", () => {
  it("the FinancialOpportunity and its first-class field types are secret-free", () => {
    type Cases = [
      Check<IsNever<FindForbiddenSecretKeys<FinancialOpportunity>>>,
      Check<IsNever<FindForbiddenSecretKeys<ExpectedReturnEstimate>>>,
      Check<IsNever<FindForbiddenSecretKeys<ArbitrageLeg>>>,
      Check<IsNever<FindForbiddenSecretKeys<SupportingObservation>>>,
    ];
    const _cases: Cases = [true, true, true, true];
    expect(_cases.length).toBe(4);
  });

  it("the observation input, policy evaluation and resolution contracts are secret-free", () => {
    type Cases = [
      Check<IsNever<FindForbiddenSecretKeys<OpportunityObservationInput>>>,
      Check<IsNever<FindForbiddenSecretKeys<DiscoveryPolicyEvaluation>>>,
      Check<IsNever<FindForbiddenSecretKeys<ResolvedOpportunity>>>,
    ];
    const _cases: Cases = [true, true, true];
    expect(_cases.length).toBe(3);
  });

  it("the Lab capability registration contract is secret-free", () => {
    type Cases = [
      Check<IsNever<FindForbiddenSecretKeys<OpportunityFamilyCapability>>>,
    ];
    const _cases: Cases = [true];
    expect(_cases.length).toBe(1);
  });

  it("a contract carrying a forbidden key name is DETECTED at the type level (proof the proof works)", () => {
    type Smuggled = { readonly privateKey: string };
    type Detected = IsNever<FindForbiddenSecretKeys<Smuggled>>;
    const detected: Check<Detected extends false ? true : false> = true;
    expect(detected).toBe(true);
    type NotNever = FindForbiddenSecretKeys<Smuggled>;
    const key: NotNever = "privateKey";
    expect(key).toBe("privateKey");
  });

  it("the runtime scrubber ACCEPTS every catalog opportunity (agent-facing artifacts are secret-free)", () => {
    for (const entry of discoveryCatalog()) {
      const opportunity = discoverOpportunity(entry.input, NOW);
      expect(() => assertNoSecretMaterial(opportunity, entry.label), entry.label).not.toThrow();
      expect(isSecretFree(opportunity), entry.label).toBe(true);
    }
  });

  it("the runtime scrubber DETECTS forbidden key names at any nesting depth (runtime-assembled fixtures)", () => {
    // Assembled at runtime from fragments — never a literal secret shape.
    const forgeForbiddenKey = (key: string): Record<string, unknown> => ({
      provenance: { venueId: "venue:x", nested: { [key]: "assembled" } },
    });
    for (const pattern of SECRET_KEY_NAME_PATTERNS) {
      const keyName = pattern.source.replace(/^\^/, "").replace(/\$$/, "").replace(/i$/, "");
      const forged = forgeForbiddenKey(keyName);
      const findings = scanForSecretMaterial(forged);
      expect(findings.length, keyName).toBeGreaterThan(0);
      expect(findings[0]?.keyName, keyName).toBe(keyName);
      expect(() => assertNoSecretMaterial(forged, "forged")).toThrow(SecretMaterialError);
    }
  });

  it("the runtime scrubber DETECTS credential-shaped VALUES (runtime-assembled from fragments)", () => {
    // Fragment assembly: no complete secret literal ever appears in source.
    const classicPatPrefix = "ghp_";
    const classicPatBody = "B".repeat(36);
    const classicPat = classicPatPrefix + classicPatBody;

    const modernPatPrefix = "github_pat_";
    const modernPatBody = "X".repeat(40);
    const modernPat = modernPatPrefix + modernPatBody;

    const hexPrefix = "0x";
    const hexBody = "a".repeat(64);
    const hexKey = hexPrefix + hexBody;

    const pemHeader = "-----BEGIN " + "EC PRIVATE " + "KEY-----";
    const skPrefix = "sk-";
    const skBody = "z".repeat(32);
    const skKey = skPrefix + skBody;
    const bearerToken = "Bearer " + "t".repeat(24);

    const forged = {
      venueNote: classicPat,
      backup: modernPat,
      wallet: hexKey,
      pem: pemHeader + " blah",
      llm: skKey,
      auth: bearerToken,
      clean: "an ordinary observed venue note with no key shape",
    };
    const findings = scanForSecretMaterial(forged);
    expect(findings.length).toBeGreaterThanOrEqual(6);
    expect(() => assertNoSecretMaterial(forged, "forged-values")).toThrow(
      SecretMaterialError,
    );
    expect(isSecretFree(forged)).toBe(false);
    // The clean field alone is free.
    expect(isSecretFree({ venueNote: forged.clean })).toBe(true);
  });

  it("the scrubber is deterministic and cycle-safe (same value, same findings)", () => {
    const forgeA = "ghp_" + "C".repeat(30);
    const value: Record<string, unknown> = { note: forgeA };
    value.self = value; // a cycle — traversed once, never stack-overflowed.
    const first = scanForSecretMaterial(value);
    const second = scanForSecretMaterial(value);
    expect(first).toEqual(second);
    expect(first.length).toBe(1);
  });

  it("the pattern lists are frozen, non-empty and carry no complete secret literal", () => {
    expect(Object.isFrozen(SECRET_KEY_NAME_PATTERNS)).toBe(true);
    expect(Object.isFrozen(SECRET_VALUE_PATTERNS)).toBe(true);
    expect(SECRET_KEY_NAME_PATTERNS.length).toBeGreaterThanOrEqual(10);
    expect(SECRET_VALUE_PATTERNS.length).toBeGreaterThanOrEqual(5);
    const sources = SECRET_VALUE_PATTERNS.map(String).join("\n");
    // Shape patterns only: no literal token runs longer than the pattern
    // classes themselves (no assembled secret ever appears in source).
    expect(sources).not.toMatch(/gh[pousr]_[A-Za-z0-9]{20,}/);
    expect(sources).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
    expect(sources).not.toMatch(/0x[0-9a-fA-F]{64}/);
  });
});
