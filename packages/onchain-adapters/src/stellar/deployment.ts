/**
 * @payswap/onchain-adapters — the Stellar DEPLOYMENT RECORD derivation
 * (P22-A, lane 3-a; ADR-0016 D4/D7).
 *
 * The evidence stage of the deploy lifecycle path: from a CONFIRMED
 * deployment observation, the deployment record
 * `{ txHash, contractId, sourceHash, bytecodeHash }` is derived — the ONLY
 * source of a SmartContractExtensionPin for what the deployment produced
 * (never fabricated). The contract id is OBSERVED from the rail (the `C…`
 * StrKey on the create-contract operation of the deployed transaction);
 * the source/bytecode hashes are the PREPARED plan's digest-bound artifact
 * identity (what was declared at prepare, never re-guessed here).
 */

import { ValidationError } from '../errors.ts';
import type { FamilyStageContext } from '../lifecycle/stage-context.ts';
import type { BroadcastStageOutcome, PreparedAdapterOperation } from '../contract/stage-io.ts';
import type { ContractDeploymentEvidence } from '../pins/onchain-domain/deployment.ts';
import { validateContractDeploymentEvidence } from '../pins/onchain-domain/deployment.ts';
import type { RestTransport } from '../transport.ts';
import type { StellarExecutionPlan } from './plan.ts';
import { isStellarContractId } from './stages-submit.ts';

/**
 * Derives the deployment evidence record from a CONFIRMED deployment
 * observation + the prepared deploy plan. Fail closed:
 * - the plan must be a contract_deploy plan (a transfer never yields one);
 * - the observation must be CONFIRMED (a deployment record derives ONLY
 *   from a confirmed deployment — a broadcast or unknown outcome never
 *   fabricates one);
 * - the observed contract id must match the `C…` StrKey shape;
 * - the derived record is validated COMPLETE before it is returned.
 */
export async function stellarDeploymentRecord(
  ctx: FamilyStageContext,
  transport: RestTransport,
  input: {
    readonly prepared: PreparedAdapterOperation<StellarExecutionPlan>;
    readonly observation: BroadcastStageOutcome;
  },
): Promise<ContractDeploymentEvidence> {
  const plan = input.prepared.familyPlan;
  if (plan.kind !== 'contract_deploy') {
    throw new ValidationError(
      `the prepared operation is a '${plan.kind}' plan — only a contract_deploy plan derives a deployment record (ADR-0016 D4)`,
    );
  }
  if (input.observation.outcome !== 'CONFIRMED') {
    throw new ValidationError(
      `a deployment record derives ONLY from a CONFIRMED deployment observation — outcome '${input.observation.outcome}' never fabricates one (ADR-0016 D7)`,
    );
  }
  const txHash = input.observation.externalOperationRef;
  if (typeof txHash !== 'string' || txHash.length === 0) {
    throw new ValidationError(
      'the CONFIRMED deployment observation carries no transaction hash — the deployment record is never fabricated',
    );
  }
  // Observe the deployed contract id from the transaction's operations.
  const operations = await transport.get(`/transactions/${txHash}/operations`);
  if (operations.kind !== 'REST_OK') {
    throw new ValidationError(
      `the operations of deployment transaction '${txHash}' are unobservable ('${operations.message}') — the contract id is observed, never guessed`,
    );
  }
  const records = (operations.body as { _embedded?: { records?: unknown[] } } | null)?._embedded
    ?.records;
  const contractId = Array.isArray(records)
    ? records.find((entry) =>
        isStellarContractId((entry as Readonly<Record<string, unknown>>)['contract_id']),
      )
    : undefined;
  const observedContractId = contractId !== undefined
    ? (contractId as Readonly<Record<string, unknown>>)['contract_id']
    : undefined;
  if (typeof observedContractId !== 'string' || !isStellarContractId(observedContractId)) {
    throw new ValidationError(
      `no create-contract operation with a 'C…' contract id is observable on deployment transaction '${txHash}' — the deployment record is never fabricated`,
    );
  }
  const evidence = validateContractDeploymentEvidence({
    txHash,
    contractId: observedContractId,
    sourceHash: plan.sourceHash,
    bytecodeHash: plan.wasmHash,
  });
  ctx.logEvidence(txHash, 'evidence', Date.parse(input.observation.observedAt), [
    `deploy:${observedContractId}`,
    `wasm:${plan.wasmHash}`,
  ]);
  return evidence;
}
