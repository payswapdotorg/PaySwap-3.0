/**
 * @payswap/onchain-adapters — the Stellar family OBSERVE stages over the
 * Horizon REST surface (P22-A, lane 3-a; ADR-0016 D2/D3).
 *
 * observe (head): GET /ledgers?order=desc&limit=1 → the latest CLOSED ledger
 * (closed ledgers are final — the head is a finality-class anchor).
 *
 * observe (account): GET /accounts/{accountRef} → the account's sequence +
 * balances as issuer-scoped asset position OBSERVATIONS (never custody,
 * never a balance). Amounts are EXACT (stroops.ts — no float, INV-2).
 */

import { ValidationError } from '../errors.ts';
import type { FamilyStageContext } from '../lifecycle/stage-context.ts';
import type {
  AssetPositionProbe,
  ChainHeadObservation,
  ChainHeadProbe,
} from '../contract/observations.ts';
import type { RestTransport } from '../transport.ts';
import { EXACT_STROOPS, STRKEY_ACCOUNT, stellarDecimalToStroops } from './stroops.ts';

// ---------------------------------------------------------------------------
// observe: the chain head (the latest CLOSED ledger)
// ---------------------------------------------------------------------------

/** Observes the Stellar chain head: the latest closed ledger. */
export async function stellarObserveChainHead(
  ctx: FamilyStageContext,
  transport: RestTransport,
  defaultMaxAgeSeconds: number,
  input: {
    readonly at: string;
    readonly maxAgeSeconds?: number;
  },
): Promise<ChainHeadProbe> {
  const ledgers = await transport.get('/ledgers?order=desc&limit=1');
  if (ledgers.kind !== 'REST_OK') {
    return stellarUnreachableHead(transport, ctx.chainKey, ledgers.message);
  }
  const records = (ledgers.body as { _embedded?: { records?: unknown[] } } | null)?._embedded
    ?.records;
  const latest = Array.isArray(records) ? (records[0] as Record<string, unknown> | undefined) : undefined;
  const sequence = latest?.['sequence'];
  const hash = latest?.['hash'];
  if (
    latest === undefined ||
    typeof sequence !== 'number' ||
    !Number.isSafeInteger(sequence) ||
    sequence < 1 ||
    typeof hash !== 'string' ||
    hash.length === 0
  ) {
    return stellarUnreachableHead(
      transport,
      ctx.chainKey,
      'the latest closed ledger is unparseable (sequence/hash missing)',
    );
  }
  const atMs = Date.parse(input.at);
  const head: ChainHeadObservation = Object.freeze({
    observationKind: 'ChainHeadObservation',
    chainKey: ctx.chainKey,
    environmentClass: ctx.environmentClass,
    height: sequence,
    headHash: hash,
    observedAt: input.at,
    provenance: ctx.buildProvenance(ledgers.servedBy, atMs),
    maxAgeSeconds: input.maxAgeSeconds ?? defaultMaxAgeSeconds,
  });
  ctx.logEvidence('chain-head', 'observe', atMs, [head.headHash, String(head.height)]);
  return { kind: 'HEAD_OBSERVED', head };
}

/** The unreachable-head probe (availability UNKNOWN — never failure). */
export function stellarUnreachableHead(
  transport: RestTransport,
  chainKey: string,
  message: string,
): ChainHeadProbe {
  return {
    kind: 'RAIL_UNREACHABLE',
    availability: 'UNKNOWN',
    chainKey,
    transportId: transport.transportId,
    attemptedEndpointIds: transport.endpoints().map((endpoint) => endpoint.endpointId),
    message: `Stellar chain head unobservable: ${message} — reachability UNKNOWN, never success/failure`,
    at: new Date(0).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// observe: the account + issuer-scoped asset positions
// ---------------------------------------------------------------------------

/** The parsed account view the observe stage produces (an OBSERVATION, never custody). */
export interface StellarAccountObservation {
  readonly accountRef: string;
  /** The account's current sequence number (transaction composition input). */
  readonly sequence: string;
  /** The raw balance entries as Horizon served them (verbatim shapes). */
  readonly balances: readonly {
    readonly assetType: string;
    readonly assetCode?: string;
    readonly assetIssuer?: string;
    readonly balance: string;
  }[];
}

/** Observes a Stellar account (sequence + balances) — read-only. */
export async function stellarObserveAccount(
  transport: RestTransport,
  accountRef: string,
): Promise<StellarAccountObservation> {
  const account = await transport.get(`/accounts/${accountRef}`);
  if (account.kind !== 'REST_OK') {
    throw new ValidationError(
      `the account '${accountRef}' is unobservable on the Horizon surface ('${account.message}') — the account observation fails closed, never fabricated`,
    );
  }
  const body = account.body as { sequence?: unknown; balances?: unknown } | null;
  const sequence = body?.sequence;
  const balances = body?.balances;
  if (typeof sequence !== 'string' || !EXACT_STROOPS.test(sequence) || !Array.isArray(balances)) {
    throw new ValidationError(
      `the account '${accountRef}' observation is malformed (sequence/balances missing) — never fabricated`,
    );
  }
  const parsed = balances.map((entry) => {
    const record = entry as Record<string, unknown>;
    const assetType = record['asset_type'];
    const balance = record['balance'];
    if (typeof assetType !== 'string' || typeof balance !== 'string') {
      throw new ValidationError(
        `the account '${accountRef}' carries a malformed balance entry — never fabricated`,
      );
    }
    return {
      assetType,
      ...(typeof record['asset_code'] === 'string' ? { assetCode: record['asset_code'] as string } : {}),
      ...(typeof record['asset_issuer'] === 'string'
        ? { assetIssuer: record['asset_issuer'] as string }
        : {}),
      balance,
    };
  });
  return Object.freeze({ accountRef, sequence, balances: Object.freeze(parsed) });
}

/**
 * Observes one issuer-scoped asset position: the native XLM balance, or the
 * balance entry whose (asset_code, asset_issuer) matches the canonical
 * assetId's issuer scope. A credit assetId WITHOUT an issuer scope is
 * ASSET_BINDING_UNKNOWN (the issuer-collision law — the issuer scope is
 * required to identify a credit asset).
 */
export async function stellarObserveAssetPosition(
  ctx: FamilyStageContext,
  transport: RestTransport,
  nativeAssetId: string,
  input: {
    readonly accountRef: string;
    readonly assetId: string;
    readonly at: string;
    readonly maxAgeSeconds?: number;
  },
): Promise<AssetPositionProbe> {
  const scope = parseStellarAssetId(input.assetId, nativeAssetId);
  if (scope === undefined) {
    return {
      kind: 'POSITION_UNOBSERVABLE',
      reason: 'ASSET_BINDING_UNKNOWN',
      message: `assetId '${input.assetId}' does not resolve on '${ctx.chainKey}' (the native binding is '${nativeAssetId}'; credit assets require the issuer-scoped form '${ctx.chainKey}/asset:CODE:ISSUER' — two issuers of the same code are two assets, ADR-0016 D3)`,
      chainKey: ctx.chainKey,
      at: input.at,
    };
  }
  const account = await transport.get(`/accounts/${input.accountRef}`);
  if (account.kind === 'TRANSPORT_UNREACHABLE') {
    return {
      kind: 'POSITION_UNOBSERVABLE',
      reason: 'RAIL_UNREACHABLE',
      message: `account observation failed for '${input.accountRef}': ${account.message}`,
      chainKey: ctx.chainKey,
      at: input.at,
    };
  }
  if (account.kind === 'REST_ERROR') {
    return {
      kind: 'POSITION_UNOBSERVABLE',
      reason:
        account.status === 400 || account.status === 404
          ? 'PROVIDER_REJECTED_ACCOUNT'
          : 'RAIL_UNREACHABLE',
      message: `account observation failed for '${input.accountRef}': ${account.message}`,
      chainKey: ctx.chainKey,
      at: input.at,
    };
  }
  const balances = (account.body as { balances?: unknown } | null)?.balances;
  if (!Array.isArray(balances)) {
    return {
      kind: 'POSITION_UNOBSERVABLE',
      reason: 'PROVIDER_REJECTED_ACCOUNT',
      message: `the Horizon response for '${input.accountRef}' carries no balances — a lossy observation is never fabricated`,
      chainKey: ctx.chainKey,
      at: input.at,
    };
  }
  const entry = balances.find((candidate) => stellarBalanceMatches(candidate, scope));
  if (entry === undefined) {
    return {
      kind: 'POSITION_UNOBSERVABLE',
      reason: 'ASSET_BINDING_UNKNOWN',
      message: `no balance entry matches '${input.assetId}' on '${input.accountRef}' (no trustline, or the issuer scope names an unheld asset) — a zero position is never assumed, only observed`,
      chainKey: ctx.chainKey,
      at: input.at,
    };
  }
  const balance = (entry as Record<string, unknown>)['balance'];
  let minorUnits: string;
  try {
    minorUnits = stellarDecimalToStroops(balance, 'balance');
  } catch (error) {
    return {
      kind: 'POSITION_UNOBSERVABLE',
      reason: 'PROVIDER_REJECTED_ACCOUNT',
      message: `the observed balance for '${input.assetId}' is not exact (${error instanceof Error ? error.message : String(error)}) — never fabricated`,
      chainKey: ctx.chainKey,
      at: input.at,
    };
  }
  const observation = ctx.validatedAssetObservation({
    observationKind: 'AssetObservation',
    observationId: `asset-obs:${ctx.adapterId}:${input.assetId}:${minorUnits}`,
    observedAt: input.at,
    assetId: input.assetId,
    chainKey: ctx.chainKey,
    location: { chainKey: ctx.chainKey, accountRef: input.accountRef },
    observedAmount: { currency: input.assetId, minorUnits },
    freshness: { asOf: input.at, maxAgeSeconds: input.maxAgeSeconds ?? 35 },
    provenance: {
      providerName: account.servedBy.providerName,
      source: 'PROVIDER_API',
      capturedAt: input.at,
    },
    observer: { observerId: ctx.adapterId, observerKind: 'INDEXER' },
  });
  ctx.logEvidence(`position:${input.assetId}:${input.accountRef}`, 'observe', Date.parse(input.at), [
    observation.observationId,
  ]);
  return { kind: 'POSITION_OBSERVED', observation };
}

/** The parsed issuer scope of a Stellar assetId (undefined = unresolvable). */
export interface ParsedStellarAssetScope {
  readonly kind: 'native' | 'issuer_scoped';
  readonly code: string;
  readonly issuerAccount?: string;
}

/** Parses a (possibly issuer-scoped) Stellar assetId against the native binding. */
export function parseStellarAssetId(
  assetId: string,
  nativeAssetId: string,
): ParsedStellarAssetScope | undefined {
  if (assetId === nativeAssetId) {
    const code = nativeAssetId.slice(nativeAssetId.lastIndexOf(':') + 1);
    return { kind: 'native', code };
  }
  // Issuer-scoped form: `${chainKey}/asset:CODE:ISSUER`.
  const prefix = `${nativeAssetId.slice(0, nativeAssetId.lastIndexOf('/asset:'))}/asset:`;
  if (!assetId.startsWith(prefix)) {
    return undefined;
  }
  const remainder = assetId.slice(prefix.length);
  const lastColon = remainder.lastIndexOf(':');
  if (lastColon === -1) {
    // A credit asset WITHOUT an issuer scope: unresolvable (the collision law).
    return undefined;
  }
  const code = remainder.slice(0, lastColon);
  const issuerAccount = remainder.slice(lastColon + 1);
  if (
    code.length === 0 ||
    !/^[A-Z0-9]{1,12}$/.test(code) ||
    !STRKEY_ACCOUNT.test(issuerAccount)
  ) {
    return undefined;
  }
  return { kind: 'issuer_scoped', code, issuerAccount };
}

function stellarBalanceMatches(
  candidate: unknown,
  scope: ParsedStellarAssetScope,
): boolean {
  if (candidate === null || typeof candidate !== 'object') {
    return false;
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  const assetType = record['asset_type'];
  if (scope.kind === 'native') {
    return assetType === 'native';
  }
  return (
    (assetType === 'credit_alphanum4' || assetType === 'credit_alphanum12') &&
    record['asset_code'] === scope.code &&
    record['asset_issuer'] === scope.issuerAccount
  );
}
