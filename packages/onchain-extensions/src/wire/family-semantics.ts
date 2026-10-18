/**
 * @payswap/onchain-extensions — the pack-family SEMANTICS tables (Work Order
 * P5-W2, lane R3-W2). Three frozen, total, declarative tables over the six
 * pack families:
 *
 * 1. PACK_FAMILY_SEMANTICS — what each family offers (surface summary) and
 *    which canonical onchain operations represent it (addressing summary);
 * 2. PACK_FAMILY_PROTOCOL_CLASSES — the protocolClass coupling law (a dex
 *    pack's protocol is DEX-class; a lending-staking pack's protocol is
 *    LENDING or STAKING-class; …);
 * 3. PACK_FAMILY_COMPOSITION — the family-compatibility law for sub-pack
 *    composition (which families a composer of family F may compose).
 *
 * The tables are DATA, never execution: the validators and the registry
 * read them; nothing here performs I/O, mints authority or executes.
 */

import type { OnchainOperationKind, ProtocolClass } from '../pins/onchain-domain.ts';
import type { PackFamily } from './families.ts';
import { PACK_FAMILIES } from './families.ts';

/** What a pack family offers, declaratively (never how to execute it). */
export interface PackFamilySemantics {
  readonly family: PackFamily;
  /** Declarative surface summary: what venues of this family offer. */
  readonly description: string;
  /** Representative canonical onchain operations (from ONCHAIN_OPERATION_KINDS). */
  readonly representativeOperations: readonly OnchainOperationKind[];
  /** How venues of this family are addressed (declarative summary). */
  readonly addressingDescription: string;
}

/** The family semantics table (total over PACK_FAMILIES). */
export const PACK_FAMILY_SEMANTICS: Readonly<Record<PackFamily, PackFamilySemantics>> =
  Object.freeze({
    dex: Object.freeze({
      family: 'dex',
      description:
        'Token swap execution on a single chain (AMM, order book, RFQ or aggregator venues).',
      representativeOperations: Object.freeze(['onchain.swap'] as const),
      addressingDescription:
        'Protocol-per-chain: the venue is addressed by its protocol descriptor (router/contracts) on one chainKey.',
    }),
    bridge: Object.freeze({
      family: 'bridge',
      description:
        'Cross-chain asset movement through declared corridors (lock-and-mint, burn-and-mint, liquidity-pool or message-passing models).',
      representativeOperations: Object.freeze(['onchain.bridge'] as const),
      addressingDescription:
        'Corridor: the venue is addressed by its protocol descriptor plus a declared source→destination corridor.',
    }),
    'off-ramp': Object.freeze({
      family: 'off-ramp',
      description:
        'Conversion of onchain assets into fiat payout through a declared settlement-rail handoff (payout methods, jurisdictions, KYC).',
      representativeOperations: Object.freeze(['onchain.transfer'] as const),
      addressingDescription:
        'Protocol-per-chain with a fiat-rail handoff: the onchain leg is addressed by the protocol descriptor; the payout leg is a declared rail reference, never an onchain venue.',
    }),
    liquidity: Object.freeze({
      family: 'liquidity',
      description:
        'Liquidity provision positions in pools or books (constant-product, concentrated-liquidity, order-book or peer-pool models) with declared fee tiers and lockups.',
      representativeOperations: Object.freeze(['onchain.approval', 'onchain.contract_call'] as const),
      addressingDescription:
        'Protocol-per-chain: positions are addressed through the pool contracts of the venue on one chainKey.',
    }),
    'lending-staking': Object.freeze({
      family: 'lending-staking',
      description:
        'Yield-bearing positions: supply, borrow, staking and liquid-staking surfaces with declared collateral, rate and unbonding semantics.',
      representativeOperations: Object.freeze(['onchain.approval', 'onchain.contract_call'] as const),
      addressingDescription:
        'Protocol-per-chain: positions are addressed through the market/staking contracts of the venue on one chainKey.',
    }),
    'intent-protocol': Object.freeze({
      family: 'intent-protocol',
      description:
        'Intent-based settlement domains: users declare intents, solvers compete to fulfill them (batch-auction or fulfiller-settled models).',
      representativeOperations: Object.freeze(['onchain.intent'] as const),
      addressingDescription:
        'Domain: the venue is addressed by its protocol descriptor plus the declared settlement domain (the chains the auction/settlement spans).',
    }),
  });

/** The protocolClass coupling law: which classes a family's protocol may take. */
export const PACK_FAMILY_PROTOCOL_CLASSES: Readonly<
  Record<PackFamily, readonly ProtocolClass[]>
> = Object.freeze({
  dex: Object.freeze(['DEX'] as const),
  bridge: Object.freeze(['BRIDGE'] as const),
  'off-ramp': Object.freeze(['OTHER'] as const),
  liquidity: Object.freeze(['DEX', 'OTHER'] as const),
  'lending-staking': Object.freeze(['LENDING', 'STAKING'] as const),
  'intent-protocol': Object.freeze(['INTENT_NETWORK'] as const),
});

/**
 * The family-composition law: which families a composer of family F may
 * reference as sub-packs (versioned references resolved by the registry).
 * Leaves (liquidity, lending-staking) compose nothing.
 */
export const PACK_FAMILY_COMPOSITION: Readonly<Record<PackFamily, readonly PackFamily[]>> =
  Object.freeze({
    dex: Object.freeze(['dex', 'liquidity'] as const),
    bridge: Object.freeze(['bridge', 'liquidity'] as const),
    'off-ramp': Object.freeze(['off-ramp', 'dex'] as const),
    liquidity: Object.freeze([] as const),
    'lending-staking': Object.freeze([] as const),
    'intent-protocol': Object.freeze(['dex', 'bridge'] as const),
  });

/** Fail-closed lookup of a family's semantics (never fabricates). */
export function packFamilySemantics(family: PackFamily): PackFamilySemantics {
  const entry = PACK_FAMILY_SEMANTICS[family];
  if (entry === undefined) {
    throw new Error(`packFamilySemantics: unknown pack family '${family}'`);
  }
  return entry;
}

/** Fail-closed lookup of a family's allowed protocol classes. */
export function allowedProtocolClasses(family: PackFamily): readonly ProtocolClass[] {
  const entry = PACK_FAMILY_PROTOCOL_CLASSES[family];
  if (entry === undefined) {
    throw new Error(`allowedProtocolClasses: unknown pack family '${family}'`);
  }
  return entry;
}

/** Fail-closed lookup of a family's composable sub-pack families. */
export function composableFamilies(family: PackFamily): readonly PackFamily[] {
  const entry = PACK_FAMILY_COMPOSITION[family];
  if (entry === undefined) {
    throw new Error(`composableFamilies: unknown pack family '${family}'`);
  }
  return entry;
}

/** Every family is covered by every table (totality, machine-checkable). */
export function packFamilyTablesAreTotal(): boolean {
  return PACK_FAMILIES.every(
    (family) =>
      PACK_FAMILY_SEMANTICS[family] !== undefined &&
      PACK_FAMILY_PROTOCOL_CLASSES[family] !== undefined &&
      PACK_FAMILY_COMPOSITION[family] !== undefined,
  );
}
