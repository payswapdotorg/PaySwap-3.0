/**
 * Deterministic shared fixtures for the @payswap/command test suite.
 *
 * The crypto fixtures are REAL: node:crypto SHA-256/HMAC implementations
 * injected through the typed ports (test-only — src/** has no node:
 * imports; the ports prove the wire contracts are implementable with a
 * real primitive). Everything else is pure data.
 */

import { createHash, createHmac } from 'node:crypto';

import type { RequestHasher, HmacPort, Hex64, CommandClock, IdFactory } from '../src/ports.ts';
import { createDeterministicClock, createDeterministicIdFactory } from '../src/ports.ts';
import type { PrincipalRef, SessionToken } from '../src/identifiers.ts';
import type { Session } from '../src/session-contract.ts';
import type { ApprovalRequest } from '../src/approval-interaction.ts';
import type { MethodDescriptor } from '../src/method-registry.ts';
import type { ExtensionManifest } from '../src/extension-boundary.ts';
import type { DeveloperApiDescriptor } from '../src/developer-api.ts';
import { COMMAND_SURFACE_API_VERSION } from '../src/version.ts';

/** Loose override bag (capability-lane pattern): no explicit undefined — omit via omitField). */
type Loose<T> = { readonly [K in keyof T]?: T[K] };

type MethodOverrides = Loose<MethodDescriptor>;
type ManifestOverrides = Loose<ExtensionManifest>;
type RequestOverrides = Loose<ApprovalRequest>;

/** Structurally omit one field (tests probe absent optional fields). */
export function omitField<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const copy: Record<string, unknown> = { ...(value as unknown as Record<string, unknown>) };
  delete copy[key as string];
  return copy as Omit<T, K>;
}

// ---------------------------------------------------------------------------
// REAL crypto ports (test-side injections)
// ---------------------------------------------------------------------------

/** The REAL SHA-256 hasher (node:crypto) behind the RequestHasher port. */
export const realSha256: RequestHasher = {
  hashUtf8(input: string): Hex64 {
    return createHash('sha256').update(input, 'utf8').digest('hex') as Hex64;
  },
};

/** The REAL HMAC-SHA256 signer (node:crypto) behind the HmacPort. */
export const realHmac: HmacPort = {
  signUtf8(key: string, payload: string): Hex64 {
    return createHmac('sha256', key).update(payload, 'utf8').digest('hex') as Hex64;
  },
};

// ---------------------------------------------------------------------------
// Deterministic clock + id factory
// ---------------------------------------------------------------------------

/** A fixed epoch for tests: 2026-01-01T00:00:00Z = 1767225600000 ms. */
export const T0_MS = 1767225600000n;

export function testClock(): CommandClock & { advanceMs(deltaMs: bigint | number): void } {
  return createDeterministicClock(T0_MS);
}

export function testIds(): IdFactory {
  return createDeterministicIdFactory(testClock());
}

// ---------------------------------------------------------------------------
// Principals + tenants
// ---------------------------------------------------------------------------

export const USER_PRINCIPAL: PrincipalRef = Object.freeze({
  principalType: 'user',
  principalId: 'alice',
});

export const SERVICE_PRINCIPAL: PrincipalRef = Object.freeze({
  principalType: 'service',
  principalId: 'payments-bot',
});

export const AGENT_PRINCIPAL: PrincipalRef = Object.freeze({
  principalType: 'agent',
  principalId: 'agent-key-fingerprint-1',
});

// ---------------------------------------------------------------------------
// Approval requests
// ---------------------------------------------------------------------------

export function sampleApprovalRequest(overrides?: RequestOverrides): ApprovalRequest {
  return {
    principal: 'user:alice',
    requestedAuthorityScope: { domain: 'payments', actions: ['payments.intent.propose'] },
    requestHash: 'hash_test_1',
    expiresAt: '2030-01-01T00:00:00Z',
    channel: 'SMS',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Method descriptors + registries
// ---------------------------------------------------------------------------

const SCHEMA = Object.freeze({ type: 'object' });

export function sampleMethodDescriptor(overrides?: MethodOverrides): MethodDescriptor {
  return {
    methodName: 'payments.intent.propose',
    description: 'Submit a payment intent proposal (a proposal, never authority).',
    inputSchema: SCHEMA,
    outputSchema: SCHEMA,
    effectClass: 'PROPOSAL',
    idempotencyRelevant: true,
    requiredPermission: 'COMMAND_PROPOSE',
    authSchemes: ['SESSION'],
    agentCallable: true,
    requiredAuthority: { domain: 'payments', actions: ['payments.intent.propose'] },
    ...overrides,
  };
}

export function sampleMethodSet(): readonly MethodDescriptor[] {
  const readBase = omitField(
    omitField(sampleMethodDescriptor(), 'requiredPermission'),
    'requiredAuthority',
  );
  return [
    sampleMethodDescriptor(),
    {
      ...readBase,
      methodName: 'quotes.read',
      description: 'Read a quote projection (read-only; evidence, never authorization).',
      effectClass: 'NO_EFFECT',
      idempotencyRelevant: false,
      agentCallable: false,
    },
    {
      ...readBase,
      methodName: 'observations.read',
      description: 'Read fresh provider observations (evidence, never authorization).',
      effectClass: 'OBSERVATION',
      idempotencyRelevant: true,
      requiredPermission: 'OBSERVATION_READ' as const,
      agentCallable: true,
      requiredAuthority: { domain: 'observations', actions: ['observations.read'] },
    },
  ];
}

export function sampleDeveloperApi(): DeveloperApiDescriptor {
  return {
    apiVersion: COMMAND_SURFACE_API_VERSION,
    title: 'PaySwap Command API (test fixture)',
    methods: sampleMethodSet(),
  };
}

// ---------------------------------------------------------------------------
// Extension manifests
// ---------------------------------------------------------------------------

export function sampleExtensionManifest(overrides?: ManifestOverrides): ExtensionManifest {
  return {
    extensionId: 'ext_test_1',
    displayName: 'Test Extension',
    apiVersion: '1.0.0',
    permissions: ['SURFACE_RENDER', 'COMMAND_PROPOSE'],
    hostOrigins: ['https://app.payswap.example'],
    effectBearingMethods: ['payments.intent.propose'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Session fixtures
// ---------------------------------------------------------------------------

export function sampleSession(overrides?: {
  readonly securityEpoch?: bigint;
  readonly issuedAtMs?: bigint;
  readonly expiresAtMs?: bigint;
}): Session {
  return {
    token: 'sess_testtoken1' as SessionToken,
    tenantId: 'tenant_1',
    principal: USER_PRINCIPAL,
    securityEpoch: overrides?.securityEpoch ?? 1n,
    issuedAtMs: overrides?.issuedAtMs ?? T0_MS,
    expiresAtMs: overrides?.expiresAtMs ?? T0_MS + 3_600_000n,
  };
}
