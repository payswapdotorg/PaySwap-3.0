import { describe, expect, it } from "vitest";
import {
  COMMIT_SHA_PATTERN,
  DEPLOYMENT_IDENTITY_SCHEMA_VERSION,
  DeploymentIdentityError,
  IDENTITY_CHAIN_ORDER,
  SHA256_HEX_PATTERN,
  computeIdentityDigest,
  defineDeploymentIdentity,
  identitiesAreByteIdentical,
  serializeDeploymentIdentity,
  verifyDeploymentIdentity,
} from "../src/deployment-identity.js";
import { defineEnvironmentRecord, defineEnvironmentManifest } from "../src/environment.js";

const COMMIT = "b01a0a9000000000000000000000000000000000";
const SHA_A =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SHA_B =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function environment(executionMode: "SANDBOX" | "LIVE" = "SANDBOX") {
  const manifest = defineEnvironmentManifest({
    tier: executionMode === "LIVE" ? "production" : "preview",
    services: [
      {
        planeId: "payswap-operations",
        plane: "operations-plane",
        version: "3.0.0-p8w3",
        config: { VAULT_REF: "vault://payswap/ops" },
      },
    ],
  });
  return defineEnvironmentRecord({
    tier: executionMode === "LIVE" ? "production" : "preview",
    region: "eu-west-1",
    executionMode,
    manifestFingerprint: manifest.configFingerprint,
    providerBindingsFingerprint: "fnv1a64:0000000000000001",
    notes: ["release-evidence lane"],
  });
}

function identity() {
  return defineDeploymentIdentity({
    commitSha: COMMIT,
    environment: environment(),
    buildDigest: SHA_A,
    manifestDigest: SHA_B,
  });
}

describe("deployment identity (hard law 1)", () => {
  it("all four components are required — fail-closed on each", () => {
    expect(COMMIT_SHA_PATTERN.test(COMMIT)).toBe(true);
    expect(SHA256_HEX_PATTERN.test(SHA_A)).toBe(true);
    for (const bad of [
      { commitSha: "short", buildDigest: SHA_A, manifestDigest: SHA_B },
      { commitSha: COMMIT.toUpperCase(), buildDigest: SHA_A, manifestDigest: SHA_B },
      { commitSha: COMMIT, buildDigest: "nothex", manifestDigest: SHA_B },
      { commitSha: COMMIT, buildDigest: SHA_A, manifestDigest: "" },
    ]) {
      expect(() =>
        defineDeploymentIdentity({
          ...bad,
          environment: environment(),
        } as never),
      ).toThrow(DeploymentIdentityError);
    }
    expect(() =>
      defineDeploymentIdentity({
        commitSha: COMMIT,
        environment: undefined as never,
        buildDigest: SHA_A,
        manifestDigest: SHA_B,
      }),
    ).toThrow(/environment record is REQUIRED/);
  });

  it("the identity is digest-chained in the documented fixed order", () => {
    const id = identity();
    expect(IDENTITY_CHAIN_ORDER).toEqual([
      "commitSha",
      "environment",
      "buildDigest",
      "manifestDigest",
    ]);
    expect(id.schema_version).toBe(DEPLOYMENT_IDENTITY_SCHEMA_VERSION);
    expect(id.identityDigest).toBe(
      computeIdentityDigest({
        commitSha: COMMIT,
        environment: environment(),
        buildDigest: SHA_A,
        manifestDigest: SHA_B,
      }),
    );
  });

  it("byte-determinism: the same components always produce identical bytes", () => {
    const a = identity();
    const b = identity();
    expect(identitiesAreByteIdentical(a, b)).toBe(true);
    expect(serializeDeploymentIdentity(a)).toBe(serializeDeploymentIdentity(b));
    const different = defineDeploymentIdentity({
      commitSha: COMMIT,
      environment: environment(),
      buildDigest: SHA_B,
      manifestDigest: SHA_A,
    });
    expect(identitiesAreByteIdentical(a, different)).toBe(false);
  });

  it("chain verification passes on a valid identity", () => {
    expect(verifyDeploymentIdentity(identity()).ok).toBe(true);
  });

  it("tampering any component breaks the chain (tamper-evident)", () => {
    for (const tampered of [
      { ...identity(), commitSha: COMMIT.replace("b", "c") },
      { ...identity(), buildDigest: SHA_B },
      { ...identity(), manifestDigest: SHA_A },
      { ...identity(), identityDigest: "fnv1a64:0000000000000000" },
    ]) {
      const report = verifyDeploymentIdentity(tampered);
      expect(report.ok).toBe(false);
    }
  });

  it("shape verification rejects malformed identities", () => {
    expect(verifyDeploymentIdentity(null).ok).toBe(false);
    expect(verifyDeploymentIdentity({}).ok).toBe(false);
    expect(
      verifyDeploymentIdentity({
        schema_version: "0.9",
        commitSha: COMMIT,
        environment: environment(),
        buildDigest: SHA_A,
        manifestDigest: SHA_B,
        identityDigest: "x",
      }).problems.join("\n"),
    ).toContain("schema_version");
  });

  it("a LIVE identity is representable for production (recorded, not executed)", () => {
    const live = defineDeploymentIdentity({
      commitSha: COMMIT,
      environment: environment("LIVE"),
      buildDigest: SHA_A,
      manifestDigest: SHA_B,
    });
    expect(live.environment.executionMode).toBe("LIVE");
    expect(verifyDeploymentIdentity(live).ok).toBe(true);
  });
});
