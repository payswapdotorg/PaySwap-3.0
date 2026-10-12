/**
 * Execution modes (P2-W1; ADAPT of payswap.org@8a735bf
 * packages/connectors/src/execution-modes.ts).
 *
 * Every connector execution carries an EXPLICIT, VERSIONED mode vocabulary:
 * - PASS_THROUGH_NATIVE      — preserve the provider's native execution/
 *   optimization flow with minimal translation;
 * - COMPOSED_PAYSWAP         — compose the provider capability with PaySwap
 *   capabilities (FX, liquidity, credit, incentives, other rails);
 * - OPTIMIZED_MULTI_PROVIDER — compare/orchestrate multiple reachable
 *   providers/capabilities.
 *
 * Canonical citations: old INV-C07 does not transfer; the law is carried by
 * spec/architecture/CAPABILITY-MODEL.md ("Execution modes are explicit") and
 * canonical INV-15 (provider-native execution remains a candidate baseline
 * — PASS_THROUGH_NATIVE is never structurally disadvantaged).
 *
 * The mode is DECLARED on every executable capability (see
 * executable-declaration.ts: a non-empty `executionModes` list is mandatory)
 * and never inferred. NONE of the modes bypasses protocol authorization,
 * policy, compliance, security, idempotency or evidence: every canonical
 * execution request must reference the protocol authorization that
 * authorized it, and `validateExecutionRequest` enforces both the explicit
 * mode and that authorization link.
 *
 * INV-15 baseline discipline: this vocabulary assigns NO priority, scoring
 * or ordering advantage — declaring only COMPOSED_PAYSWAP is as legal as
 * declaring only PASS_THROUGH_NATIVE, and the fabric treats every declared
 * mode uniformly (machine-checked by tests).
 */

import { ImplicitExecutionModeError, ValidationError } from './errors.ts';

/** Version of the execution-mode vocabulary contract itself. */
export const EXECUTION_MODE_VOCABULARY_VERSION = '1.0.0' as const;

export const EXECUTION_MODES = [
  'PASS_THROUGH_NATIVE',
  'COMPOSED_PAYSWAP',
  'OPTIMIZED_MULTI_PROVIDER',
] as const;

export type ExecutionMode = (typeof EXECUTION_MODES)[number];

const EXECUTION_MODE_SEMANTICS: Readonly<Record<ExecutionMode, string>> = {
  PASS_THROUGH_NATIVE:
    "preserve the provider's native execution/optimization flow with minimal translation (INV-15 incumbent baseline)",
  COMPOSED_PAYSWAP:
    'compose the provider capability with PaySwap capabilities (FX, liquidity, credit, incentives, other rails)',
  OPTIMIZED_MULTI_PROVIDER:
    'compare/orchestrate multiple reachable providers/capabilities',
} as const;

/** The versioned contract triple for one mode (vocabulary law). */
export interface ExecutionModeContract {
  readonly mode: ExecutionMode;
  readonly vocabularyVersion: typeof EXECUTION_MODE_VOCABULARY_VERSION;
  readonly semantics: string;
}

/** The full versioned vocabulary, in declaration order (no priority). */
export const EXECUTION_MODE_CONTRACTS: readonly ExecutionModeContract[] =
  Object.freeze(
    EXECUTION_MODES.map((mode) => ({
      mode,
      vocabularyVersion: EXECUTION_MODE_VOCABULARY_VERSION,
      semantics: EXECUTION_MODE_SEMANTICS[mode],
    })),
  );

export function isExecutionMode(value: unknown): value is ExecutionMode {
  return (
    typeof value === 'string' && (EXECUTION_MODES as readonly unknown[]).includes(value)
  );
}

/**
 * Validate a DECLARED mode list (on an executable capability declaration):
 * non-empty, every member a known mode, no duplicates. A capability that
 * supports exactly one mode is legal — including only PASS_THROUGH_NATIVE.
 */
export function validateDeclaredExecutionModes(
  modes: unknown,
): readonly ExecutionMode[] {
  const errors: string[] = [];
  if (!Array.isArray(modes)) {
    throw new ValidationError(
      'executionModes must be an array of declared ExecutionMode values (never inferred)',
    );
  }
  if (modes.length === 0) {
    errors.push(
      'executionModes is REQUIRED and must declare at least one explicit mode (PASS_THROUGH_NATIVE | COMPOSED_PAYSWAP | OPTIMIZED_MULTI_PROVIDER)',
    );
  }
  const seen = new Set<string>();
  for (const mode of modes) {
    if (!isExecutionMode(mode)) {
      errors.push(`unknown execution mode '${String(mode)}'`);
    } else if (seen.has(mode)) {
      errors.push(`duplicate execution mode '${mode}'`);
    } else {
      seen.add(mode);
    }
  }
  if (errors.length > 0) {
    throw new ValidationError(
      `Invalid declared execution modes: ${errors.join('; ')}`,
      { errors: [...errors] },
    );
  }
  return modes as readonly ExecutionMode[];
}

/**
 * The protocol authorization backing a connector execution. The referenced
 * command is the protocol-authorized envelope under which the external
 * effect may happen; it carries its own principal and evidence. The
 * capability fabric holds an OPAQUE reference — it never verifies or
 * interprets authorization (trust/protocol lanes own that).
 */
export interface ProtocolAuthorizationRef {
  readonly commandId: string;
  readonly principal: {
    readonly principalType: string;
    readonly principalId: string;
  };
  readonly authorizationEvidenceRef: string;
}

/**
 * A canonical connector execution request. `executionMode` is REQUIRED on
 * every execution, and so is the protocol authorization reference and the
 * ConnectedCapabilityInstance reference: no mode — including
 * PASS_THROUGH_NATIVE — can bypass protocol authorization, and no
 * catalogue/definition reference can stand in for a connected instance
 * (INV-13).
 */
export interface ConnectorExecutionRequest {
  readonly executionMode: ExecutionMode;
  readonly modeVocabularyVersion: typeof EXECUTION_MODE_VOCABULARY_VERSION;
  /** MUST reference a ConnectedCapabilityInstance (never a catalogue entry). */
  readonly capabilityInstanceId: string;
  /** Opaque provider-native request payload (never typed with provider SDKs). */
  readonly providerRequest: unknown;
  readonly idempotencyKey: string;
  readonly protocolAuthorization: ProtocolAuthorizationRef;
}

export type ExecutionRequestValidation =
  | { readonly ok: true; readonly mode: ExecutionMode }
  | { readonly ok: false; readonly violations: readonly string[] };

/**
 * Validates that an execution request carries an explicit, valid mode AND
 * the protocol authorization link. Missing mode, stale mode vocabulary,
 * missing instance reference, missing idempotency key and a missing
 * protocol authorization reference are all violations.
 */
export function validateExecutionRequest(
  request: unknown,
): ExecutionRequestValidation {
  const violations: string[] = [];
  const candidate = request as Partial<ConnectorExecutionRequest> | null;

  if (candidate === null || typeof candidate !== 'object') {
    return {
      ok: false,
      violations: ['execution request must be an object'],
    };
  }

  if (!isExecutionMode(candidate.executionMode)) {
    violations.push(
      'executionMode is REQUIRED and must be explicit on every execution: PASS_THROUGH_NATIVE | COMPOSED_PAYSWAP | OPTIMIZED_MULTI_PROVIDER',
    );
  }
  if (candidate.modeVocabularyVersion !== EXECUTION_MODE_VOCABULARY_VERSION) {
    violations.push(
      `modeVocabularyVersion must be '${EXECUTION_MODE_VOCABULARY_VERSION}' (versioned mode contract)`,
    );
  }
  if (
    typeof candidate.capabilityInstanceId !== 'string' ||
    candidate.capabilityInstanceId === ''
  ) {
    violations.push(
      'capabilityInstanceId is required (must reference a ConnectedCapabilityInstance, never a provider catalogue entry or definition — INV-13)',
    );
  }
  if (typeof candidate.idempotencyKey !== 'string' || candidate.idempotencyKey === '') {
    violations.push('idempotencyKey is required');
  }
  const authorization = candidate.protocolAuthorization;
  if (
    authorization === null ||
    typeof authorization !== 'object' ||
    typeof authorization.commandId !== 'string' ||
    authorization.commandId === '' ||
    authorization.principal === null ||
    typeof authorization.principal !== 'object' ||
    typeof authorization.principal.principalType !== 'string' ||
    typeof authorization.principal.principalId !== 'string' ||
    typeof authorization.authorizationEvidenceRef !== 'string' ||
    authorization.authorizationEvidenceRef === ''
  ) {
    violations.push(
      'protocolAuthorization is required: no execution mode (including PASS_THROUGH_NATIVE) can bypass protocol authorization',
    );
  }

  if (violations.length > 0) {
    return { ok: false, violations };
  }
  return { ok: true, mode: (candidate as ConnectorExecutionRequest).executionMode };
}

/** Thrown when an execution is attempted without an explicit mode. */
export function implicitExecutionModeError(
  violations: readonly string[],
): ImplicitExecutionModeError {
  return new ImplicitExecutionModeError(violations);
}
