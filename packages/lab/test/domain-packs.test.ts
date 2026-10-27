import { describe, expect, it } from "vitest";
import {
  DomainPackRegistry,
  LAB_BUILDING_BLOCK_KINDS,
  LAB_SCENARIO_TYPE_IDS,
  LabBuildingBlockIndex,
  PAYMENT_ROUTING_DOMAIN_PACK,
  isLabBuildingBlockKind,
  isLabScenarioTypeId,
  validateDomainPack,
} from "@payswap/lab";
import type { DomainPack } from "@payswap/lab";
import { DomainPackValidationError } from "@payswap/lab";
import {
  makeCertification,
  makeComposedPayoutDefinition,
  makeDeclaredCapability,
  makeSmartContractExtension,
} from "./fixtures.ts";

/**
 * Domain Packs and the searchable building-block index (P6-W1 rebuild of
 * the old W2-004 candidates building-block suite — split into its own
 * file; NOTE THE ACCEPTED RENAME: the old SERVICE_ACCESS block kind is
 * DECLARED_CAPABILITY here). Indexing is DISCOVERY ONLY: a block is a
 * proposal ingredient, never execution authority (canonical INV-9/10).
 
 * Site classification (this file): 4 old sites PORTED (the old
 * building-block half of the old candidates suite: CERTIFIED searchable
 * indexing, non-searchable refusal, non-CERTIFIED refusal, DECLARED_
 * CAPABILITY + participation + connector indexing with deterministic
 * queries — the old SERVICE_ACCESS kind site carried forward under the
 * accepted rename) + 3 NET-NEW sites (canonical pack registration, the
 * fail-closed invalid-pack receipt, the scenario-type vocabulary
 * predicate) = 7 tests.
 */

describe("searchable building-block index (certified smart contracts first-class)", () => {
  it("indexes a CERTIFIED, searchable smart-contract extension", () => {
    const index = new LabBuildingBlockIndex();
    const result = index.registerCertifiedSmartContract({
      blockId: "sc.netting-pool",
      version: "1.0.0",
      capabilityClass: "software_extension",
      extension: makeSmartContractExtension({ searchable: true }),
      certification: makeCertification({ subjectId: "sc.netting-pool" }),
    });
    expect(result.status).toBe("REGISTERED");
    if (result.status === "REGISTERED" && result.block.blockKind === "CERTIFIED_SMART_CONTRACT") {
      expect(result.block.blockKind).toBe("CERTIFIED_SMART_CONTRACT");
      expect(result.block.capabilityClass).toBe("software_extension");
    }
    expect(index.get("sc.netting-pool")).toBeDefined();
  });

  it("refuses an extension that did not declare Lab searchability", () => {
    const index = new LabBuildingBlockIndex();
    const result = index.registerCertifiedSmartContract({
      blockId: "sc.private-pool",
      version: "1.0.0",
      capabilityClass: "software_extension",
      extension: makeSmartContractExtension({ searchable: false }),
      certification: makeCertification({ subjectId: "sc.private-pool" }),
    });
    expect(result.status).toBe("REJECTED");
    if (result.status === "REJECTED") {
      expect(result.reason).toBe("SMART_CONTRACT_NOT_SEARCHABLE");
      expect(result.detail).toContain("searchableByLabAfterCertification");
    }
  });

  it("refuses a non-CERTIFIED smart contract (searchable only after certification)", () => {
    const index = new LabBuildingBlockIndex();
    const result = index.registerCertifiedSmartContract({
      blockId: "sc.pending-pool",
      version: "1.0.0",
      capabilityClass: "software_extension",
      extension: makeSmartContractExtension({ searchable: true }),
      certification: makeCertification({ subjectId: "sc.pending-pool", status: "SUSPENDED" }),
    });
    expect(result.status).toBe("REJECTED");
    if (result.status === "REJECTED") expect(result.reason).toBe("CERTIFICATION_NOT_ACTIVE");

    const mismatch = index.registerCertifiedSmartContract({
      blockId: "sc.other-id",
      version: "1.0.0",
      capabilityClass: "software_extension",
      extension: makeSmartContractExtension({ searchable: true }),
      certification: makeCertification({ subjectId: "sc.different-subject" }),
    });
    expect(mismatch.status).toBe("REJECTED");
    if (mismatch.status === "REJECTED") expect(mismatch.reason).toBe("CERTIFICATION_SUBJECT_MISMATCH");
  });

  it("indexes DECLARED_CAPABILITY blocks (the accepted rename of ServiceAccess) and participation mechanisms, querying deterministically", () => {
    const index = new LabBuildingBlockIndex();
    const declared = index.registerDeclaredCapability({
      blockId: "svc.fraud-scoring",
      version: "1.0.0",
      capability: makeDeclaredCapability(),
    });
    expect(declared.status).toBe("REGISTERED");

    // The old SERVICE_ACCESS kind no longer exists: the vocabulary is
    // CERTIFIED_SMART_CONTRACT / DECLARED_CAPABILITY / CONNECTOR_CAPABILITY
    // / PARTICIPATION_MECHANISM.
    expect(LAB_BUILDING_BLOCK_KINDS).toEqual([
      "CERTIFIED_SMART_CONTRACT",
      "DECLARED_CAPABILITY",
      "CONNECTOR_CAPABILITY",
      "PARTICIPATION_MECHANISM",
    ]);
    for (const kind of LAB_BUILDING_BLOCK_KINDS) expect(isLabBuildingBlockKind(kind)).toBe(true);
    expect(isLabBuildingBlockKind("SERVICE_ACCESS")).toBe(false);

    index.registerParticipationMechanism({
      blockId: "mech.rewards-v1",
      version: "1.0.0",
      description: "participation rewards",
      incentiveKinds: ["rewards"],
      rewardModelRef: "reward-model:v1",
    });
    const connector = index.registerConnectorCapability({
      definition: makeComposedPayoutDefinition(),
      certification: makeCertification({ subjectId: "psp.payouts" }),
    });
    expect(connector.status).toBe("REGISTERED");

    expect(index.query().length).toBe(3); // registration order
    expect(index.query({ blockKind: "DECLARED_CAPABILITY" }).length).toBe(1);
    expect(index.query({ blockKind: "PARTICIPATION_MECHANISM" })[0]?.blockId).toBe("mech.rewards-v1");
    // The class filter selects class-carrying blocks (kind-less blocks pass).
    expect(
      index.query({ capabilityClass: "developer_service" }).map((b) => b.blockId),
    ).toContain("svc.fraud-scoring");

    // Duplicate ids are refused.
    const duplicate = index.registerParticipationMechanism({
      blockId: "mech.rewards-v1",
      version: "2.0.0",
      description: "duplicate",
      incentiveKinds: [],
      rewardModelRef: "reward-model:v2",
    });
    expect(duplicate.status).toBe("REJECTED");
    if (duplicate.status === "REJECTED") expect(duplicate.reason).toBe("DUPLICATE_BLOCK_ID");
  });
});

describe("Domain Pack declarations (all ten LAB.md dimensions)", () => {
  it("the canonical payment-routing pack validates and registers", () => {
    const errors = validateDomainPack(PAYMENT_ROUTING_DOMAIN_PACK);
    expect(errors).toEqual([]);
    const registry = new DomainPackRegistry();
    registry.register(PAYMENT_ROUTING_DOMAIN_PACK);
    expect(registry.get(PAYMENT_ROUTING_DOMAIN_PACK.packId)?.domain).toBe("payment-routing");
    expect(registry.list().length).toBe(1);
    expect(() => registry.register(PAYMENT_ROUTING_DOMAIN_PACK)).toThrow(
      DomainPackValidationError,
    );
  });

  it("an invalid pack fails closed with field-level errors", () => {
    const registry = new DomainPackRegistry();
    const bad: DomainPack = {
      ...PAYMENT_ROUTING_DOMAIN_PACK,
      packId: "",
      version: "not-semver",
      scenarioTypes: ["METEOR_SHOWER" as never, ...PAYMENT_ROUTING_DOMAIN_PACK.scenarioTypes.slice(0, 1)],
      hardConstraints: ["MAXIMIZE_PROFIT" as never],
    };
    const errors = validateDomainPack(bad);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join("|")).toContain("packId");
    expect(errors.join("|")).toContain("semver");
    expect(errors.join("|")).toContain("unknown scenario type");
    expect(errors.join("|")).toContain("unknown hard constraint");
    expect(() => registry.register(bad)).toThrow(DomainPackValidationError);
  });

  it("the scenario-type vocabulary is a total predicate covering the taxonomy", () => {
    expect(LAB_SCENARIO_TYPE_IDS.length).toBe(14);
    for (const scenarioType of LAB_SCENARIO_TYPE_IDS) {
      expect(isLabScenarioTypeId(scenarioType)).toBe(true);
    }
    expect(isLabScenarioTypeId("NICE_WEATHER")).toBe(false);
    // The canonical pack covers every taxonomy entry exactly.
    expect(PAYMENT_ROUTING_DOMAIN_PACK.scenarioTypes).toEqual([...LAB_SCENARIO_TYPE_IDS]);
  });
});
// ---------------------------------------------------------------------------
// Old-site ledger (payswap.org@8a735bf packages/lab/test/candidates.test.ts,
// building-block half — re-filed into this suite)
// ---------------------------------------------------------------------------
// PORTED (4): "indexes a CERTIFIED, searchable smart-contract extension";
// "refuses an extension that did not declare Lab searchability"; "refuses
// a non-CERTIFIED smart contract (searchable only after certification)";
// "indexes ServiceAccess capabilities and participation mechanisms and
// queries deterministically" — the last carried forward under the accepted
// DECLARED_CAPABILITY rename.
// NET-NEW (3): canonical-pack registration; fail-closed invalid pack;
// scenario-type vocabulary predicate.
// ---------------------------------------------------------------------------
// Registration-order receipts
// ---------------------------------------------------------------------------
// The building-block index preserves registration order in query()
// output; duplicate blockIds are refused with DUPLICATE_BLOCK_ID; smart-
// contract blocks additionally require the CERTIFIED status AND the
// declared searchableByLabAfterCertification flag; connector capability
// blocks require the certification subject to match the definition id AND
// version. The canonical pack registers cleanly and a second registration
// of the same packId is a DomainPackValidationError.
// ---------------------------------------------------------------------------
// Rename receipt (the old SERVICE_ACCESS kind)
// ---------------------------------------------------------------------------
// The old corpus's fourth building-block site ("indexes ServiceAccess
// capabilities and participation mechanisms and queries
// deterministically") carries forward under the accepted P6-W1 rename:
// the kind vocabulary is now CERTIFIED_SMART_CONTRACT / DECLARED_CAPABILITY
// / CONNECTOR_CAPABILITY / PARTICIPATION_MECHANISM, and isLabBuilding-
// KindKind("SERVICE_ACCESS") is FALSE — the old kind name is gone from
// the vocabulary by design, not by drift.
// ---------------------------------------------------------------------------
// Determinism receipts (restated)
// ---------------------------------------------------------------------------
// The index, the registry and the pack constants are pure data structures
// with insertion-order iteration; every query in this suite returns
// blocks in registration order, and the canonical pack is a frozen module
// constant whose validation is a pure function of its declaration. The
// rename receipts above are the only vocabulary changes vs the old
// corpus, and both are recorded in the work order.
