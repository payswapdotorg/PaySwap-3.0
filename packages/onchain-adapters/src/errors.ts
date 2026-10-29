/**
 * @payswap/onchain-adapters — domain error taxonomy (Work Order P4-W3,
 * lane R2-W3; ADAPT of payswap.org@8a735bf
 * packages/onchain-adapters/src/errors.ts).
 *
 * Zero-runtime-dependency package (layer `rails`, leaf-in-flight law): the
 * error surface is self-contained and deliberately mirrors the accepted
 * PaySwapError shape (code + category + message + details) WITHOUT
 * importing @payswap/protocol — the TL wires the type at integration
 * (structural compatibility by construction, the provider-runtime pattern).
 *
 * Every error is a fail-closed signal: adapters never approximate a missing
 * semantic and never convert ambiguity into success/failure (INV-X01 law,
 * carried here as the adapter-side discipline the accepted protocol lane
 * owns canonically).
 */

export type ErrorCategory =
  | 'VALIDATION'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'AUTHORIZATION_REQUIRED'
  | 'POLICY_BLOCKED'
  | 'EXTERNAL_AMBIGUITY'
  | 'STALE_STATE'
  | 'SECURITY'
  | 'UNAVAILABLE'
  | 'TERMINAL_STATE'
  | 'INTERNAL';

/** Readonly bag of structured error context. Values stay JSON-ish. */
export interface OnchainAdapterErrorDetails {
  readonly [key: string]: unknown;
}

export interface OnchainAdapterErrorInit {
  /** Stable machine-readable error code, e.g. `ADAPTER_STAGE_UNSUPPORTED`. */
  readonly code: string;
  readonly category: ErrorCategory;
  readonly message: string;
  readonly details?: OnchainAdapterErrorDetails;
}

/** Base class of every onchain-adapters error (PaySwapError-shaped). */
export class OnchainAdapterError extends Error {
  readonly code: string;
  readonly category: ErrorCategory;
  /**
   * Absent entirely when no details were supplied (never a defined
   * `undefined`) — `declare` keeps this a type-only declaration so class
   * field semantics cannot pre-define the property.
   */
  declare readonly details?: OnchainAdapterErrorDetails;

  constructor(init: OnchainAdapterErrorInit) {
    super(init.message);
    this.name = new.target.name;
    this.code = init.code;
    this.category = init.category;
    if (init.details !== undefined) {
      this.details = init.details;
    }
  }
}

/** Malformed input to an adapter contract (fail-closed validation). */
export class ValidationError extends OnchainAdapterError {
  constructor(message: string, details?: OnchainAdapterErrorDetails) {
    super({
      code: 'ONCHAIN_ADAPTER_VALIDATION',
      category: 'VALIDATION',
      message,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

/**
 * The environment/rail discriminator law (structural, from chain identity):
 * testnet/simulation state can NEVER be production financial execution.
 * A non-production rail can never carry a PRODUCTION environment token or
 * feed production settlement machinery.
 */
export class TestnetNeverProductionError extends OnchainAdapterError {
  constructor(message: string, details?: OnchainAdapterErrorDetails) {
    super({
      code: 'TESTNET_NEVER_PRODUCTION',
      category: 'AUTHORIZATION_REQUIRED',
      message,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

/**
 * A family adapter was asked to perform a lifecycle stage it explicitly
 * declared unsupported (e.g. UTXO simulation). Fail closed — the adapter
 * never approximates an unimplementable stage.
 */
export class UnsupportedLifecycleStageError extends OnchainAdapterError {
  constructor(adapterId: string, stage: string, reason: string) {
    super({
      code: 'ADAPTER_STAGE_UNSUPPORTED',
      category: 'POLICY_BLOCKED',
      message: `adapter '${adapterId}' explicitly declares lifecycle stage '${stage}' unsupported: ${reason} — the stage fails closed, it is never approximated`,
      details: { adapterId, stage, reason },
    });
  }
}

/**
 * The observed rail state is too old to act on (freshness violation), or a
 * chain head regressed below a previously observed head, or a pre-broadcast
 * recheck VOIDED an authorization. Stale observations invalidate prepared
 * and authorized state; they never silently authorize execution.
 */
export class StaleObservationError extends OnchainAdapterError {
  constructor(message: string, details?: OnchainAdapterErrorDetails) {
    super({
      code: 'STALE_OBSERVATION',
      category: 'STALE_STATE',
      message,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

/**
 * A chain-identity cross-check failed (EVM eth_chainId, Solana genesis
 * hash, UTXO genesis block hash): the endpoint does not serve the chain the
 * adapter/instance declares. Chain confusion is a first-class threat — fail
 * closed, never routed around.
 */
export class ChainIdentityMismatchError extends OnchainAdapterError {
  constructor(message: string, details?: OnchainAdapterErrorDetails) {
    super({
      code: 'CHAIN_IDENTITY_MISMATCH',
      category: 'SECURITY',
      message,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

/**
 * A family semantic could not be expressed from the observed rail state
 * (e.g. an EVM block without EIP-1559 baseFee cannot express GAS_AUCTION
 * 1559 fee parameters). Fail closed — the semantic is never approximated.
 */
export class SemanticNotExpressibleError extends OnchainAdapterError {
  constructor(message: string, details?: OnchainAdapterErrorDetails) {
    super({
      code: 'SEMANTIC_NOT_EXPRESSIBLE',
      category: 'VALIDATION',
      message,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

/**
 * The adapter transport could not establish ANY endpoint connection. Callers
 * turn this into availability UNKNOWN — the error class exists so
 * observation paths can distinguish reachability failure from a rail fact.
 * (Carried as an error for the CONTRACT surface; the probe unions keep
 * unreachability as data — never converted into success or failure.)
 */
export class RailUnreachableError extends OnchainAdapterError {
  constructor(message: string, details?: OnchainAdapterErrorDetails) {
    super({
      code: 'RAIL_UNREACHABLE',
      category: 'UNAVAILABLE',
      message,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

/**
 * A contract-deployment broadcast was attempted WITHOUT its deployment
 * grant (P22-A, ADR-0016 D7 — the no-bypass discipline): the authorize stage
 * (the injected onchain-security kernel — the grant law) never recorded the
 * write, so the deploy directive is a TYPED refusal at the broadcast
 * boundary and NEVER reaches a transport. A smuggled deploy directive is
 * unrepresentable as a submission.
 */
export class DeploymentGrantRequiredError extends OnchainAdapterError {
  constructor(message: string, details?: OnchainAdapterErrorDetails) {
    super({
      code: 'DEPLOYMENT_GRANT_REQUIRED',
      category: 'AUTHORIZATION_REQUIRED',
      message,
      ...(details !== undefined ? { details } : {}),
    });
  }
}
