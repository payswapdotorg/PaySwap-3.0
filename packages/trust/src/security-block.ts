/**
 * Security blocks and the INV-21 law (P1-W3, net-new).
 *
 * THE LAW (canonical INV-21: "Security/adversarial intelligence cannot
 * downgrade BLOCK"; SECURITY-MODEL.md "Adversarial agents are advisory ...
 * cannot downgrade BLOCK"):
 *
 *   A BLOCK verdict is STICKY ACROSS EPOCH ADVANCEMENT. Advancing the
 *   network security epoch — no matter how far, no matter for what
 *   security-relevant event — never retires, weakens or downgrades a
 *   registered block. Authority (mandates, approval artifacts) is
 *   perishable: it dies on epoch advancement (TB-5). Security blocks are
 *   the deliberate asymmetry: they survive.
 *
 *   The ONLY path that retires a block is an EXPLICIT higher-authority
 *   revocation: a separate, append-only, evidence-carrying record naming
 *   the revoking authority and its reason. That revocation is itself
 *   irrevocable history — it can never be undone, re-dated or repeated for
 *   the same block id.
 *
 * This module is the trust-plane HOME of that law for P1. Phase 6 (P6-W3
 * adversarial security intelligence) integrates threat intelligence on top;
 * it can ADD blocks and propose revocations, but never downgrade one.
 *
 * Deterministic only: every query answers at an explicitly supplied epoch
 * value; no ambient clock; no randomness.
 */

/** A registered BLOCK verdict (evidence record — append-only). */
export interface SecurityBlockRecord {
  readonly id: string;
  /** Opaque reference to what is blocked (principal, resource, action class...). */
  readonly subjectRef: string;
  readonly reason: string;
  /** Network security epoch at which the block was issued. */
  readonly issuedAtEpoch: bigint;
  /** Opaque evidence references backing the block. */
  readonly evidenceRefs: readonly string[];
}

/** The explicit higher-authority revocation of a block (append-only evidence). */
export interface BlockRevocationRecord {
  readonly blockId: string;
  /** Opaque reference to the higher authority ordering the revocation. */
  readonly revokedBy: string;
  readonly reason: string;
  /** Network security epoch at which the revocation fired. */
  readonly revokedAtEpoch: bigint;
}

/** Raised on invalid block-registry operations (fail closed). */
export class SecurityBlockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecurityBlockError";
  }
}

/**
 * Append-only registry of BLOCK verdicts and their explicit
 * higher-authority revocations. There is deliberately NO operation that
 * "downgrades", "expires" or "weakens" a block: epoch advancement cannot
 * reach a block, and the only exit is revokeAsHigherAuthority, which is
 * itself irreversible history (INV-21).
 */
export class SecurityBlockRegistry {
  readonly #blocks = new Map<string, SecurityBlockRecord>();
  readonly #revocations = new Map<string, BlockRevocationRecord>();
  readonly #history: (SecurityBlockRecord | BlockRevocationRecord)[] = [];

  /** Register a block (append-only; ids are unique). */
  register(input: {
    id: string;
    subjectRef: string;
    reason: string;
    issuedAtEpoch: bigint;
    evidenceRefs: readonly string[];
  }): SecurityBlockRecord {
    if (input.id.length === 0) {
      throw new SecurityBlockError("block id must not be empty");
    }
    if (this.#blocks.has(input.id)) {
      throw new SecurityBlockError(`block '${input.id}' already exists (append-only registry)`);
    }
    if (input.subjectRef.length === 0) {
      throw new SecurityBlockError("block subjectRef must not be empty");
    }
    if (input.reason.length === 0) {
      throw new SecurityBlockError("block reason must not be empty");
    }
    if (input.issuedAtEpoch < 0n) {
      throw new SecurityBlockError("block issuedAtEpoch must be >= 0 (genesis epoch)");
    }
    for (const evidenceRef of input.evidenceRefs) {
      if (evidenceRef.length === 0) {
        throw new SecurityBlockError("block evidence refs must not be empty strings");
      }
    }
    const record: SecurityBlockRecord = Object.freeze({
      id: input.id,
      subjectRef: input.subjectRef,
      reason: input.reason,
      issuedAtEpoch: input.issuedAtEpoch,
      evidenceRefs: Object.freeze([...input.evidenceRefs]),
    });
    this.#blocks.set(record.id, record);
    this.#history.push(record);
    return record;
  }

  /**
   * The explicit higher-authority revocation path (the ONLY block exit).
   * Append-only and irrevocable: revoking the same block id twice throws;
   * the revocation record cannot be reversed, re-dated or removed.
   */
  revokeAsHigherAuthority(input: {
    blockId: string;
    revokedBy: string;
    reason: string;
    revokedAtEpoch: bigint;
  }): BlockRevocationRecord {
    const block = this.#blocks.get(input.blockId);
    if (block === undefined) {
      throw new SecurityBlockError(`block '${input.blockId}' is unknown`);
    }
    if (this.#revocations.has(input.blockId)) {
      throw new SecurityBlockError(
        `block '${input.blockId}' is already revoked: revocation is append-only and cannot be repeated or reversed`,
      );
    }
    if (input.revokedBy.length === 0) {
      throw new SecurityBlockError("revocation revokedBy must not be empty");
    }
    if (input.reason.length === 0) {
      throw new SecurityBlockError("revocation reason must not be empty");
    }
    if (input.revokedAtEpoch < block.issuedAtEpoch) {
      throw new SecurityBlockError(
        `revocation epoch ${input.revokedAtEpoch} precedes the block issuance epoch ${block.issuedAtEpoch}: revocations cannot be backdated`,
      );
    }
    const revocation: BlockRevocationRecord = Object.freeze({
      blockId: input.blockId,
      revokedBy: input.revokedBy,
      reason: input.reason,
      revokedAtEpoch: input.revokedAtEpoch,
    });
    this.#revocations.set(input.blockId, revocation);
    this.#history.push(revocation);
    return revocation;
  }

  /** A registered block by id (records stay queryable after revocation). */
  lookup(blockId: string): SecurityBlockRecord | undefined {
    return this.#blocks.get(blockId);
  }

  /** The explicit revocation of a block, when one ever fired. */
  revocationOf(blockId: string): BlockRevocationRecord | undefined {
    return this.#revocations.get(blockId);
  }

  /**
   * Is the subject blocked at the given network epoch value? INV-21: the
   * answer is true for EVERY epoch at or after issuance, no matter how far
   * the epoch has advanced, unless the explicit higher-authority revocation
   * fired at or before that epoch. Blocks are never retroactive before
   * their issuance epoch (deterministic window [issuedAtEpoch, infinity)).
   */
  isBlocked(subjectRef: string, atEpoch: bigint): boolean {
    for (const block of this.#blocks.values()) {
      if (block.subjectRef !== subjectRef) {
        continue;
      }
      if (atEpoch < block.issuedAtEpoch) {
        continue; // block not yet in force at this epoch
      }
      const revocation = this.#revocations.get(block.id);
      if (revocation !== undefined && atEpoch >= revocation.revokedAtEpoch) {
        continue; // explicitly revoked by higher authority at/before atEpoch
      }
      return true; // BLOCK survives any epoch advancement (INV-21)
    }
    return false;
  }

  /** Append-only registry history (blocks and revocations), in order. */
  history(): readonly (SecurityBlockRecord | BlockRevocationRecord)[] {
    return [...this.#history];
  }
}
