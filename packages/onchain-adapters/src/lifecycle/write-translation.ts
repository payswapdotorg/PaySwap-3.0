/**
 * @payswap/onchain-adapters — the neutral directive → kernel write request
 * translation (Work Order P4-W3, lane R2-W3; PORT of payswap.org@8a735bf
 * packages/onchain-adapters/src/lifecycle.ts write-translation half).
 *
 * Deterministic and fail-closed: operation support is family-declared
 * (unsupported operations throw — never approximated), asset identity is
 * resolved (never guessed), amounts stay exact, and the route hash is the
 * content digest of the validated directive. The result is secret-scanned
 * (rule 25) before it can become a kernel write.
 */

import { ValidationError } from '../errors.ts';
import { contentDigest } from '../digest.ts';
import { assertNoSecretMaterial } from '../secrets.ts';
import type { ResolvedAssetIdentity } from './declaration.ts';
import type {
  OnchainExecutionDirective,
} from '../pins/onchain-domain/directive.ts';
import { validateOnchainExecutionDirective } from '../pins/onchain-domain/directive.ts';
import type { OnchainWriteRequest } from '../pins/onchain-security/write-request.ts';

/** The family-owned operation-support assertion (unsupported fails closed). */
export type OperationSupportAssertion = (
  operation: OnchainExecutionDirective['operation'],
) => void;

/** The family-owned asset-identity resolver (never guessed). */
export type AssetIdentityResolver = (assetId: string) => ResolvedAssetIdentity;

/** Context the translation needs beyond the directive itself. */
export interface WriteTranslationContext {
  readonly adapterId: string;
  readonly chainKey: string;
  readonly family: 'EVM' | 'SOLANA' | 'UTXO';
  readonly assertOperationSupported: OperationSupportAssertion;
  readonly resolveAssetIdentity: AssetIdentityResolver;
}

/**
 * Builds the kernel-ready OnchainWriteRequest from the neutral directive.
 * Deterministic and fail-closed: family/chain dispatch consistency,
 * future-dated expiry, declared operation support, resolved asset identity,
 * exact amounts, digest-bound route.
 */
export function buildWriteRequest(
  context: WriteTranslationContext,
  input: {
    readonly directive: OnchainExecutionDirective;
    readonly signerAccountRef: string;
    readonly at: number;
    readonly requestedBy: string;
    readonly settlementInstruction?: {
      readonly instructionId: string;
      readonly instructionDigest: string;
    };
    readonly familyNonce?: string;
  },
): OnchainWriteRequest {
  const directive = validateOnchainExecutionDirective(input.directive);
  context.assertOperationSupported(directive.operation);
  if (directive.family !== context.family) {
    throw new ValidationError(
      `directive family '${directive.family}' does not match adapter family '${context.family}' for chain '${context.chainKey}' — family dispatch fails closed`,
    );
  }
  if (directive.chainKey !== context.chainKey) {
    throw new ValidationError(
      `directive chainKey '${directive.chainKey}' does not match adapter chainKey '${context.chainKey}' — chain confusion fails closed`,
    );
  }
  const expiresAtMs = Date.parse(directive.expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= input.at) {
    throw new ValidationError(
      `directive expiresAt '${directive.expiresAt}' must be a future instant at prepare time — an expired write is never prepared`,
    );
  }
  const resolvedAsset =
    directive.assetId !== undefined
      ? context.resolveAssetIdentity(directive.assetId)
      : undefined;

  const writeId = `write:${contentDigest({ directive, at: input.at, adapter: context.adapterId })}`;
  const routeHash = `route:${contentDigest(directive)}`;
  const contractCall = buildContractCallLeg(directive);
  const writeRequest: OnchainWriteRequest = {
    writeId,
    action: directive.operation,
    chain: context.chainKey,
    ...(directive.operation === 'onchain.transfer'
      ? {
          transfer: {
            asset: {
              chain: context.chainKey,
              assetId: directive.assetId as string,
              symbol: resolvedAsset?.symbol as string,
            },
            amount: {
              currency: resolvedAsset?.symbol as string,
              minorUnits: directive.amount?.minorUnits as string,
            },
            from: input.signerAccountRef,
            to: directive.destination as string,
          },
        }
      : {}),
    approvals:
      directive.operation === 'onchain.approval'
        ? [
            {
              asset: {
                chain: context.chainKey,
                assetId: directive.assetId as string,
                symbol: resolvedAsset?.symbol as string,
              },
              owner: input.signerAccountRef,
              spender: directive.spenderRef as string,
              amount: {
                currency: resolvedAsset?.symbol as string,
                minorUnits: directive.amount?.minorUnits as string,
              },
              unlimited: false,
            },
          ]
        : [],
    ...(contractCall !== undefined ? { contractCall } : {}),
    route: {
      routeId: directive.routeRef ?? routeHash,
      routeHash,
    },
    expiry: expiresAtMs,
    ...(input.familyNonce !== undefined ? { nonce: input.familyNonce } : {}),
    ...(input.settlementInstruction !== undefined
      ? { settlementInstruction: input.settlementInstruction }
      : {}),
    requestedBy: input.requestedBy,
  };
  assertNoSecretMaterial(writeRequest, 'prepared adapter write request');
  return writeRequest;
}

/**
 * Optional family contract-call leg from the directive's family payload: a
 * contract_call directive REQUIRES { target, calldata, calldataDigest } —
 * unknown contract writes never execute silently.
 */
export function buildContractCallLeg(
  directive: OnchainExecutionDirective,
): OnchainWriteRequest['contractCall'] | undefined {
  const payload = directive.familyPayload as
    | {
        readonly calldata?: unknown;
        readonly calldataDigest?: unknown;
        readonly target?: unknown;
        readonly value?: unknown;
      }
    | undefined;
  if (directive.operation !== 'onchain.contract_call' || payload === undefined) {
    return undefined;
  }
  if (
    typeof payload.calldata !== 'string' ||
    typeof payload.calldataDigest !== 'string' ||
    typeof payload.target !== 'string' ||
    payload.calldata.length === 0 ||
    payload.calldataDigest.length === 0 ||
    payload.target.length === 0
  ) {
    throw new ValidationError(
      'a contract_call directive requires a familyPayload { target, calldata, calldataDigest } — unknown contract writes never execute silently',
    );
  }
  return {
    target: payload.target,
    calldata: payload.calldata,
    calldataDigest: payload.calldataDigest,
    ...(typeof payload.value === 'object' && payload.value !== null
      ? { value: payload.value as { currency: string; minorUnits: string } }
      : {}),
  };
}
