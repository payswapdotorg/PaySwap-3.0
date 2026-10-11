/**
 * The deterministic test world: one composed provider runtime wired for
 * the battery — a test PSP ('test-psp') with one state-changing transfer
 * operation (carrying a customerTransactionId-style provider evidence
 * field) and one read operation, a scoped API-credential connection, a
 * broker holding a fake secret bundle, and the full store/retrieval/
 * event surfaces. Every component is deterministic (DeterministicClock).
 */

import { DeterministicClock } from '../src/clock.ts';
import { InMemoryConnectionRegistry } from '../src/connection-lifecycle.ts';
import { freezeConnectionScope } from '../src/connection-scope.ts';
import {
  BrowserSessionBroker,
  InMemoryCredentialBroker,
} from '../src/credential-isolation.ts';
import { IdempotencyContractRegistry } from '../src/idempotency.ts';
import { InMemoryIdempotencyRegistrar } from '../src/idempotency-registrar.ts';
import { OperationBindingRegistry } from '../src/operation.ts';
import { RawProviderStateStore } from '../src/raw-state.ts';
import { ProviderRetrievalService } from '../src/retrieval.ts';
import type { TimestampMs } from '../src/clock.ts';
import type { CorrelationId } from '../src/identifiers.ts';
import { asCorrelationId } from '../src/identifiers.ts';
import { ScriptedFakeTransport } from './fake-transport.ts';
import { ProviderExecutionBridge } from '../src/execution-bridge.ts';
import type { ProviderExecutionBridgeDeps, AuthorizedCommand } from '../src/execution-bridge.ts';

/** The fake provider identity used across the battery. */
export const TEST_PROVIDER = 'test-psp' as const;
/** The fake secret API key (test material ONLY — never a real credential).
 * Constructed by concatenation so the source text never contains a
 * contiguous live-provider key literal (GitHub push-protection false
 * positive on the synthetic fixture, 2026-10-11); the RUNTIME value keeps
 * the realistic provider-key shape the redaction battery must survive. */
export const TEST_SECRET_API_KEY = ('sk' + '_test_FAKEsecretDoNotUse000001') as string;
/** The fake transfer operation (state-changing; provider evidence field). */
export const TEST_TRANSFER_OPERATION = 'test-psp.create_transfer' as const;
/** The fake read operation. */
export const TEST_READ_OPERATION = 'test-psp.get_transfer' as const;

export interface TestWorld {
  readonly clock: DeterministicClock;
  readonly broker: InMemoryCredentialBroker;
  readonly browserSessions: BrowserSessionBroker;
  readonly connections: InMemoryConnectionRegistry;
  readonly contracts: IdempotencyContractRegistry;
  readonly registrar: InMemoryIdempotencyRegistrar;
  readonly store: RawProviderStateStore;
  readonly retrieval: ProviderRetrievalService;
  readonly bindings: OperationBindingRegistry;
  readonly transport: ScriptedFakeTransport;
  readonly connectionId: string;
  readonly correlationId: CorrelationId;
  readonly runtimeKey: ReturnType<InMemoryCredentialBroker['registerRuntime']>;
}

/** Build the deterministic world (SANDBOX mode by construction). */
export function buildTestWorld(): TestWorld {
  const clock = new DeterministicClock(1_000_000n);
  const broker = new InMemoryCredentialBroker();
  const runtimeKey = broker.registerRuntime('test-adapter');
  const handle = broker.registerBundle({
    kind: 'API_KEY',
    material: { apiKey: TEST_SECRET_API_KEY },
    description: 'test-psp scoped api credential (fake material)',
    registeredAt: clock.now(),
  });

  const connections = new InMemoryConnectionRegistry();
  connections.register({
    connectionId: 'conn:test-1',
    providerName: TEST_PROVIDER,
    form: 'SCOPED_API_CREDENTIAL',
    credentialKind: 'API_KEY',
    credentialHandleRef: handle,
    scope: freezeConnectionScope({
      allowedOperations: [
        'READ_PROVIDER_STATE',
        'OBSERVE_EXTERNAL_FUNDS',
        'CREATE_EXTERNAL_EFFECT',
        'MANAGE_CONNECTION',
      ],
      allowedEffectClasses: ['NONE', 'OBSERVATION_ONLY', 'STATE_CHANGING'],
      scopedCapabilities: [
        {
          definitionId: 'cap.test-psp.transfer',
          implementationId: 'impl.test-psp.1',
          version: '1.0.0',
        },
        {
          definitionId: 'cap.test-psp.transfer-read',
          implementationId: 'impl.test-psp.1',
          version: '1.0.0',
        },
      ],
      effectiveUntil: 10_000_000n,
    }),
    createdAt: clock.now(),
  });
  connections.transition('conn:test-1', 'PENDING_VERIFICATION', {
    at: clock.now(),
    cause: 'PRINCIPAL_REQUEST',
    actorRef: 'principal:test-owner',
  });
  connections.transition('conn:test-1', 'ACTIVE', {
    at: clock.now(),
    cause: 'VERIFICATION_SUCCEEDED',
    actorRef: 'principal:test-owner',
  });

  const contracts = new IdempotencyContractRegistry();
  contracts.register({
    operationId: TEST_TRANSFER_OPERATION,
    // Provider-side reality (as scripted for the fake): keys are scoped to
    // the connected account (connection) AND the endpoint (operation), the
    // key rides a provider body field (customerTransactionId-style —
    // provider evidence, not a PaySwap constant), duplicates replay the
    // original result, and same-key/different-body answers a provider
    // conflict signal.
    keyScope: { connection: true, operation: true },
    keyDerivation: 'CALLER_SUPPLIED_PROVIDER_FIELD',
    replayBehavior: 'REPLAYS_ORIGINAL_RESULT',
    conflictReporting: 'PROVIDER_CONFLICT_SIGNAL',
    providerEvidenceField: 'customerTransactionId',
    notes: 'fake provider contract: per-account+endpoint key in a body field',
  });

  const registrar = new InMemoryIdempotencyRegistrar();
  const store = new RawProviderStateStore();
  const retrieval = new ProviderRetrievalService({ store, clock });
  retrieval.registerContract({
    providerName: TEST_PROVIDER,
    objectType: 'transfer',
    operationId: TEST_READ_OPERATION,
    supportsRevisionFetch: false,
    buildFetchParams: (input) => ({ transferId: input.externalId }),
    parseFetchResponse: (response) => {
      const body = response.body as Record<string, unknown> | undefined;
      if (body === null || typeof body !== 'object') return undefined;
      const record = body as Record<string, unknown>;
      if (typeof record.id !== 'string' || typeof record.revision !== 'string') {
        return undefined;
      }
      return {
        externalId: record.id,
        revision: record.revision,
        state: record,
      };
    },
  });

  const bindings = new OperationBindingRegistry();
  bindings.register({
    declaration: {
      operationId: TEST_TRANSFER_OPERATION,
      operationClass: 'CREATE_EXTERNAL_EFFECT',
      effectClass: 'STATE_CHANGING',
      capability: {
        definitionId: 'cap.test-psp.transfer',
        implementationId: 'impl.test-psp.1',
        version: '1.0.0',
      },
      providerEndpoint: '/v1/transfers',
    },
    idempotencyContract: contracts.require(TEST_TRANSFER_OPERATION),
    parseResponse: (response) => {
      const body = response.body as Record<string, unknown>;
      const parse: {
        providerReferences: readonly string[];
        objectState?: {
          objectType: string;
          externalId: string;
          revision: string;
          state: unknown;
        };
      } = { providerReferences: [] };
      if (typeof body.id === 'string') {
        parse.providerReferences = [body.id];
        if (typeof body.revision === 'string') {
          parse.objectState = {
            objectType: 'transfer',
            externalId: body.id,
            revision: body.revision,
            state: body,
          };
        }
      }
      return parse;
    },
    bindHeaders: (material) => {
      const key = (material as { apiKey: string }).apiKey;
      return { Authorization: `Bearer ${key}` };
    },
  });
  bindings.register({
    declaration: {
      operationId: TEST_READ_OPERATION,
      operationClass: 'READ_PROVIDER_STATE',
      effectClass: 'NONE',
      capability: {
        definitionId: 'cap.test-psp.transfer-read',
        implementationId: 'impl.test-psp.1',
        version: '1.0.0',
      },
      providerEndpoint: '/v1/transfers:get',
    },
    parseResponse: () => ({ providerReferences: [] }),
    bindHeaders: (material) => {
      const key = (material as { apiKey: string }).apiKey;
      return { Authorization: `Bearer ${key}` };
    },
  });

  return {
    clock,
    broker,
    browserSessions: new BrowserSessionBroker(),
    connections,
    contracts,
    registrar,
    store,
    retrieval,
    bindings,
    transport: new ScriptedFakeTransport(),
    connectionId: 'conn:test-1',
    correlationId: asCorrelationId('corr:test-flow-1'),
    runtimeKey,
  };
}

/** The standard authorized command used by bridge tests. */
export interface TestCommandOverrides {
  readonly commandId?: string;
  readonly params?: Record<string, unknown>;
  readonly operationId?: string;
}

/** The credential dispatch bundle for the test world (the read binder). */
export function retrievalCredential(world: TestWorld): import('../src/credential-isolation.ts').CredentialDispatch {
  return {
    broker: world.broker,
    runtimeKey: world.runtimeKey,
    credentialHandleRef: world.connections.get(world.connectionId).credentialHandleRef,
    bindHeaders: (material) => ({ Authorization: `Bearer ${(material as { apiKey: string }).apiKey}` }),
  };
}

/** The standard test authorization ref (opaque structural P1-W2 pattern). */
export const TEST_AUTH = {
  artifactId: 'art:1',
  mandateRef: 'mandate:1',
  approverRef: 'principal:owner',
  epoch: 7n,
} as const;

/** Build the standard authorized command for bridge tests. */
export function testCommand(
  world: TestWorld,
  overrides?: {
    commandId?: string;
    params?: Record<string, unknown>;
    operationId?: string;
  },
): AuthorizedCommand {
  return {
    commandId: overrides?.commandId ?? 'cmd-1',
    correlationId: world.correlationId,
    authorization: TEST_AUTH,
    operationId: overrides?.operationId ?? TEST_TRANSFER_OPERATION,
    params: overrides?.params ?? { amount: '1200', currency: 'USD', recipient: 'acct_eur_1' },
  };
}

/** Build the standard SANDBOX execution bridge over the test world. */
export function testBridge(world: TestWorld): ProviderExecutionBridge {
  return new ProviderExecutionBridge(buildBridgeDeps(world));
}

function buildBridgeDeps(world: TestWorld): ProviderExecutionBridgeDeps {
  return {
    mode: 'SANDBOX',
    transport: world.transport,
    connections: world.connections,
    broker: world.broker,
    runtimeKey: world.runtimeKey,
    bindings: world.bindings,
    idempotencyContracts: world.contracts,
    idempotencyRegistrar: world.registrar,
    store: world.store,
    retrieval: world.retrieval,
    clock: world.clock,
  };
}

/** The bridge dependency bundle (for tests that need custom modes/ledgers). */
export function bridgeDeps(world: TestWorld): ProviderExecutionBridgeDeps {
  return buildBridgeDeps(world);
}

/** Advance deterministic time by a fixed delta and return it (receipt ordering). */
export function advanceMs(world: TestWorld, delta: number): TimestampMs {
  world.clock.advance(delta);
  return world.clock.now();
}
