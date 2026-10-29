/**
 * @payswap/opportunities — the model-proposal VALIDATION (P23-A, lane A;
 * ADR-0015 D6): the STRICT single-proposal contract, split from
 * ./repair-proposals.ts under the 400-line file law (the
 * ./conditional-validation.ts precedent). Fail-closed on every dimension:
 * the request (facts, catalogue snapshot, budget, instant), the proposal
 * (marker-scan FIRST, the exact NOTHING-ELSE shape, the frozen
 * vocabularies, the grounding of every citation, the A.8 provenance, the
 * deterministic identity). The budget/dedup fold over VALIDATED proposals
 * lives in ./repair-proposal-fold.ts.
 */

import { deepFreeze } from "./canonical.ts";
import { isPinnedCorridorExclusionCode } from "./pins/capability.ts";
import { repairOperatorById } from "./repair-operators.ts";
import type { RepairOperator } from "./repair-operators.ts";
import { validateRepairExclusionFacts } from "./repair-facts.ts";
import type { RepairExclusionFact } from "./repair-facts.ts";
import { isConditionalPartyChange } from "./conditional.ts";
import type { ConditionalPartyChange } from "./conditional.ts";
import { pinnedAssertNotProtocolCommand } from "./pins/agents.ts";
import { assertNoGuaranteeLanguage } from "./vocabulary.ts";
import { assertNoSecretMaterial } from "./secret-free.ts";
import {
  MAX_MODEL_PROPOSAL_RATIONALE_LENGTH,
  ModelProposalError,
  modelProposalId,
} from "./repair-proposals.ts";
import type {
  ModelProposal,
  ModelProposalEvidenceRef,
  ModelProposalRequest,
} from "./repair-proposals.ts";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** The exact-key law: required keys present, no unknown key (NOTHING ELSE). */
function requireExactKeySet(
  record: Readonly<Record<string, unknown>>,
  required: readonly string[],
  optional: readonly string[],
  subject: string,
): void {
  const allowed = new Set([...required, ...optional]);
  const actual = Object.keys(record);
  const unknown = actual.filter((key) => !allowed.has(key));
  const missing = required.filter((key) => !(key in record));
  if (unknown.length > 0 || missing.length > 0) {
    const parts: string[] = [];
    if (missing.length > 0) {
      parts.push(`is missing [${missing.join(", ")}]`);
    }
    if (unknown.length > 0) {
      parts.push(`carries the unknown fields [${unknown.join(", ")}]`);
    }
    throw new ModelProposalError(
      `${subject} ${parts.join(" and ")} — the shape is exactly [${[...required, ...optional].join(", ")}] (NOTHING ELSE: no eligibility, no authority, no command shape)`,
    );
  }
}

/**
 * Fail-closed request validation: the grounded facts (the shared fact
 * law), the catalogue snapshot (non-empty, every member a frozen
 * catalogue member), the budget (a positive integer — a malformed budget
 * carries the MODEL_PROPOSAL_BUDGET_EXCEEDED rejection because every
 * proposal is malformed against it) and the caller-supplied instant.
 */
export function validateModelProposalRequest(candidate: unknown): ModelProposalRequest {
  if (candidate === null || typeof candidate !== "object") {
    throw new ModelProposalError("a model-proposal request must be an object { facts, catalogue, maxProposals, at }");
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  requireExactKeySet(record, ["facts", "catalogue", "maxProposals", "at"], [], "a model-proposal request");
  let facts: readonly RepairExclusionFact[];
  try {
    facts = validateRepairExclusionFacts(record["facts"]);
  } catch (error) {
    throw new ModelProposalError(
      `the request's grounded exclusion facts are malformed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const catalogue = record["catalogue"];
  if (!Array.isArray(catalogue) || catalogue.length === 0) {
    throw new ModelProposalError("the request's catalogue snapshot must be a NON-EMPTY array of repair operators (the model proposes within the frozen catalogue)");
  }
  for (let index = 0; index < catalogue.length; index += 1) {
    const entry = catalogue[index];
    const operatorId = (entry as Partial<RepairOperator> | null)?.operatorId;
    if (entry === null || typeof entry !== "object" || repairOperatorById(String(operatorId)) === null) {
      throw new ModelProposalError(
        `the request's catalogue snapshot carries a foreign entry at [${String(index)}] — every snapshot member must be a frozen repair-operator catalogue member`,
      );
    }
  }
  const maxProposals = record["maxProposals"];
  if (typeof maxProposals !== "number" || !Number.isSafeInteger(maxProposals) || maxProposals < 1) {
    throw new ModelProposalError(
      "maxProposals must be a positive integer (the difficulty budget) — a malformed budget makes every proposal malformed against it",
      { rejectionCode: "MODEL_PROPOSAL_BUDGET_EXCEEDED" },
    );
  }
  const at = record["at"];
  if (typeof at !== "number" || !Number.isSafeInteger(at) || at < 0) {
    throw new ModelProposalError("the request instant `at` must be a non-negative integer (caller-supplied; no ambient clock)");
  }
  return { facts, catalogue: catalogue as readonly RepairOperator[], maxProposals, at };
}

/**
 * THE single-proposal validation (deterministic, fail-closed): grounds
 * every citation in the request's facts, checks the operator and party
 * change against the frozen vocabularies, marker-scans at every depth,
 * enforces the exact NOTHING-ELSE shape, enforces the deterministic id and
 * returns a NEW deep-frozen record (the caller's original is never
 * trusted, never returned).
 */
export function validateModelProposal(proposal: unknown, request: ModelProposalRequest): ModelProposal {
  const validatedRequest = validateModelProposalRequest(request);
  if (proposal === null || typeof proposal !== "object") {
    throw new ModelProposalError("a model proposal must be an object");
  }
  // (c) THE MARKER-SCAN FIRST: command/authority shape fails closed before
  // any field is read (a smuggled field never reaches validation).
  try {
    pinnedAssertNotProtocolCommand(proposal);
  } catch (error) {
    throw new ModelProposalError(
      `the proposal carries command/authority shape at some depth — ${error instanceof Error ? error.message : String(error)}`,
      { rejectionCode: "MODEL_PROPOSAL_COMMAND_SHAPE" },
    );
  }
  const record = proposal as Readonly<Record<string, unknown>>;
  requireExactKeySet(
    record,
    ["proposalId", "operatorId", "rationale", "evidenceCited", "provenance"],
    ["partyChange"],
    "a model proposal",
  );
  if (!isNonEmptyString(record["proposalId"])) {
    throw new ModelProposalError("proposalId must be a non-empty string (the deterministic identity)");
  }
  // (b) VOCABULARY: the operator must be a member of BOTH the request's
  // catalogue snapshot and the frozen catalogue (they coincide in every
  // honest deployment).
  const operatorId = record["operatorId"];
  const inSnapshot =
    typeof operatorId === "string" &&
    validatedRequest.catalogue.some((entry) => entry.operatorId === operatorId);
  if (!isNonEmptyString(operatorId) || !inSnapshot || repairOperatorById(String(operatorId)) === null) {
    throw new ModelProposalError(
      `operator '${String(operatorId)}' is not a member of the frozen repair-operator catalogue (the snapshot the model saw) — models propose within the vocabulary, never invent repair kinds`,
      { rejectionCode: "MODEL_PROPOSAL_OUT_OF_VOCABULARY" },
    );
  }
  const partyChange = record["partyChange"];
  if (partyChange !== undefined && !isConditionalPartyChange(partyChange)) {
    throw new ModelProposalError(
      `party change '${String(partyChange)}' is not a member of the closed conditional party-change vocabulary — models propose within the vocabulary`,
      { rejectionCode: "MODEL_PROPOSAL_OUT_OF_VOCABULARY" },
    );
  }
  const rationale = record["rationale"];
  if (!isNonEmptyString(rationale) || rationale.length > MAX_MODEL_PROPOSAL_RATIONALE_LENGTH) {
    throw new ModelProposalError(
      `rationale must be a non-empty string of at most ${String(MAX_MODEL_PROPOSAL_RATIONALE_LENGTH)} characters`,
    );
  }
  assertNoGuaranteeLanguage(rationale, "model proposal rationale");
  // (a) GROUNDED: every citation must match an input fact (code + routeId).
  const evidenceCited = record["evidenceCited"];
  if (!Array.isArray(evidenceCited) || evidenceCited.length === 0) {
    throw new ModelProposalError(
      "evidenceCited must be a NON-EMPTY array of { code, routeId } citations — a proposal citing nothing answers nothing",
      { rejectionCode: "MODEL_PROPOSAL_UNGROUNDED" },
    );
  }
  const citations: ModelProposalEvidenceRef[] = [];
  for (let index = 0; index < evidenceCited.length; index += 1) {
    const entry = evidenceCited[index];
    if (entry === null || typeof entry !== "object") {
      throw new ModelProposalError(
        `evidenceCited[${String(index)}] must be a { code, routeId } citation`,
        { rejectionCode: "MODEL_PROPOSAL_UNGROUNDED" },
      );
    }
    const citation = entry as Readonly<Record<string, unknown>>;
    requireExactKeySet(citation, ["code", "routeId"], [], `evidenceCited[${String(index)}]`);
    if (!isPinnedCorridorExclusionCode(citation["code"]) || !isNonEmptyString(citation["routeId"])) {
      throw new ModelProposalError(
        `evidenceCited[${String(index)}] cites '${String(citation["code"])}' over '${String(citation["routeId"])}' — the code must be one of the pinned 26 and the route non-empty`,
        { rejectionCode: "MODEL_PROPOSAL_UNGROUNDED" },
      );
    }
    const code = citation["code"] as RepairExclusionFact["code"];
    const routeId = citation["routeId"] as string;
    const matches = validatedRequest.facts.some((fact) => fact.code === code && fact.routeId === routeId);
    if (!matches) {
      throw new ModelProposalError(
        `evidenceCited[${String(index)}] cites '${code}' over '${routeId}' — NO input fact carries that code+routeId pair; a proposal may cite only the exclusion facts it answers`,
        { rejectionCode: "MODEL_PROPOSAL_UNGROUNDED" },
      );
    }
    citations.push({ code, routeId });
  }
  const provenance = record["provenance"];
  if (provenance === null || typeof provenance !== "object") {
    throw new ModelProposalError("provenance must be { source, modelId, proposedAt } (the A.8 provenance is mandatory)");
  }
  const provenanceRecord = provenance as Readonly<Record<string, unknown>>;
  requireExactKeySet(provenanceRecord, ["source", "modelId", "proposedAt"], [], "provenance");
  if (provenanceRecord["source"] !== "MODEL_PROPOSAL" || !isNonEmptyString(provenanceRecord["modelId"])) {
    throw new ModelProposalError(
      "provenance.source must be 'MODEL_PROPOSAL' and provenance.modelId a non-empty string (WHO proposed, honestly)",
    );
  }
  const proposedAt = provenanceRecord["proposedAt"];
  if (typeof proposedAt !== "number" || !Number.isSafeInteger(proposedAt) || proposedAt < 0) {
    throw new ModelProposalError("provenance.proposedAt must be a non-negative integer (the model's stamp, never an ambient clock)");
  }
  // The identity law: the id IS the deterministic derivation (a forged id
  // never validates).
  const expectedId = modelProposalId(
    operatorId as string,
    citations,
    partyChange as ConditionalPartyChange | undefined,
  );
  if (record["proposalId"] !== expectedId) {
    throw new ModelProposalError(
      `proposalId must be the deterministic derivation '${expectedId}' (see modelProposalId) — a forged identity never validates`,
    );
  }
  const built: ModelProposal = {
    proposalId: expectedId,
    operatorId: operatorId as string,
    rationale,
    evidenceCited: Object.freeze(citations.map((citation) => Object.freeze({ ...citation }))),
    provenance: Object.freeze({
      source: "MODEL_PROPOSAL",
      modelId: provenanceRecord["modelId"],
      proposedAt,
    }),
    ...(partyChange !== undefined ? { partyChange: partyChange as ConditionalPartyChange } : {}),
  };
  pinnedAssertNotProtocolCommand(built);
  assertNoSecretMaterial(built, `model proposal '${built.proposalId}'`);
  return deepFreeze(built);
}
