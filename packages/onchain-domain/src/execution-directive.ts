/**
 * @payswap/onchain-domain — the onchain execution directive and request
 * contracts (P4-W1, lane R2-W1; PORT/ADAPT of payswap.org@8a735bf
 * packages/onchain-domain/src/execution.ts, split for the file-size law).
 *
 * OnchainExecutionRequest EXTENDS the pinned canonical connector execution
 * request (src/pins.ts PinnedConnectorExecutionRequest — the capability
 * fabric's explicit-mode + protocol-authorization-link law): an explicit
 * execution mode and the protocol authorization reference are mandatory on
 * every request — no mode (including PASS_THROUGH_NATIVE) bypasses
 * protocol authorization (INV-5), and the capability instance reference is
 * a genuinely connected instance, never a catalogue entry (INV-13). The
 * provider-neutral onchain directive is carried as the request payload and
 * is validated against the deterministic operation semantics table
 * (./operations.ts).
 *
 * The execution-scope assertion enforces the catalogue-never-authorizes
 * discipline: chain catalogue shapes and provider catalogue entries are
 * rejected with the typed CatalogueNotAuthorityError; only genuinely
 * connected instances pass.
 */

import { ValidationError } from "./errors.ts";
import { isNonEmptyString, isRecord } from "./shared.ts";
import { isChainFamily, isValidChainKey } from "./family.ts";
import type { ChainFamily } from "./family.ts";
import {
  isOnchainOperationKind,
  onchainOperationSemantics,
  ONCHAIN_OPERATION_KINDS,
} from "./operations.ts";
import type { OnchainOperationKind } from "./operations.ts";
import type { PinnedConnectorExecutionRequest } from "./pins.ts";
import { validatePinnedExecutionRequest } from "./pins-validation.ts";
import { validateSignerHandle } from "./wallet.ts";
import type { SignerHandle } from "./wallet.ts";
import { validateAssetAmount } from "./asset.ts";
import type { AssetAmount } from "./asset.ts";
import {
  assertConnectedChainInstance,
  isChainCatalogueShape,
} from "./chain.ts";
import type { ConnectedChainInstance } from "./chain.ts";

// ---------------------------------------------------------------------------
// The execution directive (provider-neutral; family-specific shapes never appear here)
// ---------------------------------------------------------------------------

/**
 * The provider-neutral onchain execution directive. Field rules:
 * - `destination`/`spenderRef` are OPAQUE external references (neutral);
 * - `familyPayload` is an opaque, family-scoped payload owned by the
 *   family adapters (later waves) — the core never interprets it;
 * - `signerHandle` references the signing instrument OPAQUELY — key
 *   material never enters this contract (INV-19);
 * - `expiresAt` is mandatory: the authorization layer (P4-W2) evaluates
 *   expiry before authorization.
 * Required-field coupling is enforced against the deterministic operation
 * semantics table (see ./operations.ts).
 */
export interface OnchainExecutionDirective {
  readonly operation: OnchainOperationKind;
  readonly chainKey: string;
  readonly family: ChainFamily;
  /** Opaque external destination account/contract reference (neutral). */
  readonly destination?: string;
  /** Canonical asset reference being moved/approved/swapped. */
  readonly assetId?: string;
  /** Exact amount in integer minor units (INV-2). */
  readonly amount?: AssetAmount;
  /** Opaque approved-spender reference (approval operations). */
  readonly spenderRef?: string;
  /** Canonical protocol reference (protocol-scoped operations). */
  readonly protocolRef?: string;
  /** Optional route reference (best-execution route identity). */
  readonly routeRef?: string;
  readonly expiresAt: string;
  readonly signerHandle: SignerHandle;
  /** Opaque family-scoped payload (adapter-owned; the core never interprets it). */
  readonly familyPayload?: unknown;
}

// ---------------------------------------------------------------------------
// The execution request (extends the pinned canonical execution request)
// ---------------------------------------------------------------------------

/**
 * An onchain execution request: the pinned canonical connector execution
 * request (explicit execution mode, mode vocabulary version, capability
 * instance reference, idempotency key, PROTOCOL AUTHORIZATION reference —
 * INV-5/INV-6) carrying the provider-neutral onchain directive as its
 * request payload.
 */
export interface OnchainExecutionRequest extends PinnedConnectorExecutionRequest {
  readonly providerRequest: OnchainExecutionDirective;
}

// ---------------------------------------------------------------------------
// Validators + the execution-scope assertion (implementation)
// ---------------------------------------------------------------------------

/**
 * Validates an onchain execution directive against the deterministic
 * operation semantics table: operation known, chain/family declared and
 * consistent, expiry declared, signer handle validated (opaque, never key
 * material), amounts exact, and every operation-specific required field
 * present (destination/spender/asset/amount/protocol per the table).
 */
export function validateOnchainExecutionDirective(
  candidate: unknown,
): OnchainExecutionDirective {
  if (!isRecord(candidate)) {
    throw new ValidationError("onchain execution directive must be an object");
  }
  const record = candidate;
  const errors: string[] = [];

  if (!isOnchainOperationKind(record.operation)) {
    errors.push(
      `operation must be one of [${ONCHAIN_OPERATION_KINDS.join(", ")}] — undeclared operations never validate`,
    );
  }
  if (!isValidChainKey(record.chainKey)) {
    errors.push("chainKey must be a canonical `${namespace}:${network}` chain key");
  }
  if (!isChainFamily(record.family)) {
    errors.push(
      "family must be a declared chain family (see CHAIN_FAMILIES) — declared family semantics are required for family dispatch",
    );
  }
  if (!isNonEmptyString(record.expiresAt)) {
    errors.push(
      "expiresAt is mandatory: the authorization layer evaluates expiry before authorization",
    );
  }

  try {
    validateSignerHandle(record.signerHandle);
  } catch (error) {
    errors.push(
      `signerHandle is invalid: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (isOnchainOperationKind(record.operation)) {
    const semantics = onchainOperationSemantics(record.operation);
    if (semantics.requires.destination && !isNonEmptyString(record.destination)) {
      errors.push(`operation '${record.operation}' requires a destination reference`);
    }
    if (semantics.requires.spender && !isNonEmptyString(record.spenderRef)) {
      errors.push(`operation '${record.operation}' requires a spenderRef (the approved spender)`);
    }
    if (semantics.requires.asset && !isNonEmptyString(record.assetId)) {
      errors.push(`operation '${record.operation}' requires an assetId`);
    }
    if (
      semantics.requires.amount &&
      (record.amount === null || record.amount === undefined || typeof record.amount !== "object")
    ) {
      errors.push(`operation '${record.operation}' requires an exact amount`);
    }
    if (semantics.requires.protocol && !isNonEmptyString(record.protocolRef)) {
      errors.push(
        `operation '${record.operation}' requires a protocolRef (canonical protocol reference)`,
      );
    }
  }
  for (const field of ["destination", "spenderRef", "assetId", "protocolRef", "routeRef"] as const) {
    if (record[field] !== undefined && !isNonEmptyString(record[field])) {
      errors.push(`${field}, when present, must be a non-empty string`);
    }
  }
  // An amount, whenever present (required or optional), must be exact.
  if (record.amount !== undefined) {
    if (record.amount === null || typeof record.amount !== "object") {
      errors.push("amount, when present, must be an exact AssetAmount object");
    } else {
      try {
        validateAssetAmount(record.amount as AssetAmount);
        const amountAssetId = (record.amount as Readonly<Record<string, unknown>>).assetId;
        if (!isNonEmptyString(amountAssetId)) {
          errors.push("amount.assetId must be a non-empty string");
        } else if (isNonEmptyString(record.assetId) && amountAssetId !== record.assetId) {
          errors.push(
            "amount.assetId must match the directive's assetId (the amount is denominated in the directive's asset)",
          );
        }
      } catch (error) {
        errors.push(
          `amount is invalid: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(
      `Invalid onchain execution directive: ${errors.join("; ")}`,
      { errors: [...errors] },
    );
  }
  return candidate as unknown as OnchainExecutionDirective;
}

/**
 * Validates an onchain execution request: the pinned canonical execution
 * request validation runs first (explicit mode + protocol authorization
 * link + idempotency key — the capability fabric's law), then the onchain
 * directive validation. A request without the protocol authorization link
 * never validates — catalogue data alone can never construct an executable
 * request.
 */
export function validateOnchainExecutionRequest(
  candidate: unknown,
): OnchainExecutionRequest {
  const base = validatePinnedExecutionRequest(candidate);
  if (!base.ok) {
    throw new ValidationError(
      `Onchain execution request violates the canonical execution contract: ${base.violations.join("; ")}`,
      { violations: [...base.violations] },
    );
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  validateOnchainExecutionDirective(record.providerRequest);
  return candidate as unknown as OnchainExecutionRequest;
}

/**
 * Execution-scope assertion (catalogue never authorizes, INV-13): the
 * value presented as the executing capability must be a genuinely
 * connected chain instance. Chain catalogue shapes (ChainDefinition, bare
 * chain descriptors) and provider catalogue entries are rejected with the
 * explicit catalogue-never-authorizes error.
 */
export function assertOnchainExecutionScope(
  value: unknown,
): asserts value is ConnectedChainInstance {
  assertConnectedChainInstance(value);
}

/** Deterministic probe: does this value carry a chain catalogue shape? */
export function isOnchainCatalogueShape(value: unknown): boolean {
  return isChainCatalogueShape(value);
}
