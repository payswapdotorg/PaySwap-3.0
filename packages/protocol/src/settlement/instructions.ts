/**
 * @payswap/protocol — settlement instructions (P1-W2, MMI-12 PORT).
 *
 * Adapted from payswap.org@8a735bf packages/settlement/src/instructions.ts
 * (old Work Order W1-004, first half; the attempt ledger lives in
 * attempts.ts). Old invariants: INV-F05/INV-O01 → canonical INV-06;
 * INV-X01..X04 → canonical INV-03/INV-04; INV-E01/E02 → canonical INV-05.
 *
 * `SettlementInstruction` EXTENDS the protocol-owned settlement instruction
 * from temporal netting: the settlement plane CONSUMES the protocol
 * derivation (gross derivation preserved verbatim via `fromNetPosition`)
 * and adds the payment-plane enrichment — remittance references preserved
 * end-to-end, the EXTERNAL settlement destination (never PaySwap custody)
 * and the authorization lineage references every consequential action must
 * carry (INV-05).
 *
 * CROSS-LANE PINS (dependency-free in flight; the TL wires the owning
 * package at integration):
 * - `RemittanceAllocation` pins the structural shape of the old
 *   `@payswap/payment` `DocumentAllocation` (documentKind + documentId +
 *   allocatedAmount) — the payment plane (P5-W3 merchant/checkout lane)
 *   owns the real type.
 * - Authorization lineage uses the OPAQUE `AuthorizationRef` structural
 *   record (src/authorization.ts) instead of the old untyped string refs —
 *   the trust lane owns the semantics.
 */

import { ValidationError } from '../errors.ts';
import type { TimestampMs } from '../clock.ts';
import { isPositive } from '../money.ts';
import type { Money } from '../money.ts';
import type { ProtocolSettlementInstruction, SettlementInstructionId } from '../netting.ts';
import { asSettlementInstructionId } from '../netting.ts';
import type { AuthorizationRef } from '../authorization.ts';
import { requireAuthorizationLineage } from '../authorization.ts';

/** One business document this settlement settles (remittance reference). */
export interface RemittanceDocumentRef {
  readonly documentKind: string;
  readonly documentId: string;
}

/**
 * PINNED structural remittance allocation (old repo:
 * @payswap/payment DocumentAllocation). One document's allocated share of
 * the settlement amount — exact Money in the instruction's currency.
 */
export interface RemittanceAllocation {
  readonly documentKind: string;
  readonly documentId: string;
  readonly allocatedAmount: Money;
}

/**
 * A protocol netting-derived settlement instruction enriched with the
 * payment-plane settlement semantics. The protocol part (id, set, parties,
 * amount, `fromNetPosition` with its gross derivation) is consumed
 * verbatim — never re-derived here.
 */
export interface SettlementInstruction extends ProtocolSettlementInstruction {
  /**
   * Remittance references preserved end-to-end: the document allocations of
   * the payments whose obligations this instruction settles.
   */
  readonly remittance: readonly RemittanceAllocation[];
  /** Free-form remittance information the payer required (preserved verbatim). */
  readonly remittanceInfo?: string;
  /** The EXTERNAL settlement destination — never PaySwap custody. */
  readonly settlementDestinationId: string;
  /**
   * INV-05: authorization lineage references (opaque structural refs) — a
   * consequential action without authorization refs is unconstructible.
   */
  readonly authorizationRefs: readonly AuthorizationRef[];
  readonly issuedAt: TimestampMs;
}

/** Options for `deriveSettlementInstruction`. */
export interface DeriveSettlementInstructionInput {
  readonly protocolInstruction: ProtocolSettlementInstruction;
  readonly remittance: readonly RemittanceAllocation[];
  readonly remittanceInfo?: string;
  readonly settlementDestinationId: string;
  readonly authorizationRefs: readonly AuthorizationRef[];
  readonly issuedAt: TimestampMs;
}

/**
 * Construct a validated, frozen settlement instruction from a PROTOCOL-derived
 * instruction. Validation is all-or-nothing:
 * - the protocol instruction must be well-formed (branded id, positive exact
 *   Money, net position present);
 * - each remittance allocation must be positive exact Money in the
 *   instruction's currency with a unique (documentKind, documentId);
 * - the settlement destination must be identified (it stays external);
 * - at least one structurally valid authorization reference must be present
 *   (INV-05 — validated through the opaque structural contract).
 */
export function deriveSettlementInstruction(
  input: DeriveSettlementInstructionInput,
): SettlementInstruction {
  if (input === null || typeof input !== 'object') {
    throw new ValidationError('derive input must be a DeriveSettlementInstructionInput object');
  }
  const protocolInstruction = input.protocolInstruction;
  if (protocolInstruction === null || typeof protocolInstruction !== 'object') {
    throw new ValidationError('protocolInstruction must be a protocol SettlementInstruction');
  }
  asSettlementInstructionId(protocolInstruction.id);
  if (
    protocolInstruction.amount === null ||
    typeof protocolInstruction.amount !== 'object' ||
    typeof protocolInstruction.amount.value !== 'bigint'
  ) {
    throw new ValidationError('protocol instruction amount must be exact Money (INV-02)');
  }
  if (!isPositive(protocolInstruction.amount)) {
    throw new ValidationError('a settlement instruction amount must be positive');
  }
  if (protocolInstruction.fromNetPosition === null || typeof protocolInstruction.fromNetPosition !== 'object') {
    throw new ValidationError('protocol instruction must carry its net position (gross derivation)');
  }
  if (typeof input.settlementDestinationId !== 'string' || input.settlementDestinationId.length === 0) {
    throw new ValidationError('settlementDestinationId must be a non-empty string (external destination)');
  }
  const authorizationRefs = requireAuthorizationLineage(input.authorizationRefs ?? []);
  if (typeof input.issuedAt !== 'bigint') {
    throw new ValidationError('issuedAt must be a bigint TimestampMs');
  }
  if (!Array.isArray(input.remittance)) {
    throw new ValidationError('remittance must be an array of RemittanceAllocation');
  }
  const seen = new Set<string>();
  const remittance: RemittanceAllocation[] = [];
  for (const allocation of input.remittance) {
    if (allocation === null || typeof allocation !== 'object') {
      throw new ValidationError('each remittance allocation must be a RemittanceAllocation');
    }
    if (
      typeof allocation.documentKind !== 'string' ||
      allocation.documentKind.length === 0 ||
      typeof allocation.documentId !== 'string' ||
      allocation.documentId.length === 0
    ) {
      throw new ValidationError('each remittance allocation must carry documentKind and documentId');
    }
    const key = `${allocation.documentKind}:${allocation.documentId}`;
    if (seen.has(key)) {
      throw new ValidationError(`a document may appear at most once in the remittance: ${key}`);
    }
    seen.add(key);
    if (
      allocation.allocatedAmount === null ||
      typeof allocation.allocatedAmount !== 'object' ||
      typeof allocation.allocatedAmount.value !== 'bigint' ||
      typeof allocation.allocatedAmount.currency !== 'string'
    ) {
      throw new ValidationError(`allocation for ${key} must be exact Money`);
    }
    if (allocation.allocatedAmount.currency !== protocolInstruction.amount.currency) {
      throw new ValidationError(
        `allocation for ${key} must be in the instruction currency ${String(protocolInstruction.amount.currency)}`,
      );
    }
    if (!isPositive(allocation.allocatedAmount)) {
      throw new ValidationError(`allocation for ${key} must be positive`);
    }
    remittance.push(Object.freeze({ ...allocation, allocatedAmount: allocation.allocatedAmount }));
  }
  if (
    input.remittanceInfo !== undefined &&
    (typeof input.remittanceInfo !== 'string' || input.remittanceInfo.length === 0)
  ) {
    throw new ValidationError('remittanceInfo must be a non-empty string when present');
  }

  return Object.freeze({
    ...protocolInstruction,
    remittance: Object.freeze(remittance),
    ...(input.remittanceInfo !== undefined ? { remittanceInfo: input.remittanceInfo } : {}),
    settlementDestinationId: input.settlementDestinationId,
    authorizationRefs,
    issuedAt: input.issuedAt,
  });
}

/**
 * Deterministic deduplicated document-reference view of the instruction's
 * remittance (first-appearance order): "which business documents did this
 * settlement settle?" — preserved end-to-end.
 */
export function remittanceDocumentRefs(
  instruction: SettlementInstruction,
): readonly RemittanceDocumentRef[] {
  const seen = new Set<string>();
  const refs: RemittanceDocumentRef[] = [];
  for (const allocation of instruction.remittance) {
    const key = `${allocation.documentKind}:${allocation.documentId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(
      Object.freeze({
        documentKind: allocation.documentKind,
        documentId: allocation.documentId,
      }),
    );
  }
  return Object.freeze(refs);
}
