/**
 * ProviderStateEnvelope — lossless consequential provider-state preservation
 * (P2-W1; RE-AUTHOR of payswap.org@8a735bf
 * packages/connectors/src/provider-state.ts, 373 lines).
 *
 * Canonical ownership note: the CONCEPT is owned by the canonical
 * CAPABILITY-MODEL (spec/architecture/CAPABILITY-MODEL.md — "Consequential
 * provider state is preserved in a ProviderStateEnvelope where required")
 * and enforced by canonical INV-14 ("Provider state is preserved where
 * needed for action/reconciliation/audit"). The old repo's INV-C06
 * numbering does NOT transfer.
 *
 * Canonical state (the Financial Protocol Authority) owns protocol truth;
 * this envelope preserves the provider semantics needed for customer
 * action, reconciliation, support, audit and reprocessing WITHOUT lossy
 * canonical mapping. The raw provider-native `state` is carried VERBATIM
 * (opaque passthrough); the `classification` is ADDITIVE metadata (family +
 * lifecycle step), never a replacement for the raw state.
 *
 * Consequential state families that round-trip losslessly: customer
 * authentication/action required, asynchronous processing, capture, mandate
 * lifecycle, refund lifecycle, dispute evidence, payout state and
 * connected-account state.
 *
 * Determinism law: timestamps are DATA declared by the envelope author; this
 * module never reads a clock. The envelope is a versioned contract
 * (`schemaVersion: 1`).
 */

import { ValidationError } from './errors.ts';

/** Contract version of the envelope shape itself (versioned contract law). */
export const PROVIDER_STATE_ENVELOPE_SCHEMA_VERSION = 1 as const;

export interface ProviderStateTransition {
  readonly fromRevision?: string;
  readonly toRevision: string;
  readonly occurredAt: string;
  readonly actor?: string;
  readonly note?: string;
}

/** A provider-required user action preserved verbatim (e.g. a 3DS challenge). */
export interface ProviderActionRequired {
  readonly kind: string;
  readonly message: string;
  readonly deepLink?: string;
}

/**
 * Provider failure metadata, including outcome-ambiguity classification.
 * OUTCOME_UNKNOWN feeds ambiguity handling: it is never a plain failure
 * (INV-4 — UNKNOWN is distinct from FAILED and must be reconciled).
 */
export interface ProviderFailureMetadata {
  readonly providerErrorCode?: string;
  readonly providerErrorMessage?: string;
  readonly retryable: boolean;
  readonly ambiguity: 'NONE' | 'OUTCOME_UNKNOWN';
}

/**
 * Consequential provider-state families (INV-14). `other` keeps the
 * envelope total: provider states outside the eight named families are
 * still preserved verbatim.
 */
export const PROVIDER_STATE_FAMILIES = [
  'customer_action_required',
  'async_processing',
  'capture',
  'mandate',
  'refund',
  'dispute',
  'payout',
  'connected_account',
  'other',
] as const;

export type ProviderStateFamily = (typeof PROVIDER_STATE_FAMILIES)[number];

export function isProviderStateFamily(value: unknown): value is ProviderStateFamily {
  return (
    typeof value === 'string' &&
    (PROVIDER_STATE_FAMILIES as readonly unknown[]).includes(value)
  );
}

/**
 * Additive classification of the raw provider state. The family and
 * lifecycle step CARRY meaning; they never replace `state`.
 */
export interface ProviderStateClassification {
  readonly family: ProviderStateFamily;
  /** Provider-declared step within the family (e.g. 'evidence_required'). */
  readonly lifecycleStep: string;
  readonly isTerminal: boolean;
  readonly requiresCustomerAction: boolean;
}

export type PrivacyDataClassification = 'PUBLIC' | 'PARTNER' | 'PRIVATE';

/**
 * Privacy-scoped constraints on the envelope's provider-specific payload.
 * Constraints are hard sharing rules (e.g. 'no-PII-in-support-tickets');
 * shareableFields names raw-state fields shareable at the declared
 * classification. Secrets must never appear in an envelope in the first
 * place (INV-19) — the privacy scope bounds the CONSEQUENTIAL payload.
 */
export interface PrivacyScopeDeclaration {
  readonly dataClassification: PrivacyDataClassification;
  readonly constraints: readonly string[];
  readonly shareableFields: readonly string[];
}

/**
 * ProviderStateEnvelope (INV-14). `state` is the raw provider-native state,
 * preserved VERBATIM; consumers may read it for customer action,
 * reconciliation, support, audit and reprocessing, but must never flatten,
 * overwrite or erase provider lifecycle semantics.
 */
export interface ProviderStateEnvelope {
  readonly schemaVersion: typeof PROVIDER_STATE_ENVELOPE_SCHEMA_VERSION;
  readonly provider: {
    readonly name: string;
    readonly version: string;
  };
  readonly object: {
    readonly objectType: string;
    readonly externalId: string;
  };
  readonly revision: string;
  /** Raw provider-native state. Opaque passthrough; never flattened. */
  readonly state: unknown;
  readonly classification: ProviderStateClassification;
  readonly history: readonly ProviderStateTransition[];
  readonly actionRequired?: ProviderActionRequired;
  readonly failure?: ProviderFailureMetadata;
  readonly privacy: PrivacyScopeDeclaration;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly timestamps: {
    readonly observedAt: string;
    readonly updatedAt?: string;
  };
  readonly provenance: {
    readonly source: 'PROVIDER_API' | 'PROVIDER_WEBHOOK' | 'OPERATOR';
    readonly fetchId?: string;
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Input accepted by `createProviderStateEnvelope`. `classification` and
 * `privacy` are optional HERE only so that their ABSENCE can be rejected by
 * runtime validation — the constructed envelope always carries both.
 * `schemaVersion` is optional here for the same reason; it is stamped.
 */
export type ProviderStateEnvelopeInput = Omit<
  ProviderStateEnvelope,
  'schemaVersion' | 'classification' | 'privacy'
> & {
  readonly schemaVersion?: typeof PROVIDER_STATE_ENVELOPE_SCHEMA_VERSION;
  readonly classification?: ProviderStateClassification;
  readonly privacy?: PrivacyScopeDeclaration;
};

/**
 * Validates and freezes a provider state envelope (INV-14): the raw
 * provider state passes through untouched; classification and privacy scope
 * are mandatory (absence is a validation error) so the envelope is
 * queryable and privacy-bounded without ever being lossy.
 */
export function createProviderStateEnvelope(
  input: ProviderStateEnvelopeInput,
): ProviderStateEnvelope {
  const errors: string[] = [];
  if (input === null || typeof input !== 'object') {
    throw new ValidationError('provider state envelope must be an object');
  }
  const record = input as unknown as Readonly<Record<string, unknown>>;
  const provider = record.provider as Readonly<Record<string, unknown>> | undefined;
  if (
    provider === undefined ||
    !isNonEmptyString(provider.name) ||
    !isNonEmptyString(provider.version)
  ) {
    errors.push('provider.name and provider.version must be non-empty strings');
  }
  const object = record.object as Readonly<Record<string, unknown>> | undefined;
  if (
    object === undefined ||
    !isNonEmptyString(object.objectType) ||
    !isNonEmptyString(object.externalId)
  ) {
    errors.push('object.objectType and object.externalId must be non-empty strings');
  }
  if (!isNonEmptyString(record.revision)) {
    errors.push('revision must be a non-empty string');
  }
  if (!('state' in record)) {
    errors.push('state must be present (raw provider state, preserved verbatim)');
  }
  if (
    record.schemaVersion !== undefined &&
    record.schemaVersion !== PROVIDER_STATE_ENVELOPE_SCHEMA_VERSION
  ) {
    errors.push(
      `schemaVersion '${String(record.schemaVersion)}' is not the supported envelope contract version ${PROVIDER_STATE_ENVELOPE_SCHEMA_VERSION}`,
    );
  }
  const classification = record.classification as
    | Readonly<Record<string, unknown>>
    | undefined;
  if (classification === undefined || typeof classification !== 'object') {
    errors.push('classification must be a ProviderStateClassification');
  } else {
    if (!isProviderStateFamily(classification.family)) {
      errors.push(
        `classification.family must be one of [${PROVIDER_STATE_FAMILIES.join(', ')}]`,
      );
    }
    if (!isNonEmptyString(classification.lifecycleStep)) {
      errors.push('classification.lifecycleStep must be a non-empty string');
    }
    if (typeof classification.isTerminal !== 'boolean') {
      errors.push('classification.isTerminal must be a boolean');
    }
    if (typeof classification.requiresCustomerAction !== 'boolean') {
      errors.push('classification.requiresCustomerAction must be a boolean');
    }
  }
  if (!Array.isArray(record.history)) {
    errors.push('history must be an array of ProviderStateTransition (may be empty)');
  }
  const privacy = record.privacy as Readonly<Record<string, unknown>> | undefined;
  if (privacy === undefined || typeof privacy !== 'object') {
    errors.push('privacy must be a PrivacyScopeDeclaration');
  } else {
    if (
      privacy.dataClassification !== 'PUBLIC' &&
      privacy.dataClassification !== 'PARTNER' &&
      privacy.dataClassification !== 'PRIVATE'
    ) {
      errors.push('privacy.dataClassification must be PUBLIC, PARTNER or PRIVATE');
    }
    if (!Array.isArray(privacy.constraints)) {
      errors.push('privacy.constraints must be an array');
    }
    if (!Array.isArray(privacy.shareableFields)) {
      errors.push('privacy.shareableFields must be an array');
    }
  }
  const timestamps = record.timestamps as
    | Readonly<Record<string, unknown>>
    | undefined;
  if (timestamps === undefined || !isNonEmptyString(timestamps.observedAt)) {
    errors.push('timestamps.observedAt must be a non-empty string');
  }
  const provenance = record.provenance as
    | Readonly<Record<string, unknown>>
    | undefined;
  if (
    provenance === undefined ||
    (provenance.source !== 'PROVIDER_API' &&
      provenance.source !== 'PROVIDER_WEBHOOK' &&
      provenance.source !== 'OPERATOR')
  ) {
    errors.push('provenance.source must be PROVIDER_API, PROVIDER_WEBHOOK or OPERATOR');
  }
  const actionRequired = record.actionRequired as
    | Readonly<Record<string, unknown>>
    | undefined;
  if (
    actionRequired !== undefined &&
    (typeof actionRequired !== 'object' ||
      !isNonEmptyString(actionRequired.kind) ||
      !isNonEmptyString(actionRequired.message))
  ) {
    errors.push('actionRequired, when present, must be { kind, message, deepLink? }');
  }
  const failure = record.failure as Readonly<Record<string, unknown>> | undefined;
  if (
    failure !== undefined &&
    (typeof failure !== 'object' || typeof failure.retryable !== 'boolean')
  ) {
    errors.push('failure, when present, must declare retryable: boolean');
  }

  if (errors.length > 0) {
    throw new ValidationError(`Invalid provider state envelope: ${errors.join('; ')}`, {
      errors: [...errors],
    });
  }

  const envelope = input as ProviderStateEnvelope;
  return Object.freeze({
    ...envelope,
    schemaVersion: PROVIDER_STATE_ENVELOPE_SCHEMA_VERSION,
    classification: Object.freeze({ ...envelope.classification }),
    privacy: Object.freeze({ ...envelope.privacy }),
    history: Object.freeze([...envelope.history]),
    timestamps: Object.freeze({ ...envelope.timestamps }),
    provenance: Object.freeze({ ...envelope.provenance }),
  });
}

/** Structural guard for envelopes from untyped sources. */
export function isProviderStateEnvelope(
  value: unknown,
): value is ProviderStateEnvelope {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<ProviderStateEnvelope>;
  return (
    candidate.schemaVersion === PROVIDER_STATE_ENVELOPE_SCHEMA_VERSION &&
    typeof candidate.revision === 'string' &&
    candidate.revision !== '' &&
    candidate.classification !== undefined &&
    isProviderStateFamily(candidate.classification.family) &&
    candidate.privacy !== undefined &&
    candidate.privacy !== null &&
    candidate.timestamps !== undefined &&
    candidate.timestamps !== null &&
    candidate.provenance !== undefined &&
    candidate.provenance !== null
  );
}

/**
 * Serializes an envelope to canonical JSON. The raw provider state must be
 * JSON-representable — anything a provider reports over a wire is.
 */
export function serializeProviderStateEnvelope(
  envelope: ProviderStateEnvelope,
): string {
  return JSON.stringify(envelope);
}

/**
 * Parses and validates a serialized envelope. Round-tripping through
 * serialize -> parse is LOSSLESS: schema version, family, raw state,
 * history, action required, failure metadata, privacy scope and provenance
 * all survive.
 */
export function parseProviderStateEnvelope(
  json: string,
): ProviderStateEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new ValidationError('provider state envelope JSON is malformed', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!isProviderStateEnvelope(parsed)) {
    throw new ValidationError('parsed JSON is not a ProviderStateEnvelope');
  }
  return createProviderStateEnvelope(parsed);
}
