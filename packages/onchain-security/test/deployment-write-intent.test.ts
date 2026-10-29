import { describe, expect, it } from "vitest";
import { prepareWrite } from "../src/write-intent.ts";
import type { OnchainWriteRequest } from "../src/write-intent.ts";
import { InvalidWriteError } from "../src/write-intent.ts";

/**
 * P22-A (ADR-0016 D4): the DEPLOYMENT write leg. The onchain-security
 * kernel's prepare accepts a consequential write whose effect is a contract
 * deployment (`onchain.contract_deploy`): the leg carries the deploying
 * account and the digest-bound artifact identity (the wasm/bytecode hash +
 * the declared artifact kind). A deployment write with NO other leg is a
 * complete consequential write — and every field of the deployment leg is
 * mandatory, fail closed (an unknown deployment never prepares).
 */

const STELLAR_CHAIN = "stellar:testnet";
const DEPLOYER = "G-account-shape-fixture-0000000000000000000000000000";
const ARTIFACT_HASH = "sha256:wasm-artifact";
const ROUTE_HASH = "fnv1a64:0000000000000009";

function deploymentWrite(overrides?: Partial<OnchainWriteRequest>): OnchainWriteRequest {
  return {
    writeId: "write-deploy-1",
    action: "onchain.contract_deploy",
    chain: STELLAR_CHAIN,
    deployment: {
      deployer: DEPLOYER,
      artifactHash: ARTIFACT_HASH,
      artifactKind: "WASM",
    },
    approvals: [],
    route: { routeId: "route-deploy-1", routeHash: ROUTE_HASH },
    expiry: 2_000_000,
    requestedBy: "agent:agent-key-1",
    ...overrides,
  };
}

describe("the deployment write leg (ADR-0016 D4 — prepare accepts a consequential DEPLOYMENT)", () => {
  it("a deployment-only write prepares (validated, frozen, content-addressed)", () => {
    const prepared = prepareWrite(deploymentWrite(), 1_000_000);
    expect(prepared.action).toBe("onchain.contract_deploy");
    expect(prepared.deployment).toEqual({
      deployer: DEPLOYER,
      artifactHash: ARTIFACT_HASH,
      artifactKind: "WASM",
    });
    expect(Object.isFrozen(prepared)).toBe(true);
    // The package-local FNV-1a content digest (16 lowercase hex chars).
    expect(prepared.writeDigest).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  });

  it("the digest BINDS the deployment leg (a different artifact is a different write)", () => {
    const a = prepareWrite(deploymentWrite(), 1_000_000);
    const b = prepareWrite(
      deploymentWrite({
        deployment: { deployer: DEPLOYER, artifactHash: "sha256:other-wasm", artifactKind: "WASM" },
      }),
      1_000_000,
    );
    expect(a.writeDigest).not.toBe(b.writeDigest);
  });

  it("a deployment write with NO effect leg at all is still rejected (an empty write never validates)", () => {
    const { deployment: _omit, ...noDeployment } = deploymentWrite();
    expect(() => prepareWrite(noDeployment, 1_000_000)).toThrow(InvalidWriteError);
  });

  it("every deployment-leg field is mandatory (fail closed)", () => {
    expect(() =>
      prepareWrite(
        deploymentWrite({
          deployment: { artifactHash: ARTIFACT_HASH, artifactKind: "WASM" } as never,
        }),
        1_000_000,
      ),
    ).toThrow(/deployer/);
    expect(() =>
      prepareWrite(
        deploymentWrite({
          deployment: { deployer: DEPLOYER, artifactKind: "WASM" } as never,
        }),
        1_000_000,
      ),
    ).toThrow(/artifactHash/);
    expect(() =>
      prepareWrite(
        deploymentWrite({
          deployment: { deployer: DEPLOYER, artifactHash: ARTIFACT_HASH } as never,
        }),
        1_000_000,
      ),
    ).toThrow(/artifactKind/);
  });

  it("the artifact kind vocabulary is explicit (WASM | BYTECODE | PROVIDER_DEFINED — never guessed)", () => {
    expect(() =>
      prepareWrite(
        deploymentWrite({
          deployment: {
            deployer: DEPLOYER,
            artifactHash: ARTIFACT_HASH,
            artifactKind: "hex" as never,
          },
        }),
        1_000_000,
      ),
    ).toThrow(/artifactKind/);
  });

  it("the deployer reference is address-validated (whitespace-free, bounded)", () => {
    expect(() =>
      prepareWrite(
        deploymentWrite({
          deployment: { deployer: "has whitespace inside", artifactHash: ARTIFACT_HASH, artifactKind: "WASM" },
        }),
        1_000_000,
      ),
    ).toThrow(/deployer/);
    expect(() =>
      prepareWrite(
        deploymentWrite({
          deployment: { deployer: "", artifactHash: ARTIFACT_HASH, artifactKind: "WASM" },
        }),
        1_000_000,
      ),
    ).toThrow(/deployer/);
  });

  it("a deployment write is secret-scanned like every write (INV-19)", () => {
    expect(() =>
      prepareWrite(
        deploymentWrite({
          deployment: {
            deployer: `S${"Q".repeat(55)}`,
            artifactHash: ARTIFACT_HASH,
            artifactKind: "WASM",
          },
        }),
        1_000_000,
      ),
    ).toThrow(/secret|Stellar/i);
  });
});
