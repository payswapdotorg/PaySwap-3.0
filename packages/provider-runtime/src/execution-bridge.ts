/**
 * @payswap/provider-runtime — the execution bridge (P2-W2).
 *
 * The adapter execution path: an AUTHORIZED COMMAND (opaque
 * AuthorizationRef in, per the P1-W2 pattern) through a live CONNECTION
 * to an EXTERNAL EFFECT ATTEMPT, with the explicit result envelope
 * CONFIRMED / UNKNOWN / FAILED (INV-04 — an ambiguous outcome after a
 * potentially effective external command is UNKNOWN and must be
 * reconciled before any consequential retry).
 *
 * The bridge composes every runtime law in dispatch order:
 *
 * 1. COMMAND VALIDATION: structural authorization lineage (INV-05) +
 *    operation binding exists + params clean of secret material (INV-19).
 * 2. CONNECTION ADMISSION: lifecycle (ACTIVE/DEGRADED only) + scope
 *    (operation class, effect class, exact capability reference).
 * 3. IDEMPOTENCY: endpoint-specific contract (fail-closed INV-06), key
 *    derivation, registrar begin (BEGIN / REPLAY / CONFLICT).
 * 4. RECONCILE-BEFORE-RETRY GATE: a consequential command whose prior
 *    attempt is an unresolved UNKNOWN is REFUSED unless a post-ambiguity
 *    provider retrieval exists (INV-04). The runtime SUPPLIES the
 *    retrieval evidence; the definitive resolution is the protocol lane.
 * 5. DISPATCH INSIDE THE SEAL: credential material opens ONLY inside
 *    broker.withMaterial; the binder builds provider headers; the
 *    transport carries the call. Headers never enter any record.
 * 6. CLASSIFICATION + RETENTION: transport response → result envelope;
 *    delivered object state retained losslessly (redacted at boundary).
 * 7. ATTEMPT RECORD: commandId, providerReferences, correlationId,
 *    eventId?, dispatched/completed times, outcome, authorization lineage
 *    and raw-state record id — persisted into the attempt ledger.
 */

import {
  ConnectionScopeViolationError,
  IdempotencyKeyConflictError,
  ReconciliationRequiredBeforeRetryError,
  ValidationError,
} from './errors.ts';
import type { RuntimeClock, TimestampMs } from './clock.ts';
import type { RawStateRecordId } from './identifiers.ts';
import { contentHash } from './identifiers.ts';
import type { AuthorizationRef } from './refs.ts';
import { validateAuthorizationRef } from './refs.ts';
import type { InMemoryConnectionRegistry } from './connection-lifecycle.ts';
import type { ConnectorRuntimeKey } from './credential-isolation.ts';
import type { InMemoryCredentialBroker } from './credential-isolation.ts';
import { deriveIdempotencyKey } from './idempotency.ts';
import type { IdempotencyContractRegistry } from './idempotency.ts';
import type { IdempotencyRecord, InMemoryIdempotencyRegistrar } from './idempotency-registrar.ts';
import type { RawProviderStateStore } from './raw-state.ts';
import type { ProviderRetrievalService } from './retrieval.ts';
import type { ProviderTransport, ProviderTransportCall } from './transport.ts';
import {
  classifyTransportOutcome,
  envelopeFromClassification,
  type ExecutionResultEnvelope,
} from './result-envelope.ts';
import type { OperationBinding, OperationBindingRegistry } from './operation.ts';
import { validateOperationResponseParse } from './operation.ts';
import type { EffectAttempt } from './attempts.ts';
import { InMemoryEffectAttemptLedger } from './attempts.ts';
import type { ExecutionMode } from './execution-mode.ts';
import { validateTransportBinding } from './execution-mode.ts';
import { redactForArtifact } from './redaction.ts';

/** The authorized command entering the bridge (opaque authorization ref in). */
export interface AuthorizedCommand {
  readonly commandId: string;
  readonly correlationId: string;
  /** OPAQUE structural authorization lineage (P1-W2 pattern; trust lane owns semantics). */
  readonly authorization: AuthorizationRef;
  /** The operation to execute (must be a registered adapter binding). */
  readonly operationId: string;
  /** Operation params — must be clean of secret material (fail-closed). */
  readonly params: Readonly<Record<string, unknown>>;
}

/** Dependencies the bridge composes (all injected; deterministic battery). */
export interface ProviderExecutionBridgeDeps {
  readonly mode: ExecutionMode;
  readonly transport: ProviderTransport;
  readonly connections: InMemoryConnectionRegistry;
  readonly broker: InMemoryCredentialBroker;
  readonly runtimeKey: ConnectorRuntimeKey;
  readonly bindings: OperationBindingRegistry;
  readonly idempotencyContracts: IdempotencyContractRegistry;
  readonly idempotencyRegistrar: InMemoryIdempotencyRegistrar;
  readonly store: RawProviderStateStore;
  readonly retrieval: ProviderRetrievalService;
  readonly clock: RuntimeClock;
  /** The append-only attempt ledger (injectable; default: fresh in-memory). */
  readonly attempts?: InMemoryEffectAttemptLedger;
}

/**
 * The execution bridge. One instance binds ONE transport under ONE
 * execution mode; the sandbox/live transport-binding law is validated at
 * construction (a LIVE runtime can never bind a FAKE_DETERMINISTIC
 * transport — INV-25).
 */
export class ProviderExecutionBridge {
  readonly mode: ExecutionMode;
  readonly transportId: string;
  private readonly deps: ProviderExecutionBridgeDeps;
  private readonly ledger: InMemoryEffectAttemptLedger;

  constructor(deps: ProviderExecutionBridgeDeps) {
    validateTransportBinding(deps.mode, deps.transport.transportClass);
    this.deps = deps;
    this.mode = deps.mode;
    this.transportId = deps.transport.transportId;
    this.ledger = deps.attempts ?? new InMemoryEffectAttemptLedger();
  }

  /** The attempt ledger (audit surface). */
  attempts(): InMemoryEffectAttemptLedger {
    return this.ledger;
  }

  /** Execute one authorized command through the connection. */
  async execute(
    command: AuthorizedCommand,
    input: { readonly connectionId: string },
  ): Promise<ExecutionResultEnvelope> {
    // --- 1. command validation -----------------------------------------
    validateAuthorizationRef(command.authorization);
    if (typeof command.commandId !== 'string' || command.commandId.length === 0) {
      throw new ValidationError('command requires a commandId');
    }
    if (typeof command.correlationId !== 'string' || command.correlationId.length === 0) {
      throw new ValidationError('command requires a correlationId');
    }
    if (command.params === null || typeof command.params !== 'object') {
      throw new ValidationError('command params must be a record');
    }
    const paramRedaction = redactForArtifact(command.params);
    if (paramRedaction.notices.length > 0) {
      throw new ValidationError(
        'INV-19: command params carry secret-shaped material — secret material never enters the execution path',
        { paths: paramRedaction.notices.map((n) => n.path) },
      );
    }
    const binding = this.deps.bindings.require(command.operationId);
    const declaration = binding.declaration;

    // --- 2. connection admission ---------------------------------------
    const connection = this.deps.connections.get(input.connectionId);
    const now = this.deps.clock.now();
    const admitted = this.deps.connections.admitsOperation(
      input.connectionId,
      {
        operationClass: declaration.operationClass,
        effectClass: declaration.effectClass,
        capability: declaration.capability,
      },
      now,
    );
    if (!admitted) {
      throw new ConnectionScopeViolationError(
        `connection '${input.connectionId}' refuses operation '${command.operationId}' (lifecycle '${connection.state}' + scope admission failed)`,
        { connectionId: input.connectionId, operationId: command.operationId },
      );
    }

    const isConsequential = declaration.effectClass === 'STATE_CHANGING';
    const contract = isConsequential
      ? this.deps.idempotencyContracts.require(command.operationId)
      : undefined;
    const idempotencyKey =
      contract !== undefined ? deriveIdempotencyKey(contract, command.commandId) : command.commandId;

    // --- 3. idempotency decision point ---------------------------------
    if (isConsequential && contract !== undefined) {
      const begin = this.deps.idempotencyRegistrar.begin({
        contract,
        connectionId: input.connectionId,
        commandId: command.commandId,
        correlationId: command.correlationId,
        idempotencyKey,
        command: command.params,
        now,
      });
      if (begin.kind === 'CONFLICT') {
        throw new IdempotencyKeyConflictError(
          `idempotency key '${idempotencyKey}' was already submitted with a DIFFERENT command body — never a silent success (INV-06)`,
          { idempotencyKey, recordedCommandHash: begin.record.commandHash },
        );
      }
      if (begin.kind === 'REPLAY') {
        const record = begin.record;
        if (record.status === 'COMPLETED') {
          // Exact replay of the recorded result — no second effect.
          return this.replayResult(record, command, binding);
        }
        if (record.status === 'IN_FLIGHT') {
          // Another execution holds the key — the caller waits; the bridge
          // refuses a parallel second dispatch (never silent).
          throw new IdempotencyKeyConflictError(
            `idempotency key '${idempotencyKey}' is IN_FLIGHT — a parallel second dispatch is refused (INV-06)`,
            { idempotencyKey },
          );
        }
        if (record.status === 'AMBIGUOUS') {
          // INV-04 gate: a consequential re-dispatch while the prior attempt
          // is unresolved UNKNOWN requires post-ambiguity retrieval.
          this.requirePostAmbiguityRetrieval(command, record, connection.providerName);
          // Retrieval evidence exists — the re-dispatch proceeds under the
          // SAME key (the provider dedupes by its own contract semantics).
        }
      }
    }

    // --- 4/5. dispatch inside the credential seal -----------------------
    // THE DISPATCH PATTERN: the transport interaction runs INSIDE the seal
    // (the binder builds secret-bearing headers, the transport consumes
    // them) and only the clean provider response comes out. The headers
    // never enter any record (INV-19).
    const dispatchedAt = this.deps.clock.now();
    const transportCall: {
      -readonly [K in keyof ProviderTransportCall]: ProviderTransportCall[K];
    } = {
      operationId: command.operationId,
      idempotencyKey,
      params: paramRedaction.value,
      headers: {},
      correlationId: command.correlationId,
    };
    if (contract?.providerEvidenceField !== undefined) {
      transportCall.idempotencyField = contract.providerEvidenceField;
    }
    const response = await this.deps.broker.withMaterial(
      connection.credentialHandleRef as Parameters<InMemoryCredentialBroker['withMaterial']>[0],
      {
        runtimeKey: this.deps.runtimeKey,
        context: `execution-bridge:${command.operationId}`,
        consumer: (material) =>
          this.deps.transport.send({
            ...transportCall,
            headers: binding.bindHeaders(material),
          }),
      },
    );
    const completedAt = this.deps.clock.now();

    // --- 6. classification + retention ----------------------------------
    const classification = classifyTransportOutcome(response);
    const providerReferences: string[] = [];
    let rawStateRecordId: RawStateRecordId | undefined;
    if (response.delivered && classification.outcome === 'CONFIRMED') {
      const parse = binding.parseResponse({
        status: response.status as number,
        body: response.body,
      });
      validateOperationResponseParse(parse);
      providerReferences.push(...parse.providerReferences);
      if (parse.objectState !== undefined) {
        const record = this.deps.store.append({
          providerName: connection.providerName,
          objectType: parse.objectState.objectType,
          externalId: parse.objectState.externalId,
          revision: parse.objectState.revision,
          receivedAt: completedAt,
          source: 'PROVIDER_RESPONSE',
          correlationId: command.correlationId,
          commandId: command.commandId,
          rawState: parse.objectState.state,
        });
        rawStateRecordId = record.recordId;
      }
    }

    // --- idempotency registrar outcome ----------------------------------
    if (contract !== undefined) {
      if (classification.outcome === 'CONFIRMED') {
        this.deps.idempotencyRegistrar.complete({
          contract,
          connectionId: input.connectionId,
          idempotencyKey,
          providerReferences,
          now: completedAt,
        });
      } else if (classification.outcome === 'FAILED') {
        this.deps.idempotencyRegistrar.fail({
          contract,
          connectionId: input.connectionId,
          idempotencyKey,
          now: completedAt,
        });
      } else {
        // UNKNOWN: the record stays occupied as AMBIGUOUS — a duplicate
        // command must never silently re-execute while unresolved.
        this.deps.idempotencyRegistrar.markAmbiguous({
          contract,
          connectionId: input.connectionId,
          idempotencyKey,
          now: completedAt,
        });
      }
    }

    // --- 7. the attempt record (all identifiers + lineage) --------------
    const envelopeParts: {
      readonly providerReferences: readonly string[];
      rawStateRecordId?: RawStateRecordId;
      readonly dispatchedAt: TimestampMs;
      readonly completedAt: TimestampMs;
    } = { providerReferences, dispatchedAt, completedAt };
    if (rawStateRecordId !== undefined) {
      envelopeParts.rawStateRecordId = rawStateRecordId;
    }
    const envelope = envelopeFromClassification(classification, envelopeParts);
    this.ledger.append({
      commandId: command.commandId,
      correlationId: command.correlationId,
      authorization: command.authorization,
      capability: declaration.capability,
      operationId: command.operationId,
      idempotencyKey,
      executionMode: this.mode,
      connectionId: input.connectionId,
      dispatchedAt,
      completedAt,
      outcome: envelope.outcome,
      providerReferences: Object.freeze(providerReferences),
      commandHash: contentHash(command.params),
      ...(rawStateRecordId !== undefined ? { rawStateRecordId } : {}),
      ...(envelope.providerFailure !== undefined ? { failure: envelope.providerFailure } : {}),
      ...(envelope.ambiguityReason !== undefined
        ? { ambiguityReason: envelope.ambiguityReason }
        : {}),
    });
    return envelope;
  }

  /** Replay the recorded result of a completed idempotency record. */
  private replayResult(
    record: IdempotencyRecord,
    command: AuthorizedCommand,
    binding: OperationBinding,
  ): ExecutionResultEnvelope {
    const at = this.deps.clock.now();
    // A replay attempt records NO dispatch (dispatchedAt == completedAt) —
    // the effect was never re-executed, only the recorded result returned.
    this.ledger.append({
      commandId: command.commandId,
      correlationId: command.correlationId,
      authorization: command.authorization,
      capability: binding.declaration.capability,
      operationId: record.operationId,
      idempotencyKey: record.idempotencyKey,
      executionMode: this.mode,
      connectionId: record.connectionId,
      dispatchedAt: at,
      completedAt: at,
      outcome: 'CONFIRMED',
      providerReferences: Object.freeze([...record.providerReferences]),
      commandHash: record.commandHash,
    });
    return Object.freeze({
      outcome: 'CONFIRMED' as const,
      providerReferences: Object.freeze([...record.providerReferences]),
      dispatchedAt: at,
      completedAt: at,
    });
  }

  /**
   * The INV-04 gate: a consequential re-dispatch after an unresolved
   * UNKNOWN requires a provider retrieval recorded AFTER the ambiguity
   * (object-anchored or correlation-anchored — see
   * ProviderRetrievalService.hasPostAmbiguityRetrievalEvidence). The
   * runtime SUPPLIES the retrieval evidence; the definitive resolution of
   * the ambiguity itself belongs to the P1-W2 protocol lane.
   */
  private requirePostAmbiguityRetrieval(
    command: AuthorizedCommand,
    record: IdempotencyRecord,
    providerName: string,
  ): void {
    const ambiguousSince = record.ambiguousSince ?? record.lastTransitionAt;
    const satisfied = this.deps.retrieval.hasPostAmbiguityRetrievalEvidence({
      providerName,
      providerReferences: [...record.providerReferences],
      correlationId: command.correlationId,
      ambiguousSince,
    });
    if (!satisfied) {
      throw new ReconciliationRequiredBeforeRetryError(
        `INV-04: command '${command.commandId}' is unresolved UNKNOWN (ambiguous since ${String(ambiguousSince)}) — reconcile via provider retrieval BEFORE any consequential retry`,
        {
          commandId: command.commandId,
          operationId: command.operationId,
          capability: this.deps.bindings.require(command.operationId).declaration.capability
            .definitionId,
        },
      );
    }
  }
}
