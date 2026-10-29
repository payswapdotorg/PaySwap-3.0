/**
 * @payswap/opportunities — the model-proposal BUDGET + DEDUP FOLD (P23-A,
 * lane A; ADR-0015 D6 (d)/(e)), split from ./repair-proposals.ts under
 * the 400-line file law: the SET validation over a port's returned
 * proposals and the fold against the deterministic derivation output.
 *
 * LAWS:
 * - BUDGET: at most maxProposals surface; an honest overflow TRUNCATES
 *   (the FIRST maxProposals in input order are kept) WITH a truncation
 *   receipt naming the returned/kept/dropped counts — never a silent
 *   loss, never a typed failure for the honest overflow (the malformed
 *   budget is the BUDGET_EXCEEDED case, owned by the single-proposal
 *   validation).
 * - DEDUP: a proposal whose operator matches a DETERMINISTIC derivation
 *   output FOLDS into it (the corroboration provenance records the
 *   model's agreement, never a duplicate card); a later proposal whose
 *   operatorId+partyChange repeats an earlier NON-folded one is a
 *   duplicate; everything else is novel.
 */

import { ModelProposalError } from "./repair-proposals.ts";
import type {
  ModelProposal,
  ModelProposalProvenance,
  ModelProposalRequest,
} from "./repair-proposals.ts";
import { validateModelProposal, validateModelProposalRequest } from "./repair-proposal-validation.ts";
import { repairOperatorById } from "./repair-operators.ts";
import type { ConditionalPartyChange } from "./conditional.ts";
import { isConditionalPartyChange } from "./conditional.ts";

/** The honest truncation receipt (present iff the port returned more than the budget). */
export interface ModelProposalTruncationReceipt {
  readonly returnedCount: number;
  readonly keptCount: number;
  readonly droppedCount: number;
  readonly note: string;
}

/** The set-validation result: the kept VALIDATED proposals + the honest receipt. */
export interface ValidatedModelProposals {
  readonly proposals: readonly ModelProposal[];
  readonly budget: number;
  /** Present iff the port returned more than the budget (the honest truncation receipt). */
  readonly truncationReceipt?: Readonly<ModelProposalTruncationReceipt>;
  readonly advisoryOnly: true;
  readonly permitsExecution: false;
}

/**
 * THE set validation (deterministic, fail-closed): validates the request,
 * keeps the FIRST maxProposals in input order (the budget bounds the
 * surfaced work — the dropped ones are honestly receipted, never
 * silently lost), validates every KEPT proposal through the full
 * single-proposal contract and returns the frozen advisory record.
 */
export function validateModelProposals(
  proposals: readonly ModelProposal[],
  request: ModelProposalRequest,
): ValidatedModelProposals {
  const validatedRequest = validateModelProposalRequest(request);
  if (!Array.isArray(proposals as unknown)) {
    throw new ModelProposalError("the port's proposals must be an array (readonly ModelProposal[])");
  }
  const returnedCount = proposals.length;
  const kept = proposals.slice(0, validatedRequest.maxProposals);
  const validated = Object.freeze(kept.map((proposal) => validateModelProposal(proposal, request)));
  const droppedCount = returnedCount - validated.length;
  const base: ValidatedModelProposals = {
    proposals: validated,
    budget: validatedRequest.maxProposals,
    advisoryOnly: true,
    permitsExecution: false,
  };
  if (droppedCount > 0) {
    return Object.freeze({
      ...base,
      truncationReceipt: Object.freeze({
        returnedCount,
        keptCount: validated.length,
        droppedCount,
        note: `the port returned ${String(returnedCount)} proposals against the budget of ${String(validatedRequest.maxProposals)} — the first ${String(validated.length)} in input order are kept and ${String(droppedCount)} are dropped: an honest truncation, never a silent loss`,
      }),
    });
  }
  return Object.freeze(base);
}

/**
 * One folded proposal group: the DETERMINISTIC operator the proposals
 * corroborate, the distinct party-change members they carried (sorted,
 * unique) and the corroborating model provenance (input order).
 */
export interface FoldedModelProposal {
  readonly operatorId: string;
  readonly partyChanges: readonly ConditionalPartyChange[];
  readonly corroboration: readonly Readonly<ModelProposalProvenance>[];
}

/** The fold outcome: folded (with corroboration), novel, duplicates. */
export interface ModelProposalFold {
  /** Proposals whose operator already has a deterministic derivation — folded, never a duplicate card. */
  readonly folded: readonly FoldedModelProposal[];
  /** Proposals for operators with NO deterministic derivation (still validation-gated upstream). */
  readonly novel: readonly ModelProposal[];
  /** In-batch duplicates: a later proposal whose operatorId+partyChange repeats an earlier non-folded one. */
  readonly duplicates: readonly ModelProposal[];
}

function proposalFoldKey(operatorId: string, partyChange: unknown): string {
  return typeof partyChange === "string" ? `${operatorId}:${partyChange}` : operatorId;
}

function provenanceOf(proposal: unknown): Readonly<ModelProposalProvenance> {
  const provenance = (proposal as Partial<ModelProposal>)?.provenance;
  if (
    provenance === null || typeof provenance !== "object" ||
    provenance.source !== "MODEL_PROPOSAL" ||
    typeof provenance.modelId !== "string" || provenance.modelId.length === 0 ||
    typeof provenance.proposedAt !== "number" || !Number.isSafeInteger(provenance.proposedAt) || provenance.proposedAt < 0
  ) {
    throw new ModelProposalError(
      "a folded proposal must carry the A.8 provenance { source: 'MODEL_PROPOSAL', modelId, proposedAt } (WHO corroborates, honestly)",
    );
  }
  return provenance as Readonly<ModelProposalProvenance>;
}

/**
 * THE dedup fold (deterministic, pure): partitions ALREADY-VALIDATED
 * proposals against the deterministic derivation output. A proposal whose
 * operatorId is in `deterministicOperatorIds` FOLDS into it (multiple
 * proposals for the same operator are all corroborations); a later
 * proposal whose operatorId+partyChange repeats an earlier non-folded one
 * is a duplicate (never a duplicate card); everything else is novel.
 */
export function foldModelProposals(
  proposals: readonly ModelProposal[],
  deterministicOperatorIds: readonly string[],
): ModelProposalFold {
  if (!Array.isArray(proposals as unknown)) {
    throw new ModelProposalError("foldModelProposals requires the proposals as an array");
  }
  if (!Array.isArray(deterministicOperatorIds as unknown)) {
    throw new ModelProposalError("foldModelProposals requires the deterministic operator ids as an array");
  }
  const deterministic = new Set<string>();
  for (const operatorId of deterministicOperatorIds) {
    if (typeof operatorId !== "string" || operatorId.length === 0) {
      throw new ModelProposalError("every deterministic operator id must be a non-empty string (the fold never guesses)");
    }
    if (repairOperatorById(operatorId) === null) {
      throw new ModelProposalError(
        `deterministic operator id '${operatorId}' is not a member of the frozen repair-operator catalogue — the fold keys on real derivations only`,
      );
    }
    deterministic.add(operatorId);
  }
  const folded = new Map<string, FoldedModelProposal>();
  const novel: ModelProposal[] = [];
  const duplicates: ModelProposal[] = [];
  const seenKeys = new Set<string>();
  for (const proposal of proposals) {
    const record = proposal as Partial<ModelProposal>;
    if (record === null || typeof record !== "object" || typeof record.operatorId !== "string" || record.operatorId.length === 0) {
      throw new ModelProposalError("every folded proposal must be an object carrying a non-empty operatorId (validate first)");
    }
    if (record.partyChange !== undefined && !isConditionalPartyChange(record.partyChange)) {
      throw new ModelProposalError(
        `proposal party change '${String(record.partyChange)}' is not a member of the closed conditional party-change vocabulary (validate first)`,
      );
    }
    const provenance = provenanceOf(proposal);
    if (deterministic.has(record.operatorId)) {
      const existing = folded.get(record.operatorId);
      const partyChanges = new Set<ConditionalPartyChange>(existing?.partyChanges ?? []);
      if (record.partyChange !== undefined) {
        partyChanges.add(record.partyChange);
      }
      folded.set(record.operatorId, {
        operatorId: record.operatorId,
        partyChanges: Object.freeze([...partyChanges].sort()),
        corroboration: Object.freeze([...(existing?.corroboration ?? []), provenance]),
      });
      continue;
    }
    const key = proposalFoldKey(record.operatorId, record.partyChange);
    if (seenKeys.has(key)) {
      duplicates.push(proposal);
      continue;
    }
    seenKeys.add(key);
    novel.push(proposal);
  }
  return Object.freeze({
    folded: Object.freeze([...folded.values()]),
    novel: Object.freeze(novel),
    duplicates: Object.freeze(duplicates),
  });
}
