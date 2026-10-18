import { describe, expect, it } from "vitest";
import { validateSmartContractExtensionPin, assessPinnedSmartContractRisk } from "../src/pins-smart-contract.ts";
import { bridgeSmartContract } from "./fixtures.ts";

/**
 * NET-NEW (the 3.0 laws): the pinned smart-contract declaration — the
 * declaration-completeness law and the mirrored deterministic risk profile
 * (authority: @payswap/capability src/smart-contract.ts; split from
 * test/pins.test.ts for the file-size law).
 */

describe("the pinned smart-contract declaration (the completeness law)", () => {
  it("validates a canonical declaration", () => {
    const declaration = validateSmartContractExtensionPin(bridgeSmartContract());
    expect(declaration.kind).toBe("smart_contract_extension");
    expect(declaration.custody.custodial).toBe(true);
  });

  it("rejects an incomplete declaration (undeclared property — never assumed)", () => {
    const { custody, ...rest } = bridgeSmartContract();
    void custody;
    expect(() => validateSmartContractExtensionPin(rest)).toThrow(/custody must be declared/);
  });

  it("rejects a custodial declaration without a named custodian (NON-CUSTODY law)", () => {
    expect(() =>
      validateSmartContractExtensionPin({
        ...bridgeSmartContract(),
        custody: {
          custodial: true,
          withdrawalAuthority: "declared",
          keyManagement: "declared",
        },
      }),
    ).toThrow(/custodianRef is REQUIRED/);
  });

  it("rejects an unknown authority kind", () => {
    expect(() =>
      validateSmartContractExtensionPin({
        ...bridgeSmartContract(),
        upgradeAuthority: { kind: "BENEVOLENT_DICTATOR", description: "n/a" },
      }),
    ).toThrow(/upgradeAuthority.kind/);
  });

  it("the mirrored risk profile derivation is deterministic", () => {
    const contract = validateSmartContractExtensionPin(bridgeSmartContract());
    const risk = assessPinnedSmartContractRisk(contract);
    expect(risk.upgradeRisk).toBe("BOUNDED"); // MULTISIG without timelock
    expect(risk.governanceRisk).toBe("LOW"); // IMMUTABLE admin
    expect(risk.pauseRisk).toBe("PRESENT");
    expect(risk.custodyRisk).toBe("CUSTODIAL");

    const daoUpgradable = assessPinnedSmartContractRisk(
      validateSmartContractExtensionPin({
        ...bridgeSmartContract(),
        upgradeAuthority: { kind: "DAO", description: "n/a" },
        adminAuthority: { kind: "DAO", description: "n/a" },
        pausePowers: [],
        oracleDependencies: [{ oracleRef: "oracle:001", usage: "price feed" }],
        custody: { ...bridgeSmartContract().custody, custodial: false },
      }),
    );
    expect(daoUpgradable.upgradeRisk).toBe("UNBOUNDED");
    expect(daoUpgradable.governanceRisk).toBe("HIGH");
    expect(daoUpgradable.pauseRisk).toBe("NONE");
    expect(daoUpgradable.oracleRisk).toBe("PRESENT");
    expect(daoUpgradable.custodyRisk).toBe("NON_CUSTODIAL");
    expect(daoUpgradable.notes.some((n) => n.includes("unbounded"))).toBe(true);

    const immutable = assessPinnedSmartContractRisk(
      validateSmartContractExtensionPin({
        ...bridgeSmartContract(),
        upgradeAuthority: { kind: "IMMUTABLE", description: "n/a" },
        pausePowers: [],
        custody: { ...bridgeSmartContract().custody, custodial: false },
      }),
    );
    expect(immutable.upgradeRisk).toBe("NONE");
    expect(immutable.notes).toHaveLength(0);
  });
});
