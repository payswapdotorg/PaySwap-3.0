/**
 * @payswap/onchain-domain — onchain operation vocabulary and deterministic
 * operation semantics (P4-W1, lane R2-W1; PORT/ADAPT of payswap.org@8a735bf
 * packages/onchain-domain/src/operations.ts).
 *
 * An onchain operation is the canonical, provider-neutral classification of
 * a consequential onchain write. The semantics table is the deterministic
 * authority for validation and family dispatch: every operation declares
 * its financial-effect classification (RECONCILED to the capability
 * fabric's pinned vocabulary — src/pins.ts PINNED_FINANCIAL_EFFECT_CLASSES;
 * the old repository's per-side-effect vocabulary does not transfer),
 * reversibility, and which directive fields are required.
 *
 * INV-18 (supported onchain writes follow the canonical sequence):
 * consequential onchain writes require explicit authorization lineage and,
 * where supported, simulation plus a pre-broadcast re-check — every
 * operation here is a consequential write (reads are observations, not
 * operations).
 *
 * INV-20 (generic contract writes never execute silently): the
 * contract-interaction operation's financial effect is DECLARED BY THE
 * CERTIFIED METHOD, never defaulted.
 */

import { ValidationError } from "./errors.ts";
import type { PinnedFinancialEffectClass } from "./pins.ts";

/**
 * The declared onchain operation kinds (the consequential-write vocabulary).
 */
export const ONCHAIN_OPERATION_KINDS = [
  "onchain.transfer",
  "onchain.approval",
  "onchain.contract_call",
  "onchain.swap",
  "onchain.bridge",
  "onchain.intent",
] as const;

export type OnchainOperationKind = (typeof ONCHAIN_OPERATION_KINDS)[number];

/**
 * Financial-effect marker for the generic contract interaction: the effect
 * is DECLARED BY THE CERTIFIED METHOD of the contract-interaction capability
 * (INV-20) — it is never defaulted here and never guessed.
 */
export type CertifiedMethodDeclaredEffect = "DECLARED_BY_CERTIFIED_METHOD";

/**
 * The deterministic semantics of one onchain operation kind.
 * `consequentialWrite` is a literal `true`: every operation in this
 * vocabulary is a consequential write and therefore requires the protocol
 * authorization link (INV-5) on every execution request.
 */
export interface OnchainOperationSemantics {
  readonly operation: OnchainOperationKind;
  readonly description: string;
  readonly financialEffect: PinnedFinancialEffectClass | CertifiedMethodDeclaredEffect;
  readonly reversible: boolean;
  readonly consequentialWrite: true;
  /** Required directive fields, enforced by the execution validator. */
  readonly requires: {
    readonly destination: boolean;
    readonly spender: boolean;
    readonly asset: boolean;
    readonly amount: boolean;
    readonly protocol: boolean;
  };
}

/**
 * The frozen operation semantics table. Deterministic and total: every
 * OnchainOperationKind has exactly one entry.
 *
 * Financial-effect reconciliation (old vocabulary -> the fabric's pinned
 * classes): transfer/swap/bridge/intent were MOVES_VALUE and are
 * CONSEQUENTIAL_EXTERNAL_EFFECT; approval was NO_FINANCIAL_EFFECT and is
 * NO_EFFECT (it grants an allowance — security-consequential, reversible by
 * revocation, but no external value moves); contract_call stays
 * DECLARED_BY_CERTIFIED_METHOD (INV-20).
 */
export const ONCHAIN_OPERATION_SEMANTICS: Readonly<
  Record<OnchainOperationKind, OnchainOperationSemantics>
> = Object.freeze({
  "onchain.transfer": Object.freeze({
    operation: "onchain.transfer",
    description:
      "Transfer an exact amount of one asset to one destination account on one chain",
    financialEffect: "CONSEQUENTIAL_EXTERNAL_EFFECT",
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
  "onchain.approval": Object.freeze({
    operation: "onchain.approval",
    description:
      "Grant or change a spender's allowance over an asset held by the authorizing account (security-consequential; reversible by revocation; no external value moves)",
    financialEffect: "NO_EFFECT",
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
  "onchain.contract_call": Object.freeze({
    operation: "onchain.contract_call",
    description:
      "Interact with a certified protocol contract method through the controlled contract-interaction escape hatch",
    financialEffect: "DECLARED_BY_CERTIFIED_METHOD",
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
  "onchain.swap": Object.freeze({
    operation: "onchain.swap",
    description:
      "Exchange one asset for another through a certified DEX/aggregator capability on one chain",
    financialEffect: "CONSEQUENTIAL_EXTERNAL_EFFECT",
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
  "onchain.bridge": Object.freeze({
    operation: "onchain.bridge",
    description:
      "Move an asset across chains through a certified bridge capability",
    financialEffect: "CONSEQUENTIAL_EXTERNAL_EFFECT",
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
  "onchain.intent": Object.freeze({
    operation: "onchain.intent",
    description:
      "Submit an execution intent to a certified intent-network capability for solver settlement",
    financialEffect: "CONSEQUENTIAL_EXTERNAL_EFFECT",
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

// ---------------------------------------------------------------------------
// Vocabulary guard + deterministic lookup (implementation)
// ---------------------------------------------------------------------------

/** Guard: a declared onchain operation kind. */
export function isOnchainOperationKind(
  value: unknown,
): value is OnchainOperationKind {
  return (
    typeof value === "string" &&
    (ONCHAIN_OPERATION_KINDS as readonly unknown[]).includes(value)
  );
}

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
      `no declared semantics for operation '${operation}' — undeclared operations never validate`,
    );
  }
  return semantics;
}
