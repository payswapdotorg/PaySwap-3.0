/**
 * @payswap/command — the command proposal envelope and idempotency wire
 * shapes (P7-W3).
 *
 * THE AUTHORITY-FIREWALL LAW (zcode-bridge doctrine): the command surface
 * NEVER carries financial authorization. A command on this surface is a
 * PROPOSAL — proposal inputs + observations, never financial authority
 * (INV-9: agents/LLMs cannot declare financial truth; INV-23: the
 * interaction surface never owns financial truth). Encoded structurally:
 *
 * - the envelope has NO authority fields: no signature, no mandate, no
 *   approval artifact, no authorization decision, no settlement/finality
 *   claim. Authority travels the trust lane out of band; this surface
 *   references it at most via opaque strings;
 * - `payload` is opaque proposal input, deep-scanned by
 *   `assertProposalPayloadIsAuthorityFree` (secret/credential/token/
 *   signature/mandate keys are rejected — INV-19 + authority material);
 * - every envelope carries an idempotency key (INV-6: state-changing
 *   commands are idempotent and replay-safe) and full lineage
 *   (causationId/correlationId) so evidence lineage can always be
 *   reconstructed;
 * - timestamps are bigint DATA (issuedAtMs), never an ambient clock.
 *
 * Wire shapes adapt the old repository's protocol command envelope
 * (commandType/payload/principalRef/idempotencyKey/causation/correlation/
 * schemaVersion) and the idempotency registrar contract (scope, record,
 * begin outcomes), with the schema version pinned to
 * COMMAND_ENVELOPE_SCHEMA_VERSION.
 */

import type { CommandId, CorrelationId, PrincipalRef } from './identifiers.ts';
import { asCommandId, asCorrelationId, validatePrincipalRef } from './identifiers.ts';
import { ValidationError, FinancialAuthorityError } from './errors.ts';
import { COMMAND_ENVELOPE_SCHEMA_VERSION, assertEnvelopeSchemaVersion } from './version.ts';
import type { CommandClock, IdFactory } from './ports.ts';

/**
 * A typed command PROPOSAL envelope. Created exclusively through
 * `createCommandProposalEnvelope` (injected id factory + clock — never
 * ambient entropy or time). Carries NO authority (see module doc).
 */
export interface CommandProposalEnvelope<TPayload = unknown> {
  readonly id: CommandId;
  readonly commandType: string;
  /** Opaque proposal input (authority-free, machine-checked). */
  readonly payload: TPayload;
  /** The principal the proposal travels for (opaque reference). */
  readonly principalRef: PrincipalRef;
  /** REQUIRED: one idempotency key maps to one authoritative result (INV-6). */
  readonly idempotencyKey: string;
  /** What caused this proposal (another command), when known. */
  readonly causationId?: CommandId;
  /** The conversation this proposal belongs to (survives end to end). */
  readonly correlationId?: CorrelationId;
  /** Issuance time as bigint DATA (never an ambient clock reading). */
  readonly issuedAtMs: bigint;
  /** Pinned envelope schema version (COMMAND_ENVELOPE_SCHEMA_VERSION). */
  readonly schemaVersion: number;
}

/**
 * The idempotency scope of a command: what command, issued by whom, under
 * which key. One scope maps to one authoritative result (INV-6).
 */
export interface IdempotencyScope {
  readonly commandType: string;
  readonly principal: PrincipalRef;
  readonly key: string;
}

/** Durable record of the idempotency decision for one scope. */
export interface IdempotencyRecord {
  readonly scope: IdempotencyScope;
  readonly commandHash: string;
  readonly status: 'IN_FLIGHT' | 'COMPLETED' | 'FAILED';
  readonly resultHash?: string;
}

/**
 * The begin decision (the single idempotency decision point):
 * - BEGIN: no record, or a FAILED record (a corrected retry re-arms);
 * - REPLAY: an existing record for the SAME command hash — the caller
 *   replays the recorded authoritative result instead of re-executing;
 * - CONFLICT: same key + a DIFFERENT command hash (an INV-6 violation
 *   attempt).
 */
export type BeginOutcome =
  | { readonly kind: 'BEGIN' }
  | { readonly kind: 'REPLAY'; readonly record: IdempotencyRecord }
  | { readonly kind: 'CONFLICT'; readonly record: IdempotencyRecord };

/**
 * Storage-agnostic idempotency registrar PORT (typed shape, never I/O):
 * `begin` is the single decision point; `complete`/`fail` transition the
 * record. Durable implementations MUST decide `begin` atomically under the
 * same transaction that executes the command.
 */
export interface IdempotencyRegistrar {
  begin(scope: IdempotencyScope, commandHash: string): BeginOutcome;
  complete(scope: IdempotencyScope, resultHash: string): void;
  fail(scope: IdempotencyScope): void;
}

// ---------------------------------------------------------------------------
// Envelope construction (pure: injected ids + clock, never ambient)
// ---------------------------------------------------------------------------

const MAX_COMMAND_TYPE_LENGTH = 128;
const MAX_IDEMPOTENCY_KEY_LENGTH = 256;

/** Envelope dependencies: every effect-bearing dependency injected. */
export interface EnvelopeDependencies {
  readonly ids: IdFactory;
  readonly clock: CommandClock;
}

/** Options for `createCommandProposalEnvelope`. */
export interface CreateCommandProposalEnvelopeOptions<TPayload> {
  readonly commandType: string;
  /** Opaque proposal input (must be authority-free — machine-checked). */
  readonly payload: TPayload;
  readonly principalRef: PrincipalRef;
  /** REQUIRED (INV-6): one key maps to one authoritative result. */
  readonly idempotencyKey: string;
  readonly causationId?: CommandId;
  readonly correlationId?: CorrelationId;
}

function requireCommandType(value: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_COMMAND_TYPE_LENGTH ||
    value.trim() !== value
  ) {
    throw new ValidationError(
      `commandType must be a non-empty trimmed string of at most ${MAX_COMMAND_TYPE_LENGTH} characters`,
      { commandType: value },
    );
  }
  return value;
}

function requireIdempotencyKey(value: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_IDEMPOTENCY_KEY_LENGTH
  ) {
    throw new ValidationError(
      `idempotencyKey must be a non-empty string of at most ${MAX_IDEMPOTENCY_KEY_LENGTH} characters (REQUIRED on state-changing commands, INV-6)`,
      { idempotencyKey: value },
    );
  }
  return value;
}

/**
 * THE AUTHORITY-FIREWALL SCAN (the headline law, machine-checked): proposal
 * payloads are proposal inputs + observations ONLY. Any object key matching
 * the denylist marks secret/credential material (INV-19) or raw authority
 * material (signatures, mandates, authorization artifacts) that must NEVER
 * ride a command proposal. Opaque REFERENCES to authority (e.g.
 * `approvalArtifactRef`, `requestHash`) remain legal — the denylist matches
 * authority MATERIAL, not references.
 */
const PAYLOAD_AUTHORITY_KEY_DENYLIST =
  /(secret|password|passphrase|credential|privatekey|private_key|apikey|api_key|mnemonic|seedphrase|seed_phrase|cookie|token|signature|hmac|authorization|mandate)/i;

function scanForAuthorityMaterial(value: unknown, path: string, offenders: string[]): void {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      scanForAuthorityMaterial(value[index], `${path}[${index}]`, offenders);
    }
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry === undefined) {
        continue;
      }
      if (PAYLOAD_AUTHORITY_KEY_DENYLIST.test(key)) {
        offenders.push(`${path}.${key}`);
      }
      scanForAuthorityMaterial(entry, `${path}.${key}`, offenders);
    }
  }
}

/**
 * Assert the authority-firewall law on a proposal payload: no secrets
 * (INV-19), no raw signature/MAC material, no authorization/mandate
 * artifacts — anywhere in the structure. Throws `FinancialAuthorityError`
 * listing every offending path (fail closed; deterministic).
 */
export function assertProposalPayloadIsAuthorityFree(payload: unknown): void {
  const offenders: string[] = [];
  scanForAuthorityMaterial(payload, 'payload', offenders);
  if (offenders.length > 0) {
    throw new FinancialAuthorityError(
      'the command surface never carries financial authority: the proposal payload contains authority/credential material — commands are proposals/inputs (proposal inputs + observations, never financial authority)',
      { offenders: [...offenders] },
    );
  }
}

/**
 * Pure factory for command PROPOSAL envelopes: injected id factory + clock
 * (never ambient entropy or time), deep-frozen output, idempotency key
 * REQUIRED (INV-6), schema version pinned, payload authority-free
 * (machine-checked).
 */
export function createCommandProposalEnvelope<TPayload>(
  options: CreateCommandProposalEnvelopeOptions<TPayload>,
  deps: EnvelopeDependencies,
): CommandProposalEnvelope<TPayload> {
  const commandType = requireCommandType(options.commandType);
  const idempotencyKey = requireIdempotencyKey(options.idempotencyKey);
  const principalRef = validatePrincipalRef(options.principalRef);
  assertProposalPayloadIsAuthorityFree(options.payload);
  if (options.causationId !== undefined) {
    asCommandId(options.causationId);
  }
  if (options.correlationId !== undefined) {
    asCorrelationId(options.correlationId);
  }
  const id = asCommandId(deps.ids.mintId('cmd'));
  const envelope: CommandProposalEnvelope<TPayload> = Object.freeze({
    id,
    commandType,
    payload: options.payload,
    principalRef: Object.freeze({ ...principalRef }),
    idempotencyKey,
    ...(options.causationId === undefined ? {} : { causationId: options.causationId }),
    ...(options.correlationId === undefined ? {} : { correlationId: options.correlationId }),
    issuedAtMs: deps.clock.now(),
    schemaVersion: COMMAND_ENVELOPE_SCHEMA_VERSION,
  });
  return envelope;
}

/** Validate an already-materialized proposal envelope (wire re-validation). */
export function validateCommandProposalEnvelope(
  envelope: CommandProposalEnvelope<unknown>,
): CommandProposalEnvelope<unknown> {
  asCommandId(envelope.id);
  requireCommandType(envelope.commandType);
  requireIdempotencyKey(envelope.idempotencyKey);
  validatePrincipalRef(envelope.principalRef);
  assertEnvelopeSchemaVersion(envelope.schemaVersion);
  if (typeof envelope.issuedAtMs !== 'bigint') {
    throw new ValidationError('issuedAtMs must be bigint DATA (milliseconds)');
  }
  assertProposalPayloadIsAuthorityFree(envelope.payload);
  return envelope;
}

// ---------------------------------------------------------------------------
// Idempotency scope validation + the begin decision table
// ---------------------------------------------------------------------------

/** Validate an idempotency scope (fail closed). */
export function validateIdempotencyScope(scope: IdempotencyScope): IdempotencyScope {
  requireCommandType(scope.commandType);
  if (typeof scope.key !== 'string' || scope.key.length === 0) {
    throw new ValidationError('scope.key must be a non-empty string');
  }
  validatePrincipalRef(scope.principal);
  return Object.freeze({
    commandType: scope.commandType,
    principal: Object.freeze({ ...scope.principal }),
    key: scope.key,
  });
}

/**
 * Deterministic canonical key for a scope (JSON array form is unambiguous).
 * Mirrors the old repository's `canonicalScopeKey` wire form.
 */
export function canonicalScopeKey(scope: IdempotencyScope): string {
  return JSON.stringify([
    scope.commandType,
    scope.principal.principalType,
    scope.principal.principalId,
    scope.key,
  ]);
}

/**
 * THE BEGIN DECISION TABLE (pure, deterministic — the single idempotency
 * decision point, INV-6):
 *
 * | existing record          | same commandHash            | different commandHash |
 * |--------------------------|-----------------------------|-----------------------|
 * | none                     | BEGIN                       | BEGIN                 |
 * | IN_FLIGHT                | REPLAY (record, in flight)  | CONFLICT               |
 * | COMPLETED                | REPLAY (record, with result)| CONFLICT               |
 * | FAILED                   | BEGIN (retry re-arms)       | CONFLICT               |
 *
 * Same key + different command hash => CONFLICT (an INV-6 violation
 * attempt). Retry after completion => exact REPLAY of the recorded result.
 * Retry after failure => BEGIN again (transient failures are retryable).
 * Duplicate while in flight => REPLAY so the caller waits instead of
 * double-executing (never a silent second execution).
 */
export function resolveBeginOutcome(
  existing: IdempotencyRecord | undefined,
  commandHash: string,
): BeginOutcome {
  if (existing === undefined) {
    return { kind: 'BEGIN' };
  }
  if (existing.commandHash !== commandHash) {
    return { kind: 'CONFLICT', record: existing };
  }
  if (existing.status === 'FAILED') {
    return { kind: 'BEGIN' };
  }
  return { kind: 'REPLAY', record: existing };
}

/**
 * A deterministic in-memory idempotency registrar (the reference
 * implementation of the port — the state the old repository's protocol
 * kernel carried; durable stores implement the same decision table
 * atomically). One instance owns one scope table; all decisions come from
 * `resolveBeginOutcome`.
 */
export function createInMemoryIdempotencyRegistrar(): IdempotencyRegistrar {
  const records = new Map<string, IdempotencyRecord>();
  return {
    begin(scope: IdempotencyScope, commandHash: string): BeginOutcome {
      const validated = validateIdempotencyScope(scope);
      const key = canonicalScopeKey(validated);
      const existing = records.get(key);
      const outcome = resolveBeginOutcome(existing, commandHash);
      if (outcome.kind === 'BEGIN') {
        records.set(key, {
          scope: validated,
          commandHash,
          status: 'IN_FLIGHT',
        });
      }
      return outcome;
    },
    complete(scope: IdempotencyScope, resultHash: string): void {
      const key = canonicalScopeKey(validateIdempotencyScope(scope));
      const existing = records.get(key);
      if (existing === undefined || existing.status === 'COMPLETED') {
        throw new ValidationError(
          'idempotency complete requires an IN_FLIGHT or FAILED record (a completed scope is immutable)',
          { key, status: existing?.status },
        );
      }
      records.set(key, { scope: existing.scope, commandHash: existing.commandHash, status: 'COMPLETED', resultHash });
    },
    fail(scope: IdempotencyScope): void {
      const key = canonicalScopeKey(validateIdempotencyScope(scope));
      const existing = records.get(key);
      if (existing === undefined || existing.status === 'COMPLETED') {
        throw new ValidationError(
          'idempotency fail requires an IN_FLIGHT or FAILED record (a completed scope is immutable)',
          { key, status: existing?.status },
        );
      }
      records.set(key, { scope: existing.scope, commandHash: existing.commandHash, status: 'FAILED' });
    },
  };
}
