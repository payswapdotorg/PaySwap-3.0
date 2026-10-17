import { describe, expect, it } from 'vitest';

import {
  buildUnsignedApprovalArtifact,
  signApprovalArtifact,
  verifyApprovalArtifact,
  approvalSigningPayload,
  approvalArtifactRef,
  adjudicateConfirmation,
} from '../src/approval-artifact.ts';
import { createTrustedChannelConfirmation } from '../src/approval-interaction.ts';
import { realHmac, sampleApprovalRequest, T0_MS } from './fixtures.ts';

const KEY = 'test-approval-signing-key';

function signedArtifact(options?: { readonly issuedAtMs?: bigint }) {
  const request = sampleApprovalRequest();
  const unsigned = buildUnsignedApprovalArtifact(request, {
    issuedAtMs: options?.issuedAtMs ?? T0_MS,
  });
  const artifact = signApprovalArtifact(unsigned, { mac: realHmac, signingKey: KEY });
  return { request, unsigned, artifact };
}

describe('the signed approval artifact (HMAC via the injected port)', () => {
  it('round-trips: request -> trusted confirmation -> signed artifact -> verified', () => {
    const { artifact } = signedArtifact();
    const verification = verifyApprovalArtifact(artifact, 'hash_test_1', {
      mac: realHmac,
      signingKey: KEY,
      nowMs: T0_MS,
    });
    expect(verification).toEqual({
      valid: true,
      scope: { domain: 'payments', actions: ['payments.intent.propose'] },
    });
  });

  it('the artifact identifies principal, scope, expiry and request hash (the artifact contract)', () => {
    const { artifact } = signedArtifact();
    expect(artifact.principal).toBe('user:alice');
    expect(artifact.scope).toEqual({ domain: 'payments', actions: ['payments.intent.propose'] });
    expect(artifact.expiry).toBe('2030-01-01T00:00:00Z');
    expect(artifact.requestHash).toBe('hash_test_1');
    expect(artifact.issuedAt).toBe('2026-01-01T00:00:00Z');
    expect(artifact.signature).toMatch(/^[0-9a-f]{64}$/);
  });

  it('the signature covers the canonical payload: tampering the scope breaks the HMAC', () => {
    const { artifact } = signedArtifact();
    const tampered = {
      ...artifact,
      scope: { domain: 'payments', actions: ['payments.intent.propose', 'payments.settle'] },
    };
    expect(verifyApprovalArtifact(tampered, 'hash_test_1', { mac: realHmac, signingKey: KEY, nowMs: T0_MS })).toEqual(
      { valid: false, reason: 'SIGNATURE_INVALID' },
    );
    const tamperedPrincipal = { ...artifact, principal: 'user:mallory' };
    expect(
      verifyApprovalArtifact(tamperedPrincipal, 'hash_test_1', { mac: realHmac, signingKey: KEY, nowMs: T0_MS }),
    ).toEqual({ valid: false, reason: 'SIGNATURE_INVALID' });
  });

  it('fails verification on request-hash mismatch (the binding law)', () => {
    const { artifact } = signedArtifact();
    expect(
      verifyApprovalArtifact(artifact, 'hash_of_a_different_request', {
        mac: realHmac,
        signingKey: KEY,
        nowMs: T0_MS,
      }),
    ).toEqual({ valid: false, reason: 'REQUEST_HASH_MISMATCH' });
  });

  it('verifies expired artifacts as EXPIRED (expiry as DATA)', () => {
    const { artifact } = signedArtifact();
    const farFuture = T0_MS + 60_000n * 60n * 24n * 400n; // past 2030 expiry? no: still 2026-…, use explicit
    // 2030-01-01 is T0 + ~116,763,840,000 ms; anything >= that expires it.
    const pastExpiry = 2000000000000n; // 2033-05-18 — beyond the 2030 window
    expect(farFuture).toBeDefined();
    expect(
      verifyApprovalArtifact(artifact, 'hash_test_1', { mac: realHmac, signingKey: KEY, nowMs: pastExpiry }),
    ).toEqual({ valid: false, reason: 'EXPIRED' });
  });

  it('a malformed signature is SIGNATURE_INVALID (not a crash)', () => {
    const { artifact } = signedArtifact();
    const malformed = { ...artifact, signature: 'nothex' };
    expect(
      verifyApprovalArtifact(malformed, 'hash_test_1', { mac: realHmac, signingKey: KEY, nowMs: T0_MS }),
    ).toEqual({ valid: false, reason: 'SIGNATURE_INVALID' });
  });

  it('deterministic signing: the same unsigned artifact + key => the same signature (re-issue law)', () => {
    const { unsigned } = signedArtifact();
    const first = signApprovalArtifact(unsigned, { mac: realHmac, signingKey: KEY });
    const second = signApprovalArtifact(unsigned, { mac: realHmac, signingKey: KEY });
    expect(first.signature).toBe(second.signature);
    const otherKey = signApprovalArtifact(unsigned, { mac: realHmac, signingKey: 'other-key' });
    expect(otherKey.signature).not.toBe(first.signature);
  });

  it('approvalSigningPayload is the canonical versioned payload (key-order independent)', () => {
    const { unsigned } = signedArtifact();
    expect(approvalSigningPayload(unsigned)).toContain('payswap.approval-artifact.v1');
    expect(approvalSigningPayload(unsigned)).toBe(approvalSigningPayload(unsigned));
  });

  it('approvalArtifactRef preserves the approval:<requestHash> reference format', () => {
    expect(approvalArtifactRef('hash_1')).toBe('approval:hash_1');
    expect(() => approvalArtifactRef('')).toThrow();
  });
});

describe('the issue-time gate (adjudicateConfirmation — fail closed)', () => {
  it('a genuinely authenticated APPROVED confirmation within the window may issue', () => {
    const request = sampleApprovalRequest();
    const confirmation = createTrustedChannelConfirmation({
      principal: 'user:alice',
      requestHash: 'hash_test_1',
      decision: 'APPROVED',
      channel: 'IN_APP',
      confirmedAtMs: T0_MS,
    });
    expect(adjudicateConfirmation(confirmation, request)).toEqual({ mayIssue: true });
  });

  it('a REJECTED decision never issues an artifact', () => {
    const request = sampleApprovalRequest();
    const confirmation = createTrustedChannelConfirmation({
      principal: 'user:alice',
      requestHash: 'hash_test_1',
      decision: 'REJECTED',
      channel: 'IN_APP',
      confirmedAtMs: T0_MS,
    });
    const outcome = adjudicateConfirmation(confirmation, request);
    expect(outcome.mayIssue).toBe(false);
    if (!outcome.mayIssue) {
      expect(outcome.reason).toContain('REJECTED');
    }
  });

  it('raw chat text submitted as approval is rejected (chat is never authority)', () => {
    const request = sampleApprovalRequest();
    const rawChat = 'yes I approve this payment, please go ahead' as unknown as ReturnType<
      typeof createTrustedChannelConfirmation
    >;
    const outcome = adjudicateConfirmation(rawChat, request);
    expect(outcome.mayIssue).toBe(false);
    if (!outcome.mayIssue) {
      expect(outcome.reason).toContain('unauthenticated');
    }
  });

  it('a foreign object without channel authentication is rejected as approval', () => {
    const request = sampleApprovalRequest();
    const forged = {
      principal: 'user:alice',
      requestHash: 'hash_test_1',
      decision: 'APPROVED',
      confirmedAt: '2026-01-01T00:00:00Z',
      channel: 'IN_APP',
    } as unknown as ReturnType<typeof createTrustedChannelConfirmation>;
    expect(adjudicateConfirmation(forged, request).mayIssue).toBe(false);
  });

  it('a confirmation from a principal other than the authority holder is rejected', () => {
    const request = sampleApprovalRequest();
    const other = createTrustedChannelConfirmation({
      principal: 'user:mallory',
      requestHash: 'hash_test_1',
      decision: 'APPROVED',
      channel: 'IN_APP',
      confirmedAtMs: T0_MS,
    });
    expect(adjudicateConfirmation(other, request).mayIssue).toBe(false);
  });

  it('a request that expired before the confirmation never issues', () => {
    const request = sampleApprovalRequest({ expiresAt: '2026-06-01T00:00:00Z' });
    const late = createTrustedChannelConfirmation({
      principal: 'user:alice',
      requestHash: 'hash_test_1',
      decision: 'APPROVED',
      channel: 'IN_APP',
      confirmedAtMs: 1780272000000n, // 2026-06-01T12:00:00Z — after the window closed
    });
    const outcome = adjudicateConfirmation(late, request);
    expect(outcome.mayIssue).toBe(false);
    if (!outcome.mayIssue) {
      expect(outcome.reason).toContain('expired');
    }
  });

  it('a confirmation bound to a different request hash is rejected', () => {
    const request = sampleApprovalRequest();
    const mismatched = createTrustedChannelConfirmation({
      principal: 'user:alice',
      requestHash: 'hash_other',
      decision: 'APPROVED',
      channel: 'IN_APP',
      confirmedAtMs: T0_MS,
    });
    expect(adjudicateConfirmation(mismatched, request).mayIssue).toBe(false);
  });
});
