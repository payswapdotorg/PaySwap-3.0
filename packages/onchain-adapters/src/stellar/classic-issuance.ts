/**
 * @payswap/onchain-adapters — the classic-asset ISSUANCE alternative
 * (P22-A, lane 3-a; ADR-0016 D4: "the classic-asset issuance path (an
 * issuing `G…` account + trustline) is ALSO in scope as the asset vehicle
 * — both are honest on testnet, neither is fabricated").
 *
 * DECLARED PLAN DATA, never execution: the classic issuance vehicle for a
 * Stellar asset is an issuing `G…` account whose payment of the asset code
 * to a holder MINTS the holder's position — but ONLY after the holder
 * holds a TRUSTLINE to the issuer (the prerequisite is a LITERAL of this
 * plan, never assumed away). The plan derives from valid shapes only
 * (issuer/holder `G…` StrKeys, the classic asset-code law, exact stroops);
 * the actual issuance payment rides the normal onchain.transfer lifecycle
 * with the issuer-scoped assetId this plan names.
 */

import { ValidationError } from '../errors.ts';

const STRKEY_ACCOUNT = /^G[A-Z2-7]{55}$/;
const CLASSIC_ASSET_CODE = /^[A-Z0-9]{1,12}$/;
const EXACT_STROOPS = /^(0|[1-9][0-9]*)$/;

/**
 * The declared classic-issuance plan: descriptive data naming the issuing
 * account, the asset code, the receiving holder, the exact amount and the
 * trustline prerequisite. `requiresTrustline` is a LITERAL type — the
 * holder's trustline is a structural prerequisite of classic issuance,
 * never assumed away.
 */
export interface StellarClassicIssuancePlan {
  readonly kind: 'stellar_classic_issuance';
  /** The issuing account (`G…` StrKey) — the asset's issuer scope. */
  readonly issuerAccount: string;
  /** The classic asset code (1-12 uppercase alphanumerics). */
  readonly assetCode: string;
  /** The receiving holder (`G…` StrKey). */
  readonly holderAccount: string;
  /** Exact integer amount in stroops (7-decimal minor units — INV-2). */
  readonly amountStroops: string;
  /** The issuer-scoped canonical assetId the issuance moves (ADR-0016 D3). */
  readonly assetId: string;
  readonly requiresTrustline: true;
  /**
   * Honest scope note: the issuance payment itself is an ordinary
   * onchain.transfer on the issuer-scoped assetId — this plan DECLARES the
   * vehicle, it never executes (ADR-0016 D4: both vehicles are honest on
   * testnet, neither is fabricated).
   */
  readonly descriptiveOnly: true;
}

/**
 * Derives the classic-issuance plan from explicit shapes (fail closed):
 * issuer and holder must be `G…` StrKey account shapes, the code must
 * match the classic asset-code law, and the amount must be exact stroops.
 * The plan is declared data — never execution, never authority.
 */
export function stellarClassicIssuancePlan(
  chainKey: string,
  input: {
    readonly issuerAccount: string;
    readonly assetCode: string;
    readonly holderAccount: string;
    readonly amountStroops: string;
  },
): StellarClassicIssuancePlan {
  if (typeof input.issuerAccount !== 'string' || !STRKEY_ACCOUNT.test(input.issuerAccount)) {
    throw new ValidationError(
      `issuerAccount must be a Stellar account StrKey matching /^G[A-Z2-7]{55}$/ (the classic-issuance vehicle is an issuing account), got '${String(input.issuerAccount)}'`,
    );
  }
  if (typeof input.assetCode !== 'string' || !CLASSIC_ASSET_CODE.test(input.assetCode)) {
    throw new ValidationError(
      `assetCode must match /^[A-Z0-9]{1,12}$/ (the classic asset-code law), got '${String(input.assetCode)}'`,
    );
  }
  if (typeof input.holderAccount !== 'string' || !STRKEY_ACCOUNT.test(input.holderAccount)) {
    throw new ValidationError(
      `holderAccount must be a Stellar account StrKey matching /^G[A-Z2-7]{55}$/, got '${String(input.holderAccount)}'`,
    );
  }
  if (typeof input.amountStroops !== 'string' || !EXACT_STROOPS.test(input.amountStroops)) {
    throw new ValidationError(
      `amountStroops must be a non-negative exact integer stroop string (no floating-point money), got '${String(input.amountStroops)}'`,
    );
  }
  if (input.issuerAccount === input.holderAccount) {
    throw new ValidationError(
      'the issuing account and the holder are the same account — classic issuance to the issuer itself is not a meaningful vehicle and fails closed',
    );
  }
  return Object.freeze({
    kind: 'stellar_classic_issuance',
    issuerAccount: input.issuerAccount,
    assetCode: input.assetCode,
    holderAccount: input.holderAccount,
    amountStroops: input.amountStroops,
    assetId: `${chainKey}/asset:${input.assetCode}:${input.issuerAccount}`,
    requiresTrustline: true,
    descriptiveOnly: true,
  });
}
