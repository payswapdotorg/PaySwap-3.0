import { describe, expect, it } from 'vitest';

import {
  validateApprovalRequest,
  approvalRequestMaterial,
  renderApprovalMessage,
  parseApprovalResponse,
  expressApprovalIntentFromChat,
  createTrustedChannelConfirmation,
  isAuthenticatedConfirmation,
  computeRequestHashVia,
  type ChatMessage,
} from '../src/approval-interaction.ts';
import { ValidationError } from '../src/errors.ts';
import { sampleApprovalRequest, realSha256 } from './fixtures.ts';

function chat(text: string): ChatMessage {
  return { text, senderRef: 'user:alice', sentAt: '2026-01-01T00:00:00Z' };
}

describe('approval request validation (fail closed)', () => {
  it('accepts a well-formed request bound to its request hash', () => {
    const request = validateApprovalRequest(sampleApprovalRequest());
    expect(request.principal).toBe('user:alice');
    expect(request.requestHash).toBe('hash_test_1');
    expect(request.channel).toBe('SMS');
    expect(request.requestedAuthorityScope).toEqual({
      domain: 'payments',
      actions: ['payments.intent.propose'],
    });
  });

  it('rejects missing principal/hash, empty scopes, bad channels and malformed expiry', () => {
    expect(() => validateApprovalRequest({ ...sampleApprovalRequest(), principal: '' })).toThrow(ValidationError);
    expect(() => validateApprovalRequest({ ...sampleApprovalRequest(), requestHash: '' })).toThrow(ValidationError);
    expect(() =>
      validateApprovalRequest({
        ...sampleApprovalRequest(),
        requestedAuthorityScope: { domain: 'payments', actions: [] },
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateApprovalRequest({ ...sampleApprovalRequest(), channel: 'TELEPATHY' as 'SMS' }),
    ).toThrow(ValidationError);
    expect(() => validateApprovalRequest({ ...sampleApprovalRequest(), expiresAt: 'tomorrow' })).toThrow(
      ValidationError,
    );
  });
});

describe('request material + hashing (deterministic binding)', () => {
  it('approvalRequestMaterial is the canonical versioned serialization', () => {
    const material = approvalRequestMaterial(sampleApprovalRequest());
    expect(material).toContain('payswap.approval-request.v1');
    expect(material).toContain('user:alice');
    expect(material).toContain('hash_test_1');
  });

  it('computeRequestHashVia: canonical JSON + SHA-256 (key order does not affect the hash)', () => {
    const payloadA = { kind: 'intent', amount: { currency: 'USD', minorUnits: '1000' }, note: 'x' };
    const payloadB = { note: 'x', amount: { minorUnits: '1000', currency: 'USD' }, kind: 'intent' };
    expect(computeRequestHashVia(realSha256, payloadA)).toBe(computeRequestHashVia(realSha256, payloadB));
    expect(computeRequestHashVia(realSha256, payloadA)).toMatch(/^[0-9a-f]{64}$/);
    expect(computeRequestHashVia(realSha256, payloadA)).not.toBe(computeRequestHashVia(realSha256, { other: 1 }));
  });
});

describe('approval message rendering (the deep-link law)', () => {
  it('renders the APPROVE/REJECT reply text AND the trusted-surface deep link', () => {
    const message = renderApprovalMessage(sampleApprovalRequest(), {
      deepLinkBaseUrl: 'https://app.payswap.example',
    });
    expect(message.requestHash).toBe('hash_test_1');
    expect(message.deepLink).toBe('https://app.payswap.example/approvals/hash_test_1');
    expect(message.text).toContain('APPROVE hash_test_1');
    expect(message.text).toContain('REJECT hash_test_1');
    expect(message.text).toContain('expresses intent only');
  });

  it('an empty deep-link base is rejected (a bare chat reply is never the completion path)', () => {
    expect(() => renderApprovalMessage(sampleApprovalRequest(), { deepLinkBaseUrl: '' })).toThrow(ValidationError);
  });
});

describe('intent-at-most parsing (raw chat text is never authority)', () => {
  it('parses APPROVE/REJECT replies into intents; first match wins; word-boundary anchored', () => {
    expect(parseApprovalResponse(chat('APPROVE hash_test_1'))).toEqual({
      kind: 'INTENT',
      intent: 'APPROVE',
      requestHash: 'hash_test_1',
    });
    expect(parseApprovalResponse(chat('REJECT hash_test_1'))).toEqual({
      kind: 'INTENT',
      intent: 'REJECT',
      requestHash: 'hash_test_1',
    });
    expect(parseApprovalResponse(chat('APPROVE hash_1 then REJECT hash_2'))).toEqual({
      kind: 'INTENT',
      intent: 'APPROVE',
      requestHash: 'hash_1',
    });
  });

  it('unrelated chat is NOT_AN_APPROVAL (no intent manufactured)', () => {
    expect(parseApprovalResponse(chat('hey, what is the weather like?'))).toEqual({ kind: 'NOT_AN_APPROVAL' });
    expect(parseApprovalResponse(chat('yes I approve this payment, please go ahead'))).toEqual({
      kind: 'NOT_AN_APPROVAL',
    });
    expect(parseApprovalResponse(chat('approve hash_1'))).toEqual({ kind: 'NOT_AN_APPROVAL' });
  });

  it('expressApprovalIntentFromChat: the intent ALWAYS requires the trusted surface (constant law)', () => {
    const outcome = expressApprovalIntentFromChat(chat('APPROVE hash_test_1'));
    if (outcome.kind !== 'APPROVAL_INTENT') {
      throw new Error('expected an approval intent');
    }
    expect(outcome.requiresTrustedSurfaceConfirmation).toBe(true);
    expect(outcome.intent).toBe('APPROVE');
    expect(outcome.requestHash).toBe('hash_test_1');
    expect(outcome.note).toContain('intent only');
    expect(expressApprovalIntentFromChat(chat('small talk'))).toEqual({ kind: 'NOT_AN_APPROVAL' });
  });
});

describe('the trusted-channel confirmation seam (the ONLY constructor)', () => {
  it('creates a genuinely authenticated confirmation with strict-UTC confirmedAt DATA', () => {
    const confirmation = createTrustedChannelConfirmation({
      principal: 'user:alice',
      requestHash: 'hash_test_1',
      decision: 'APPROVED',
      channel: 'IN_APP',
      confirmedAtMs: 1767225600000n,
    });
    expect(confirmation.principal).toBe('user:alice');
    expect(confirmation.confirmedAt).toBe('2026-01-01T00:00:00Z');
    expect(isAuthenticatedConfirmation(confirmation)).toBe(true);
  });

  it('rejects malformed seam inputs (fail closed)', () => {
    expect(() =>
      createTrustedChannelConfirmation({
        principal: '',
        requestHash: 'hash_test_1',
        decision: 'APPROVED',
        channel: 'IN_APP',
        confirmedAtMs: 0n,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      createTrustedChannelConfirmation({
        principal: 'user:alice',
        requestHash: 'hash_test_1',
        decision: 'MAYBE' as 'APPROVED',
        channel: 'IN_APP',
        confirmedAtMs: 0n,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      createTrustedChannelConfirmation({
        principal: 'user:alice',
        requestHash: 'hash_test_1',
        decision: 'APPROVED',
        channel: 'PONY' as 'IN_APP',
        confirmedAtMs: 0n,
      }),
    ).toThrow(ValidationError);
  });

  it('forged foreign objects are NOT authenticated confirmations (raw chat is never authority)', () => {
    const forged = {
      principal: 'user:alice',
      requestHash: 'hash_test_1',
      decision: 'APPROVED',
      confirmedAt: '2026-01-01T00:00:00Z',
      channel: 'IN_APP',
    };
    expect(isAuthenticatedConfirmation(forged)).toBe(false);
    expect(isAuthenticatedConfirmation('yes I approve this payment')).toBe(false);
    expect(isAuthenticatedConfirmation(null)).toBe(false);
    const rawChatText = 'yes I approve this payment, please go ahead' as unknown as ReturnType<
      typeof createTrustedChannelConfirmation
    >;
    expect(isAuthenticatedConfirmation(rawChatText)).toBe(false);
  });
});
