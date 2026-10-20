import { describe, expect, it } from "vitest";
import {
  canonicalString,
  contentDigest,
} from "../src/digest.js";
import {
  DEPLOYABLE_PLANES,
  ENVIRONMENT_TIERS,
  defineEnvironmentManifest,
  defineEnvironmentRecord,
  verifyEnvironmentParity,
} from "../src/environment.js";
import {
  COMMIT_SHA_PATTERN,
  defineDeploymentIdentity,
  identitiesAreByteIdentical,
  serializeDeploymentIdentity,
  verifyDeploymentIdentity,
} from "../src/deployment-identity.js";
import { PACKAGE_NAME } from "../src/index.js";
import { PINNED_EXECUTION_MODES } from "../src/pins/provider-runtime.js";

const COMMIT = "b01a0a9".padEnd(40, "0");
const SHA =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function fixtureEnvironmentRecord() {
  const manifest = defineEnvironmentManifest({
    tier: "preview",
    services: [
      {
        planeId: "payswap-surface-web",
        plane: "surface-web",
        version: "3.0.0-p8w3",
        config: { VAULT_REF: "vault://payswap/preview" },
      },
    ],
  });
  return defineEnvironmentRecord({
    tier: "preview",
    region: "eu-west-1",
    executionMode: "SANDBOX",
    manifestFingerprint: manifest.configFingerprint,
    providerBindingsFingerprint: "fnv1a64:0000000000000001",
  });
}

describe("smoke: package skeleton + the identity/digest model", () => {
  it("exposes the package name and the pinned vocabularies", () => {
    expect(PACKAGE_NAME).toBe("@payswap/operations");
    expect([...ENVIRONMENT_TIERS]).toEqual([
      "local",
      "preview",
      "staging",
      "production",
    ]);
    expect([...PINNED_EXECUTION_MODES]).toEqual(["SANDBOX", "LIVE"]);
    expect(DEPLOYABLE_PLANES.length).toBeGreaterThan(0);
  });

  it("the digest substrate is deterministic and sorted-key canonical", () => {
    expect(canonicalString({ b: 1, a: 2 })).toBe(
      canonicalString({ a: 2, b: 1 }),
    );
    expect(contentDigest({ z: 1, y: [1n, 2n] })).toBe(
      contentDigest({ y: [1n, 2n], z: 1 }),
    );
    expect(contentDigest("x")).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  });

  it("a deployment identity requires all four components (law 1)", () => {
    const environment = fixtureEnvironmentRecord();
    const identity = defineDeploymentIdentity({
      commitSha: COMMIT,
      environment,
      buildDigest: SHA,
      manifestDigest: SHA,
    });
    expect(COMMIT_SHA_PATTERN.test(COMMIT)).toBe(true);
    expect(identity.identityDigest).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(verifyDeploymentIdentity(identity).ok).toBe(true);
    expect(() =>
      defineDeploymentIdentity({
        commitSha: "short",
        environment,
        buildDigest: SHA,
        manifestDigest: SHA,
      }),
    ).toThrow(/commitSha/);
  });

  it("identities are byte-deterministic and tamper-evident", () => {
    const environment = fixtureEnvironmentRecord();
    const a = defineDeploymentIdentity({
      commitSha: COMMIT,
      environment,
      buildDigest: SHA,
      manifestDigest: SHA,
    });
    const b = defineDeploymentIdentity({
      commitSha: COMMIT,
      environment: fixtureEnvironmentRecord(),
      buildDigest: SHA,
      manifestDigest: SHA,
    });
    expect(identitiesAreByteIdentical(a, b)).toBe(true);
    expect(serializeDeploymentIdentity(a)).toBe(serializeDeploymentIdentity(b));

    const tampered = { ...a, buildDigest: SHA.replace("a", "b") };
    const report = verifyDeploymentIdentity(tampered);
    expect(report.ok).toBe(false);
    expect(report.problems.join("\n")).toContain("chain mismatch");
  });

  it("parity allows only the explicit environment differences", () => {
    const lower = defineEnvironmentManifest({
      tier: "preview",
      services: [
        {
          planeId: "payswap-surface-web",
          plane: "surface-web",
          version: "3.0.0",
          config: {
            VAULT_REF: "vault://payswap/preview",
            OBSERVABILITY_ENDPOINT: "https://obs.preview",
          },
        },
      ],
    });
    const higher = defineEnvironmentManifest({
      tier: "production",
      services: [
        {
          planeId: "payswap-surface-web",
          plane: "surface-web",
          version: "3.0.0",
          config: {
            VAULT_REF: "vault://payswap/production",
            OBSERVABILITY_ENDPOINT: "https://obs.production",
            NEW_UNANNOUNCED_KEY: "drift",
          },
        },
      ],
    });
    const report = verifyEnvironmentParity(lower, higher);
    expect(report.passed).toBe(false);
    expect(report.serviceDiffs[0]?.unexpectedConfigDifferences).toEqual([
      "NEW_UNANNOUNCED_KEY",
    ]);
  });
});
