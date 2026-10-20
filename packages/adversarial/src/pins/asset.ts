/**
 * @payswap/adversarial — structural pin: the asset vocabulary
 * (P6-W3, lane r4-w3).
 *
 * LAYER LAW: zero sibling imports (MODULE-OWNERSHIP layer `security`).
 * Asset definitions are owned by the onchain-domain lane
 * (packages/onchain-domain/src/asset.ts, P4-W1/R2-W1): assets are
 * DESCRIPTIVE catalogue vocabulary with canonical identity
 * (`asset.<chainKey>.<symbol-or-slug>`), an asset CLASS, exact
 * integer minor-unit scale and chain scope (INV-2: exact money;
 * INV-7: external balances are observations). The security kernel
 * carries asset references as neutral strings; this pin mirrors:
 *
 * - `AssetRef` — the neutral asset reference wire (a canonical asset
 *   id string);
 * - `ASSET_CLASSES` / `AssetClass` — the onchain-domain class union
 *   verbatim (NATIVE | TOKEN | WRAPPED | BRIDGED | OTHER);
 * - `ASSET_ID_PATTERN` — the canonical identity shape
 *   (`asset.<chainKey>.<slug>`, lower-case; the domain validator's
 *   structural core).
 *
 * Provider observations (impersonation lookalikes, honeypot
 * restrictions, partial-payment captures) reference assets through
 * this pin only — never a vendor token address in a core contract
 * (INV-16/INV-17: provider implementations do not leak into neutral
 * domain contracts).
 *
 * Deterministic only: pure data + pure functions.
 */

/** Neutral asset reference — a canonical asset id string. */
export type AssetRef = string;

/** Asset classes (onchain-domain asset.ts, verbatim union). */
export const ASSET_CLASSES = [
  "NATIVE",
  "TOKEN",
  "WRAPPED",
  "BRIDGED",
  "OTHER",
] as const;

export type AssetClass = (typeof ASSET_CLASSES)[number];

/** Canonical asset identity shape: `asset.<chainKey>.<slug>`. */
export const ASSET_ID_PATTERN = /^asset\.[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/;

/** Type predicate: is the value a canonical asset id? */
export function isValidAssetRef(value: unknown): value is string {
  return typeof value === "string" && ASSET_ID_PATTERN.test(value);
}
