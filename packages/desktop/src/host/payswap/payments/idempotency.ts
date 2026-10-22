/**
 * PaySwap Desktop (P13-C) — the durable idempotency registrar core.
 *
 * PINS BY VALUE the @payswap/provider-runtime idempotency-registrar
 * semantics (P2-W2, INV-06 — the desktop host layer law forbids
 * @payswap/* imports, so the semantics table + the scope-key law + the
 * content-hash law are pinned here and BEHAVIORALLY mirror-tested
 * against the real InMemoryIdempotencyRegistrar in
 * test/payswap/payments-contract-mirrors.test.ts: the same scenario
 * driven through both must produce identical decisions).
 *
 * The registrar decision table (verbatim semantics):
 *
 * | existing record | same commandHash        | different commandHash |
 * |-----------------|--------------------------|-----------------------|
 * | none            | BEGIN                    | BEGIN                 |
 * | IN_FLIGHT       | REPLAY (in flight)       | CONFLICT              |
 * | COMPLETED       | REPLAY (recorded result) | CONFLICT              |
 * | FAILED          | BEGIN (retry re-arms)    | CONFLICT              |
 * | AMBIGUOUS       | REPLAY (ambiguous)       | CONFLICT              |
 *
 * - same key + different command hash → CONFLICT (INV-06 violation
 *   attempt — never a silent re-execution);
 * - retry after definitive failure → BEGIN again under the same hash;
 * - AMBIGUOUS (UNKNOWN outcome recorded) keeps the record occupied —
 *   the exits are `complete` (reconciliation evidence confirmed the
 *   effect) or `fail` (reconciliation evidence proved no effect);
 * - lastTransitionAt is BIGINT ms (the real registrar's TimestampMs
 *   law) so persistence is lossless.
 *
 * This module is the PURE CORE over injected state: the durable store
 * (payment-mission-store.ts) persists its records in the same snapshot
 * as the missions (atomic with every attempt mutation — the no-duplicate-
 * write law survives crashes).
 */

import { PaymentMissionError } from "./contracts.js";

/** Registrar record status (pinned IdempotencyRecordStatus). */
export const PAYMENT_IDEMPOTENCY_STATUSES = [
  "IN_FLIGHT",
  "COMPLETED",
  "FAILED",
  "AMBIGUOUS",
] as const;
export type PaymentIdempotencyStatus = (typeof PAYMENT_IDEMPOTENCY_STATUSES)[number];

/** The durable idempotency record (pinned IdempotencyRecord shape). */
export interface PaymentIdempotencyRecord {
  readonly operationId: string;
  readonly connectionId: string;
  readonly idempotencyKey: string;
  readonly commandId: string;
  readonly correlationId: string;
  readonly commandHash: string;
  readonly status: PaymentIdempotencyStatus;
  /** Provider references acknowledged for the completed command. */
  readonly providerReferences: readonly string[];
  /** When the record last changed state (bigint ms — the real law). */
  readonly lastTransitionAt: bigint;
  /** Present while AMBIGUOUS: the ambiguity must be reconciled before retry. */
  readonly ambiguousSince?: bigint;
}

/** The begin() decision (pinned IdempotencyBeginOutcome). */
export type PaymentIdempotencyBeginOutcome =
  | { readonly kind: "BEGIN" }
  | { readonly kind: "REPLAY"; readonly record: PaymentIdempotencyRecord }
  | { readonly kind: "CONFLICT"; readonly record: PaymentIdempotencyRecord };

/**
 * The per-operation idempotency contract subset the payments plane pins
 * (the real OperationIdempotencyContract: keyScope dimensions + the
 * operation id; derivation/replay/conflict reporting are the provider
 * adapter's concern, behind the execution-authority port).
 */
export interface PaymentOperationIdempotencyScope {
  readonly operationId: string;
  /** Key namespace is per connection (true for account-scoped providers). */
  readonly connection: boolean;
  /** Key namespace is per endpoint/operation. */
  readonly operation: boolean;
}

/** The payments plane's per-operation scopes (the two operations). */
export const PAYMENT_OPERATION_SCOPES: Readonly<
  Record<"CREATE_EXTERNAL_EFFECT" | "CANCEL_OR_REVERSE_EFFECT", PaymentOperationIdempotencyScope>
> = Object.freeze({
  CREATE_EXTERNAL_EFFECT: Object.freeze({
    operationId: "CREATE_EXTERNAL_EFFECT",
    connection: true,
    operation: true,
  }),
  CANCEL_OR_REVERSE_EFFECT: Object.freeze({
    operationId: "CANCEL_OR_REVERSE_EFFECT",
    connection: true,
    operation: true,
  }),
});

/**
 * The canonical scope key (pinned idempotencyScopeKey law):
 * `op:<operationId>` when operation-scoped, `conn:<connectionId>` when
 * connection-scoped, always `key:<idempotencyKey>`.
 */
export function paymentIdempotencyScopeKey(
  scope: PaymentOperationIdempotencyScope,
  connectionId: string,
  idempotencyKey: string,
): string {
  const parts: string[] = [];
  if (scope.operation) {
    parts.push(`op:${scope.operationId}`);
  }
  if (scope.connection) {
    parts.push(`conn:${connectionId}`);
  }
  parts.push(`key:${idempotencyKey}`);
  return parts.join("|");
}

/**
 * Deterministic FNV-1a 64-bit content fingerprint over canonical JSON
 * (pinned contentHash law: BINDING-NEVER-SECURITY — exact and
 * deterministic, not tamper-resistant).
 */
export function paymentContentHash(value: unknown): string {
  let hash = 0xcbf29ce484222325n;
  const mask = 0xffffffffffffffffn;
  const canonical = canonicalJson(value);
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= BigInt(canonical.charCodeAt(index));
    hash = (hash * 0x100000001b3n) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

/** Deterministic canonical JSON (stable key order) — the pinned law. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/** The deterministic per-mission idempotency key (mission+operation+intent digest). */
export function paymentIdempotencyKey(
  missionId: string,
  operation: "CREATE_EXTERNAL_EFFECT" | "CANCEL_OR_REVERSE_EFFECT",
  intentDigest: string,
): string {
  return `pmt:${missionId}:${operation === "CREATE_EXTERNAL_EFFECT" ? "create" : "cancel"}:${intentDigest}`;
}

// ---------------------------------------------------------------------------
// The pure registrar core (deterministic; state is held by the store)
// ---------------------------------------------------------------------------

/** One mutation of the registrar state (returned for persistence). */
export interface PaymentIdempotencyMutation {
  readonly scopeKey: string;
  readonly record: PaymentIdempotencyRecord;
}

/** The pure begin() decision (pinned semantics table). */
export function beginIdempotency(
  existing: readonly PaymentIdempotencyRecord[],
  input: {
    readonly scope: PaymentOperationIdempotencyScope;
    readonly connectionId: string;
    readonly commandId: string;
    readonly correlationId: string;
    readonly idempotencyKey: string;
    readonly command: unknown;
    readonly now: bigint;
  },
): { readonly outcome: PaymentIdempotencyBeginOutcome; readonly mutation?: PaymentIdempotencyMutation } {
  const commandHash = paymentContentHash(input.command);
  const scopeKey = paymentIdempotencyScopeKey(input.scope, input.connectionId, input.idempotencyKey);
  const existingRecord = existing.find((record) => scopeKeyOf(record) === scopeKey);
  if (existingRecord === undefined) {
    const record: PaymentIdempotencyRecord = Object.freeze({
      operationId: input.scope.operationId,
      connectionId: input.connectionId,
      idempotencyKey: input.idempotencyKey,
      commandId: input.commandId,
      correlationId: input.correlationId,
      commandHash,
      status: "IN_FLIGHT",
      providerReferences: Object.freeze([]),
      lastTransitionAt: input.now,
    });
    return { outcome: { kind: "BEGIN" }, mutation: { scopeKey, record } };
  }
  if (existingRecord.commandHash !== commandHash) {
    // INV-06: same key, different command — a conflict, never a re-execution.
    return { outcome: { kind: "CONFLICT", record: existingRecord } };
  }
  if (existingRecord.status === "FAILED") {
    // Retry-safety: a definitive failure may be retried under the same hash.
    const record: PaymentIdempotencyRecord = Object.freeze({
      ...existingRecord,
      commandId: input.commandId,
      correlationId: input.correlationId,
      status: "IN_FLIGHT",
      lastTransitionAt: input.now,
    });
    return { outcome: { kind: "BEGIN" }, mutation: { scopeKey, record } };
  }
  // IN_FLIGHT / COMPLETED / AMBIGUOUS: REPLAY so the caller waits /
  // receives the recorded result / is forced to reconcile.
  return { outcome: { kind: "REPLAY", record: existingRecord } };
}

/** The pure complete() transition (reconciliation's confirmed exit). */
export function completeIdempotency(
  existing: readonly PaymentIdempotencyRecord[],
  input: {
    readonly scope: PaymentOperationIdempotencyScope;
    readonly connectionId: string;
    readonly idempotencyKey: string;
    readonly providerReferences: readonly string[];
    readonly now: bigint;
  },
): { readonly record: PaymentIdempotencyRecord; readonly mutation: PaymentIdempotencyMutation } {
  const scopeKey = paymentIdempotencyScopeKey(input.scope, input.connectionId, input.idempotencyKey);
  const existingRecord = findForMutation(existing, scopeKey);
  if (existingRecord.status === "COMPLETED") {
    if (
      existingRecord.providerReferences.length === input.providerReferences.length &&
      existingRecord.providerReferences.every((ref, i) => ref === input.providerReferences[i])
    ) {
      return { record: existingRecord, mutation: { scopeKey, record: existingRecord } };
    }
    throw new PaymentMissionError(
      "IDEMPOTENCY_CONFLICT",
      "the idempotency record already completed with different provider references — results must be deterministic",
    );
  }
  if (existingRecord.status === "FAILED") {
    throw new PaymentMissionError(
      "IDEMPOTENCY_CONFLICT",
      "cannot complete a failed idempotency record",
    );
  }
  const record: PaymentIdempotencyRecord = Object.freeze({
    ...existingRecord,
    status: "COMPLETED",
    providerReferences: Object.freeze([...input.providerReferences]),
    lastTransitionAt: input.now,
  });
  return { record, mutation: { scopeKey, record } };
}

/** The pure fail() transition (definitive no-effect). */
export function failIdempotency(
  existing: readonly PaymentIdempotencyRecord[],
  input: {
    readonly scope: PaymentOperationIdempotencyScope;
    readonly connectionId: string;
    readonly idempotencyKey: string;
    readonly now: bigint;
  },
): { readonly record: PaymentIdempotencyRecord; readonly mutation: PaymentIdempotencyMutation } {
  const scopeKey = paymentIdempotencyScopeKey(input.scope, input.connectionId, input.idempotencyKey);
  const existingRecord = findForMutation(existing, scopeKey);
  if (existingRecord.status === "COMPLETED") {
    throw new PaymentMissionError(
      "IDEMPOTENCY_CONFLICT",
      "cannot fail a completed idempotency record — the effect is confirmed; reconcile instead",
    );
  }
  const record: PaymentIdempotencyRecord = Object.freeze({
    ...existingRecord,
    status: "FAILED",
    providerReferences: Object.freeze([]),
    lastTransitionAt: input.now,
  });
  return { record, mutation: { scopeKey, record } };
}

/** The pure markAmbiguous() transition (UNKNOWN recorded; stays occupied). */
export function markAmbiguousIdempotency(
  existing: readonly PaymentIdempotencyRecord[],
  input: {
    readonly scope: PaymentOperationIdempotencyScope;
    readonly connectionId: string;
    readonly idempotencyKey: string;
    readonly now: bigint;
  },
): { readonly record: PaymentIdempotencyRecord; readonly mutation: PaymentIdempotencyMutation } {
  const scopeKey = paymentIdempotencyScopeKey(input.scope, input.connectionId, input.idempotencyKey);
  const existingRecord = findForMutation(existing, scopeKey);
  if (existingRecord.status === "COMPLETED") {
    throw new PaymentMissionError(
      "IDEMPOTENCY_CONFLICT",
      "cannot mark a completed record ambiguous — the effect is confirmed",
    );
  }
  const record: PaymentIdempotencyRecord = Object.freeze({
    ...existingRecord,
    status: "AMBIGUOUS",
    lastTransitionAt: input.now,
    ambiguousSince: input.now,
  });
  return { record, mutation: { scopeKey, record } };
}

/** The scope key of a persisted record (the inverse of the composition law). */
export function paymentIdempotencyRecordScopeKey(record: PaymentIdempotencyRecord): string {
  const parts: string[] = [];
  if (record.operationId !== "" && record.connectionId !== "") {
    // The persisted records of this plane are always operation+connection
    // scoped (PAYMENT_OPERATION_SCOPES pins both dimensions true).
    parts.push(`op:${record.operationId}`);
    parts.push(`conn:${record.connectionId}`);
  }
  parts.push(`key:${record.idempotencyKey}`);
  return parts.join("|");
}

function scopeKeyOf(record: PaymentIdempotencyRecord): string {
  return paymentIdempotencyRecordScopeKey(record);
}

function findForMutation(
  existing: readonly PaymentIdempotencyRecord[],
  scopeKey: string,
): PaymentIdempotencyRecord {
  const record = existing.find((candidate) => scopeKeyOf(candidate) === scopeKey);
  if (record === undefined) {
    throw new PaymentMissionError("IDEMPOTENCY_CONFLICT", `no idempotency record for scope ${scopeKey}`);
  }
  return record;
}
