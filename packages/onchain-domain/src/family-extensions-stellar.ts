/**
 * @payswap/onchain-domain — the STELLAR FAMILY-SCOPED EXTENSION CONTRACTS
 * (P22-A, lane 3-a; ADR-0016 D2/D3/D9).
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║ This is a FAMILY-EXTENSIONS module (the family-extensions.ts law):   ║
 * ║ the ONLY place family-specific shapes may live. The neutral core     ║
 * ║ (chain, asset, protocol, wallet, execution, settlement mapping)      ║
 ║ references these shapes ONLY through the opaque, optional              ║
 * ║ `familyExtension` unions re-exported from ./family-extensions.ts     ║
 * ║ with neutral names. Core contracts NEVER require an extension, so a  ║
 * ║ STELLAR-family chain/asset is fully expressible without any Stellar  ║
 * ║ field leaking into the neutral vocabulary (INV-16; guarded by        ║
 * ║ test/adversarial.test.ts).                                           ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * The Stellar shapes (ADR-0016 appendix — the frozen cross-lane vocabulary):
 * - StrKey address shapes: `G…` accounts, `S…` secrets, `C…` contracts —
 *   base32, exactly the pinned patterns below (D2/D9);
 * - the chain-descriptor extension: the declared network passphrase (the
 *   Stellar chain-identity cross-check — the numeric-chain-id /
 *   genesis-hash precedent of the other declared families);
 * - the issuer-scoped ASSET extension: issuer account (`G…`) + asset code
 *   (D3 — two issuers of the same code are two assets).
 *
 * NO secret material lives here: the `S…` SECRET SHAPE LAW is a DETECTOR
 * (the shape is rejected wherever a secret must never appear); real key
 * material exists only inside the host's sealed credential broker (D9).
 */

import { ValidationError } from "./errors.ts";
import { isNonEmptyString } from "./shared.ts";

// ---------------------------------------------------------------------------
// The StrKey address-shape laws (ADR-0016 D2/D9 — the pinned patterns)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN (ADR-0016 D2/D9 appendix): a Stellar account key's StrKey shape
 * — version byte `G`, 55 base32 characters (56 total). Shape law only; the
 * CRC-16 checksum is a Stellar-SDK concern that never enters this package.
 */
export const STELLAR_STRKEY_ACCOUNT_PATTERN = /^G[A-Z2-7]{55}$/;

/**
 * VALUE PIN (ADR-0016 D9 appendix): a Stellar secret key's StrKey shape —
 * version byte `S`, 55 base32 characters. A value of this shape is SECRET
 * MATERIAL wherever it appears outside the sealed credential broker (see
 * the wallet-law / secret-boundary laws); this pattern exists so such
 * values can be DETECTED and rejected, never so one can be constructed.
 */
export const STELLAR_STRKEY_SECRET_PATTERN = /^S[A-Z2-7]{55}$/;

/**
 * VALUE PIN (ADR-0016 D2 appendix): a Soroban contract's StrKey shape —
 * version byte `C`, 55 base32 characters. The deployment evidence record's
 * `contractId` carries this shape.
 */
export const STELLAR_STRKEY_CONTRACT_PATTERN = /^C[A-Z2-7]{55}$/;

/** Guard: a Stellar account StrKey shape (`G…`). */
export function isStellarStrKeyAccount(value: unknown): value is string {
  return (
    typeof value === "string" && STELLAR_STRKEY_ACCOUNT_PATTERN.test(value)
  );
}

/** Guard: a Stellar secret key StrKey shape (`S…`) — detected, never carried. */
export function isStellarStrKeySecret(value: unknown): value is string {
  return (
    typeof value === "string" && STELLAR_STRKEY_SECRET_PATTERN.test(value)
  );
}

/** Guard: a Soroban contract StrKey shape (`C…`). */
export function isStellarStrKeyContract(value: unknown): value is string {
  return (
    typeof value === "string" && STELLAR_STRKEY_CONTRACT_PATTERN.test(value)
  );
}

/**
 * The classic asset-code law: 1-12 uppercase alphanumerics (the Stellar
 * classic asset vocabulary — 4- and 12-character codes in practice; the
 * shape admits the full documented range).
 */
export const STELLAR_ASSET_CODE_PATTERN = /^[A-Z0-9]{1,12}$/;

// ---------------------------------------------------------------------------
// Chain descriptor extension: STELLAR family
// ---------------------------------------------------------------------------

/**
 * Chain descriptor extension: Stellar family. Carries the declared network
 * passphrase — the PUBLIC chain-identity string that distinguishes the
 * Stellar networks (the numeric-chain-id / genesis-hash precedent of the
 * other declared families: descriptive identity, cross-checked by the
 * family adapter at prepare). Descriptive only — never execution authority.
 */
export interface StellarChainDescriptor {
  readonly family: "STELLAR";
  /** Declared network passphrase (e.g. the public Test SDF Network string). */
  readonly networkPassphrase?: string;
}

// ---------------------------------------------------------------------------
// Asset family extension: STELLAR (the issuer-scoped shape — ADR-0016 D3)
// ---------------------------------------------------------------------------

/**
 * Asset family extension: Stellar. An AssetDefinition on a STELLAR-family
 * chain MAY carry this extension to declare the ISSUER-SCOPED asset
 * identity: the issuing account (`G…`) plus the asset code. When present,
 * the canonical assetId disambiguates issuers
 * (`${chainKey}/asset:${assetCode}:${issuerAccount}` — D3): two issuers of
 * the same code are TWO assets. Descriptive catalogue metadata only.
 */
export interface StellarAssetDescriptor {
  readonly family: "STELLAR";
  /** The issuing account's StrKey (`G…`) — the asset's issuer scope. */
  readonly issuerAccount: string;
  /** The classic asset code (1-12 uppercase alphanumerics). */
  readonly assetCode: string;
}

// ---------------------------------------------------------------------------
// Validators (family-scoped; fail closed)
// ---------------------------------------------------------------------------

/** Guard: a Stellar chain-descriptor extension (family discriminant). */
export function isStellarChainDescriptor(
  value: unknown,
): value is StellarChainDescriptor {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Partial<StellarChainDescriptor>).family === "STELLAR"
  );
}

/**
 * Validates a Stellar chain-descriptor extension: the family discriminant
 * must match (enforced by the caller) and the declared network passphrase,
 * when present, must be a non-empty string (a chain-identity claim without
 * a value is never guessed).
 */
export function validateStellarChainDescriptor(
  candidate: unknown,
): StellarChainDescriptor {
  if (candidate === null || typeof candidate !== "object") {
    throw new ValidationError(
      "family extension must be an object carrying a family discriminant",
    );
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  if (record.family !== "STELLAR") {
    throw new ValidationError(
      `family extension discriminant '${String(record.family)}' does not match the descriptor family 'STELLAR'`,
    );
  }
  if (
    record.networkPassphrase !== undefined &&
    !isNonEmptyString(record.networkPassphrase)
  ) {
    throw new ValidationError(
      "networkPassphrase, when present, must be a non-empty string (the declared Stellar network identity)",
    );
  }
  return {
    family: "STELLAR",
    ...(isNonEmptyString(record.networkPassphrase)
      ? { networkPassphrase: record.networkPassphrase }
      : {}),
  };
}

/**
 * Validates a Stellar asset family extension (the issuer-scoped shape):
 * the issuer account MUST match the `G…` StrKey account pattern (an issuer
 * scope is an account, never a secret and never a contract) and the asset
 * code MUST match the classic asset-code law. Fail closed — a malformed
 * issuer scope is never approximated (the issuer-collision law depends on
 * the issuer being exactly an account shape).
 */
export function validateStellarAssetDescriptor(
  candidate: unknown,
): StellarAssetDescriptor {
  if (candidate === null || typeof candidate !== "object") {
    throw new ValidationError("asset family extension must be an object");
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  if (record.family !== "STELLAR") {
    throw new ValidationError(
      `asset family extension discriminant '${String(record.family)}' is not the STELLAR asset family discriminant`,
    );
  }
  if (!isStellarStrKeyAccount(record.issuerAccount)) {
    throw new ValidationError(
      "issuerAccount must be a Stellar account StrKey matching /^G[A-Z2-7]{55}$/ — the issuer scope is the issuing account (never a secret, never a contract)",
    );
  }
  if (
    typeof record.assetCode !== "string" ||
    !STELLAR_ASSET_CODE_PATTERN.test(record.assetCode)
  ) {
    throw new ValidationError(
      "assetCode must match /^[A-Z0-9]{1,12}$/ (the classic asset-code law)",
    );
  }
  return {
    family: "STELLAR",
    issuerAccount: record.issuerAccount,
    assetCode: record.assetCode,
  };
}

/**
 * The issuer-scope suffix a family asset extension contributes to the
 * canonical asset identity: `:${issuerAccount}` for a Stellar issuer-scoped
 * extension, `undefined` for every extension that carries no issuer scope
 * (the neutral asset validator calls this through family-extensions.ts, so
 * no Stellar shape knowledge ever leaks into the neutral core — INV-16).
 */
export function stellarAssetIdentitySuffix(
  extension: StellarAssetDescriptor,
): string {
  return `:${extension.issuerAccount}`;
}
