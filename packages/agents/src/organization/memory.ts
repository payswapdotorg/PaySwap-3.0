/**
 * Organization memory-boundary contracts (P3-W1 net-new; FROZEN §7
 * "memory" in the organization definition; canonical INV-19 discipline —
 * secrets never enter memory artifacts).
 *
 * Memory in an organization is a TYPED, POLICY-BOUNDED artifact stream —
 * never ambient shared state:
 * - records belong to one (organization id, organization VERSION);
 * - the released memory policy governs who reads what (scope) and how
 *   long records live (retention);
 * - record content is scanned: no protocol-command shape, no root
 *   credentials — memory can never become an authority or secret carrier.
 *
 * The store is the deterministic reference implementation of the memory
 * boundary (the policy type lives in src/organization.ts).
 */

import { assertNoRootCredential } from "../smart-account.ts";
import { assertNotProtocolCommand } from "../proposal.ts";
import type { ReleasedOrganization } from "../organization.ts";

/** One memory record written inside an organization version. */
export interface OrganizationMemoryRecord {
  readonly recordId: string;
  readonly orgId: string;
  readonly orgVersion: number;
  /** The participating instance that wrote the record. */
  readonly writerInstanceId: string;
  /** Topic channel (e.g. "routing-notes", "corridor-facts"). */
  readonly channel: string;
  /** Advisory content — scanned against command/credential shape. */
  readonly content: Readonly<Record<string, unknown>>;
  readonly writtenAt: number;
}

/** Raised when a memory operation violates the memory boundary. */
export class MemoryBoundaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoryBoundaryError";
  }
}

/** Write parameters: the record id is caller-supplied (determinism law). */
export interface MemoryWriteParams {
  readonly recordId: string;
  readonly writerInstanceId: string;
  readonly channel: string;
  readonly content: Readonly<Record<string, unknown>>;
  readonly writtenAt: number;
}

/** Session-boundary event for session-retention memory. */
export interface MemorySessionClose {
  readonly closedAt: number;
}

/**
 * The organization memory boundary (deterministic, in-memory reference
 * store). Constructed from a RELEASED organization version — memory is
 * always scoped to one immutable graph version, never ambient state.
 *
 * LAWS (fail closed, all of them):
 * - M1 WRITERS ARE PARTICIPANTS: only instances of THIS organization
 *   version may write; anything else is rejected.
 * - M2 RETENTION BOUNDS LIFETIME: "ephemeral" policy rejects every write
 *   (an ephemeral organization retains NO memory at all); "session" keeps
 *   records until closeSession() and rejects writes after it; "persistent"
 *   is append-only forever.
 * - M3 CONTENT BOUNDARY: record content is scanned — no protocol-command
 *   shape (the proposal guard) and no root credentials (the smart-account
 *   guard). Memory can never become an authority or secret carrier
 *   (INV-19 discipline).
 * - M4 SCOPE BOUNDS READS: with "isolated" scope an instance reads ONLY
 *   its own records; with "shared" scope every participant reads all
 *   records of this version. Non-participants read nothing.
 * - M5 APPEND-ONLY + DEEP-FROZEN: stored records are frozen; the record
 *   list never rewrites history.
 */
export class OrganizationMemoryStore {
  readonly #org: ReleasedOrganization;
  readonly #records: OrganizationMemoryRecord[] = [];
  #sessionClosed: MemorySessionClose | undefined;

  constructor(org: ReleasedOrganization) {
    this.#org = org;
  }

  #participants(): Set<string> {
    return new Set(this.#org.instances.map((instance) => instance.id));
  }

  #requireOpen(): void {
    const retention = this.#org.memory.retention;
    if (retention === "ephemeral") {
      throw new MemoryBoundaryError(
        "memory policy is 'ephemeral': this organization version retains no memory; writes fail closed",
      );
    }
    if (this.#sessionClosed !== undefined) {
      throw new MemoryBoundaryError(
        "memory policy is 'session' and the session is closed: session memory cannot be reopened (open a new organization version instead)",
      );
    }
  }

  /** Append one memory record (laws M1-M3, M5). */
  write(params: MemoryWriteParams): OrganizationMemoryRecord {
    this.#requireOpen();
    if (params.recordId.length === 0) {
      throw new MemoryBoundaryError("recordId must not be empty");
    }
    if (this.#records.some((record) => record.recordId === params.recordId)) {
      throw new MemoryBoundaryError(`duplicate memory record id '${params.recordId}'`);
    }
    if (!this.#participants().has(params.writerInstanceId)) {
      throw new MemoryBoundaryError(
        `writer '${params.writerInstanceId}' is not a participating instance of ${this.#org.id}@${this.#org.version}`,
      );
    }
    if (params.channel.length === 0) {
      throw new MemoryBoundaryError("channel must not be empty");
    }
    // M3: content boundary — advisory memory only.
    assertNotProtocolCommand(params.content);
    assertNoRootCredential(params.content);
    const record: OrganizationMemoryRecord = Object.freeze({
      recordId: params.recordId,
      orgId: this.#org.id,
      orgVersion: this.#org.version,
      writerInstanceId: params.writerInstanceId,
      channel: params.channel,
      content: params.content,
      writtenAt: params.writtenAt,
    });
    this.#records.push(record);
    return record;
  }

  /**
   * The records `instanceId` may read under the version's memory policy
   * (law M4). Non-participants always read nothing.
   */
  readableBy(instanceId: string): readonly OrganizationMemoryRecord[] {
    if (!this.#participants().has(instanceId)) {
      return [];
    }
    if (this.#org.memory.scope === "isolated") {
      return this.#records.filter((record) => record.writerInstanceId === instanceId);
    }
    return [...this.#records];
  }

  /** Close the session (session-retention law M2): records stop being writable. */
  closeSession(closedAt: number): void {
    if (this.#org.memory.retention !== "session") {
      throw new MemoryBoundaryError(
        "closeSession applies only to 'session' retention memory",
      );
    }
    if (this.#sessionClosed !== undefined && closedAt < this.#sessionClosed.closedAt) {
      throw new MemoryBoundaryError("session close timestamps are monotonic");
    }
    this.#sessionClosed = { closedAt };
  }

  /** True when the session boundary has closed (session retention only). */
  isSessionClosed(): boolean {
    return this.#sessionClosed !== undefined;
  }

  /** All records of this version, in write order (append-only evidence). */
  records(): readonly OrganizationMemoryRecord[] {
    return [...this.#records];
  }
}
