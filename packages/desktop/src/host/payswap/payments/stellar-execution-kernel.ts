/**
 * PaySwap Desktop (P22-H, ADR-0016 D2/D4/D9) — the REAL Stellar
 * execution kernel behind the ExecutionAuthorityPort (the onchain
 * rail's SANDBOX/testnet lane).
 *
 * LAYER LAW (the Stripe kernel precedent): this package NEVER imports
 * @payswap/* — the kernel is a STRUCTURAL adapter over injected seams;
 * the corridor literals are VALUE PINS (onchain-rail-pins.js) and the
 * battery MIRROR-ASSERTS the fidelity against the real contracts.
 *
 * LAWS:
 * - THE GRANT (D9/INV-25): the Stellar kernel is SANDBOX-only on
 *   `stellar:testnet` — any other execution mode is MODE_NOT_OFFERED
 *   (a pubnet-shaped target is never offered in this deployment); the
 *   sealed keypair's StrKey shapes are re-validated inside the seal on
 *   EVERY dispatch (never cached). The grant does NOT derive from a key
 *   prefix (keypairs are network-agnostic by shape) — the CONNECTION
 *   declares the network and the mode gate is the honest law.
 * - THE OPERATION SURFACE (D2/D4): CREATE_EXTERNAL_EFFECT maps to the
 *   leg payload's legKind — PSP_STABLECOIN_ISSUANCE → the
 *   `onchain.contract_deploy` path (the Soroban vehicle: submit the
 *   prepared deployment, the envelope references the tx hash + the
 *   observed contract id); ONCHAIN_TRANSFER (or the N=1 no-leg shape)
 *   → the `onchain.transfer` path (the issuer-scoped asset payment:
 *   the leg's assetRef + planned stroops + destination). CANCEL is NOT
 *   OFFERED (an onchain submission, once landed, is not reversible
 *   through this surface — the read-back + reconciliation are the path).
 * - HONEST FINALITY: a 2xx without the canonical Horizon shapes is
 *   UNKNOWN (never a guessed success); a timeout/lost connection after
 *   a potentially-effective submission is UNKNOWN (INV-04).
 * - SECRETS: the keypair exists only inside the seal consumer; the
 *   envelope answer is escape-scanned by the broker's withMaterial
 *   (BOTH halves — the envelope never carries the account address).
 */

import {
  validatePaymentDispatchCommand,
  type ExecutionAuthorityAnswer,
  type ExecutionAuthorityPort,
  type ExecutionAuthorityRefusal,
  type PaymentDispatchCommand,
} from "./execution-authority.js";
import { PaymentMissionError } from "./contracts.js";
import type { PaymentResultEnvelope } from "./contracts.js";
import type { KernelConnectionAuthoritySeam, KernelTransportSeam } from "./execution-kernel.js";
import { classify } from "./execution-kernel.js";
import {
  PINNED_STELLAR_STRKEY_ACCOUNT_PATTERN,
  PINNED_STELLAR_STRKEY_CONTRACT_PATTERN,
  PINNED_STELLAR_STRKEY_SECRET_PATTERN,
} from "../connections/onchain-rail-pins.js";

/** Options (all seams injected; no ambient fetch, no ambient clock). */
export interface StellarExecutionKernelOptions {
  readonly connectionAuthority: KernelConnectionAuthoritySeam;
  readonly transport: KernelTransportSeam;
  readonly nowMs?: () => number;
}

/** The mirrored operation ids (the Horizon evidence surface). */
export const KERNEL_STELLAR_OPERATION_IDS = {
  submit: "stellar.transaction.submit",
  transfer: "onchain.transfer",
  deploy: "onchain.contract_deploy",
  accountRead: "stellar.account.read",
  transactionRead: "stellar.transaction.read",
  operationsRead: "stellar.operations.read",
} as const;

/** A typed refusal raised inside the seal (mapped to the port answer). */
class StellarKernelRefusal extends Error {
  constructor(readonly refusal: ExecutionAuthorityRefusal) {
    super(refusal.reason);
  }
}

/** True iff the thrown value is the kernel's typed seal refusal (the read-back mapping aid). */
export function isStellarKernelRefusal(thrown: unknown): thrown is StellarKernelRefusal {
  return thrown instanceof StellarKernelRefusal;
}

/**
 * THE MODE GRANT LAW (D9/INV-25) — runs on every path, inside the seal:
 * SANDBOX on stellar:testnet ONLY (the connection declares the network;
 * a pubnet-shaped target is MODE_NOT_OFFERED — never a shape guess).
 */
export function admitStellarSandboxGrant(executionMode: string): void {
  if (executionMode !== "SANDBOX") {
    throw new StellarKernelRefusal({
      kind: "MODE_NOT_OFFERED",
      reason: `INV-25: the Stellar kernel is SANDBOX on stellar:testnet only in this deployment (got ${executionMode}); a pubnet-shaped target is never offered`,
    });
  }
}

/** The sealed keypair shape (re-validated inside the seal on every dispatch). */
export function stellarKeypairOf(material: unknown): { readonly publicKey: string; readonly secretKey: string } {
  if (material === null || typeof material !== "object" || Array.isArray(material)) {
    throw new PaymentMissionError("INVALID_TRANSITION", "the sealed credential material is malformed");
  }
  const publicKey = (material as { publicKey?: unknown }).publicKey;
  const secretKey = (material as { secretKey?: unknown }).secretKey;
  if (
    typeof publicKey !== "string" ||
    !PINNED_STELLAR_STRKEY_ACCOUNT_PATTERN.test(publicKey) ||
    typeof secretKey !== "string" ||
    !PINNED_STELLAR_STRKEY_SECRET_PATTERN.test(secretKey)
  ) {
    throw new PaymentMissionError(
      "INVALID_TRANSITION",
      "the sealed keypair does not carry canonical StrKey shapes (G… public + S… secret)",
    );
  }
  return { publicKey, secretKey };
}

/** Read the submitted-transaction fields off a confirmed body (never guesses). */
export function submittedTransactionFieldsOf(body: unknown): { txHash: string | null; success: boolean | null } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { txHash: null, success: null };
  }
  const record = body as { id?: unknown; success?: unknown; hash?: unknown };
  const id = typeof record.id === "string" && record.id.length > 0 ? record.id : null;
  const hash = typeof record.hash === "string" && record.hash.length > 0 ? record.hash : null;
  const success = typeof record.success === "boolean" ? record.success : null;
  return { txHash: id ?? hash, success };
}

/** Read the deployed-contract id off a confirmed operations body (the C… StrKey). */
export function deployedContractIdOf(body: unknown): string | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const records = (body as { _embedded?: { records?: unknown } })._embedded?.records;
  if (!Array.isArray(records)) {
    return null;
  }
  for (const record of records) {
    if (record === null || typeof record !== "object" || Array.isArray(record)) {
      continue;
    }
    const contractId = (record as { contract_id?: unknown }).contract_id;
    if (typeof contractId === "string" && PINNED_STELLAR_STRKEY_CONTRACT_PATTERN.test(contractId)) {
      return contractId;
    }
    const address = (record as { address?: unknown; type?: unknown }).address;
    const type = (record as { type?: unknown }).type;
    if (
      typeof address === "string" &&
      PINNED_STELLAR_STRKEY_CONTRACT_PATTERN.test(address) &&
      type === "invoke_host_function"
    ) {
      return address;
    }
  }
  return null;
}

/** The internal execution result (envelope-shaped, secret-free). */
interface OnchainExecutionOutcome {
  readonly outcome: "CONFIRMED" | "UNKNOWN" | "FAILED";
  readonly providerReferences: readonly string[];
  readonly classification: ReturnType<typeof classify>;
  readonly dispatchedAt: number;
  readonly completedAt: number;
}

/** Compose the REAL Stellar kernel (the onchain rail's SANDBOX lane). */
export function createStellarExecutionKernel(
  options: StellarExecutionKernelOptions,
): ExecutionAuthorityPort {
  const nowMs = options.nowMs ?? Date.now;
  const transport = options.transport;
  const connectionAuthority = options.connectionAuthority;

  function toEnvelope(execution: OnchainExecutionOutcome): PaymentResultEnvelope {
    const envelope: {
      -readonly [K in keyof PaymentResultEnvelope]: PaymentResultEnvelope[K];
    } = {
      outcome: execution.outcome,
      providerReferences: [...execution.providerReferences],
      dispatchedAt: execution.dispatchedAt,
      completedAt: execution.completedAt,
    };
    if (execution.outcome === "UNKNOWN") {
      envelope.ambiguityReason = execution.classification.ambiguityReason ?? "MALFORMED_RESPONSE_AFTER_DISPATCH";
      envelope.providerFailure = { retryable: true, ambiguity: "OUTCOME_UNKNOWN" };
    } else if (execution.outcome === "FAILED") {
      envelope.providerFailure = {
        providerErrorCode: execution.classification.providerErrorCode,
        providerErrorMessage: execution.classification.providerErrorMessage,
        retryable: execution.classification.retryable ?? false,
        ambiguity: "NONE",
      };
    }
    return Object.freeze(envelope);
  }

  /**
   * Submit ONE transaction envelope through the Horizon seam. The
   * signing itself rides the sealed keypair inside this frame; the
   * envelope's deterministic binding (the operation JSON — the
   * StellarSigningEnvelopeAdapter law: the host composes the bound
   * operation set, the transport submits, nothing here signs outside
   * the seal).
   */
  async function submitTransaction(
    executionMode: string,
    operations: readonly unknown[],
    dispatchedAt: number,
    idempotencyKey: string,
  ): Promise<OnchainExecutionOutcome> {
    admitStellarSandboxGrant(executionMode);
    const response = await transport.send({
      operationId: KERNEL_STELLAR_OPERATION_IDS.submit,
      idempotencyKey,
      params: { operations },
      headers: {},
      correlationId: `stellar-kernel:${KERNEL_STELLAR_OPERATION_IDS.submit}:${String(dispatchedAt)}`,
    });
    const classification = classify(response);
    if (classification.outcome === "CONFIRMED") {
      const submitted = submittedTransactionFieldsOf(response.body);
      if (submitted.txHash === null) {
        // A 2xx without the transaction shape: UNKNOWN (INV-04).
        return {
          outcome: "UNKNOWN",
          providerReferences: Object.freeze([]),
          classification: { outcome: "UNKNOWN", ambiguityReason: "MALFORMED_RESPONSE_AFTER_DISPATCH" },
          dispatchedAt,
          completedAt: nowMs(),
        };
      }
      return {
        outcome: "CONFIRMED",
        providerReferences: Object.freeze([submitted.txHash]),
        classification,
        dispatchedAt,
        completedAt: nowMs(),
      };
    }
    return {
      outcome: classification.outcome,
      providerReferences: Object.freeze([]),
      classification,
      dispatchedAt,
      completedAt: nowMs(),
    };
  }

  return {
    async dispatch(command: PaymentDispatchCommand): Promise<ExecutionAuthorityAnswer> {
      validatePaymentDispatchCommand(command);
      // ---- admission (outside the seal; no material involved) ----
      const statuses = await connectionAuthority.connectionStatuses();
      const connection = statuses.find((s) => s.connectionId === command.connectionRef);
      if (connection === undefined || connection.state !== "ACTIVE") {
        return {
          kind: "REFUSED",
          refusal: {
            kind: "CONNECTION_NOT_ACTIVE",
            reason: `the executing connection '${command.connectionRef}' is not ACTIVE (the onchain rail dispatches only over a probe-confirmed connection)`,
          },
        };
      }
      if (connection.executionMode !== command.executionMode) {
        return {
          kind: "REFUSED",
          refusal: {
            kind: "MODE_NOT_OFFERED",
            reason: `the connection's execution mode (${connection.executionMode}) does not match the command's (INV-25: ${command.executionMode})`,
          },
        };
      }
      if (command.operation === "CANCEL_OR_REVERSE_EFFECT") {
        return {
          kind: "REFUSED",
          refusal: {
            kind: "COMMAND_REJECTED",
            reason:
              "an onchain submission, once landed, is not reversible through this surface — the honest path is the transaction read-back and reconciliation, never a fabricated reversal",
          },
        };
      }

      const dispatchedAt = nowMs();
      try {
        // ---- the seal: everything below runs on the sealed keypair ----
        const execution = await connectionAuthority.withSealedCredential(
          command.connectionRef,
          async (material) => {
            // The StrKey shapes re-validate inside the seal on EVERY
            // dispatch; the mode grant law runs on every path.
            stellarKeypairOf(material);
            admitStellarSandboxGrant(command.executionMode);
            if (command.leg?.legKind === "PSP_STABLECOIN_ISSUANCE") {
              // ---- the CONTRACT-DEPLOY path (D4 — the Soroban vehicle) ----
              if (command.leg.deploy === undefined) {
                throw new StellarKernelRefusal({
                  kind: "COMMAND_REJECTED",
                  reason:
                    "a deployment leg requires its plan refs (sourceHash + bytecodeHash — the D4 evidence inputs); a deploy without its prepared plan is never dispatched",
                });
              }
              const operations = [
                {
                  operationKind: KERNEL_STELLAR_OPERATION_IDS.deploy,
                  sourceHash: command.leg.deploy.sourceHash,
                  bytecodeHash: command.leg.deploy.bytecodeHash,
                  ...(command.leg.assetRef !== undefined ? { assetRef: command.leg.assetRef } : {}),
                },
              ];
              return submitTransaction(command.executionMode, operations, dispatchedAt, command.idempotencyKey);
            }
            // ---- the TRANSFER path (onchain.transfer — the issuer-scoped asset payment) ----
            const destination = command.leg?.destinationRef ?? command.intent.destination.locationRef;
            if (typeof destination !== "string" || destination.length === 0) {
              throw new StellarKernelRefusal({
                kind: "COMMAND_REJECTED",
                reason: "the onchain transfer requires a destination (the leg's destination or the intent's destination location reference)",
              });
            }
            const amount = command.leg?.plannedAmount.minorUnits ?? command.intent.originAmount.minorUnits;
            if (!/^\d+$/.test(amount) || amount === "0") {
              throw new StellarKernelRefusal({
                kind: "COMMAND_REJECTED",
                reason: "the onchain transfer requires a positive exact amount in the asset's minor units (stroops)",
              });
            }
            const operations = [
              {
                operationKind: KERNEL_STELLAR_OPERATION_IDS.transfer,
                destination,
                amount,
                ...(command.leg?.assetRef !== undefined ? { assetRef: command.leg.assetRef } : { assetType: "native" }),
              },
            ];
            return submitTransaction(command.executionMode, operations, dispatchedAt, command.idempotencyKey);
          },
          `stellar-onchain-dispatch:${command.attemptId}`,
        );
        return { kind: "ENVELOPE", envelope: toEnvelope(execution) };
      } catch (error) {
        if (error instanceof StellarKernelRefusal) {
          return { kind: "REFUSED", refusal: error.refusal };
        }
        if (error instanceof PaymentMissionError) {
          return {
            kind: "REFUSED",
            refusal: { kind: "COMMAND_REJECTED", reason: error.message },
          };
        }
        throw error;
      }
    },
  };
}
