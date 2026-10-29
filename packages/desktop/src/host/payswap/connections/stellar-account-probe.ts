/**
 * PaySwap Desktop (P22-H, ADR-0016 D9) — the STELLAR ACCOUNT-READ PROBE:
 * the Horizon verification probe for the onchain rail's keypair
 * connections (the P13 evidence precedent — READ-ONLY).
 *
 * THE PROBE LAW: the probe reads the SEALED keypair's PUBLIC account on
 * the Stellar TESTNET through Horizon (`GET /accounts/{publicKey}`) and
 * classifies through the SAME core the PSP probes use:
 * - 200 with balances → CONFIRMED: the account is readable, the asset
 *   positions are observed (the issuer-scoped refs — the corridor
 *   chain's grounding), the accountRef is the G… id;
 * - 404 (Horizon's not_found) → FAILED with the honest reason: the
 *   keypair is shape-valid but the account is NOT FUNDED on testnet —
 *   never a fabricated CONFIRMED position (fund it first);
 * - 401/403-class and malformed shapes → the classification core's
 *   FAILED/UNKNOWN laws (INV-04 — never a guess).
 *
 * THE MATERIAL LAW: the account read needs ONLY the public key for
 * addressing; the secret stays sealed. THE ESCAPE-SCAN LAW (the
 * conservative broker): the keypair seals as ONE material and the
 * scan covers BOTH halves — so the probe's RESULT may never echo the
 * account's G… address either (a key-shaped value in any result
 * field is a refused result, never sanitized). The observation the
 * surfaces see: the account is readable, its asset POSITIONS are
 * observed (the issuer-scoped refs — the issuers are NOT sealed
 * material) — the raw account address stays inside the seal (the
 * opaque-handle law, D9). No Authorization header exists on the
 * Horizon read (the public ledger needs none).
 */

import type { HostTransport } from "./host-https-transports.js";
import type { HostProbeResult } from "./probe-classification.js";
import {
  PINNED_STELLAR_STRKEY_ACCOUNT_PATTERN,
  PINNED_STELLAR_CHAIN_KEY,
  pinnedStellarAssetRef,
} from "./onchain-rail-pins.js";

/** Deps (the PSP probe pattern — all injected). */
export interface StellarAccountReadProbeDeps {
  readonly transport: HostTransport;
  readonly nowMs: () => number;
  readonly executionMode: "SANDBOX" | "LIVE";
}

/** The issuer-scoped positions the account read observed (secret-free). */
export interface StellarAccountPositions {
  /** Canonical issuer-scoped asset refs (`stellar:testnet/asset:USDC:<issuerG>`). */
  readonly assetRefs: readonly string[];
  /** The asset codes observed (XLM native + issued codes). */
  readonly assetCodes: readonly string[];
}

/** The Stellar account-read probe result (HostProbeResult + the positions). */
export interface StellarAccountReadResult extends HostProbeResult {
  readonly positions: StellarAccountPositions | null;
}

/**
 * The Horizon account balance row (the subset the probe reads — Horizon's
 * balances: [{balance, asset_type, asset_code?, asset_issuer?}, …]).
 */
interface HorizonBalanceRow {
  readonly asset_type?: unknown;
  readonly asset_code?: unknown;
  readonly asset_issuer?: unknown;
  readonly balance?: unknown;
}

/** Validate the sealed keypair material shape (never echoes the halves). */
function keypairOf(material: unknown): { readonly publicKey: string } | null {
  if (material === null || typeof material !== "object" || Array.isArray(material)) {
    return null;
  }
  const publicKey = (material as { publicKey?: unknown }).publicKey;
  if (typeof publicKey !== "string" || !PINNED_STELLAR_STRKEY_ACCOUNT_PATTERN.test(publicKey)) {
    return null;
  }
  return { publicKey };
}

/** Extract the secret-free positions off a CONFIRMED account body (never guesses). */
function positionsOf(body: unknown): StellarAccountPositions | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const balances = (body as { balances?: unknown }).balances;
  if (!Array.isArray(balances)) {
    return null;
  }
  const assetRefs: string[] = [];
  const assetCodes: string[] = [];
  for (const entry of balances) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const row = entry as HorizonBalanceRow;
    const assetType = typeof row.asset_type === "string" ? row.asset_type : "";
    if (assetType === "native") {
      assetCodes.push("XLM");
      continue;
    }
    if (assetType === "credit_alphanum4" || assetType === "credit_alphanum12") {
      const code = typeof row.asset_code === "string" && row.asset_code.length > 0 ? row.asset_code : null;
      const issuer =
        typeof row.asset_issuer === "string" && PINNED_STELLAR_STRKEY_ACCOUNT_PATTERN.test(row.asset_issuer)
          ? row.asset_issuer
          : null;
      if (code !== null && issuer !== null) {
        // The issuer-scoped law: a balance without its issuer grounds
        // NOTHING (two issuers of the same code are two assets).
        assetRefs.push(pinnedStellarAssetRef(code, issuer));
        assetCodes.push(code);
      }
    }
  }
  return { assetRefs: Object.freeze(assetRefs), assetCodes: Object.freeze(assetCodes) };
}

/**
 * Create the Stellar account-read probe (a seal consumer over the
 * keypair material; the read addresses ONLY the public half).
 */
export function createHostStellarAccountReadProbe(
  deps: StellarAccountReadProbeDeps,
): (material: unknown) => Promise<StellarAccountReadResult> {
  return async (material: unknown): Promise<StellarAccountReadResult> => {
    const dispatchedAt = deps.nowMs();
    const keypair = keypairOf(material);
    if (keypair === null) {
      // Fail-closed: a malformed keypair never reaches the wire.
      return {
        outcome: "FAILED",
        executionMode: deps.executionMode,
        transportClass: "PRODUCTION_HTTP" as const,
        transportId: deps.transport.transportId,
        providerReferences: [],
        accountRef: null,
        providerLiveMode: null,
        keyClass: "READ_ONLY_TEST",
        balanceCurrencies: [],
        failure: {
          code: "STELLAR_KEYPAIR_SHAPE_INVALID",
          message:
            "the sealed material is not a canonical Stellar keypair — the account read is refused before any dispatch",
          retryable: false,
          keyRejected: true,
        },
        dispatchedAt,
        completedAt: deps.nowMs(),
        positions: null,
      };
    }
    const response = await deps.transport.send({
      operationId: "stellar.account.read",
      idempotencyKey: `stellar-account-read:${keypair.publicKey}`,
      params: { accountId: keypair.publicKey },
      headers: {},
      correlationId: `stellar-account-read:${String(dispatchedAt)}`,
    });
    const base = {
      executionMode: deps.executionMode,
      transportClass: "PRODUCTION_HTTP" as const,
      transportId: deps.transport.transportId,
      providerReferences: [] as string[],
      accountRef: null as string | null,
      providerLiveMode: null as boolean | null,
      keyClass: "READ_ONLY_TEST" as const,
      balanceCurrencies: [] as string[],
      dispatchedAt,
      completedAt: deps.nowMs(),
    };
    if (!response.delivered) {
      const kind = response.failure?.kind ?? "MALFORMED_RESPONSE";
      if (
        kind === "TIMEOUT_AFTER_DISPATCH" ||
        kind === "CONNECTION_LOST_AFTER_DISPATCH" ||
        kind === "MALFORMED_RESPONSE"
      ) {
        return {
          ...base,
          outcome: "UNKNOWN",
          ambiguityReason:
            kind === "TIMEOUT_AFTER_DISPATCH"
              ? ("TRANSPORT_TIMEOUT_AFTER_DISPATCH" as const)
              : kind === "CONNECTION_LOST_AFTER_DISPATCH"
                ? ("TRANSPORT_CONNECTION_LOST_AFTER_DISPATCH" as const)
                : ("MALFORMED_RESPONSE_AFTER_DISPATCH" as const),
          positions: null,
        };
      }
      return {
        ...base,
        outcome: "FAILED",
        failure: {
          code: kind,
          message: response.failure?.detail ?? "the account read was refused before dispatch",
          retryable: true,
          keyRejected: false,
        },
        positions: null,
      };
    }
    const status = response.status ?? 0;
    if (status === 404) {
      // The honest unfunded-account law: the keypair is shape-valid, the
      // account simply does not exist on testnet yet.
      return {
        ...base,
        outcome: "FAILED",
        failure: {
          code: "STELLAR_ACCOUNT_NOT_FUNDED",
          message:
            "the account is not funded on the Stellar testnet — fund it (a testnet transfer or the friendbot faucet) before it can ground a corridor relay; the keypair itself stays sealed and valid",
          retryable: true,
          keyRejected: false,
        },
        positions: null,
      };
    }
    if (status < 200 || status >= 300) {
      const providerCode = response.providerErrorCode ?? `HTTP_${String(status)}`;
      return {
        ...base,
        outcome: "FAILED",
        failure: {
          code: providerCode,
          message: response.providerErrorMessage ?? "horizon answered with an error status",
          retryable: false,
          keyRejected: false,
        },
        positions: null,
      };
    }
    // 2xx: the account is readable — extract the positions (never guesses).
    // THE OPAQUE-HANDLE LAW: the raw G… account address is SEALED
    // material (the keypair's public half) — the result never echoes
    // it (the escape-scan would refuse, correctly). The observation is
    // the positions + the fact of readability; the account identity
    // beyond that stays inside the seal.
    const positions = positionsOf(response.body);
    if (positions === null) {
      // A 2xx without the canonical account shape: UNKNOWN (INV-04).
      return {
        ...base,
        outcome: "UNKNOWN",
        ambiguityReason: "MALFORMED_RESPONSE_AFTER_DISPATCH",
        positions: null,
      };
    }
    return {
      ...base,
      outcome: "CONFIRMED",
      accountRef: null,
      providerReferences: Object.freeze([...positions.assetRefs]),
      balanceCurrencies: Object.freeze([...positions.assetCodes]),
      positions,
    };
  };
}

/** The chain key this probe grounds (the corridor rail — ADR-0008 D5). */
export const STELLAR_ACCOUNT_READ_CHAIN_KEY = PINNED_STELLAR_CHAIN_KEY;
