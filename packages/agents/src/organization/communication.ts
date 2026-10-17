/**
 * Organization communications contracts (P3-W1 net-new; FROZEN §7
 * "communication" + §24: agents compose through typed protocol artifacts,
 * never through direct state mutation).
 *
 * A message may travel ONLY along a DECLARED communication edge of a
 * RELEASED organization version — same version, same channel, declared
 * sender and receiver. Message payloads are scanned: no protocol-command
 * shape, no root credentials. Delivery is deterministic (edge array order)
 * and evidenced (delivered messages are frozen, immutable records).
 *
 * The relay is the deterministic reference implementation (the edge type
 * lives in src/organization.ts).
 */

import { assertNoRootCredential } from "../smart-account.ts";
import { assertNotProtocolCommand } from "../proposal.ts";
import type { ReleasedOrganization } from "../organization.ts";

/** One typed message between two instances of one organization version. */
export interface AgentMessage {
  readonly messageId: string;
  readonly orgId: string;
  readonly orgVersion: number;
  readonly fromInstanceId: string;
  readonly toInstanceId: string;
  /** Must match the declared edge's channel. */
  readonly channel: string;
  /** Typed protocol artifact family this message carries (§24). */
  readonly artifactType: string;
  /** Advisory payload — scanned against command/credential shape. */
  readonly payload: Readonly<Record<string, unknown>>;
  readonly sentAt: number;
}

/** Raised when a communication violates the declared graph. */
export class CommunicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommunicationError";
  }
}

/**
 * Deterministic communication relay over a RELEASED organization version
 * (reference implementation; the edge type lives in src/organization.ts).
 *
 * LAWS (fail closed, all of them):
 * - C1 DECLARED EDGES ONLY: a message travels only along a communication
 *   edge of THIS version with matching sender, receiver and channel.
 *   Undeclared communication is impossible by construction.
 * - C2 PARTICIPANTS ONLY: sender and receiver must be instances of this
 *   organization version.
 * - C3 CONTENT BOUNDARY: payloads are scanned — no protocol-command shape,
 *   no root credentials (advisory, typed-artifact communication only).
 * - C4 EVIDENCED + IMMUTABLE: delivered messages are deep-frozen and
 *   retained in delivery order; history is never rewritten.
 * - C5 DETERMINISTIC FAN-OUT: broadcast delivers along the version's
 *   edges in array order.
 */
export class OrganizationCommunicationRelay {
  readonly #org: ReleasedOrganization;
  readonly #delivered: AgentMessage[] = [];

  constructor(org: ReleasedOrganization) {
    this.#org = org;
  }

  #participants(): Set<string> {
    return new Set(this.#org.instances.map((instance) => instance.id));
  }

  #requireEdge(message: Omit<AgentMessage, "orgId" | "orgVersion">): void {
    const declared = this.#org.communicationEdges.some(
      (edge) =>
        edge.fromInstanceId === message.fromInstanceId &&
        edge.toInstanceId === message.toInstanceId &&
        edge.channel === message.channel,
    );
    if (!declared) {
      throw new CommunicationError(
        `no communication edge ${message.fromInstanceId} -> ${message.toInstanceId} on channel '${message.channel}' is declared in ${this.#org.id}@${this.#org.version}: undeclared communication fails closed`,
      );
    }
  }

  /**
   * Deliver one message (laws C1-C4). The message must already carry this
   * relay's organization id and version; a foreign org/version is rejected.
   * The declared-edge law (C1) is checked FIRST: an undeclared edge is
   * impossible to deliver regardless of who the endpoints are (release
   * validation already guarantees declared edges only reference
   * participating instances — the participant checks below are
   * defense-in-depth).
   */
  deliver(message: AgentMessage): AgentMessage {
    if (message.orgId !== this.#org.id || message.orgVersion !== this.#org.version) {
      throw new CommunicationError(
        `message belongs to ${message.orgId}@${message.orgVersion}, not to this relay's ${this.#org.id}@${this.#org.version}: communication never crosses organization versions`,
      );
    }
    if (message.messageId.length === 0) {
      throw new CommunicationError("messageId must not be empty");
    }
    if (this.#delivered.some((delivered) => delivered.messageId === message.messageId)) {
      throw new CommunicationError(`duplicate message id '${message.messageId}'`);
    }
    if (message.artifactType.length === 0) {
      throw new CommunicationError("artifactType must not be empty");
    }
    this.#requireEdge(message);
    if (!this.#participants().has(message.fromInstanceId)) {
      throw new CommunicationError(
        `sender '${message.fromInstanceId}' is not a participating instance of ${this.#org.id}@${this.#org.version}`,
      );
    }
    if (!this.#participants().has(message.toInstanceId)) {
      throw new CommunicationError(
        `receiver '${message.toInstanceId}' is not a participating instance of ${this.#org.id}@${this.#org.version}`,
      );
    }
    // C3: content boundary.
    assertNotProtocolCommand(message.payload);
    assertNoRootCredential(message.payload);
    const frozen = deepFreezeMessage(message);
    this.#delivered.push(frozen);
    return frozen;
  }

  /**
   * Broadcast one payload from `fromInstanceId` on `channel` to EVERY
   * declared receiver of that channel, in edge array order (law C5). The
   * per-receiver message ids derive deterministically from the base id.
   */
  broadcast(params: {
    readonly baseMessageId: string;
    readonly fromInstanceId: string;
    readonly channel: string;
    readonly artifactType: string;
    readonly payload: Readonly<Record<string, unknown>>;
    readonly sentAt: number;
  }): readonly AgentMessage[] {
    if (params.baseMessageId.length === 0) {
      throw new CommunicationError("baseMessageId must not be empty");
    }
    assertNotProtocolCommand(params.payload);
    assertNoRootCredential(params.payload);
    const out: AgentMessage[] = [];
    let index = 0;
    for (const edge of this.#org.communicationEdges) {
      if (edge.fromInstanceId !== params.fromInstanceId || edge.channel !== params.channel) {
        continue;
      }
      index += 1;
      out.push(
        this.deliver({
          messageId: `${params.baseMessageId}:${index}`,
          orgId: this.#org.id,
          orgVersion: this.#org.version,
          fromInstanceId: params.fromInstanceId,
          toInstanceId: edge.toInstanceId,
          channel: params.channel,
          artifactType: params.artifactType,
          payload: params.payload,
          sentAt: params.sentAt,
        }),
      );
    }
    if (out.length === 0) {
      throw new CommunicationError(
        `no communication edge ${params.fromInstanceId} -> (any receiver) on channel '${params.channel}' is declared in ${this.#org.id}@${this.#org.version}: a broadcast with no declared receivers fails closed`,
      );
    }
    return out;
  }

  /** All delivered messages, in delivery order (immutable evidence). */
  delivered(): readonly AgentMessage[] {
    return [...this.#delivered];
  }

  /** The messages delivered to one participating instance, in order. */
  inboxOf(instanceId: string): readonly AgentMessage[] {
    if (!this.#participants().has(instanceId)) {
      return [];
    }
    return this.#delivered.filter((message) => message.toInstanceId === instanceId);
  }
}

function deepFreezeMessage(message: AgentMessage): AgentMessage {
  deepFreezeValue(message);
  return message;
}

function deepFreezeValue(value: object): void {
  if (Object.isFrozen(value)) {
    return;
  }
  Object.freeze(value);
  for (const key of Object.keys(value)) {
    const child = (value as Readonly<Record<string, unknown>>)[key];
    if (child !== null && typeof child === "object") {
      deepFreezeValue(child);
    }
  }
}
