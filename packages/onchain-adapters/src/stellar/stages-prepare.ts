/**
 * @payswap/onchain-adapters — the Stellar family PREPARE stage over the
 * Horizon REST surface (P22-A, lane 3-a; ADR-0016 D2/D3/D4).
 *
 * prepare: the network-passphrase chain-identity cross-check (GET / — the
 * Horizon root declares the network it serves; a mismatch is chain
 * confusion, fail closed) + the observed fee (GET /fee_stats — the
 * STROOPS_PER_OPERATION view) + the exact transfer/deploy plan.
 */

import { ValidationError } from '../errors.ts';
import { ChainIdentityMismatchError } from '../errors.ts';
import type { FamilyStageContext } from '../lifecycle/stage-context.ts';
import type { PreparePrologueResult } from '../lifecycle/prepare-prologue.ts';
import type {
  PreparedAdapterOperation,
  PrepareStageInput,
} from '../contract/stage-io.ts';
import type { RestTransport } from '../transport.ts';
import { STELLAR_NETWORK_PASSPHRASES } from './identities.ts';
import { EXACT_STROOPS, STRKEY_ACCOUNT } from './stroops.ts';
import type {
  StellarDeployPlan,
  StellarExecutionPlan,
  StellarPlanFee,
  StellarTransferPlan,
} from './plan.ts';

/** Derives the observed STROOPS_PER_OPERATION fee from the Horizon fee-stats feed. */
export async function stellarDeriveFee(transport: RestTransport): Promise<StellarPlanFee> {
  const feeStats = await transport.get('/fee_stats');
  if (feeStats.kind !== 'REST_OK') {
    return {
      expressible: false,
      reason: `the fee-stats feed is unreachable ('${feeStats.message}') — STROOPS_PER_OPERATION semantics are not expressible and fail closed (never approximated)`,
    };
  }
  const maxFee = (feeStats.body as { max_fee?: { mode?: unknown } } | null)?.max_fee;
  const mode = maxFee?.mode;
  if (typeof mode !== 'string' || !EXACT_STROOPS.test(mode)) {
    return {
      expressible: false,
      reason: 'the fee-stats feed carries no exact max_fee mode — STROOPS_PER_OPERATION semantics are not expressible and fail closed (never approximated)',
    };
  }
  return {
    family: 'STELLAR',
    expressible: true,
    feeModel: 'STROOPS_PER_OPERATION',
    stroopsPerOperation: mode,
  };
}

/**
 * The Stellar prepare stage: the network-passphrase chain-identity
 * cross-check (a mismatch is chain confusion — fail closed), the observed
 * fee, and the exact transfer or deploy plan.
 */
export async function stellarPrepare(
  ctx: FamilyStageContext,
  transport: RestTransport,
  prologue: PreparePrologueResult,
  input: PrepareStageInput,
): Promise<PreparedAdapterOperation<StellarExecutionPlan>> {
  // Structural chain identity: the Horizon root declares the network it
  // serves; it must match the declared passphrase for this chainKey.
  const root = await transport.get('/');
  if (root.kind !== 'REST_OK') {
    throw new ChainIdentityMismatchError(
      `the Horizon root is unobservable on '${ctx.chainKey}' — prepare fails closed when chain identity cannot be verified`,
    );
  }
  const passphrase = (root.body as { network_passphrase?: unknown } | null)?.network_passphrase;
  const declaredPassphrase = STELLAR_NETWORK_PASSPHRASES[ctx.chainKey];
  if (typeof passphrase !== 'string' || passphrase.length === 0) {
    throw new ChainIdentityMismatchError(
      `the Horizon root on '${ctx.chainKey}' declares no network passphrase — prepare fails closed when chain identity cannot be verified`,
    );
  }
  if (declaredPassphrase !== undefined && passphrase !== declaredPassphrase) {
    throw new ChainIdentityMismatchError(
      `the Horizon endpoint serving '${ctx.chainKey}' declares network passphrase '${passphrase}', but the declared passphrase is '${declaredPassphrase}' — chain confusion fails closed`,
    );
  }

  const fee = await stellarDeriveFee(transport);
  const directive = prologue.directive;
  const ledgerAtPrepare = { height: input.head.height, headHash: input.head.headHash };

  if (directive.operation === 'onchain.contract_deploy') {
    const payload = directive.familyPayload as
      | { readonly artifactHash?: unknown; readonly sourceHash?: unknown }
      | undefined;
    const wasmHash = prologue.writeRequest.deployment?.artifactHash;
    if (wasmHash === undefined) {
      throw new ValidationError(
        'a contract_deploy directive requires the digest-bound artifact (the kernel write carries no deployment leg) — unknown deployments never execute silently',
      );
    }
    const sourceHash = payload?.sourceHash;
    if (typeof sourceHash !== 'string' || sourceHash.length === 0) {
      throw new ValidationError(
        'a Stellar contract_deploy directive requires a familyPayload { sourceHash } — the deployment evidence record needs the verified source hash (ADR-0016 D4)',
      );
    }
    const plan: StellarDeployPlan = {
      family: 'STELLAR',
      kind: 'contract_deploy',
      observedNetworkPassphrase: passphrase,
      wasmHash,
      sourceHash,
      fee,
      ledgerAtPrepare,
    };
    return Object.freeze({
      operationKind: 'PreparedAdapterOperation' as const,
      directive: prologue.directive,
      writeRequest: prologue.writeRequest,
      writeDigest: prologue.writeDigest,
      familyPlan: plan,
      preparedAt: input.at,
      evidenceRefs: prologue.evidenceRefs,
    });
  }

  // Transfer: exact stroops + a G… destination + the resolved asset scope.
  const amountStroops = directive.amount?.minorUnits;
  if (typeof amountStroops !== 'string' || !EXACT_STROOPS.test(amountStroops)) {
    throw new ValidationError(
      'a Stellar transfer requires an exact integer stroop amount (the money-exactness law)',
    );
  }
  const destination = directive.destination;
  if (typeof destination !== 'string' || !STRKEY_ACCOUNT.test(destination)) {
    throw new ValidationError(
      `a Stellar transfer requires a destination account matching /^G[A-Z2-7]{55}$/ (StrKey account shape), got '${String(destination)}'`,
    );
  }
  const assetId = directive.assetId as string;
  const plan: StellarTransferPlan = {
    family: 'STELLAR',
    kind: 'transfer',
    observedNetworkPassphrase: passphrase,
    destination,
    assetId,
    amountStroops,
    fee,
    ledgerAtPrepare,
  };
  return Object.freeze({
    operationKind: 'PreparedAdapterOperation' as const,
    directive: prologue.directive,
    writeRequest: prologue.writeRequest,
    writeDigest: prologue.writeDigest,
    familyPlan: plan,
    preparedAt: input.at,
    evidenceRefs: prologue.evidenceRefs,
  });
}
