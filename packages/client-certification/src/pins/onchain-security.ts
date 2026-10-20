/**
 * @payswap/client-certification — pinned wire shapes of the onchain
 * security kernel's secret boundary + recheck law (P8-W2, lane p8-w2;
 * commit 1/4).
 *
 * Authority: @payswap/onchain-security (R2-W2, merged @ f9392a3). The
 * secret-boundary gate re-authorizes the kernel's secret vocabulary as
 * the CLIENT boundary law: the same forbidden key names, the same value
 * shape detectors, the same redaction markers, the same drift law. PINS
 * ARE NOT IMPORTS; the shapes below mirror only what the client
 * certification consumes.
 */

// ---------------------------------------------------------------------------
// Forbidden key names (vocabulary law — fail closed)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/onchain-security src/secrets.ts
 * `FORBIDDEN_SECRET_KEY_SUBSTRINGS` (byte-identical; substring match
 * after stripping `_`/`-` separators and lowercasing). No legitimate
 * field of a client-renderable contract collides; when in doubt the
 * boundary fails closed. Lawful secret references use `vaultRef` /
 * `credentialRef` naming.
 */
export const PINNED_FORBIDDEN_SECRET_KEY_SUBSTRINGS = Object.freeze([
  "privatekey",
  "privkey",
  "secretkey",
  "plaintextkey",
  "rawkey",
  "keystore",
  "seedphrase",
  "mnemonic",
  "recoveryphrase",
  "backupphrase",
  "brainwallet",
  "password",
  "passphrase",
  "apikey",
  "apisecret",
  "providersecret",
  "clientsecret",
  "secret",
  "accesstoken",
  "refreshtoken",
  "sessiontoken",
  "cookie",
  "mfa",
  "totp",
  "otp",
] as const);

/**
 * VALUE PIN — authority: @payswap/onchain-security src/secrets.ts
 * `FORBIDDEN_SECRET_KEY_EXACT` (byte-identical; ambiguous stems are
 * forbidden only as an exact normalized key).
 */
export const PINNED_FORBIDDEN_SECRET_KEY_EXACT = Object.freeze([
  "seed",
] as const);

// ---------------------------------------------------------------------------
// Value shape detectors (structure only — never realistic literals)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/onchain-security src/secrets.ts
 * `isRawKeyShape` (behaviour-identical; asserted by test/pins.test.ts):
 * raw 32-byte key shape — 64 hex chars, with or without a 0x prefix.
 */
export function pinnedIsRawKeyShape(value: string): boolean {
  return /^(0x)?[0-9a-fA-F]{64}$/.test(value);
}

/**
 * VALUE PIN — authority: @payswap/onchain-security src/secrets.ts
 * `isMnemonicShape` (behaviour-identical): BIP-39 mnemonic shape —
 * exactly 12 or 24 lowercase words of 3-8 letters.
 */
export function pinnedIsMnemonicShape(value: string): boolean {
  const tokens = value.trim().split(/\s+/);
  if (tokens.length !== 12 && tokens.length !== 24) {
    return false;
  }
  return tokens.every((token) => /^[a-z]{3,8}$/.test(token));
}

// ---------------------------------------------------------------------------
// Redaction markers (the scrubber's output vocabulary)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/onchain-security
 * src/secrets-policy.ts `REDACTED_MARKER_KINDS` (byte-identical).
 */
export const PINNED_REDACTED_MARKER_KINDS = Object.freeze([
  "raw_key",
  "mnemonic",
  "forbidden_key",
] as const);

/** STRUCTURAL PIN — authority: @payswap/onchain-security `RedactedMarker`. */
export type PinnedRedactedMarkerKind =
  (typeof PINNED_REDACTED_MARKER_KINDS)[number];

// ---------------------------------------------------------------------------
// Opaque credential references (the ONLY lawful secret reference)
// ---------------------------------------------------------------------------

/**
 * STRUCTURAL PIN — authority: @payswap/onchain-security
 * `OpaqueCredentialRef` (subset: the discriminator + vault provenance
 * the sandbox/live gate binds). An opaque reference names WHERE custody
 * lives (the vault) and HOW to ask for it — never the material itself.
 */
export interface PinnedOpaqueCredentialRef {
  readonly kind: "opaque_credential_ref";
  readonly vaultRef: string;
}

/**
 * VALUE PIN — authority: @payswap/onchain-security
 * `isOpaqueCredentialRef` (behaviour-identical shape check).
 */
export function pinnedIsOpaqueCredentialRef(
  value: unknown,
): value is PinnedOpaqueCredentialRef {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Partial<PinnedOpaqueCredentialRef>;
  return (
    record.kind === "opaque_credential_ref" &&
    typeof record.vaultRef === "string" &&
    record.vaultRef.length > 0
  );
}

// ---------------------------------------------------------------------------
// The recheck drift law (freshness is carried, never assumed)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/onchain-security src/recheck.ts
 * `DriftReason` (byte-identical closed vocabulary). ANY drift between
 * what the customer authorized and the fresh observation VOIDS the
 * authorization — re-requested, never auto-repaired.
 */
export const PINNED_RECHECK_DRIFT_REASONS = Object.freeze([
  "stale_observation",
  "authorization_expired",
  "stale_network_epoch",
  "chain_drift",
  "asset_drift",
  "amount_drift",
  "destination_drift",
  "approval_drift",
  "route_drift",
  "nonce_drift",
  "protocol_identity_drift",
  "settlement_instruction_drift",
  "write_payload_drift",
] as const);

/** STRUCTURAL PIN — authority: @payswap/onchain-security `DriftReason`. */
export type PinnedDriftReason = (typeof PINNED_RECHECK_DRIFT_REASONS)[number];
