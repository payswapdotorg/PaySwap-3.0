/**
 * @payswap/execution-graph — the STRATEGY MODEL implementation (P3-W2).
 *
 * Strategies answer WHAT (settle-now, batch, net-later, hold-for-review):
 * the deterministic resolver maps a StrategyProgram's WHAT-dimensions onto
 * typed directives for a demand shape. The advisory builder wraps a
 * program + directives in the structurally non-authoritative envelope
 * (INV-09/INV-10/INV-11: no strategy artifact can declare financial truth
 * or directly authorize execution).
 */

import { ValidationError } from './errors.ts';
import { canonicalDigest, deepFreeze } from './canonical.ts';
import type {
  StrategyAdvisory,
  StrategyDemandShape,
  StrategyDirective,
  StrategyDirectiveKind,
  StrategyDirectiveParameters,
  StrategyProgram,
} from './strategy-contract.ts';
import type { TimestampMs } from '@payswap/protocol';

/** Fail-closed structural validation of a strategy program (pure data). */
export function validateStrategyProgram(program: StrategyProgram): StrategyProgram {
  if (program === null || typeof program !== 'object') {
    throw new ValidationError('a strategy program must be an object');
  }
  if (typeof program.programId !== 'string' || program.programId.length === 0) {
    throw new ValidationError('program.programId must be a non-empty string');
  }
  if (typeof program.programVersion !== 'string' || program.programVersion.length === 0) {
    throw new ValidationError('program.programVersion must be a non-empty string');
  }
  if (!Array.isArray(program.routePreference)) {
    throw new ValidationError('program.routePreference must be an array of rail ids');
  }
  for (const rail of program.routePreference) {
    if (typeof rail !== 'string' || rail.length === 0) {
      throw new ValidationError('program.routePreference entries must be non-empty rail ids');
    }
  }
  if (typeof program.useNetting !== 'boolean' || typeof program.useNetworkCredit !== 'boolean') {
    throw new ValidationError('program.useNetting and useNetworkCredit must be booleans');
  }
  if (
    typeof program.delayToleranceSteps !== 'number' ||
    !Number.isInteger(program.delayToleranceSteps) ||
    program.delayToleranceSteps < 0 ||
    program.delayToleranceSteps > 64
  ) {
    throw new ValidationError(
      'program.delayToleranceSteps must be an integer in [0, 64] (bounded deferral)',
    );
  }
  if (typeof program.fraudScreening !== 'boolean' || typeof program.privacyBounded !== 'boolean') {
    throw new ValidationError('program.fraudScreening and privacyBounded must be booleans');
  }
  if (
    program.authorizationMode !== 'PROTOCOL_AUTHORIZED' &&
    program.authorizationMode !== 'DECLARED_BYPASS'
  ) {
    throw new ValidationError(
      "program.authorizationMode must be 'PROTOCOL_AUTHORIZED' or 'DECLARED_BYPASS' (the bypass is a simulator-only probe the evaluator fails)",
    );
  }
  return program;
}

/** Fail-closed structural validation of a demand shape. */
export function validateStrategyDemandShape(shape: StrategyDemandShape): StrategyDemandShape {
  if (shape === null || typeof shape !== 'object') {
    throw new ValidationError('a demand shape must be an object');
  }
  if (typeof shape.demandId !== 'string' || shape.demandId.length === 0) {
    throw new ValidationError('shape.demandId must be a non-empty string');
  }
  if (typeof shape.amountMinor !== 'bigint' || shape.amountMinor <= 0n) {
    throw new ValidationError('shape.amountMinor must be a positive bigint (exact money)');
  }
  if (typeof shape.currency !== 'string' || shape.currency.length === 0) {
    throw new ValidationError('shape.currency must be a non-empty symbol');
  }
  if (shape.direction !== 'OUTBOUND' && shape.direction !== 'INBOUND') {
    throw new ValidationError('shape.direction must be OUTBOUND or INBOUND');
  }
  if (typeof shape.deadlineMs !== 'number' || !Number.isInteger(shape.deadlineMs) || shape.deadlineMs <= 0) {
    throw new ValidationError('shape.deadlineMs must be a positive integer');
  }
  if (shape.requiresApproval !== undefined && typeof shape.requiresApproval !== 'boolean') {
    throw new ValidationError('shape.requiresApproval, when present, must be a boolean');
  }
  return shape;
}

function directive(
  kind: StrategyDirectiveKind,
  parameters: StrategyDirectiveParameters,
  rationale: string,
  sequence: number,
): StrategyDirective {
  return deepFreeze({
    directiveId: `directive:${sequence}:${kind}`,
    kind,
    parameters: deepFreeze({ ...parameters }),
    advisoryOnly: true,
    rationale,
  });
}

/**
 * Deterministically resolve the directives a program prescribes for one
 * demand shape. The mapping is total and documented:
 * - a demand requiring approval is HELD FOR REVIEW first (advisory hold);
 * - zero delay tolerance -> SETTLE_NOW;
 * - deferral with netting -> BATCH (the coalescing window) plus NET_LATER
 *   (the deferral that makes internalization possible);
 * - deferral without netting -> NET_LATER alone.
 * Every directive is structurally advisory (advisoryOnly: true).
 */
export function resolveStrategyDirectives(
  program: StrategyProgram,
  shape: StrategyDemandShape,
): readonly StrategyDirective[] {
  validateStrategyProgram(program);
  validateStrategyDemandShape(shape);
  const directives: StrategyDirective[] = [];
  if (shape.requiresApproval === true) {
    directives.push(
      directive(
        'HOLD_FOR_REVIEW',
        { reason: 'the demand is gated on an approval arriving (advisory hold)' },
        'requiresApproval demand: execution waits for the approval surface; the strategy never approves anything itself',
        directives.length + 1,
      ),
    );
  }
  const window = program.delayToleranceSteps;
  if (window === 0) {
    directives.push(
      directive(
        'SETTLE_NOW',
        {},
        'delayToleranceSteps=0: settle immediately, no batching window',
        directives.length + 1,
      ),
    );
  } else if (program.useNetting) {
    directives.push(
      directive(
        'BATCH',
        { windowSteps: window },
        `useNetting with delayToleranceSteps=${window}: coalesce co-directional demands inside the window`,
        directives.length + 1,
      ),
    );
    directives.push(
      directive(
        'NET_LATER',
        { deferSteps: window },
        `netting defers settlement up to ${window} step(s) so opposite flows can internalize`,
        directives.length + 1,
      ),
    );
  } else {
    directives.push(
      directive(
        'NET_LATER',
        { deferSteps: window },
        `delayToleranceSteps=${window} without netting: defer only`,
        directives.length + 1,
      ),
    );
  }
  return Object.freeze(directives);
}

/** Deterministic digest of an advisory's truth-relevant content. */
export function strategyAdvisoryDigest(
  program: StrategyProgram,
  directives: readonly StrategyDirective[],
): string {
  return canonicalDigest({
    programId: program.programId,
    programVersion: program.programVersion,
    directives: directives.map((entry) => [entry.kind, entry.parameters]),
  });
}

/**
 * Build the strategy ADVISORY for a program over one demand shape: the
 * resolved directives wrapped in the structurally non-authoritative
 * envelope. `authoritative` is the literal `false`.
 */
export function buildStrategyAdvisory(
  program: StrategyProgram,
  shape: StrategyDemandShape,
  issuedAt: TimestampMs,
): StrategyAdvisory {
  const directives = resolveStrategyDirectives(program, shape);
  const digest = strategyAdvisoryDigest(program, directives);
  return deepFreeze({
    advisoryId: `strategy-advisory:${digest}`,
    programId: program.programId,
    programVersion: program.programVersion,
    directives,
    digest,
    issuedAt,
    authoritative: false,
  });
}
