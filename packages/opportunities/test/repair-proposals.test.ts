import { describe, expect, it } from "vitest";
import { REPAIR_OPERATORS } from "../src/repair-operators.ts";
import type { RepairExclusionFact } from "../src/repair-facts.ts";
import {
  MODEL_PROPOSAL_REJECTION_CODES,
  ModelProposalError,
  ModelProposalPortUnboundError,
  assertModelProposalIsAdvisory,
  modelProposalId,
  modelProposalsPermitExecution,
  requireModelProposalPort,
  unboundModelProposalPort,
} from "../src/repair-proposals.ts";
import { validateModelProposal } from "../src/repair-proposal-validation.ts";
import { foldModelProposals, validateModelProposals } from "../src/repair-proposal-fold.ts";
import type {
  ModelProposal,
  ModelProposalEvidenceRef,
  ModelProposalRequest,
} from "../src/repair-proposals.ts";

/**
 * The bounded, grounded model-proposal interface (P23-A, ADR-0015 D6): a
 * model may PROPOSE repair candidates; it can never invent repair kinds,
 * eligibility or authority. Laws pinned here: the fail-closed UNBOUND port
 * (the honest empty deployment note, verbatim); the four A.8 rejection
 * codes — MODEL_PROPOSAL_UNGROUNDED (every cited fact must match an input
 * fact), MODEL_PROPOSAL_OUT_OF_VOCABULARY (operator + party change in the
 * frozen vocabularies), MODEL_PROPOSAL_COMMAND_SHAPE (the pinned marker
 * scan at every depth), MODEL_PROPOSAL_BUDGET_EXCEEDED (the malformed
 * budget); the honest truncation receipts; the dedup-fold laws; the exact
 * NOTHING-ELSE shape; ADVISORY ONLY.
 */
describe("the bounded, grounded model-proposal interface (ADR-0015 D6)", () => {
  const AT = 1_735_689_600_000;

  const facts: readonly RepairExclusionFact[] = [
    {
      side: "SENDER",
      routeId: "route:sender-1",
      code: "SOURCE_COUNTRY_NOT_SERVED",
      message: "the source country is not served by this rail",
    },
    {
      side: "RECIPIENT",
      routeId: "route:recipient-1",
      code: "FUNDING_METHOD_NOT_SERVED",
      message: "the funding method is not served by the receiving rail's restriction sets",
      fundingMethod: "flutterwave_wallet",
    },
  ];

  function request(overrides?: Partial<ModelProposalRequest>): ModelProposalRequest {
    return {
      facts,
      catalogue: REPAIR_OPERATORS,
      maxProposals: 3,
      at: AT,
      ...overrides,
    };
  }

  type ProposalOverrides = {
    [K in keyof Omit<ModelProposal, "proposalId">]?: Omit<ModelProposal, "proposalId">[K] | undefined;
  };

  function proposal(overrides?: ProposalOverrides): ModelProposal {
    const base: ProposalOverrides = {
      operatorId: "repair:recipient-enables-served-funding-method",
      partyChange: "ENABLES_COMPATIBLE_RECEIVING_METHOD",
      rationale: "the recipient-side funding-method decline names the gap; enabling a served receiving method answers it",
      evidenceCited: [{ code: "FUNDING_METHOD_NOT_SERVED", routeId: "route:recipient-1" }],
      provenance: { source: "MODEL_PROPOSAL", modelId: "model:scripted-1", proposedAt: AT - 1_000 },
      ...overrides,
    };
    const partyChange = base.partyChange;
    const core = {
      operatorId: base.operatorId ?? "",
      rationale: base.rationale ?? "",
      evidenceCited: base.evidenceCited ?? [],
      provenance: base.provenance ?? { source: "MODEL_PROPOSAL", modelId: "", proposedAt: 0 },
    };
    return {
      proposalId: modelProposalId(core.operatorId, core.evidenceCited, partyChange),
      operatorId: core.operatorId,
      rationale: core.rationale,
      evidenceCited: core.evidenceCited,
      provenance: core.provenance,
      ...(partyChange !== undefined ? { partyChange } : {}),
    };
  }

  it("the unbound port throws the typed error naming the seam (the honest empty deployment, verbatim)", () => {
    const port = unboundModelProposalPort();
    expect(() => port.propose(request())).toThrow(ModelProposalPortUnboundError);
    expect(() => port.propose(request())).toThrow(/the model-proposal interface is not bound/);
    expect(() => port.propose(request())).toThrow(/no configured session model/);
    expect(() => port.propose(request())).toThrow(/never a fabricated proposal/);
    expect(() => requireModelProposalPort(null)).toThrow(ModelProposalPortUnboundError);
    expect(() => requireModelProposalPort({})).toThrow(ModelProposalPortUnboundError);
  });

  it("the A.8 rejection-code vocabulary is the frozen four", () => {
    expect(Object.isFrozen(MODEL_PROPOSAL_REJECTION_CODES)).toBe(true);
    expect([...MODEL_PROPOSAL_REJECTION_CODES]).toEqual([
      "MODEL_PROPOSAL_UNGROUNDED",
      "MODEL_PROPOSAL_OUT_OF_VOCABULARY",
      "MODEL_PROPOSAL_COMMAND_SHAPE",
      "MODEL_PROPOSAL_BUDGET_EXCEEDED",
    ]);
  });

  it("validates a well-formed grounded proposal (frozen round-trip, deterministic id)", () => {
    const validated = validateModelProposal(proposal(), request());
    expect(validated).toEqual(proposal());
    expect(JSON.stringify(validated)).toBe(JSON.stringify(proposal()));
    expect(validated.proposalId).toBe(
      modelProposalId("repair:recipient-enables-served-funding-method", [{ code: "FUNDING_METHOD_NOT_SERVED", routeId: "route:recipient-1" }], "ENABLES_COMPATIBLE_RECEIVING_METHOD"),
    );
    expect(validated.provenance.source).toBe("MODEL_PROPOSAL");
    expect(Object.isFrozen(validated)).toBe(true);
    expect(Object.isFrozen(validated.evidenceCited)).toBe(true);
    // Determinism: repeated validation is byte-identical.
    expect(JSON.stringify(validateModelProposal(proposal(), request()))).toBe(JSON.stringify(validated));
  });

  it("(a) GROUNDED: an uncited or mismatched fact is MODEL_PROPOSAL_UNGROUNDED", () => {
    const mismatchedRoute = proposal({
      evidenceCited: [{ code: "FUNDING_METHOD_NOT_SERVED", routeId: "route:recipient-999" }],
    });
    expect(() => validateModelProposal(mismatchedRoute, request())).toThrow(ModelProposalError);
    expect(errorOf(mismatchedRoute)).toBe("MODEL_PROPOSAL_UNGROUNDED");
    // A real code over the wrong route is still ungrounded.
    const wrongPairing = proposal({
      evidenceCited: [{ code: "SOURCE_COUNTRY_NOT_SERVED", routeId: "route:recipient-1" }],
    });
    expect(errorOf(wrongPairing)).toBe("MODEL_PROPOSAL_UNGROUNDED");
    // Empty citations ground nothing.
    const empty = proposal({ evidenceCited: [] });
    expect(errorOf(empty)).toBe("MODEL_PROPOSAL_UNGROUNDED");
    // A code outside the pinned 26 is not a fact at all.
    const alien = proposal({
      evidenceCited: [{ code: "NOT_A_CODE" as ModelProposalEvidenceRef["code"], routeId: "route:recipient-1" }],
    });
    expect(errorOf(alien)).toBe("MODEL_PROPOSAL_UNGROUNDED");
  });

  it("(b) VOCABULARY: an invented operator or party change is MODEL_PROPOSAL_OUT_OF_VOCABULARY", () => {
    const invented = proposal({ operatorId: "repair:invented-operator" });
    expect(() => validateModelProposal(invented, request())).toThrow(ModelProposalError);
    expect(errorOf(invented)).toBe("MODEL_PROPOSAL_OUT_OF_VOCABULARY");
    // A genuine catalogue member absent from the REQUEST's catalogue snapshot is still out of vocabulary.
    const snapshotWithoutIt = request({
      catalogue: REPAIR_OPERATORS.filter((operator) => operator.operatorId !== "repair:recipient-enables-served-funding-method"),
    });
    expect(() => validateModelProposal(proposal(), snapshotWithoutIt)).toThrow(ModelProposalError);
    expect(errorOf(proposal(), snapshotWithoutIt)).toBe("MODEL_PROPOSAL_OUT_OF_VOCABULARY");
    // A party change outside the grown vocabulary.
    const foreignChange = proposal({ partyChange: "ENABLES_A_RAIL" as ModelProposal["partyChange"] });
    expect(errorOf(foreignChange)).toBe("MODEL_PROPOSAL_OUT_OF_VOCABULARY");
    // A catalogue snapshot carrying a foreign operator is itself rejected.
    expect(() =>
      validateModelProposal(proposal(), request({ catalogue: [...REPAIR_OPERATORS, null as never] })),
    ).toThrow(ModelProposalError);
  });

  it("(c) MARKER-SCAN: a proposal smuggling an authorization field is MODEL_PROPOSAL_COMMAND_SHAPE", () => {
    const smuggled = {
      ...proposal(),
      authorization: { status: "ACTIVE" },
    } as unknown as ModelProposal;
    expect(() => validateModelProposal(smuggled, request())).toThrow(ModelProposalError);
    expect(errorOf(smuggled)).toBe("MODEL_PROPOSAL_COMMAND_SHAPE");
    // At depth: inside a cited evidence entry.
    const nested = {
      ...proposal(),
      evidenceCited: [
        { code: "FUNDING_METHOD_NOT_SERVED", routeId: "route:recipient-1", mandateRef: "mandate:smuggled" },
      ],
    } as unknown as ModelProposal;
    expect(errorOf(nested)).toBe("MODEL_PROPOSAL_COMMAND_SHAPE");
    // Inside the provenance.
    const inProvenance = {
      ...proposal(),
      provenance: { source: "MODEL_PROPOSAL", modelId: "model:scripted-1", proposedAt: AT - 1, signature: "0xabc" },
    } as unknown as ModelProposal;
    expect(errorOf(inProvenance)).toBe("MODEL_PROPOSAL_COMMAND_SHAPE");
  });

  it("(d) BUDGET: a malformed budget is MODEL_PROPOSAL_BUDGET_EXCEEDED; an honest overflow truncates with a receipt", () => {
    expect(() => validateModelProposal(proposal(), request({ maxProposals: 0 }))).toThrow(ModelProposalError);
    expect(errorOf(proposal(), request({ maxProposals: 0 }))).toBe("MODEL_PROPOSAL_BUDGET_EXCEEDED");
    expect(errorOf(proposal(), request({ maxProposals: -1 }))).toBe("MODEL_PROPOSAL_BUDGET_EXCEEDED");
    expect(() => validateModelProposal(proposal(), request({ maxProposals: 1.5 }))).toThrow(ModelProposalError);

    // The set path: THREE valid proposals against a budget of two.
    const three: readonly ModelProposal[] = [
      proposal(),
      proposal({
        operatorId: "repair:sender-completes-provider-permissions",
        partyChange: "COMPLETES_PROVIDER_PERMISSIONS",
        rationale: "the missing-permissions facts name the grant the sender must complete",
        evidenceCited: [{ code: "SOURCE_COUNTRY_NOT_SERVED", routeId: "route:sender-1" }],
      }),
      proposal({
        operatorId: "platform:provider-integration",
        partyChange: undefined,
        rationale: "the served-set exclusions name the provider-integration gap",
        evidenceCited: [{ code: "SOURCE_COUNTRY_NOT_SERVED", routeId: "route:sender-1" }],
      }),
    ];
    const validated = validateModelProposals(three, request({ maxProposals: 2 }));
    expect(validated.proposals).toHaveLength(2);
    expect(validated.proposals.map((entry) => entry.operatorId)).toEqual([
      "repair:recipient-enables-served-funding-method",
      "repair:sender-completes-provider-permissions",
    ]);
    expect(validated.budget).toBe(2);
    expect(validated.truncationReceipt).toBeDefined();
    expect(validated.truncationReceipt?.returnedCount).toBe(3);
    expect(validated.truncationReceipt?.keptCount).toBe(2);
    expect(validated.truncationReceipt?.droppedCount).toBe(1);
    expect(validated.truncationReceipt?.note).toMatch(/honest truncation/);
    expect(validated.advisoryOnly).toBe(true);
    expect(validated.permitsExecution).toBe(false);
    // Within budget: no receipt at all.
    const within = validateModelProposals(three.slice(0, 2), request({ maxProposals: 3 }));
    expect(within.proposals).toHaveLength(2);
    expect(within.truncationReceipt).toBeUndefined();
    // Determinism.
    expect(JSON.stringify(validateModelProposals(three, request({ maxProposals: 2 })))).toBe(
      JSON.stringify(validated),
    );
  });

  it("the NOTHING-ELSE shape: unknown fields are rejected (no eligibility, no authority)", () => {
    const withEligibility = { ...proposal(), eligibility: true } as unknown as ModelProposal;
    expect(() => validateModelProposal(withEligibility, request())).toThrow(ModelProposalError);
    expect([...MODEL_PROPOSAL_REJECTION_CODES]).not.toContain(errorOf(withEligibility));
    const withAuthorityHint = { ...proposal(), eligible: true } as unknown as ModelProposal;
    expect(() => validateModelProposal(withAuthorityHint, request())).toThrow(ModelProposalError);
    expect([...MODEL_PROPOSAL_REJECTION_CODES]).not.toContain(errorOf(withAuthorityHint));
  });

  it("a forged proposalId never validates (the identity is the deterministic derivation)", () => {
    const forged = { ...proposal(), proposalId: "model-proposal:forged" };
    expect(() => validateModelProposal(forged, request())).toThrow(ModelProposalError);
    expect(() => validateModelProposal(forged, request())).toThrow(/deterministic/);
  });

  it("the provenance law: source must be MODEL_PROPOSAL with a non-empty modelId and a caller-stampable instant", () => {
    const wrongSource = {
      ...proposal(),
      provenance: { source: "DETERMINISTIC", modelId: "model:scripted-1", proposedAt: AT - 1 },
    } as unknown as ModelProposal;
    expect(() => validateModelProposal(wrongSource, request())).toThrow(ModelProposalError);
    const emptyModel = {
      ...proposal(),
      provenance: { source: "MODEL_PROPOSAL", modelId: "", proposedAt: AT - 1 },
    } as unknown as ModelProposal;
    expect(() => validateModelProposal(emptyModel, request())).toThrow(ModelProposalError);
  });

  it("the rationale is vocabulary-scanned (a model claiming guarantees fails closed)", () => {
    const guaranteed = proposal({ rationale: "this repair is guaranteed to make the corridor real" });
    expect(() => validateModelProposal(guaranteed, request())).toThrow(/no-guaranteed-returns/);
  });

  it("structural fail-closed: non-object proposals and malformed requests never validate", () => {
    expect(() => validateModelProposal(null, request())).toThrow(ModelProposalError);
    expect(() => validateModelProposal("a string" as never, request())).toThrow(ModelProposalError);
    expect(() => validateModelProposal({ ...proposal(), rationale: "" }, request())).toThrow(ModelProposalError);
    expect(() => validateModelProposal({ ...proposal(), operatorId: "" }, request())).toThrow(ModelProposalError);
    expect(() => validateModelProposal(proposal(), null as never)).toThrow(ModelProposalError);
    expect(() => validateModelProposal(proposal(), request({ facts: "nope" as never }))).toThrow(ModelProposalError);
    expect(() => validateModelProposal(proposal(), request({ at: -1 }))).toThrow(ModelProposalError);
  });

  it("(e) DEDUP: foldModelProposals folds, novels and duplicates exactly", () => {
    const deterministic = ["repair:recipient-enables-served-funding-method"];
    const corroborating = proposal();
    const novel = proposal({
      operatorId: "repair:sender-completes-provider-permissions",
      partyChange: "COMPLETES_PROVIDER_PERMISSIONS",
      rationale: "the sender completes the provider permissions the facts name",
      evidenceCited: [{ code: "SOURCE_COUNTRY_NOT_SERVED", routeId: "route:sender-1" }],
    });
    const duplicate = proposal({
      operatorId: "repair:sender-completes-provider-permissions",
      partyChange: "COMPLETES_PROVIDER_PERMISSIONS",
      rationale: "a second model proposal of the same operator and party change",
      evidenceCited: [{ code: "SOURCE_COUNTRY_NOT_SERVED", routeId: "route:sender-1" }],
    });
    const distinctChange = proposal({
      operatorId: "repair:sender-completes-provider-permissions",
      partyChange: undefined,
      rationale: "the same operator without a party change is a distinct key",
      evidenceCited: [{ code: "SOURCE_COUNTRY_NOT_SERVED", routeId: "route:sender-1" }],
    });
    const fold = foldModelProposals([corroborating, novel, duplicate, distinctChange], deterministic);
    expect(fold.folded).toHaveLength(1);
    expect(fold.folded[0]?.operatorId).toBe("repair:recipient-enables-served-funding-method");
    expect(fold.folded[0]?.partyChanges).toEqual(["ENABLES_COMPATIBLE_RECEIVING_METHOD"]);
    expect(fold.folded[0]?.corroboration).toEqual([corroborating.provenance]);
    expect(fold.novel).toHaveLength(2);
    expect(fold.novel.map((entry) => entry.rationale)).toEqual([novel.rationale, distinctChange.rationale]);
    expect(fold.duplicates).toHaveLength(1);
    expect(fold.duplicates[0]?.rationale).toBe(duplicate.rationale);
    expect(Object.isFrozen(fold.folded)).toBe(true);
    // Empty deterministic set: everything is novel or an in-batch duplicate.
    const noDeterministic = foldModelProposals([novel, duplicate], []);
    expect(noDeterministic.folded).toEqual([]);
    expect(noDeterministic.novel).toHaveLength(1);
    expect(noDeterministic.duplicates).toHaveLength(1);
    // Fail closed: a deterministic id outside the catalogue, a malformed proposal.
    expect(() => foldModelProposals([novel], ["repair:not-a-catalogue-operator"])).toThrow(ModelProposalError);
    expect(() => foldModelProposals([null as never], [])).toThrow(ModelProposalError);
    expect(() => foldModelProposals([novel], [""])).toThrow(ModelProposalError);
  });

  it("is ADVISORY ONLY: the permits literal is false and the marker-scan assertion is the export", () => {
    expect(modelProposalsPermitExecution()).toBe(false);
    expect(() => assertModelProposalIsAdvisory(proposal())).not.toThrow();
    expect(() =>
      assertModelProposalIsAdvisory({ ...proposal(), mandate: { id: "m" } }),
    ).toThrow(/protocol command field/);
  });

  /** Captures the typed rejection code of a single-proposal validation (fail-closed helper). */
  function errorOf(candidate: ModelProposal, against: ModelProposalRequest = request()): string | undefined {
    try {
      validateModelProposal(candidate, against);
    } catch (error) {
      if (error instanceof ModelProposalError) {
        return error.rejectionCode;
      }
      return `UNEXPECTED_ERROR_TYPE:${error instanceof Error ? error.name : String(error)}`;
    }
    return undefined;
  }
});
