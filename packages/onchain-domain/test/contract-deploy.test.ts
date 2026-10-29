import { describe, expect, it } from "vitest";
import {
  ONCHAIN_OPERATION_KINDS,
  isOnchainOperationKind,
  onchainOperationSemantics,
  ONCHAIN_OPERATION_SEMANTICS,
} from "../src/operations.ts";
import { validateOnchainExecutionDirective } from "../src/execution-directive.ts";
import {
  validateContractDeploymentEvidence,
  smartContractExtensionPinFromDeployment,
} from "../src/pins-deployment.ts";
import { validateSmartContractExtensionPin } from "../src/pins-smart-contract.ts";
import { signerHandle } from "./fixtures.ts";
import { ValidationError } from "../src/errors.ts";
import { strkeyContractFixture } from "./stellar-family.test.ts";

/**
 * P22-A (ADR-0016 D4): the `onchain.contract_deploy` operation kind (effect
 * class: its own DECLARED_BY_CERTIFIED_METHOD-analog — a deployment is
 * consequential, INV-20's discipline extends to it) + the deployment
 * evidence record `{ txHash, contractId, sourceHash, bytecodeHash }` + the
 * pin construction law: a SmartContractExtensionPin derives ONLY from a
 * REAL (complete) deployment record — never fabricated.
 */

const DEPLOY_TX_HASH = "txhash-stellar-testnet-0000000000000000000000000001";
const DEPLOY_SOURCE_HASH = "sha256:source-artifact";
const DEPLOY_BYTECODE_HASH = "sha256:wasm-bytecode";

function completeDeployment() {
  return {
    txHash: DEPLOY_TX_HASH,
    contractId: strkeyContractFixture(),
    sourceHash: DEPLOY_SOURCE_HASH,
    bytecodeHash: DEPLOY_BYTECODE_HASH,
  };
}

function deployAuthorities() {
  return {
    upgradeAuthority: { kind: "IMMUTABLE" as const, description: "No upgrade path" },
    adminAuthority: { kind: "IMMUTABLE" as const, description: "No admin functions" },
    pausePowers: [],
    oracleDependencies: [],
    custody: {
      custodial: false,
      withdrawalAuthority: "none (non-custodial contract)",
      keyManagement: "none held by the contract",
    },
    searchableByLabAfterCertification: false,
  };
}

describe("the onchain.contract_deploy operation kind (ADR-0016 D4)", () => {
  it("ONCHAIN_OPERATION_KINDS declares onchain.contract_deploy (byte-identical literal)", () => {
    expect(ONCHAIN_OPERATION_KINDS).toContain("onchain.contract_deploy");
    expect(isOnchainOperationKind("onchain.contract_deploy")).toBe(true);
    expect(isOnchainOperationKind("onchain.contract_deployx")).toBe(false);
  });

  it("the semantics table stays TOTAL over every declared kind", () => {
    for (const kind of ONCHAIN_OPERATION_KINDS) {
      expect(onchainOperationSemantics(kind).operation).toBe(kind);
      expect(ONCHAIN_OPERATION_SEMANTICS[kind]).toBeDefined();
    }
  });

  it("the pinned deploy semantics: consequential, DECLARED_BY_CERTIFIED_METHOD effect (INV-20's discipline extends to deployments — ADR-0016 D4), irreversible", () => {
    const semantics = onchainOperationSemantics("onchain.contract_deploy");
    expect(semantics.consequentialWrite).toBe(true);
    expect(semantics.financialEffect).toBe("DECLARED_BY_CERTIFIED_METHOD");
    expect(semantics.reversible).toBe(false);
    expect(semantics.description).toMatch(/deploy/i);
  });

  it("a contract_deploy directive validates (the artifact hash rides the family-scoped payload)", () => {
    const directive = validateOnchainExecutionDirective({
      operation: "onchain.contract_deploy",
      chainKey: "stellar:testnet",
      family: "STELLAR",
      expiresAt: "2026-11-03T12:00:00Z",
      signerHandle: signerHandle(),
      familyPayload: {
        artifactHash: DEPLOY_BYTECODE_HASH,
        artifactKind: "WASM",
        sourceHash: DEPLOY_SOURCE_HASH,
      },
    });
    expect(directive.operation).toBe("onchain.contract_deploy");
  });
});

describe("the deployment evidence record (ADR-0016 D4/D7 — { txHash, contractId, sourceHash, bytecodeHash })", () => {
  it("a COMPLETE deployment record validates", () => {
    const evidence = validateContractDeploymentEvidence(completeDeployment());
    expect(evidence).toEqual(completeDeployment());
  });

  it("every missing field is a typed rejection listing ALL gaps (completeness is never partial)", () => {
    for (const field of ["txHash", "contractId", "sourceHash", "bytecodeHash"] as const) {
      const incomplete = { ...completeDeployment(), [field]: undefined };
      let rejected: unknown;
      try {
        validateContractDeploymentEvidence(incomplete);
      } catch (error) {
        rejected = error;
      }
      expect(rejected).toBeInstanceOf(ValidationError);
      expect((rejected as ValidationError).message).toContain(field);
    }
  });

  it("empty-string fields are rejected (an empty hash is not evidence)", () => {
    expect(() =>
      validateContractDeploymentEvidence({ ...completeDeployment(), txHash: "" }),
    ).toThrow(/txHash/);
    expect(() =>
      validateContractDeploymentEvidence({ ...completeDeployment(), contractId: "" }),
    ).toThrow(/contractId/);
  });

  it("non-objects fail closed", () => {
    expect(() => validateContractDeploymentEvidence(null)).toThrow(ValidationError);
    expect(() => validateContractDeploymentEvidence("deployed")).toThrow(ValidationError);
  });
});

describe("the pin construction law (ADR-0016 D7 — the pin derives ONLY from a real deployment record)", () => {
  it("a complete deployment record derives a valid SmartContractExtensionPin (contractAddress = the deployed contract id)", () => {
    const deployment = completeDeployment();
    const pin = smartContractExtensionPinFromDeployment({
      deployment,
      chainRef: "stellar:testnet",
      ...deployAuthorities(),
    });
    expect(() => validateSmartContractExtensionPin(pin)).not.toThrow();
    expect(pin.kind).toBe("smart_contract_extension");
    expect(pin.chainRef).toBe("stellar:testnet");
    expect(pin.contractAddress).toBe(deployment.contractId);
    expect(pin.sourceHash).toBe(DEPLOY_SOURCE_HASH);
    expect(pin.bytecodeHash).toBe(DEPLOY_BYTECODE_HASH);
  });

  it("an INCOMPLETE deployment record is a typed rejection — the pin is never fabricated", () => {
    for (const field of ["txHash", "contractId", "sourceHash", "bytecodeHash"] as const) {
      const incomplete = { ...completeDeployment(), [field]: undefined };
      let rejected: unknown;
      try {
        smartContractExtensionPinFromDeployment({
          deployment: incomplete,
          chainRef: "stellar:testnet",
          ...deployAuthorities(),
        });
      } catch (error) {
        rejected = error;
      }
      expect(rejected).toBeInstanceOf(ValidationError);
      expect((rejected as ValidationError).message).toContain(field);
    }
  });

  it("the derived pin keeps the declaration-completeness law (missing custody is still rejected)", () => {
    let rejected: unknown;
    try {
      smartContractExtensionPinFromDeployment({
        deployment: completeDeployment(),
        chainRef: "stellar:testnet",
        ...deployAuthorities(),
        custody: { custodial: true } as never,
      });
    } catch (error) {
      rejected = error;
    }
    expect(rejected).toBeInstanceOf(ValidationError);
  });
});
