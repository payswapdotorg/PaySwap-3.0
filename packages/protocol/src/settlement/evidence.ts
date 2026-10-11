/**
 * @payswap/protocol — the evidence graph (P1-W2, MMI-17 PORT).
 *
 * Adapted from payswap.org@8a735bf packages/settlement/src/evidence-graph.ts
 * (old Work Order W1-004). Canonical INV-05: every consequential financial
 * effect has authorization lineage and evidence lineage.
 *
 * EVIDENCE-KIND TAXONOMY (P1-W2 requirement — distinct kinds, never
 * conflated): the old repository used generic kinds (AUTHORIZATION,
 * EXECUTION, OUTCOME, RECONCILIATION, PROOF, RECEIPT). PaySwap 3.0 requires
 * DISTINCT evidence kinds for funding, conversion, payout, external
 * observation and finality, because conflating them produces exactly the
 * fake-success ambiguity the architecture forbids (INV-24: a "payout sent"
 * record is NOT beneficiary-account credit):
 *
 *   old kind      → new kind(s)
 *   ------------    ------------------------------------------------------
 *   AUTHORIZATION → AUTHORIZATION (why the action was allowed — INV-05)
 *   EXECUTION     → FUNDING | CONVERSION | PAYOUT (the three execution legs,
 *                   kept distinct: a funding debit, an FX conversion and a
 *                   payout submission are different economic events)
 *   OUTCOME       → OBSERVATION (external observation evidence — its own
 *                   kind; what an EXTERNAL system was observed to state,
 *                   never what PaySwap did)
 *   RECEIPT       → FINALITY (protocol-owned finality declarations)
 *   RECONCILIATION→ RECONCILIATION (unchanged)
 *   PROOF         → folded into the proof-level vocabulary (settlement/proof.ts);
 *                   proof STRENGTH is measured on every node via claimedLevel,
 *                   not a separate node kind
 *
 * - Historical evidence is immutable (INV-03): nodes are frozen, the graph
 *   is append-only, and re-recording an existing node id with DIFFERENT
 *   content throws `EvidenceMutationError`. Identical re-records are
 *   idempotent (replay-safe, INV-06).
 * - UI/browser artifacts are never stronger than their authenticated
 *   provenance (proof.ts caps `UI_BROWSER_ARTIFACT` nodes at P0/P1).
 */

import { ValidationError } from '../errors.ts';
import type { PaySwapErrorDetails } from '../errors.ts';
import type { TimestampMs } from '../clock.ts';

/**
 * What the evidence node documents — the DISTINCT kinds. `payoutSent` and
 * `beneficiaryCreditObserved` are different kinds on purpose: PAYOUT is
 * PaySwap's outgoing action; OBSERVATION is an external system's state.
 */
export type EvidenceNodeKind =
  | 'AUTHORIZATION'
  | 'FUNDING'
  | 'CONVERSION'
  | 'PAYOUT'
  | 'OBSERVATION'
  | 'FINALITY'
  | 'RECONCILIATION';

/**
 * Where the evidence came from. The provenance determines its maximum
 * believable strength (INV-05/INV-24: no fake success from weak sources).
 */
export type EvidenceProvenance =
  | { readonly source: 'PROTOCOL_LEDGER' }
  | { readonly source: 'AUTHENTICATED_PROVIDER'; readonly providerName: string }
  | { readonly source: 'INDEPENDENT_OBSERVER'; readonly observerRef: string }
  | { readonly source: 'OPERATOR'; readonly operatorRef: string }
  | { readonly source: 'UI_BROWSER_ARTIFACT'; readonly authenticated: boolean };

/** One immutable node in the evidence graph. */
export interface EvidenceNode {
  readonly nodeId: string;
  readonly kind: EvidenceNodeKind;
  /** The consequential action this evidence belongs to (attempt/instruction id). */
  readonly actionRef: string;
  /** The level this evidence CLAIMS to prove (capped by provenance). */
  readonly claimedLevel: string;
  readonly provenance: EvidenceProvenance;
  /** Deterministic binding hash of the underlying artifact payload. */
  readonly payloadHash: string;
  /** Parent node ids — the lineage this evidence continues. */
  readonly links: readonly string[];
  readonly recordedAt: TimestampMs;
}

/** Input accepted by `EvidenceGraph.record`. */
export interface EvidenceNodeDraft {
  readonly nodeId: string;
  readonly kind: EvidenceNodeKind;
  readonly actionRef: string;
  readonly claimedLevel: string;
  readonly provenance: EvidenceProvenance;
  /** Opaque artifact payload; the node stores only its deterministic hash. */
  readonly payload: string;
  readonly links: readonly string[];
  readonly recordedAt: TimestampMs;
}

/**
 * The queryable lineage of one consequential action (INV-05): each distinct
 * kind is returned separately so a caller can prove "why allowed" AND
 * exactly which leg happened AND what was externally observed.
 */
export interface ActionEvidenceLineage {
  readonly actionRef: string;
  readonly authorization: readonly EvidenceNode[];
  readonly funding: readonly EvidenceNode[];
  readonly conversion: readonly EvidenceNode[];
  readonly payout: readonly EvidenceNode[];
  readonly observation: readonly EvidenceNode[];
  readonly finality: readonly EvidenceNode[];
  readonly reconciliation: readonly EvidenceNode[];
  readonly all: readonly EvidenceNode[];
}

/** Historical-evidence immutability violation (INV-03). */
export class EvidenceMutationError extends ValidationError {
  constructor(message: string, details?: PaySwapErrorDetails) {
    super(message, details);
    this.name = 'EvidenceMutationError';
  }
}

/** No node exists under the given id. */
export class UnknownEvidenceNodeError extends ValidationError {
  constructor(message: string, details?: PaySwapErrorDetails) {
    super(message, details);
    this.name = 'UnknownEvidenceNodeError';
  }
}

const EVIDENCE_KINDS: readonly EvidenceNodeKind[] = [
  'AUTHORIZATION',
  'FUNDING',
  'CONVERSION',
  'PAYOUT',
  'OBSERVATION',
  'FINALITY',
  'RECONCILIATION',
];

/** Deterministic FNV-1a 64 over a string (binding, never security). */
export function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    hash ^= BigInt(code);
    hash *= 0x100000001b3n;
    hash &= 0xffff_ffff_ffff_ffffn;
  }
  return hash.toString(16);
}

/** Deterministic canonical rendering of a node (field-by-field, never JSON key order). */
function canonicalEvidenceNode(node: EvidenceNode): string {
  const provenance = (() => {
    switch (node.provenance.source) {
      case 'PROTOCOL_LEDGER':
        return 'PROTOCOL_LEDGER';
      case 'AUTHENTICATED_PROVIDER':
        return `AUTHENTICATED_PROVIDER:${node.provenance.providerName}`;
      case 'INDEPENDENT_OBSERVER':
        return `INDEPENDENT_OBSERVER:${node.provenance.observerRef}`;
      case 'OPERATOR':
        return `OPERATOR:${node.provenance.operatorRef}`;
      case 'UI_BROWSER_ARTIFACT':
        return `UI_BROWSER_ARTIFACT:${node.provenance.authenticated ? 'AUTHENTICATED' : 'UNAUTHENTICATED'}`;
    }
  })();
  return (
    `evidence|id:${node.nodeId}|kind:${node.kind}|action:${node.actionRef}` +
    `|claimed:${node.claimedLevel}|provenance:${provenance}` +
    `|payloadHash:${node.payloadHash}|links:[${node.links.join(',')}]` +
    `|recordedAt:${node.recordedAt}`
  );
}

function isEvidenceNodeKind(value: unknown): value is EvidenceNodeKind {
  return typeof value === 'string' && (EVIDENCE_KINDS as readonly string[]).includes(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isProvenanceShaped(value: unknown): value is EvidenceProvenance {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<EvidenceProvenance>;
  switch (candidate.source) {
    case 'PROTOCOL_LEDGER':
      return true;
    case 'AUTHENTICATED_PROVIDER':
      return typeof candidate.providerName === 'string' && candidate.providerName.length > 0;
    case 'INDEPENDENT_OBSERVER':
      return typeof candidate.observerRef === 'string' && candidate.observerRef.length > 0;
    case 'OPERATOR':
      return typeof candidate.operatorRef === 'string' && candidate.operatorRef.length > 0;
    case 'UI_BROWSER_ARTIFACT':
      return typeof candidate.authenticated === 'boolean';
    default:
      return false;
  }
}

/**
 * The append-only, queryable evidence graph. Deterministic reference
 * implementation: nodes are stored as frozen records in recording order;
 * history is never rewritten (INV-03).
 */
export class EvidenceGraph {
  readonly #nodes = new Map<string, EvidenceNode>();
  readonly #order: EvidenceNode[] = [];
  readonly #byAction = new Map<string, EvidenceNode[]>();

  /**
   * Record one evidence node (append-only). Re-recording an existing node
   * id with byte-identical content is an idempotent replay; ANY content
   * difference throws `EvidenceMutationError`.
   */
  record(draft: EvidenceNodeDraft): EvidenceNode {
    if (draft === null || typeof draft !== 'object') {
      throw new ValidationError('evidence draft must be an EvidenceNodeDraft object');
    }
    if (!isNonEmptyString(draft.nodeId)) {
      throw new ValidationError('evidence draft nodeId must be a non-empty string');
    }
    if (!isEvidenceNodeKind(draft.kind)) {
      throw new ValidationError(`evidence draft kind is not declared: ${String(draft.kind)}`);
    }
    if (!isNonEmptyString(draft.actionRef)) {
      throw new ValidationError('evidence draft actionRef must be a non-empty string');
    }
    if (typeof draft.claimedLevel !== 'string' || draft.claimedLevel.length === 0) {
      throw new ValidationError('evidence draft claimedLevel must be a non-empty proof level');
    }
    if (!isProvenanceShaped(draft.provenance)) {
      throw new ValidationError('evidence draft provenance must be a declared EvidenceProvenance');
    }
    if (typeof draft.payload !== 'string') {
      throw new ValidationError('evidence draft payload must be a string');
    }
    if (typeof draft.recordedAt !== 'bigint') {
      throw new ValidationError('evidence draft recordedAt must be a bigint TimestampMs');
    }
    if (!Array.isArray(draft.links)) {
      throw new ValidationError('evidence draft links must be an array of node ids');
    }
    for (const link of draft.links) {
      if (!isNonEmptyString(link)) {
        throw new ValidationError('evidence draft links must be non-empty node ids');
      }
      if (!this.#nodes.has(link)) {
        throw new UnknownEvidenceNodeError(
          `evidence '${draft.nodeId}' links to unknown parent '${link}' — lineage must be recorded bottom-up`,
          { nodeId: draft.nodeId, link },
        );
      }
    }

    const node: EvidenceNode = Object.freeze({
      nodeId: draft.nodeId,
      kind: draft.kind,
      actionRef: draft.actionRef,
      claimedLevel: draft.claimedLevel,
      provenance: Object.freeze({ ...draft.provenance }) as EvidenceProvenance,
      payloadHash: `evh:${fnv1a64(draft.payload)}`,
      links: Object.freeze([...draft.links]),
      recordedAt: draft.recordedAt,
    });

    const existing = this.#nodes.get(node.nodeId);
    if (existing !== undefined) {
      if (canonicalEvidenceNode(existing) !== canonicalEvidenceNode(node)) {
        // Historical evidence is immutable (INV-03).
        throw new EvidenceMutationError(
          `evidence '${node.nodeId}' is already recorded and immutable`,
          { nodeId: node.nodeId, recordedPayloadHash: existing.payloadHash, attemptedPayloadHash: node.payloadHash },
        );
      }
      return existing; // idempotent replay of identical evidence
    }

    this.#nodes.set(node.nodeId, node);
    this.#order.push(node);
    const list = this.#byAction.get(node.actionRef) ?? [];
    list.push(node);
    this.#byAction.set(node.actionRef, list);
    return node;
  }

  /** One node by id (frozen, immutable). */
  node(nodeId: string): EvidenceNode | undefined {
    return this.#nodes.get(nodeId);
  }

  /** Immutability guard: does the recorded node differ from the draft content? */
  conflictsWith(draft: EvidenceNodeDraft): boolean {
    const existing = this.#nodes.get(draft.nodeId);
    if (existing === undefined) {
      return false;
    }
    const candidate: EvidenceNode = Object.freeze({
      nodeId: draft.nodeId,
      kind: draft.kind,
      actionRef: draft.actionRef,
      claimedLevel: draft.claimedLevel,
      provenance: draft.provenance,
      payloadHash: `evh:${fnv1a64(draft.payload)}`,
      links: Object.freeze([...draft.links]),
      recordedAt: draft.recordedAt,
    });
    return canonicalEvidenceNode(existing) !== canonicalEvidenceNode(candidate);
  }

  /**
   * INV-05: the queryable evidence lineage of one consequential action.
   * Authorization, each execution leg (funding/conversion/payout),
   * external observation, finality and reconciliation chains are returned
   * separately — a caller can prove "why allowed" AND exactly which leg
   * happened AND what was externally observed, independently.
   */
  lineageForAction(actionRef: string): ActionEvidenceLineage {
    if (!isNonEmptyString(actionRef)) {
      throw new ValidationError('actionRef must be a non-empty string');
    }
    const all = [...(this.#byAction.get(actionRef) ?? [])];
    const byKind = (kind: EvidenceNodeKind): readonly EvidenceNode[] =>
      Object.freeze(all.filter((node) => node.kind === kind));
    return Object.freeze({
      actionRef,
      authorization: byKind('AUTHORIZATION'),
      funding: byKind('FUNDING'),
      conversion: byKind('CONVERSION'),
      payout: byKind('PAYOUT'),
      observation: byKind('OBSERVATION'),
      finality: byKind('FINALITY'),
      reconciliation: byKind('RECONCILIATION'),
      all: Object.freeze(all),
    });
  }

  /**
   * The full lineage chain of one node: the node followed by its transitive
   * parents (deterministic breadth-first order, cycle-safe).
   */
  chainOf(nodeId: string): readonly EvidenceNode[] {
    const start = this.#nodes.get(nodeId);
    if (start === undefined) {
      throw new UnknownEvidenceNodeError(`no evidence node exists under '${nodeId}'`, { nodeId });
    }
    const visited = new Set<string>([start.nodeId]);
    const chain: EvidenceNode[] = [start];
    const queue: EvidenceNode[] = [start];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) continue;
      for (const link of current.links) {
        if (visited.has(link)) continue;
        const parent = this.#nodes.get(link);
        if (parent === undefined) continue;
        visited.add(parent.nodeId);
        chain.push(parent);
        queue.push(parent);
      }
    }
    return Object.freeze(chain);
  }

  /** All nodes in recording order (audit view). */
  allNodes(): readonly EvidenceNode[] {
    return Object.freeze([...this.#order]);
  }

  /** Deterministic canonical rendering of one node (replay equality). */
  canonicalNode(nodeId: string): string {
    const node = this.#nodes.get(nodeId);
    if (node === undefined) {
      throw new UnknownEvidenceNodeError(`no evidence node exists under '${nodeId}'`, { nodeId });
    }
    return canonicalEvidenceNode(node);
  }
}
