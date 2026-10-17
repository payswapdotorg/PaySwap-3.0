/**
 * @payswap/onchain-adapters — the shared prepare prologue (Work Order
 * P4-W3, lane R2-W3; extracted from BaseChainFamilyAdapter to honor the
 * <=400-line file law).
 *
 * Directive validation, execution-scope assertion (catalogue never
 * authorizes), head freshness, the kernel write request, and the kernel's
 * own content-addressed prepare (the SAME digest the authorize-stage steps
 * will compute — fail early, fail closed). Families append their family
 * plan to the returned prologue.
 */

import { ValidationError } from '../errors.ts';
import { assertHeadFresh } from './staleness.ts';
import type { AdapterEvidenceLog } from './evidence-log.ts';
import type { PrepareStageInput } from '../contract/stage-io.ts';
import { assertOnchainExecutionScope } from '../pins/onchain-domain/instance.ts';
import { validateOnchainExecutionDirective } from '../pins/onchain-domain/directive.ts';
import type { OnchainExecutionDirective } from '../pins/onchain-domain/directive.ts';
import type { OnchainWriteRequest } from '../pins/onchain-security/write-request.ts';
import type { OnchainSecurityKernelPort } from '../pins/onchain-security/kernel-port.ts';
import type { RailEnvironmentClass } from '../environment.ts';

/** The prologue result families compose with their family plan. */
export interface PreparePrologueResult {
  readonly directive: OnchainExecutionDirective;
  readonly writeRequest: OnchainWriteRequest;
  readonly writeDigest: string;
  readonly evidenceRefs: readonly string[];
}

/** The base-adapter dependencies the prologue needs. */
export interface PreparePrologueDeps {
  readonly adapterId: string;
  readonly chainKey: string;
  readonly family: 'EVM' | 'SOLANA' | 'UTXO';
  readonly environmentClass: RailEnvironmentClass;
  readonly kernel: OnchainSecurityKernelPort;
  readonly evidenceLog: AdapterEvidenceLog;
  buildWriteRequest(input: {
    readonly directive: OnchainExecutionDirective;
    readonly signerAccountRef: string;
    readonly at: number;
    readonly requestedBy: string;
    readonly settlementInstruction?: import('../pins/onchain-security/write-request.ts').SettlementInstructionBinding;
  }): OnchainWriteRequest;
}

/** Runs the shared prepare prologue (see module header). */
export function runPreparePrologue(
  deps: PreparePrologueDeps,
  input: PrepareStageInput,
): PreparePrologueResult {
  const directive = validateOnchainExecutionDirective(input.directive);
  // Execution scope: a genuinely connected chain instance.
  assertOnchainExecutionScope(input.instance);
  if (input.instance.chainKey !== deps.chainKey || input.instance.family !== deps.family) {
    throw new ValidationError(
      `connected instance is scoped to chain '${input.instance.chainKey}' (family '${input.instance.family}') — the adapter operates '${deps.chainKey}' (${deps.family}) — scope mismatch fails closed`,
    );
  }
  assertHeadFresh(input.head, input.at);
  const writeRequest = deps.buildWriteRequest({
    directive,
    signerAccountRef: input.signerAccountRef,
    at: input.at,
    requestedBy: input.requestedBy,
    ...(input.settlementInstruction !== undefined
      ? { settlementInstruction: { ...input.settlementInstruction } }
      : {}),
  });
  // The kernel's own prepare: validates, freezes and content-addresses the
  // write (the digest authority).
  const preparedWrite = deps.kernel.prepareWrite(writeRequest, input.at);
  const evidenceRef = deps.evidenceLog.log(
    deps.adapterId,
    deps.environmentClass,
    directive.assetId ?? directive.protocolRef ?? 'operation',
    'prepare',
    input.at,
    [writeRequest.writeId, preparedWrite.writeDigest],
  );
  return {
    directive,
    writeRequest,
    writeDigest: preparedWrite.writeDigest,
    evidenceRefs: Object.freeze([evidenceRef, writeRequest.writeId]),
  };
}
