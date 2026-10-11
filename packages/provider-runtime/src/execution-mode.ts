/**
 * @payswap/provider-runtime — execution modes: the SANDBOX/LIVE law (P2-W2).
 *
 * INV-25: test/sandbox/live/mainnet distinctions are explicit and
 * mechanically enforced. Wise §6 (advisory acceptance guidance): a
 * sandbox-only pass is NOT live certification — live certification is P8.
 *
 * Mechanical distinctions implemented here:
 *
 * 1. `ExecutionMode` is an explicit two-value union ('SANDBOX' | 'LIVE') —
 *    a runtime, transport binding, effect attempt, event record, retrieval
 *    and raw-state record each carry the mode; nothing defaults silently.
 * 2. TRANSPORT BINDING LAW: a LIVE runtime can NEVER bind a transport that
 *    declares itself FAKE_DETERMINISTIC (a fake can never serve live
 *    behavior); a SANDBOX runtime may bind production transports pointed at
 *    provider sandbox environments — but every record it produces is
 *    mechanically branded SANDBOX and can never be presented as live proof.
 * 3. LIVE BEHAVIOR PROOF: `liveBehaviorProof` succeeds ONLY for LIVE
 *    attempts; a SANDBOX attempt throws SandboxLiveBoundaryError
 *    (`SANDBOX_NOT_LIVE_PROOF`) — a sandbox adapter path can NEVER be
 *    represented as proof of live behavior.
 */

import { SandboxLiveBoundaryError, ValidationError } from './errors.ts';

/** The two execution modes (explicit; no default, no third state). */
export const EXECUTION_MODES = ['SANDBOX', 'LIVE'] as const;

export type ExecutionMode = (typeof EXECUTION_MODES)[number];

export function isExecutionMode(value: unknown): value is ExecutionMode {
  return typeof value === 'string' && (EXECUTION_MODES as readonly unknown[]).includes(value);
}

/** The transport classes (declared by the transport implementation). */
export const TRANSPORT_CLASSES = ['FAKE_DETERMINISTIC', 'PRODUCTION_HTTP'] as const;

export type TransportClass = (typeof TRANSPORT_CLASSES)[number];

export function isTransportClass(value: unknown): value is TransportClass {
  return typeof value === 'string' && (TRANSPORT_CLASSES as readonly unknown[]).includes(value);
}

/**
 * A mechanical attestation that a record was produced by the LIVE
 * execution mode. It is constructible ONLY through `liveBehaviorProof`,
 * which refuses sandbox evidence — there is no public constructor and no
 * cast-free path from a SANDBOX attempt.
 */
export interface LiveBehaviorProof {
  readonly kind: 'LIVE_BEHAVIOR_PROOF';
  readonly executionMode: 'LIVE';
  readonly evidenceRef: string;
  readonly proofId: string;
}

/** Validate a mode declaration (fail-closed on unknown values). */
export function requireExecutionMode(mode: unknown): ExecutionMode {
  if (!isExecutionMode(mode)) {
    throw new ValidationError("execution mode must be 'SANDBOX' or 'LIVE'", { mode });
  }
  return mode;
}

/**
 * The transport binding law. A LIVE runtime binding a
 * FAKE_DETERMINISTIC transport is REFUSED: a deterministic fake transport
 * can never execute production effects, so it can never serve live
 * behavior. SANDBOX may bind either class (a production transport pointed
 * at a provider sandbox environment is still SANDBOX execution).
 */
export function validateTransportBinding(mode: ExecutionMode, transportClass: TransportClass): void {
  requireExecutionMode(mode);
  if (!isTransportClass(transportClass)) {
    throw new ValidationError('transport class must be canonical', { transportClass });
  }
  if (mode === 'LIVE' && transportClass === 'FAKE_DETERMINISTIC') {
    throw new SandboxLiveBoundaryError(
      'INV-25: a LIVE runtime can never bind a FAKE_DETERMINISTIC transport (a fake cannot execute production effects)',
      { mode, transportClass },
    );
  }
}

let proofSequence = 0;

/**
 * Produce the live behavior proof for an attempt. Refuses sandbox
 * evidence mechanically (SandboxLiveBoundaryError with code
 * SANDBOX_NOT_LIVE_PROOF) — this is the gate certification (P8) and
 * consumers lean on.
 */
export function liveBehaviorProof(attempt: {
  readonly executionMode: ExecutionMode;
  readonly evidenceRef: string;
}): LiveBehaviorProof {
  requireExecutionMode(attempt.executionMode);
  if (typeof attempt.evidenceRef !== 'string' || attempt.evidenceRef.length === 0) {
    throw new ValidationError('live behavior proof requires an evidence reference');
  }
  if (attempt.executionMode !== 'LIVE') {
    throw new SandboxLiveBoundaryError(
      'INV-25: a SANDBOX execution path can never be represented as proof of live behavior (live certification is P8)',
      { code: 'SANDBOX_NOT_LIVE_PROOF', executionMode: attempt.executionMode },
    );
  }
  proofSequence += 1;
  return Object.freeze({
    kind: 'LIVE_BEHAVIOR_PROOF' as const,
    executionMode: 'LIVE' as const,
    evidenceRef: attempt.evidenceRef,
    proofId: `live-proof:${proofSequence}`,
  });
}

/** Type predicate: is this value a live behavior proof? */
export function isLiveBehaviorProof(value: unknown): value is LiveBehaviorProof {
  return (
    value !== null &&
    typeof value === 'object' &&
    (value as LiveBehaviorProof).kind === 'LIVE_BEHAVIOR_PROOF' &&
    (value as LiveBehaviorProof).executionMode === 'LIVE'
  );
}
