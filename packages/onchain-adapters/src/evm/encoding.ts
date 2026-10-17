/**
 * @payswap/onchain-adapters — EVM wire encoding helpers (Work Order P4-W3,
 * lane R2-W3; PORT of payswap.org@8a735bf packages/onchain-adapters/src/
 * evm/index.ts encoding helpers).
 *
 * Pure, deterministic, exact-integer arithmetic only: addresses are padded
 * to 32-byte hex words, amounts become uint256 hex via BigInt (no float
 * ever touches money), and the ERC20 selectors are frozen constants.
 */

import { ValidationError } from '../errors.ts';
import { parseExactDecimal } from '../transport.ts';

/** ERC20 transfer(address,uint256) */
export const TRANSFER_SELECTOR = '0xa9059cbb';
/** ERC20 balanceOf(address) */
export const BALANCE_OF_SELECTOR = '0x70a08231';
/** ERC20 approve(address,uint256) */
export const APPROVE_SELECTOR = '0x095ea7b3';

/** EVM hex quantity shape (0x-prefixed hex). */
export const EVM_HEX_QUANTITY = /^0x[0-9a-fA-F]+$/;

/** Pads a 20-byte EVM address into a 32-byte hex word (fail closed). */
export function padAddress(address: string): string {
  const clean = address.toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{40}$/.test(clean)) {
    throw new ValidationError(
      `'${address}' is not a 20-byte EVM address (HEX_20_BYTE family convention)`,
    );
  }
  return '0x' + clean.padStart(64, '0');
}

/** Converts an exact decimal amount into a uint256 hex word (no floats). */
export function amountToUint256Hex(minorUnits: string): string {
  const exact = parseExactDecimal(minorUnits, 'amount');
  return '0x' + BigInt(exact).toString(16).padStart(64, '0');
}
