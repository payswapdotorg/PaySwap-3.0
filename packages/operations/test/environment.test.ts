import { describe, expect, it } from "vitest";
import {
  CONFIGURATION_CONTRACT,
  DEPLOYABLE_PLANES,
  ENVIRONMENT_TIERS,
  EnvironmentContractError,
  computeConfigFingerprint,
  defineEnvironmentManifest,
  defineEnvironmentRecord,
} from "../src/environment.js";
import {
  PARITY_ALLOWED_DIFFERENCES,
  checkEnvironmentVariableCompleteness,
  verifyEnvironmentParity,
} from "../src/environment-gates.js";

function manifestFixture(tier: "preview" | "production", config: Record<string, string>) {
  return defineEnvironmentManifest({
    tier,
    services: [
      {
        planeId: "payswap-surface-web",
        plane: "surface-web",
        version: "3.0.0-p8w3",
        config,
      },
      {
        planeId: "payswap-provider-runtime",
        plane: "provider-runtime-plane",
        version: "3.0.0-p8w3",
        config: { PROVIDER_STRIPE_CREDENTIAL_REF: "vault://payswap/stripe" },
      },
    ],
  });
}

describe("environment records + manifests (law 1 support)", () => {
  it("the tiers and planes are closed vocabularies", () => {
    expect([...ENVIRONMENT_TIERS]).toEqual([
      "local",
      "preview",
      "staging",
      "production",
    ]);
    expect(DEPLOYABLE_PLANES).toContain("operations-plane");
    expect(CONFIGURATION_CONTRACT.length).toBeGreaterThan(5);
    expect(
      CONFIGURATION_CONTRACT.filter((r) => r.secretBacked).map((r) => r.name),
    ).toContain("VAULT_REF");
  });

  it("manifest assembly fails closed on unknown tier/plane + duplicates", () => {
    expect(() =>
      defineEnvironmentManifest({
        tier: "prod" as never,
        services: [],
      }),
    ).toThrow(EnvironmentContractError);
    expect(() =>
      defineEnvironmentManifest({
        tier: "preview",
        services: [
          {
            planeId: "x",
            plane: "not-a-plane" as never,
            version: "1",
            config: {},
          },
        ],
      }),
    ).toThrow(/unknown plane/);
    expect(() =>
      defineEnvironmentManifest({
        tier: "preview",
        services: [
          {
            planeId: "dup",
            plane: "operations-plane",
            version: "1",
            config: {},
          },
          {
            planeId: "dup",
            plane: "operations-plane",
            version: "1",
            config: {},
          },
        ],
      }),
    ).toThrow(/duplicate planeId/);
  });

  it("config fingerprints are order-independent and content-sensitive", () => {
    expect(computeConfigFingerprint({ a: "1", b: "2" })).toBe(
      computeConfigFingerprint({ b: "2", a: "1" }),
    );
    expect(computeConfigFingerprint({ a: "1" })).not.toBe(
      computeConfigFingerprint({ a: "2" }),
    );
    const m1 = manifestFixture("preview", { VAULT_REF: "vault://x" });
    const m2 = manifestFixture("preview", { VAULT_REF: "vault://x" });
    const m3 = manifestFixture("preview", { VAULT_REF: "vault://y" });
    expect(m1.configFingerprint).toBe(m2.configFingerprint);
    expect(m1.configFingerprint).not.toBe(m3.configFingerprint);
  });

  it("the environment record is typed + fail-closed (non-production cannot be LIVE)", () => {
    const manifest = manifestFixture("preview", {});
    const record = defineEnvironmentRecord({
      tier: "preview",
      region: "eu-west-1",
      executionMode: "SANDBOX",
      manifestFingerprint: manifest.configFingerprint,
      providerBindingsFingerprint: "fnv1a64:0000000000000001",
    });
    expect(record.tier).toBe("preview");
    expect(() =>
      defineEnvironmentRecord({
        tier: "staging",
        region: "eu-west-1",
        executionMode: "LIVE",
        manifestFingerprint: manifest.configFingerprint,
        providerBindingsFingerprint: "fnv1a64:0000000000000001",
      }),
    ).toThrow(/may not declare LIVE/);
    expect(() =>
      defineEnvironmentRecord({
        tier: "preview",
        region: "x",
        executionMode: "SANDBOX",
        manifestFingerprint: manifest.configFingerprint,
        providerBindingsFingerprint: "fnv1a64:0000000000000001",
      }),
    ).toThrow(/region/);
  });
});

describe("completeness + parity gates (environment differences are explicit)", () => {
  it("a missing required variable blocks release", () => {
    const manifest = defineEnvironmentManifest({
      tier: "preview",
      services: [
        {
          planeId: "payswap-surface-web",
          plane: "surface-web",
          version: "1.0.0",
          config: { DATABASE_URL: "vault://db" },
        },
      ],
    });
    const report = checkEnvironmentVariableCompleteness(manifest);
    expect(report.passed).toBe(false);
    expect(report.services[0]?.missing).toContain("VAULT_REF");
  });

  it("the PROVIDER_CREDENTIAL_REF template accepts any concrete provider key", () => {
    const manifest = defineEnvironmentManifest({
      tier: "preview",
      services: [
        {
          planeId: "payswap-provider-runtime",
          plane: "provider-runtime-plane",
          version: "1.0.0",
          config: {
            DATABASE_URL: "vault://db",
            VAULT_REF: "vault://root",
            PROVIDER_WISE_CREDENTIAL_REF: "vault://wise",
          },
        },
      ],
    });
    const report = checkEnvironmentVariableCompleteness(manifest);
    expect(report.services[0]?.missing).not.toContain("PROVIDER_CREDENTIAL_REF");
  });

  it("parity passes when differences are only on the allowlist", () => {
    const lower = manifestFixture("preview", {
      DATABASE_URL: "vault://db-preview",
      VAULT_REF: "vault://root-preview",
      OBSERVABILITY_ENDPOINT: "https://obs.preview",
      SHARED_FEATURE_FLAG: "on",
    });
    const higher = manifestFixture("production", {
      DATABASE_URL: "vault://db-production",
      VAULT_REF: "vault://root-production",
      OBSERVABILITY_ENDPOINT: "https://obs.production",
      SHARED_FEATURE_FLAG: "on",
    });
    const report = verifyEnvironmentParity(lower, higher);
    expect(report.passed).toBe(true);
    expect(report.digest).toMatch(/^fnv1a64:/);
    for (const key of ["DATABASE_URL", "VAULT_REF"]) {
      expect(PARITY_ALLOWED_DIFFERENCES).toContain(key);
    }
  });

  it("parity fails on version drift, missing planes and unannounced keys", () => {
    const lower = manifestFixture("preview", { VAULT_REF: "vault://a" });
    const drifted = defineEnvironmentManifest({
      tier: "production",
      services: [
        {
          planeId: "payswap-surface-web",
          plane: "surface-web",
          version: "3.0.0-DIFFERENT",
          config: { VAULT_REF: "vault://b" },
        },
        {
          planeId: "payswap-provider-runtime",
          plane: "provider-runtime-plane",
          version: "3.0.0-p8w3",
          config: { PROVIDER_STRIPE_CREDENTIAL_REF: "vault://payswap/stripe" },
        },
      ],
    });
    expect(verifyEnvironmentParity(lower, drifted).passed).toBe(false);

    const extraPlane = defineEnvironmentManifest({
      tier: "production",
      services: [
        ...manifestFixture("production", { VAULT_REF: "vault://b" }).services,
        {
          planeId: "payswap-lab",
          plane: "lab-plane",
          version: "3.0.0-p8w3",
          config: {},
        },
      ],
    });
    const missingReport = verifyEnvironmentParity(lower, extraPlane);
    expect(missingReport.passed).toBe(false);
    expect(missingReport.servicesMissingInLower).toContain("payswap-lab");

    const unannounced = manifestFixture("production", {
      VAULT_REF: "vault://b",
      NEW_UNANNOUNCED_KEY: "drift",
    });
    const driftReport = verifyEnvironmentParity(lower, unannounced);
    expect(driftReport.passed).toBe(false);
    expect(driftReport.serviceDiffs[0]?.unexpectedConfigDifferences).toEqual([
      "NEW_UNANNOUNCED_KEY",
    ]);
  });
});
