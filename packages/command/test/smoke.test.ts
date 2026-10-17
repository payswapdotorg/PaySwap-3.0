import { describe, expect, it } from 'vitest';

import * as index from '../src/index.ts';
import { PACKAGE_NAME } from '../src/index.ts';

describe('smoke: the @payswap/command public surface', () => {
  it('exposes the package name and a substantial contract surface', () => {
    expect(PACKAGE_NAME).toBe('@payswap/command');
    const exports = Object.keys(index);
    expect(exports.length).toBeGreaterThanOrEqual(130);
  });

  it('exposes the headline wire anchors (grammar, envelope, registry, transport, interaction, boundary, dev API)', () => {
    // VALUE anchors only (type-only exports are erased at runtime; the type
    // surface is exercised by tsc + the type-utils expectations).
    const anchors = [
      'COMMAND_VERBS',
      'parseCommand',
      'workflowFormPrefillFromText',
      'resolveCounterparty',
      'noResultIntentTurn',
      'COMMAND_SURFACE_API_VERSION',
      'EXTENSION_BOUNDARY_API_VERSION',
      'COMMAND_ENVELOPE_SCHEMA_VERSION',
      'createCommandProposalEnvelope',
      'assertProposalPayloadIsAuthorityFree',
      'resolveBeginOutcome',
      'validateRequestEnvelope',
      'mapErrorCategoryToHttpStatus',
      'toWireError',
      'authenticateRequest',
      'METHOD_EFFECT_CLASSES',
      'buildMethodRegistry',
      'requireMethod',
      'validateMcpToolDescriptor',
      'validateA2AAgentCard',
      'validateVersionedAgUiEvent',
      'validateApprovalRequest',
      'parseApprovalResponse',
      'expressApprovalIntentFromChat',
      'createTrustedChannelConfirmation',
      'verifyApprovalArtifact',
      'adjudicateConfirmation',
      'defineMessagingChannel',
      'bindMessagingGateway',
      'evaluateSessionStatus',
      'mintSessionTokenVia',
      'signWebhookEventVia',
      'verifyWebhookSignature',
      'backoffDelayMs',
      'EXTENSION_PERMISSIONS',
      'validateExtensionManifest',
      'assertExtensionRequestAllowed',
      'describeDeveloperApi',
      'projectExternalAgentApi',
      'FinancialAuthorityError',
      'isFailureOutcome',
    ] as const satisfies readonly string[];
    for (const anchor of anchors) {
      expect((index as Record<string, unknown>)[anchor], `missing export: ${anchor}`).toBeDefined();
    }
  });

  it('type-level pins survive erasure: the value surface carries the vocabulary floors', () => {
    expect([...index.METHOD_EFFECT_CLASSES]).toHaveLength(3);
    expect([...index.EXTENSION_PERMISSIONS]).toHaveLength(4);
    expect([...index.APPROVAL_CHANNELS]).toHaveLength(4);
    expect([...index.COMMAND_VERBS]).toHaveLength(6);
    expect([...index.MUTATING_HTTP_METHODS]).toHaveLength(4);
  });
});
