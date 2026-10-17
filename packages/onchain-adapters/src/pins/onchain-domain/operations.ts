/**
 * STRUCTURAL PIN — the onchain-domain operation vocabulary (Work Order
 * P4-W3, lane R2-W3; local structural mirror of payswap.org@8a735bf
 * packages/onchain-domain/src/operations.ts).
 *
 * The canonical @payswap/onchain-domain package (P4-W1, in flight) owns
 * this table; the mirror below is pinned for this package's hermetic
 * battery and is structurally identical (same literals, same required-field
 * couplings). Every operation kind in this vocabulary is a CONSEQUENTIAL
 * WRITE — the authorization link is mandatory on every execution.
 */

import { ValidationError } from '../../errors.ts';

export const ONCHAIN_OPERATION_KINDS = [
  'onchain.transfer',
  'onchain.approval',
  'onchain.contract_call',
  'onchain.swap',
  'onchain.bridge',
  'onchain.intent',
] as const;

export type OnchainOperationKind = (typeof ONCHAIN_OPERATION_KINDS)[number];

export function isOnchainOperationKind(value: unknown): value is OnchainOperationKind {
  return (
    typeof value === 'string' &&
    (ONCHAIN_OPERATION_KINDS as readonly unknown[]).includes(value)
  );
}

/**
 * Financial-effect marker for the generic contract interaction: the effect
 * is DECLARED BY THE CERTIFIED METHOD of the contract-interaction capability
 * — it is never defaulted here and never guessed.
 */
export type CertifiedMethodDeclaredEffect = 'DECLARED_BY_CERTIFIED_METHOD';

/** The financial-effect classification of an onchain operation. */
export type FinancialEffectClassification =
  | 'MOVES_VALUE'
  | 'NO_FINANCIAL_EFFECT'
  | CertifiedMethodDeclaredEffect;

/**
 * The deterministic semantics of one onchain operation kind.
 * `consequentialWrite` is a literal `true`: every operation in this
 * vocabulary is a consequential write.
 */
export interface OnchainOperationSemantics {
  readonly operation: OnchainOperationKind;
  readonly description: string;
  readonly financialEffect: FinancialEffectClassification;
  readonly reversible: boolean;
  readonly consequentialWrite: true;
  /** Required directive fields, enforced by the directive validator. */
  readonly requires: {
    readonly destination: boolean;
    readonly spender: boolean;
    readonly asset: boolean;
    readonly amount: boolean;
    readonly protocol: boolean;
  };
}

/** The frozen operation semantics table (deterministic and total). */
export const ONCHAIN_OPERATION_SEMANTICS: Readonly<
  Record<OnchainOperationKind, OnchainOperationSemantics>
> = Object.freeze({
  'onchain.transfer': Object.freeze({
    operation: 'onchain.transfer',
    description:
      'Transfer an exact amount of one asset to one destination account on one chain',
    financialEffect: 'MOVES_VALUE',
    reversible: false,
    consequentialWrite: true,
    requires: Object.freeze({
      destination: true,
      spender: false,
      asset: true,
      amount: true,
      protocol: false,
    }),
  }),
  'onchain.approval': Object.freeze({
    operation: 'onchain.approval',
    description:
      "Grant or change a spender's allowance over an asset held by the authorizing account (security-consequential; reversible by revocation)",
    financialEffect: 'NO_FINANCIAL_EFFECT',
    reversible: true,
    consequentialWrite: true,
    requires: Object.freeze({
      destination: false,
      spender: true,
      asset: true,
      amount: true,
      protocol: false,
    }),
  }),
  'onchain.contract_call': Object.freeze({
    operation: 'onchain.contract_call',
    description:
      'Interact with a certified protocol contract method through the controlled GenericContractInteractionCapability escape hatch',
    financialEffect: 'DECLARED_BY_CERTIFIED_METHOD',
    reversible: false,
    consequentialWrite: true,
    requires: Object.freeze({
      destination: false,
      spender: false,
      asset: false,
      amount: false,
      protocol: true,
    }),
  }),
  'onchain.swap': Object.freeze({
    operation: 'onchain.swap',
    description:
      'Exchange one asset for another through a certified DEX/aggregator capability on one chain',
    financialEffect: 'MOVES_VALUE',
    reversible: false,
    consequentialWrite: true,
    requires: Object.freeze({
      destination: false,
      spender: false,
      asset: true,
      amount: true,
      protocol: true,
    }),
  }),
  'onchain.bridge': Object.freeze({
    operation: 'onchain.bridge',
    description: 'Move an asset across chains through a certified bridge capability',
    financialEffect: 'MOVES_VALUE',
    reversible: false,
    consequentialWrite: true,
    requires: Object.freeze({
      destination: true,
      spender: false,
      asset: true,
      amount: true,
      protocol: true,
    }),
  }),
  'onchain.intent': Object.freeze({
    operation: 'onchain.intent',
    description:
      'Submit an execution intent to a certified intent-network capability for solver settlement',
    financialEffect: 'MOVES_VALUE',
    reversible: false,
    consequentialWrite: true,
    requires: Object.freeze({
      destination: false,
      spender: false,
      asset: false,
      amount: false,
      protocol: true,
    }),
  }),
});

/**
 * Deterministic semantics lookup. Unknown operations throw (fail closed):
 * there is no default semantics and no undeclared operation can validate.
 */
export function onchainOperationSemantics(
  operation: OnchainOperationKind,
): OnchainOperationSemantics {
  const semantics = ONCHAIN_OPERATION_SEMANTICS[operation];
  if (semantics === undefined) {
    throw new ValidationError(
      `operation '${operation}' has no declared semantics (fail closed — undeclared operations never execute)`,
    );
  }
  return semantics;
}
