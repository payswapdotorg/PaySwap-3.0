import { describe, expect, it } from 'vitest';

import {
  defineMessagingChannel,
  bindMessagingGateway,
  MessagingChannelCapabilityError,
  type MessagingApprovalAdapterBinding,
  type InboundChannelMessage,
} from '../src/messaging-gateway.ts';
import { renderApprovalMessage, parseApprovalResponse } from '../src/approval-interaction.ts';
import { sampleApprovalRequest } from './fixtures.ts';

/**
 * ADAPTED from the old repository's messaging adapter tests
 * (packages/ux/test/messaging-adapters.test.ts — the P7-W3 share): the
 * capability-declaration laws, the gated rendering (deep-link law), the
 * intent-at-most receive outcomes and the channel binding — with typed
 * next-step descriptors replacing the old view-model `ViewAction`.
 */

const ADAPTER: MessagingApprovalAdapterBinding = {
  renderApprovalMessage(request) {
    return renderApprovalMessage(request, { deepLinkBaseUrl: 'https://app.payswap.example' });
  },
  parseApprovalResponse(message) {
    return parseApprovalResponse({ text: message.text, senderRef: 'x', sentAt: '2026-01-01T00:00:00Z' });
  },
};

const capable = defineMessagingChannel({
  channelId: 'ch_sms',
  displayName: 'SMS',
  canRenderApprovalRequests: true,
  canReceiveReplies: true,
  canDeliverNotifications: true,
  supportedReplyKinds: ['APPROVAL_REPLY', 'STATUS_QUERY', 'FREE_TEXT'],
});

function inbound(text: string, channelId = 'ch_sms'): InboundChannelMessage {
  return { channelId, senderRef: 'user:alice', sentAt: '2026-01-01T00:00:00Z', text };
}

describe('channel capability declarations (fail closed)', () => {
  it('rejects approval rendering without notification delivery', () => {
    expect(() =>
      defineMessagingChannel({
        channelId: 'ch_1',
        displayName: 'X',
        canRenderApprovalRequests: true,
        canReceiveReplies: false,
        canDeliverNotifications: false,
      }),
    ).toThrow(MessagingChannelCapabilityError);
  });

  it('rejects reply capability without declared reply kinds', () => {
    expect(() =>
      defineMessagingChannel({
        channelId: 'ch_2',
        displayName: 'X',
        canRenderApprovalRequests: false,
        canReceiveReplies: true,
        canDeliverNotifications: true,
        supportedReplyKinds: [],
      }),
    ).toThrow(MessagingChannelCapabilityError);
    expect(() =>
      defineMessagingChannel({
        channelId: 'ch_3',
        displayName: 'X',
        canRenderApprovalRequests: false,
        canReceiveReplies: true,
        canDeliverNotifications: true,
      }),
    ).toThrow(MessagingChannelCapabilityError);
  });

  it('rejects empty channel ids and display names', () => {
    expect(() =>
      defineMessagingChannel({
        channelId: '',
        displayName: 'X',
        canRenderApprovalRequests: false,
        canReceiveReplies: false,
        canDeliverNotifications: false,
      }),
    ).toThrow(MessagingChannelCapabilityError);
  });
});

describe('the gated messaging gateway', () => {
  it('a capable channel renders the approval message with the trusted-surface deep link', () => {
    const gateway = bindMessagingGateway({ channel: capable, adapter: ADAPTER });
    const message = gateway.renderApprovalRequest(sampleApprovalRequest(), 'user:alice');
    expect(message.kind).toBe('APPROVAL_REQUEST');
    expect(message.requestHash).toBe('hash_test_1');
    expect(message.deepLink).toBe('https://app.payswap.example/approvals/hash_test_1');
    expect(message.authorizationNote).toContain('exclusively on the trusted surface');
  });

  it('a channel without approval capability FAILS CLOSED', () => {
    const noApprovals = defineMessagingChannel({
      channelId: 'ch_plain',
      displayName: 'Plain',
      canRenderApprovalRequests: false,
      canReceiveReplies: false,
      canDeliverNotifications: true,
    });
    const gateway = bindMessagingGateway({ channel: noApprovals, adapter: ADAPTER });
    expect(() => gateway.renderApprovalRequest(sampleApprovalRequest(), 'user:alice')).toThrow(
      MessagingChannelCapabilityError,
    );
  });

  it('an approval message without a trusted-surface deep link is rejected (a chat reply is never the completion path)', () => {
    const brokenAdapter: MessagingApprovalAdapterBinding = {
      renderApprovalMessage() {
        return { text: 'approve?', requestHash: 'hash_test_1', deepLink: '' };
      },
      parseApprovalResponse: ADAPTER.parseApprovalResponse,
    };
    const gateway = bindMessagingGateway({ channel: capable, adapter: brokenAdapter });
    expect(() => gateway.renderApprovalRequest(sampleApprovalRequest(), 'user:alice')).toThrow(
      MessagingChannelCapabilityError,
    );
  });

  it('notifications carry no authority (informational only)', () => {
    const gateway = bindMessagingGateway({ channel: capable, adapter: ADAPTER });
    const notification = gateway.deliverNotification('user:alice', 'your payment is progressing');
    expect(notification.kind).toBe('NOTIFICATION');
    expect(notification.authorizationNote).toContain('no authority');
    expect(notification.deepLink).toBeUndefined();
  });

  it('notification delivery on a channel without the capability fails closed', () => {
    const noNotifications = defineMessagingChannel({
      channelId: 'ch_receive_only',
      displayName: 'ReceiveOnly',
      canRenderApprovalRequests: false,
      canReceiveReplies: true,
      canDeliverNotifications: false,
      supportedReplyKinds: ['FREE_TEXT'],
    });
    const gateway = bindMessagingGateway({ channel: noNotifications, adapter: ADAPTER });
    expect(() => gateway.deliverNotification('user:alice', 'x')).toThrow(MessagingChannelCapabilityError);
  });
});

describe('inbound outcomes (intents at most)', () => {
  it('an APPROVE reply yields an intent that still REQUIRES the trusted surface', () => {
    const gateway = bindMessagingGateway({ channel: capable, adapter: ADAPTER });
    const outcome = gateway.receive(inbound('APPROVE hash_test_1'));
    if (outcome.kind !== 'APPROVAL_INTENT') {
      throw new Error('expected an approval intent');
    }
    expect(outcome.intent).toBe('APPROVE');
    expect(outcome.requestHash).toBe('hash_test_1');
    expect(outcome.requiresTrustedSurfaceConfirmation).toBe(true);
    expect(outcome.nextStep).toEqual({ kind: 'TRUSTED_SURFACE', requestHash: 'hash_test_1' });
  });

  it('a REJECT reply is also just an intent for the trusted surface', () => {
    const gateway = bindMessagingGateway({ channel: capable, adapter: ADAPTER });
    const outcome = gateway.receive(inbound('REJECT hash_test_1'));
    if (outcome.kind !== 'APPROVAL_INTENT') {
      throw new Error('expected an approval intent');
    }
    expect(outcome.intent).toBe('REJECT');
    expect(outcome.requiresTrustedSurfaceConfirmation).toBe(true);
  });

  it('a status query yields a read-only status intent (no override)', () => {
    const gateway = bindMessagingGateway({ channel: capable, adapter: ADAPTER });
    const outcome = gateway.receive(inbound('what is the status of my payment?'));
    if (outcome.kind !== 'STATUS_QUERY') {
      throw new Error('expected a status query');
    }
    expect(outcome.nextStep).toEqual({ kind: 'NAVIGATION', target: 'status-view' });
    expect(outcome.authorizationNote).toContain('read-only');
  });

  it('free text without intent is NOT_ACTIONABLE', () => {
    const gateway = bindMessagingGateway({ channel: capable, adapter: ADAPTER });
    const outcome = gateway.receive(inbound('hey, lunch?'));
    expect(outcome.kind).toBe('NOT_ACTIONABLE');
  });

  it('a channel that does not declare APPROVAL_REPLY support does not accept approval replies', () => {
    const noApprovalReplies = defineMessagingChannel({
      channelId: 'ch_status_only',
      displayName: 'StatusOnly',
      canRenderApprovalRequests: false,
      canReceiveReplies: true,
      canDeliverNotifications: true,
      supportedReplyKinds: ['STATUS_QUERY', 'FREE_TEXT'],
    });
    const gateway = bindMessagingGateway({ channel: noApprovalReplies, adapter: ADAPTER });
    const outcome = gateway.receive(inbound('APPROVE hash_test_1', 'ch_status_only'));
    expect(outcome.kind).toBe('NOT_ACTIONABLE');
    if (outcome.kind === 'NOT_ACTIONABLE') {
      expect(outcome.reason).toContain('does not support approval replies');
    }
  });

  it('messages bound to a different channel are rejected', () => {
    const gateway = bindMessagingGateway({ channel: capable, adapter: ADAPTER });
    expect(() => gateway.receive(inbound('APPROVE hash_test_1', 'ch_other'))).toThrow(
      MessagingChannelCapabilityError,
    );
  });

  it('a channel without reply capability fails closed on receive', () => {
    const noReplies = defineMessagingChannel({
      channelId: 'ch_broadcast',
      displayName: 'Broadcast',
      canRenderApprovalRequests: false,
      canReceiveReplies: false,
      canDeliverNotifications: true,
    });
    const gateway = bindMessagingGateway({ channel: noReplies, adapter: ADAPTER });
    expect(() => gateway.receive(inbound('APPROVE hash_test_1', 'ch_broadcast'))).toThrow(
      MessagingChannelCapabilityError,
    );
  });
});
