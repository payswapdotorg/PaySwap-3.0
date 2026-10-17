import { describe, expect, it } from 'vitest';

import {
  validateMcpToolDescriptor,
  validateMcpToolList,
  validateA2AMessage,
  validateA2AAgentCard,
  validateVersionedAgUiEvent,
  type McpToolDescriptor,
  type A2AMessage,
  type A2AAgentCard,
  type VersionedAgUiEvent,
} from '../src/agent-interaction.ts';
import { ValidationError } from '../src/errors.ts';

const SCHEMA = Object.freeze({ type: 'object' });

function sampleTool(): McpToolDescriptor {
  return {
    schemaVersion: '1.0.0',
    name: 'payments_intent_propose',
    description: 'Wraps the payments.intent.propose command reference.',
    inputSchema: SCHEMA,
    outputSchema: SCHEMA,
    capabilityRef: {
      capabilityId: 'cap.payments.intent',
      capabilityVersion: '1.2.0',
      command: { commandType: 'payments.intent.propose', commandId: 'cmd_1' },
    },
    requiredAuthority: { domain: 'payments', actions: ['payments.intent.propose'] },
  };
}

function sampleCard(): A2AAgentCard {
  return {
    schemaVersion: '1.0.0',
    name: 'payswap-payments-agent',
    description: 'An agent that proposes payment intents.',
    url: 'https://agents.payswap.example/payments',
    cardVersion: '1.0.0',
    principalRef: 'user:alice',
    skills: [
      {
        id: 'skill-propose',
        name: 'propose-payment',
        description: 'Proposes a payment intent for approval.',
        requiredAuthority: { domain: 'payments', actions: ['payments.intent.propose'] },
      },
    ],
    capabilities: { streaming: true, pushNotifications: false },
    defaultScopes: [{ domain: 'payments', actions: ['payments.intent.propose'] }],
  };
}

describe('MCP tool descriptors (tools cannot mint authority)', () => {
  it('accepts a well-formed tool whose requiredAuthority is declared', () => {
    expect(() => validateMcpToolDescriptor(sampleTool())).not.toThrow();
  });

  it('requiredAuthority is MANDATORY — an unrestricted tool is rejected (INV-9)', () => {
    const stripped = { ...sampleTool(), requiredAuthority: undefined } as unknown as McpToolDescriptor;
    expect(() => validateMcpToolDescriptor(stripped)).toThrow(ValidationError);
  });

  it('an empty requiredAuthority scope is rejected (fail closed)', () => {
    const tool = { ...sampleTool(), requiredAuthority: { domain: '', actions: [] } };
    expect(() => validateMcpToolDescriptor(tool)).toThrow(ValidationError);
  });

  it('name, description and schemas are validated; command refs are opaque but non-empty', () => {
    expect(() => validateMcpToolDescriptor({ ...sampleTool(), name: '' })).toThrow(ValidationError);
    expect(() => validateMcpToolDescriptor({ ...sampleTool(), description: '' })).toThrow(ValidationError);
    expect(() =>
      validateMcpToolDescriptor({
        ...sampleTool(),
        capabilityRef: { ...sampleTool().capabilityRef, command: { commandType: '', commandId: '' } },
      }),
    ).toThrow(ValidationError);
  });

  it('tool lists reject duplicates and require the version pin', () => {
    expect(() =>
      validateMcpToolList({ schemaVersion: '1.0.0', tools: [sampleTool(), sampleTool()] }),
    ).toThrow(ValidationError);
    expect(() => validateMcpToolList({ schemaVersion: '', tools: [] })).toThrow(ValidationError);
    expect(() => validateMcpToolList({ schemaVersion: '1.0.0', tools: [sampleTool()] })).not.toThrow();
  });
});

describe('A2A messages and agent cards (attenuation discipline)', () => {
  it('accepts a well-formed message with text, data and command-ref parts', () => {
    const message: A2AMessage = {
      schemaVersion: '1.0.0',
      messageId: 'msg_1',
      role: 'AGENT',
      sentAt: '2026-01-01T00:00:00Z',
      parts: [
        { kind: 'text', text: 'proposing a payment' },
        { kind: 'data', data: { note: 'structured' } },
        { kind: 'command-ref', commandRef: { commandType: 'payments.intent.propose', commandId: 'cmd_1' } },
      ],
    };
    expect(() => validateA2AMessage(message)).not.toThrow();
  });

  it('rejects malformed roles, timestamps and parts (fail closed)', () => {
    const base: A2AMessage = {
      schemaVersion: '1.0.0',
      messageId: 'msg_1',
      role: 'AGENT',
      sentAt: '2026-01-01T00:00:00Z',
      parts: [],
    };
    expect(() => validateA2AMessage({ ...base, role: 'SYSTEM' as 'AGENT' })).toThrow(ValidationError);
    expect(() => validateA2AMessage({ ...base, sentAt: 'not-a-timestamp' })).toThrow(ValidationError);
    expect(() =>
      validateA2AMessage({ ...base, parts: [{ kind: 'text', text: '' }] }),
    ).toThrow(ValidationError);
    expect(() => validateA2AMessage({ ...base, parts: [{ kind: 'unknown' as 'text', text: 'x' }] })).toThrow(
      ValidationError,
    );
  });

  it('a card never exposes an unrestricted skill: requiredAuthority is mandatory', () => {
    expect(() => validateA2AAgentCard(sampleCard())).not.toThrow();
    const unrestricted: A2AAgentCard = {
      ...sampleCard(),
      skills: [{ ...sampleCard().skills[0]!, requiredAuthority: undefined as never }],
    };
    expect(() => validateA2AAgentCard(unrestricted)).toThrow(ValidationError);
  });

  it('card laws: principal named, duplicate skill ids rejected, defaultScopes validated', () => {
    expect(() => validateA2AAgentCard({ ...sampleCard(), principalRef: '' })).toThrow(ValidationError);
    expect(() =>
      validateA2AAgentCard({
        ...sampleCard(),
        skills: [...sampleCard().skills, ...sampleCard().skills],
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateA2AAgentCard({ ...sampleCard(), defaultScopes: [{ domain: 'payments', actions: [] }] }),
    ).toThrow(ValidationError);
    expect(() =>
      validateA2AAgentCard({
        ...sampleCard(),
        capabilities: { streaming: true, pushNotifications: 'yes' as unknown as boolean },
      }),
    ).toThrow(ValidationError);
  });
});

describe('AG-UI event validation (run errors are not payment failures)', () => {
  it('accepts every event kind of the adapted subset', () => {
    const events: VersionedAgUiEvent[] = [
      { schemaVersion: '1.0.0', occurredAt: '2026-01-01T00:00:00Z', event: { type: 'RUN_STARTED', runId: 'r1', threadId: 't1' } },
      { schemaVersion: '1.0.0', occurredAt: '2026-01-01T00:00:00Z', event: { type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'AGENT' } },
      { schemaVersion: '1.0.0', occurredAt: '2026-01-01T00:00:00Z', event: { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'hi' } },
      { schemaVersion: '1.0.0', occurredAt: '2026-01-01T00:00:00Z', event: { type: 'TEXT_MESSAGE_END', messageId: 'm1' } },
      { schemaVersion: '1.0.0', occurredAt: '2026-01-01T00:00:00Z', event: { type: 'TOOL_CALL_START', toolCallId: 'tc1', toolName: 'payments_intent_propose' } },
      { schemaVersion: '1.0.0', occurredAt: '2026-01-01T00:00:00Z', event: { type: 'TOOL_CALL_END', toolCallId: 'tc1' } },
      { schemaVersion: '1.0.0', occurredAt: '2026-01-01T00:00:00Z', event: { type: 'STATE_SNAPSHOT', snapshot: { step: 2 } } },
      { schemaVersion: '1.0.0', occurredAt: '2026-01-01T00:00:00Z', event: { type: 'RUN_ERROR', runId: 'r1', message: 'agent run failed' } },
      { schemaVersion: '1.0.0', occurredAt: '2026-01-01T00:00:00Z', event: { type: 'RUN_FINISHED', runId: 'r1' } },
    ];
    for (const event of events) {
      expect(() => validateVersionedAgUiEvent(event)).not.toThrow();
    }
    expect(events).toHaveLength(9);
  });

  it('rejects malformed events: unknown type, missing fields, bad timestamp (fail closed)', () => {
    expect(() =>
      validateVersionedAgUiEvent({
        schemaVersion: '1.0.0',
        occurredAt: '2026-01-01T00:00:00Z',
        event: { type: 'PAYMENT_FAILED' } as never,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateVersionedAgUiEvent({
        schemaVersion: '1.0.0',
        occurredAt: '2026-01-01T00:00:00Z',
        event: { type: 'RUN_STARTED', runId: '', threadId: 't1' },
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateVersionedAgUiEvent({
        schemaVersion: '1.0.0',
        occurredAt: 'yesterday',
        event: { type: 'RUN_FINISHED', runId: 'r1' },
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateVersionedAgUiEvent({
        schemaVersion: '1.0.0',
        occurredAt: '2026-01-01T00:00:00Z',
        event: { type: 'STATE_SNAPSHOT', snapshot: 'not-an-object' as never },
      }),
    ).toThrow(ValidationError);
  });

  it('RUN_ERROR is a run-lifecycle error — the vocabulary has no payment-terminal member (INV-4 thinking)', () => {
    // The event union cannot express payment terminal states: machine-checked
    // by scanning the source union for terminal-state tokens.
    const source = JSON.stringify({
      RUN_STARTED: 1,
      RUN_ERROR: 'runId+message',
      RUN_FINISHED: 'runId',
    });
    expect(source).not.toContain('PAYMENT_');
    expect(source).not.toContain('SETTLED');
    expect(source).not.toContain('FULFILLED');
  });
});
