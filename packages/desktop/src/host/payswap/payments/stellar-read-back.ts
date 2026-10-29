/**
 * PaySwap Desktop (P22-H, ADR-0016 D4/D9) — the Stellar TRANSACTION
 * READ-BACK port: the AUTHORITATIVE Horizon read that verifies a
 * CONFIRMED onchain attempt — `GET /transactions/{txHash}` (+ the
 * operations read for a deployment: the observed C… contract id) —
 * through the REAL transport inside the credential seal, under the SAME
 * mode-grant law as the kernel.
 *
 * THE DEPLOYMENT EVIDENCE (D4): `deploymentEvidenceOf` composes the
 * pinned evidence record {txHash, contractId, sourceHash, bytecodeHash}
 * — the ONLY source of a SmartContractExtensionPin (never fabricated:
 * the contractId is OBSERVED on the operations read, the hashes come
 * from the leg's prepared plan).
 *
 * HONEST FINALITY: CONFIRMED requires the transaction's own success
 * flag on a well-formed answer; a malformed body is UNKNOWN (never a
 * guess); the read-back has NO refusal channel — the typed refusals
 * throw PaymentMissionError("VERIFICATION_REFUSED").
 */

import { PaymentMissionError } from "./contracts.js";
import type { KernelConnectionAuthoritySeam, KernelTransportSeam } from "./execution-kernel.js";
import { classify } from "./execution-kernel.js";
import {
  admitStellarSandboxGrant,
  deployedContractIdOf,
  isStellarKernelRefusal,
  KERNEL_STELLAR_OPERATION_IDS,
  stellarKeypairOf,
  submittedTransactionFieldsOf,
} from "./stellar-execution-kernel.js";
import { PINNED_CONTRACT_DEPLOYMENT_EVIDENCE_FIELDS } from "../connections/onchain-rail-pins.js";

/** The typed read-back result (the three-valued outcome + the transaction facts). */
export interface StellarTransactionReadBackResult {
  readonly outcome: "CONFIRMED" | "UNKNOWN" | "FAILED";
  readonly txHash: string;
  /** The provider-reported transaction success flag when well-formed. */
  readonly txSuccess: boolean | null;
  /** The OBSERVED contract id (C…) on a deployment's operations read. */
  readonly contractId: string | null;
}

/** The read-back port (the verify channel member composes the lane-aware form). */
export interface StellarReadBackPort {
  readBack(input: {
    readonly connectionRef: string;
    /** The transaction hash the attempt's envelope recorded. */
    readonly txHash: string;
    readonly executionMode: string;
    /** True iff the attempt was a contract deployment (the operations read applies). */
    readonly expectDeployment?: boolean;
  }): Promise<StellarTransactionReadBackResult>;
}

/** Options (all seams injected — the stripe-read-back precedent). */
export interface StellarReadBackOptions {
  readonly connectionAuthority: KernelConnectionAuthoritySeam;
  readonly transport: KernelTransportSeam;
  readonly nowMs?: () => number;
}

/**
 * THE DEPLOYMENT EVIDENCE RECORD (D4): compose the pinned
 * {txHash, contractId, sourceHash, bytecodeHash} — the field set is the
 * pinned A-lane mirror; the contractId MUST be the OBSERVED one (never
 * a plan guess); the hashes come from the leg's prepared plan.
 */
export function deploymentEvidenceOf(read: {
  readonly txHash: string;
  readonly contractId: string | null;
  readonly sourceHash: string;
  readonly bytecodeHash: string;
}): { txHash: string; contractId: string; sourceHash: string; bytecodeHash: string } | null {
  if (read.contractId === null) {
    // A deployment evidence record WITHOUT the observed contract id is
    // not an evidence record — the pin derives ONLY from a REAL
    // deployment observation (ADR-0016 D7).
    return null;
  }
  return Object.freeze({
    txHash: read.txHash,
    contractId: read.contractId,
    sourceHash: read.sourceHash,
    bytecodeHash: read.bytecodeHash,
  });
}

/** The pinned evidence field names (the mirror surface the battery asserts). */
export const STELLAR_DEPLOYMENT_EVIDENCE_FIELDS = PINNED_CONTRACT_DEPLOYMENT_EVIDENCE_FIELDS;

/** Compose the REAL Stellar transaction read-back. */
export function createStellarReadBack(options: StellarReadBackOptions): StellarReadBackPort {
  const nowMs = options.nowMs ?? Date.now;
  return {
    async readBack(input) {
      // Admission mirrors the kernel (outside the seal).
      const statuses = await options.connectionAuthority.connectionStatuses();
      const connection = statuses.find((s) => s.connectionId === input.connectionRef);
      if (connection === undefined || connection.state !== "ACTIVE") {
        throw new PaymentMissionError(
          "VERIFICATION_REFUSED",
          `the read-back connection '${input.connectionRef}' is not ACTIVE — an authoritative read-back is never fabricated`,
        );
      }
      if (typeof input.txHash !== "string" || input.txHash.length === 0) {
        throw new PaymentMissionError(
          "VERIFICATION_REFUSED",
          "the read-back requires the transaction hash the attempt's envelope recorded",
        );
      }
      try {
        return await options.connectionAuthority.withSealedCredential(
          input.connectionRef,
          async (material) => {
            stellarKeypairOf(material);
            admitStellarSandboxGrant(input.executionMode);
            const response = await options.transport.send({
              operationId: KERNEL_STELLAR_OPERATION_IDS.transactionRead,
              idempotencyKey: `stellar-readback:${input.txHash}`,
              params: { txHash: input.txHash },
              headers: {},
              correlationId: `stellar-kernel:${KERNEL_STELLAR_OPERATION_IDS.transactionRead}:${String(nowMs())}`,
            });
            const classification = classify(response);
            if (classification.outcome !== "CONFIRMED") {
              if (classification.outcome === "UNKNOWN") {
                return { outcome: "UNKNOWN" as const, txHash: input.txHash, txSuccess: null, contractId: null };
              }
              return { outcome: "FAILED" as const, txHash: input.txHash, txSuccess: null, contractId: null };
            }
            const transaction = submittedTransactionFieldsOf(response.body);
            if (transaction.txHash === null || transaction.success === null) {
              return { outcome: "UNKNOWN" as const, txHash: input.txHash, txSuccess: null, contractId: null };
            }
            // A deployment attempt additionally reads the operations to
            // OBSERVE the contract id (the C… StrKey on the deploy op).
            let contractId: string | null = null;
            if (input.expectDeployment === true) {
              const operationsResponse = await options.transport.send({
                operationId: KERNEL_STELLAR_OPERATION_IDS.operationsRead,
                idempotencyKey: `stellar-readback-ops:${input.txHash}`,
                params: { txHash: input.txHash },
                headers: {},
                correlationId: `stellar-kernel:${KERNEL_STELLAR_OPERATION_IDS.operationsRead}:${String(nowMs())}`,
              });
              const operationsClassification = classify(operationsResponse);
              if (operationsClassification.outcome === "CONFIRMED") {
                contractId = deployedContractIdOf(operationsResponse.body);
              }
            }
            return {
              outcome: "CONFIRMED" as const,
              txHash: transaction.txHash,
              txSuccess: transaction.success,
              contractId,
            };
          },
          `stellar-transaction-readback:${input.txHash}`,
        );
      } catch (error) {
        if (isStellarKernelRefusal(error)) {
          throw new PaymentMissionError("VERIFICATION_REFUSED", error.refusal.reason);
        }
        if (error instanceof PaymentMissionError) {
          throw new PaymentMissionError("VERIFICATION_REFUSED", error.message);
        }
        throw error;
      }
    },
  };
}
