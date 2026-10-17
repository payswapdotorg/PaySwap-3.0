/**
 * @payswap/command — agent interaction protocol boundary contracts (P7-W3).
 *
 * The agent-interaction wire contracts for the three edge standards (edge
 * adapters, not domain authority): MCP (agent -> capability/tool), A2A
 * (agent <-> agent) and AG-UI (agent <-> application). Adapted from the
 * old repository's @payswap/interfaces agent-protocols.ts with the
 * authority-firewall law carried through:
 *
 * - Tools wrap protocol command REFERENCES (`CommandRef`) and CANNOT mint
 *   authority: `requiredAuthority` declares authority that must ALREADY
 *   have been granted (out of band, on the trust lane) before the runtime
 *   executes the underlying command. An agent never receives an
 *   unrestricted money-movement tool (INV-9); agent proposals never mutate
 *   financial truth;
 * - all three contracts are explicitly versioned (schemaVersion);
 * - commands enter ONLY as opaque CommandRef placeholders;
 * - an AG-UI RUN_ERROR describes an agent-run error — distinct from
 *   payment terminal states; the surface must not render one as the other
 *   (INV-4 thinking applied to run lifecycles).
 */

import type { AuthorityScope } from './permission.ts';

/** Opaque reference to a protocol command (commandType + commandId only). */
export interface CommandRef {
  readonly commandType: string;
  readonly commandId: string;
}

/** Reference from a tool/skill to the protocol capability it wraps. */
export interface CapabilityRef {
  readonly capabilityId: string;
  readonly capabilityVersion: string;
  /** The protocol command this capability binds to; opaque here. */
  readonly command: CommandRef;
}

/** JSON Schema (draft-agnostic, read-only keyword map). */
export interface JsonSchema {
  readonly [keyword: string]: unknown;
}

/**
 * MCP tool descriptor. A tool is a VIEW over a protocol command reference:
 * it describes how to invoke a capability and DECLARES the authority
 * required to do so. Tools cannot mint authority — executing the wrapped
 * command still requires an authorization-decision reference resolved out
 * of band on the trust lane (INV-9; the authority-firewall law).
 */
export interface McpToolDescriptor {
  readonly schemaVersion: string;
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly outputSchema: JsonSchema;
  /** The protocol capability this tool wraps (command reference, not authority). */
  readonly capabilityRef: CapabilityRef;
  /** Authority that must already be granted before this tool's command may execute. */
  readonly requiredAuthority: AuthorityScope;
}

/** A versioned list of MCP tool descriptors served to an agent runtime. */
export interface McpToolList {
  readonly schemaVersion: string;
  readonly tools: readonly McpToolDescriptor[];
}

/** A2A message parts (text, structured data, or an opaque command reference). */
export type A2APart =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'data'; readonly data: Readonly<Record<string, unknown>> }
  | { readonly kind: 'command-ref'; readonly commandRef: CommandRef };

/** A2A message (agent <-> agent), versioned. */
export interface A2AMessage {
  readonly schemaVersion: string;
  readonly messageId: string;
  readonly role: 'AGENT' | 'USER';
  readonly sentAt: string;
  readonly parts: readonly A2APart[];
}

/** A skill an A2A agent can perform, bound to a capability and authority. */
export interface A2ASkill {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly capabilityRef?: CapabilityRef;
  /** Required pre-granted authority for this skill (never minted by the card). */
  readonly requiredAuthority: AuthorityScope;
}

/**
 * A2A agent card: what an agent is, where it lives, what it may do.
 * `defaultScopes` declare pre-granted authority envelopes; a card can never
 * grant authority beyond what the referenced principal's mandates already
 * hold (INV-12: child delegation is strictly attenuated).
 */
export interface A2AAgentCard {
  readonly schemaVersion: string;
  readonly name: string;
  readonly description: string;
  readonly url: string;
  readonly cardVersion: string;
  /** The PaySwap principal this agent acts for (opaque reference key). */
  readonly principalRef: string;
  readonly organizationRef?: string;
  readonly skills: readonly A2ASkill[];
  readonly capabilities: {
    readonly streaming: boolean;
    readonly pushNotifications: boolean;
  };
  readonly defaultScopes: readonly AuthorityScope[];
}

/**
 * AG-UI event stream events (agent <-> application), PaySwap-adapted
 * subset. RUN_ERROR describes an agent-run error — distinct from payment
 * terminal states.
 */
export type AgUiEvent =
  | { readonly type: 'RUN_STARTED'; readonly runId: string; readonly threadId: string }
  | { readonly type: 'TEXT_MESSAGE_START'; readonly messageId: string; readonly role: 'AGENT' | 'USER' }
  | { readonly type: 'TEXT_MESSAGE_CONTENT'; readonly messageId: string; readonly delta: string }
  | { readonly type: 'TEXT_MESSAGE_END'; readonly messageId: string }
  | { readonly type: 'TOOL_CALL_START'; readonly toolCallId: string; readonly toolName: string }
  | { readonly type: 'TOOL_CALL_END'; readonly toolCallId: string }
  | { readonly type: 'STATE_SNAPSHOT'; readonly snapshot: Readonly<Record<string, unknown>> }
  | { readonly type: 'RUN_ERROR'; readonly runId: string; readonly message: string }
  | { readonly type: 'RUN_FINISHED'; readonly runId: string };

/** A versioned, timestamped AG-UI event (occurredAt is strict ISO-8601 UTC DATA). */
export interface VersionedAgUiEvent {
  readonly schemaVersion: string;
  readonly occurredAt: string;
  readonly event: AgUiEvent;
}

// ---------------------------------------------------------------------------
// Validators (fail closed; the authority-firewall laws machine-checked)
// ---------------------------------------------------------------------------

import { ValidationError } from './errors.ts';
import { validateAuthorityScope } from './permission.ts';
import { parseStrictIsoUtc } from './canonical.ts';

function requireNonEmpty(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`${label} must be a non-empty string`);
  }
  return value;
}

function requireSchemaObject(value: unknown, label: string): JsonSchema {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(`${label} must be a JSON schema object`);
  }
  return value as JsonSchema;
}

/**
 * Validate an MCP tool descriptor. THE LAW: `requiredAuthority` is
 * MANDATORY and validated — an agent never receives an unrestricted
 * money-movement tool (INV-9; the authority-firewall law: the tool
 * DESCRIBES required authority, it can never mint it).
 */
export function validateMcpToolDescriptor(descriptor: McpToolDescriptor): McpToolDescriptor {
  requireNonEmpty(descriptor.schemaVersion, 'tool.schemaVersion');
  requireNonEmpty(descriptor.name, 'tool.name');
  requireNonEmpty(descriptor.description, 'tool.description');
  requireSchemaObject(descriptor.inputSchema, 'tool.inputSchema');
  requireSchemaObject(descriptor.outputSchema, 'tool.outputSchema');
  if (descriptor.capabilityRef === null || typeof descriptor.capabilityRef !== 'object') {
    throw new ValidationError('tool.capabilityRef must be a CapabilityRef object');
  }
  requireNonEmpty(descriptor.capabilityRef.capabilityId, 'tool.capabilityRef.capabilityId');
  requireNonEmpty(descriptor.capabilityRef.capabilityVersion, 'tool.capabilityRef.capabilityVersion');
  const command = descriptor.capabilityRef.command;
  if (command === null || typeof command !== 'object') {
    throw new ValidationError('tool.capabilityRef.command must be a CommandRef object');
  }
  requireNonEmpty(command.commandType, 'tool.capabilityRef.command.commandType');
  requireNonEmpty(command.commandId, 'tool.capabilityRef.command.commandId');
  if (descriptor.requiredAuthority === undefined) {
    throw new ValidationError(
      'tool.requiredAuthority is MANDATORY: a tool declares the authority that must already be granted before its command may execute (never an unrestricted agent tool; INV-9)',
    );
  }
  validateAuthorityScope(descriptor.requiredAuthority, 'tool.requiredAuthority');
  return descriptor;
}

/** Validate a versioned MCP tool list (every descriptor + the version pin). */
export function validateMcpToolList(list: McpToolList): McpToolList {
  requireNonEmpty(list.schemaVersion, 'list.schemaVersion');
  if (!Array.isArray(list.tools)) {
    throw new ValidationError('list.tools must be an array of McpToolDescriptor');
  }
  const seen = new Set<string>();
  for (const tool of list.tools) {
    validateMcpToolDescriptor(tool);
    if (seen.has(tool.name)) {
      throw new ValidationError(`duplicate tool name in list: ${tool.name}`);
    }
    seen.add(tool.name);
  }
  return list;
}

/** Validate an A2A message (version, id, role, strict-UTC sentAt, parts). */
export function validateA2AMessage(message: A2AMessage): A2AMessage {
  requireNonEmpty(message.schemaVersion, 'message.schemaVersion');
  requireNonEmpty(message.messageId, 'message.messageId');
  if (message.role !== 'AGENT' && message.role !== 'USER') {
    throw new ValidationError('message.role must be AGENT or USER');
  }
  parseStrictIsoUtc(message.sentAt, 'message.sentAt');
  if (!Array.isArray(message.parts)) {
    throw new ValidationError('message.parts must be an array');
  }
  for (const part of message.parts) {
    if (part === null || typeof part !== 'object') {
      throw new ValidationError('message.parts entries must be A2APart objects');
    }
    if (part.kind === 'text') {
      requireNonEmpty(part.text, 'text part text');
    } else if (part.kind === 'data') {
      if (typeof part.data !== 'object' || part.data === null || Array.isArray(part.data)) {
        throw new ValidationError('data part data must be an object');
      }
    } else if (part.kind === 'command-ref') {
      requireNonEmpty(part.commandRef.commandType, 'command-ref part commandType');
      requireNonEmpty(part.commandRef.commandId, 'command-ref part commandId');
    } else {
      throw new ValidationError(`unknown A2A part kind: ${String((part as { kind?: unknown }).kind)}`);
    }
  }
  return message;
}

/**
 * Validate an A2A agent card. THE LAWS:
 * - every skill's `requiredAuthority` is MANDATORY (a card never exposes
 *   an unrestricted skill);
 * - `defaultScopes` are validated REQUEST envelopes — a card can never
 *   grant authority beyond what the referenced principal's mandates
 *   already hold (INV-12: child delegation is strictly attenuated);
 * - the card names the PaySwap principal it acts for.
 */
export function validateA2AAgentCard(card: A2AAgentCard): A2AAgentCard {
  requireNonEmpty(card.schemaVersion, 'card.schemaVersion');
  requireNonEmpty(card.name, 'card.name');
  requireNonEmpty(card.description, 'card.description');
  requireNonEmpty(card.url, 'card.url');
  requireNonEmpty(card.cardVersion, 'card.cardVersion');
  requireNonEmpty(card.principalRef, 'card.principalRef');
  if (!Array.isArray(card.skills)) {
    throw new ValidationError('card.skills must be an array of A2ASkill');
  }
  const seenSkillIds = new Set<string>();
  for (const skill of card.skills) {
    requireNonEmpty(skill.id, 'skill.id');
    requireNonEmpty(skill.name, 'skill.name');
    requireNonEmpty(skill.description, 'skill.description');
    if (seenSkillIds.has(skill.id)) {
      throw new ValidationError(`duplicate skill id in card: ${skill.id}`);
    }
    seenSkillIds.add(skill.id);
    if (skill.requiredAuthority === undefined) {
      throw new ValidationError(
        `skill ${skill.id} requires requiredAuthority (a card never exposes an unrestricted skill)`,
      );
    }
    validateAuthorityScope(skill.requiredAuthority, `skill ${skill.id} requiredAuthority`);
  }
  if (
    card.capabilities === null ||
    typeof card.capabilities !== 'object' ||
    typeof card.capabilities.streaming !== 'boolean' ||
    typeof card.capabilities.pushNotifications !== 'boolean'
  ) {
    throw new ValidationError('card.capabilities must declare streaming and pushNotifications booleans');
  }
  if (!Array.isArray(card.defaultScopes)) {
    throw new ValidationError('card.defaultScopes must be an array of AuthorityScope');
  }
  for (const scope of card.defaultScopes) {
    validateAuthorityScope(scope, 'card.defaultScopes entry');
  }
  return card;
}

/** Validate a versioned AG-UI event (version + strict-UTC occurredAt + shape). */
export function validateVersionedAgUiEvent(event: VersionedAgUiEvent): VersionedAgUiEvent {
  requireNonEmpty(event.schemaVersion, 'event.schemaVersion');
  parseStrictIsoUtc(event.occurredAt, 'event.occurredAt');
  const inner = event.event;
  if (inner === null || typeof inner !== 'object' || typeof (inner as { type?: unknown }).type !== 'string') {
    throw new ValidationError('event.event must be an AgUiEvent with a string type');
  }
  const type = (inner as { type: string }).type;
  switch (type) {
    case 'RUN_STARTED':
      requireNonEmpty((inner as { runId?: unknown }).runId, 'RUN_STARTED runId');
      requireNonEmpty((inner as { threadId?: unknown }).threadId, 'RUN_STARTED threadId');
      break;
    case 'TEXT_MESSAGE_START':
      requireNonEmpty((inner as { messageId?: unknown }).messageId, 'TEXT_MESSAGE_START messageId');
      {
        const role = (inner as { role?: unknown }).role;
        if (role !== 'AGENT' && role !== 'USER') {
          throw new ValidationError('TEXT_MESSAGE_START role must be AGENT or USER');
        }
      }
      break;
    case 'TEXT_MESSAGE_CONTENT':
      requireNonEmpty((inner as { messageId?: unknown }).messageId, 'TEXT_MESSAGE_CONTENT messageId');
      if (typeof (inner as { delta?: unknown }).delta !== 'string') {
        throw new ValidationError('TEXT_MESSAGE_CONTENT delta must be a string');
      }
      break;
    case 'TEXT_MESSAGE_END':
      requireNonEmpty((inner as { messageId?: unknown }).messageId, 'TEXT_MESSAGE_END messageId');
      break;
    case 'TOOL_CALL_START':
      requireNonEmpty((inner as { toolCallId?: unknown }).toolCallId, 'TOOL_CALL_START toolCallId');
      requireNonEmpty((inner as { toolName?: unknown }).toolName, 'TOOL_CALL_START toolName');
      break;
    case 'TOOL_CALL_END':
      requireNonEmpty((inner as { toolCallId?: unknown }).toolCallId, 'TOOL_CALL_END toolCallId');
      break;
    case 'STATE_SNAPSHOT':
      if (
        typeof (inner as { snapshot?: unknown }).snapshot !== 'object' ||
        (inner as { snapshot?: unknown }).snapshot === null ||
        Array.isArray((inner as { snapshot?: unknown }).snapshot)
      ) {
        throw new ValidationError('STATE_SNAPSHOT snapshot must be an object');
      }
      break;
    case 'RUN_ERROR':
      requireNonEmpty((inner as { runId?: unknown }).runId, 'RUN_ERROR runId');
      requireNonEmpty((inner as { message?: unknown }).message, 'RUN_ERROR message');
      break;
    case 'RUN_FINISHED':
      requireNonEmpty((inner as { runId?: unknown }).runId, 'RUN_FINISHED runId');
      break;
    default:
      throw new ValidationError(`unknown AG-UI event type: ${type}`);
  }
  return event;
}
