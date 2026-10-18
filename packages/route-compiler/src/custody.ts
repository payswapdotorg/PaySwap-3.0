/**
 * @payswap/route-compiler — the custody contracts (P5-W1).
 *
 * PORT of the old compiler's leg-contracts custody block (MMI-19): every
 * leg of every route plan carries the full chain of custody for its hop —
 * WHO holds value before, WHO holds it after, WHICH protocol/venue
 * effects the morph, WHAT asset is held and at WHAT exact amount, with
 * EVIDENCE for every transfer.
 *
 * - INV-C09 (no hidden custody): the party vocabulary is CLOSED (5
 *   kinds); a party outside it is structurally unrepresentable;
 * - INV-E02 (evidenced custody): evidenceRefs non-empty on every
 *   transfer;
 * - INV-F01: exact integer amounts on every transfer;
 * - the CONTINUITY LAW (assertCustodyContinuity): consecutive transfers
 *   must agree on the handing-over party — a gap is hidden custody and
 *   throws, naming the hop and both parties.
 */

import { InvalidRouteLegContractError } from "./errors.ts";
import { deepFreeze, requireNonEmptyStringArray, requireObject, type Fail } from "./canonical.ts";
import { validateAmountSpec } from "./amount.ts";

const fail: Fail = (message: string) => new InvalidRouteLegContractError(message);

/**
 * The closed custody-party vocabulary (INV-C09: hidden custody is
 * structurally unrepresentable — a party kind outside this list throws).
 */
export const CUSTODY_PARTY_KINDS = Object.freeze([
  "ONCHAIN_WALLET",
  "EXTERNAL_PROVIDER",
  "EXTERNAL_BANK_INSTRUMENT",
  "ONCHAIN_PROTOCOL",
  "MERCHANT_BALANCE",
] as const);

export type CustodyPartyKind = (typeof CUSTODY_PARTY_KINDS)[number];

/**
 * A custody party. Identifying refs are per-kind (wallets by accountRef,
 * providers by providerName — the account is the provider's internal
 * concern and is ignored by continuity comparison, banks by externalRef,
 * protocols by protocolKey+chainKey, merchant balances by
 * merchantAccountRef).
 */
export type CustodyParty =
  | {
      readonly kind: "ONCHAIN_WALLET";
      readonly accountRef: string;
      readonly chainKey?: string;
    }
  | {
      readonly kind: "EXTERNAL_PROVIDER";
      readonly providerName: string;
      readonly accountRef?: string;
    }
  | {
      readonly kind: "EXTERNAL_BANK_INSTRUMENT";
      readonly externalRef: string;
    }
  | {
      readonly kind: "ONCHAIN_PROTOCOL";
      readonly protocolKey: string;
      readonly chainKey: string;
    }
  | {
      readonly kind: "MERCHANT_BALANCE";
      readonly merchantAccountRef: string;
      providerName: string;
    };

/**
 * One custody transfer: the hop's from/to/via parties, the asset held
 * after the hop, the exact amount, and the evidence that the transfer
 * happened (or, pre-execution, grounds it).
 */
export interface CustodyTransfer {
  readonly from: CustodyParty;
  readonly to: CustodyParty;
  /** The protocol/venue that effects the hop (the router, bridge, PSP). */
  readonly via?: CustodyParty;
  /** What is held after the hop (canonical asset ref or currency code). */
  readonly assetRef: string;
  readonly amount: { readonly currency: string; readonly minorUnits: string };
  readonly evidenceRefs: readonly string[];
}

/** Human-readable custody party description (error messages, journeys). */
export function describeCustodyParty(party: CustodyParty): string {
  switch (party.kind) {
    case "ONCHAIN_WALLET":
      return `wallet:${party.accountRef}`;
    case "EXTERNAL_PROVIDER":
      return `provider:${party.providerName}`;
    case "EXTERNAL_BANK_INSTRUMENT":
      return `bank:${party.externalRef}`;
    case "ONCHAIN_PROTOCOL":
      return `protocol:${party.protocolKey}@${party.chainKey}`;
    case "MERCHANT_BALANCE":
      return `merchant-balance:${party.merchantAccountRef}`;
  }
}

/** Fail-closed validation of one custody party (closed vocabulary). */
export function validateCustodyParty(candidate: unknown, field: string): CustodyParty {
  const record = requireObject(candidate, `${field} (a CustodyParty)`, fail);
  const kind = record["kind"];
  switch (kind) {
    case "ONCHAIN_WALLET": {
      const accountRef = requireBounded(record["accountRef"], `${field}.accountRef`);
      const chainKey = record["chainKey"];
      if (chainKey !== undefined && (typeof chainKey !== "string" || chainKey.length === 0)) {
        throw fail(`${field}.chainKey must be a non-empty string when present`);
      }
      return Object.freeze({ kind, accountRef, ...(chainKey !== undefined ? { chainKey } : {}) });
    }
    case "EXTERNAL_PROVIDER": {
      const providerName = requireBounded(record["providerName"], `${field}.providerName`);
      const accountRef = record["accountRef"];
      if (accountRef !== undefined && (typeof accountRef !== "string" || accountRef.length === 0)) {
        throw fail(`${field}.accountRef must be a non-empty string when present`);
      }
      return Object.freeze({
        kind,
        providerName,
        ...(accountRef !== undefined ? { accountRef } : {}),
      });
    }
    case "EXTERNAL_BANK_INSTRUMENT": {
      const externalRef = requireBounded(record["externalRef"], `${field}.externalRef`);
      return Object.freeze({ kind, externalRef });
    }
    case "ONCHAIN_PROTOCOL": {
      const protocolKey = requireBounded(record["protocolKey"], `${field}.protocolKey`);
      const chainKey = requireBounded(record["chainKey"], `${field}.chainKey`);
      return Object.freeze({ kind, protocolKey, chainKey });
    }
    case "MERCHANT_BALANCE": {
      const merchantAccountRef = requireBounded(
        record["merchantAccountRef"],
        `${field}.merchantAccountRef`,
      );
      const providerName = requireBounded(record["providerName"], `${field}.providerName`);
      return Object.freeze({ kind, merchantAccountRef, providerName });
    }
    default:
      throw fail(
        `${field}.kind must be one of the closed custody vocabulary [${CUSTODY_PARTY_KINDS.join(", ")}] — hidden custody is structurally unrepresentable`,
      );
  }
}

function requireBounded(value: unknown, subject: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw fail(`${subject} must be a non-empty string`);
  }
  return value;
}

/**
 * Fail-closed validation of a custody transfer (INV-C09/E02/F01):
 * validates from/to/optional via, non-empty assetRef, exact amount and
 * non-empty evidence; returns the frozen transfer.
 */
export function validateCustodyTransfer(candidate: unknown): CustodyTransfer {
  const record = requireObject(candidate, "a CustodyTransfer", fail);
  const from = validateCustodyParty(record["from"], "CustodyTransfer.from");
  const to = validateCustodyParty(record["to"], "CustodyTransfer.to");
  const via = record["via"];
  const validatedVia =
    via === undefined ? undefined : validateCustodyParty(via, "CustodyTransfer.via");
  const assetRef = requireBounded(record["assetRef"], "CustodyTransfer.assetRef");
  let amount: CustodyTransfer["amount"];
  try {
    amount = validateAmountSpec(record["amount"], "CustodyTransfer.amount");
  } catch (error) {
    throw new InvalidRouteLegContractError(
      `CustodyTransfer.amount must be a canonical exact-integer AmountSpec (INV-F01): ${error instanceof Error ? error.message : "malformed"}`,
    );
  }
  const evidenceRefs = requireNonEmptyStringArray(
    record["evidenceRefs"],
    "CustodyTransfer.evidenceRefs",
    fail,
  );
  return deepFreeze({
    from,
    to,
    ...(validatedVia !== undefined ? { via: validatedVia } : {}),
    assetRef,
    amount,
    evidenceRefs,
  });
}

/**
 * The identity of a custody party for CONTINUITY comparison: same kind +
 * same identifying ref (the provider ACCOUNT is ignored — continuity is
 * between provider PARTIES, and the pool/issuer morphs happen within one
 * provider; the account-level detail is the provider's internal state).
 */
export function custodyPartyIdentity(party: CustodyParty): string {
  switch (party.kind) {
    case "ONCHAIN_WALLET":
      return `ONCHAIN_WALLET:${party.accountRef}`;
    case "EXTERNAL_PROVIDER":
      return `EXTERNAL_PROVIDER:${party.providerName}`;
    case "EXTERNAL_BANK_INSTRUMENT":
      return `EXTERNAL_BANK_INSTRUMENT:${party.externalRef}`;
    case "ONCHAIN_PROTOCOL":
      return `ONCHAIN_PROTOCOL:${party.protocolKey}@${party.chainKey}`;
    case "MERCHANT_BALANCE":
      return `MERCHANT_BALANCE:${party.merchantAccountRef}`;
  }
}

/**
 * THE CUSTODY-CHAIN LAW (INV-C09): for each consecutive pair, the
 * handing-over party must be the SAME party — any gap is hidden custody
 * and throws, naming the hop indexes and both parties. Continuity is
 * identity-by-kind-and-identifying-ref (custodyPartyIdentity).
 */
export function assertCustodyContinuity(custodies: readonly CustodyTransfer[]): void {
  for (let index = 0; index + 1 < custodies.length; index += 1) {
    const current = custodies[index] as CustodyTransfer;
    const next = custodies[index + 1] as CustodyTransfer;
    if (custodyPartyIdentity(current.to) !== custodyPartyIdentity(next.from)) {
      throw new InvalidRouteLegContractError(
        `custody continuity is broken between hop ${index} and hop ${index + 1}: value leaves '${describeCustodyParty(current.to)}' but hop ${index + 1} draws from '${describeCustodyParty(next.from)}' — hidden custody is structurally unrepresentable (INV-C09)`,
      );
    }
  }
}
