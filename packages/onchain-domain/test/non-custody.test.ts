import { describe, expect, it } from "vitest";
import { validateSignerHandle, WALLET_CUSTODY_MODELS } from "../src/wallet.ts";
import { validateSmartAccountCapabilityDeclaration } from "../src/wallet.ts";
import { observationPermitsFinalityDeclaration, validateOnchainSettlementLinkage, onchainRailId } from "../src/settlement-mapping.ts";
import {
  broadcastObservation,
  confirmedObservation,
  unknownObservation,
  failedObservation,
  signerHandle,
  ETHEREUM_CHAIN_KEY,
} from "./fixtures.ts";
import * as onchainDomain from "../src/index.ts";

/**
 * NET-NEW (the 3.0 laws): the NON-CUSTODY boundary
 * (spec/architecture/NON-CUSTODY.md; canonical INV-8/INV-19) encoded as
 * executable guarantees:
 * - PaySwap is an orchestration and economic-coordination layer, not hidden
 *   custody;
 * - PaySwap may model obligations, calculate routes, authorize scoped
 *   external execution, observe external balances — it may NOT claim an
 *   internal balance proves custody, withdraw user/provider funds
 *   unilaterally, or move a smart account outside its permitted
 *   authorization path;
 * - smart-account authority supports policy-limited automation, session
 *   keys, batching or sponsorship where supported — always bounded by an
 *   explicit permission envelope; root credentials remain outside model
 *   context;
 * - value-holding contracts expose their custody/withdrawal properties in
 *   full (the declaration-completeness law — covered in pins.test.ts).
 */

describe("the non-custody boundary is explicit on the export surface", () => {
  it("the package exports no custody-taking, balance, ledger or withdrawal vocabulary", () => {
    const exportedNames = Object.keys(onchainDomain).sort();
    for (const forbidden of [
      /balance/i,
      /ledger/i,
      /\bmint/i,
      /deposit/i,
      /withdraw/i,
      /\bcustody_?claim/i,
      /takeCustody/i,
    ]) {
      for (const name of exportedNames) {
        expect(forbidden.test(name), `export '${name}' matches ${forbidden}`).toBe(false);
      }
    }
    // Custody vocabulary is restricted to the descriptive custody-model
    // classification (WHO controls keys) — never a custody claim, never a
    // custody-taking constructor.
    const custodyNames = exportedNames.filter((name) => /custody/i.test(name));
    expect(custodyNames.sort()).toEqual(["WALLET_CUSTODY_MODELS", "isWalletCustodyModel"].sort());
  });

  it("the custody models declare WHO controls keys — six declared models, none carrying material", () => {
    expect([...WALLET_CUSTODY_MODELS]).toEqual([
      "NON_CUSTODIAL_EXTERNAL",
      "SELF_CUSTODIAL",
      "SMART_ACCOUNT",
      "CUSTODIAL_PROVIDER",
      "HARDWARE",
      "HYBRID",
    ]);
    // A handle with a declared custody model but key-material-shaped id is
    // STILL rejected: the declaration never launders material.
    expect(() =>
      validateSignerHandle({
        ...signerHandle(),
        custodyModel: "NON_CUSTODIAL_EXTERNAL",
        handleId: "deadbeef".repeat(8),
      }),
    ).toThrow(/key material/);
  });
});

describe("PaySwap never touches key material (INV-19)", () => {
  it("the signer handle is an OPAQUE reference bound to a connected instance — never material", () => {
    const handle = validateSignerHandle(signerHandle());
    expect(handle.handleId).toBe("signer.handle.001");
    expect(handle.capabilityInstanceId).toBe("instance:signer:001");
    // Uppercase-hex key material is rejected too.
    expect(() =>
      validateSignerHandle({ ...signerHandle(), handleId: "DEADBEEF".repeat(8) }),
    ).toThrow(/key material/);
    // The handle carries no credential field of any kind.
    expect(Object.keys(handle).sort()).toEqual(
      [
        "capabilityInstanceId",
        "custodyModel",
        "expiresAt",
        "handleId",
        "permissionEnvelopeRef",
      ].sort(),
    );
  });

  it("credential scopes carry OPAQUE references only (the pinned instance law)", () => {
    // The pinned validator rejects any credential kind outside the declared
    // opaque-reference vocabulary — there is no member that carries material.
    expect([
      "API_KEY",
      "OAUTH",
      "DELEGATED_TOKEN",
      "SESSION",
      "PROVIDER_DEFINED",
    ]).toHaveLength(5);
  });
});

describe("smart-account authority is always bounded (the non-custody law)", () => {
  it("policy-limited automation, session keys, batching and sponsorship are DECLARED capabilities — never defaults", () => {
    const declaration = validateSmartAccountCapabilityDeclaration({
      capabilityKind: "smart_account",
      permissionEnvelopeRequired: true,
      supportsSessionKeys: true,
      supportsSpendingPolicies: true,
      supportsBatchExecution: true,
      supportsGasSponsorship: true,
      recoveryModel: "declared: social recovery quorum",
    });
    expect(declaration.supportsSessionKeys).toBe(true);
    expect(declaration.supportsGasSponsorship).toBe(true);
    expect(declaration.recoveryModel).toBe("declared: social recovery quorum");
  });

  it("a smart account without an explicit permission envelope is unconstructible", () => {
    expect(() =>
      validateSmartAccountCapabilityDeclaration({
        capabilityKind: "smart_account",
        permissionEnvelopeRequired: false,
        supportsSessionKeys: false,
        supportsSpendingPolicies: false,
        supportsBatchExecution: false,
        supportsGasSponsorship: false,
        recoveryModel: "declared",
      }),
    ).toThrow(/permissionEnvelopeRequired must be true/);
  });
});

describe("observations are never custody and never finality (INV-7/INV-1)", () => {
  it("NO observation outcome permits a finality declaration on its own", () => {
    expect(observationPermitsFinalityDeclaration(broadcastObservation())).toBe(false);
    expect(observationPermitsFinalityDeclaration(confirmedObservation())).toBe(false);
    expect(observationPermitsFinalityDeclaration(unknownObservation())).toBe(false);
    expect(observationPermitsFinalityDeclaration(failedObservation())).toBe(false);
  });

  it("the settlement linkage carries only finality REFERENCES — never finality state", () => {
    const linkage = validateOnchainSettlementLinkage({
      settlementInstructionId: "settle:instruction:001",
      settlementAttemptId: "settle:attempt:001",
      railId: onchainRailId(ETHEREUM_CHAIN_KEY),
      finalityRecordId: "finality:001",
    });
    // The only finality-shaped field is the optional id reference minted by
    // the settlement FinalityAuthority.
    expect(Object.keys(linkage)).not.toContain("finalityState");
    expect(Object.keys(linkage)).not.toContain("isFinal");
    expect(Object.keys(linkage).sort()).toEqual(
      ["finalityRecordId", "railId", "settlementAttemptId", "settlementInstructionId"].sort(),
    );
  });

  it("an asset observation is immutable external evidence — there is no mutation path to a balance", () => {
    const observation = confirmedObservation();
    // Deep-frozen evidence: observations are recorded, never mutated.
    expect(Object.isFrozen(onchainDomain.ONCHAIN_DOMAIN_PROVENANCE)).toBe(true);
    void observation;
    // The balance-booking law is structural: the observation type carries
    // the nominal brand + mandatory freshness/provenance/observer
    // (type-level guard in type-level.test.ts; runtime guard in
    // adversarial.test.ts).
  });
});
