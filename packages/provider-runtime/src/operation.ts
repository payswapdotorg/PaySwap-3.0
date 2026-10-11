/**
 * @payswap/provider-runtime — operation declarations & adapter bindings (P2-W2).
 *
 * A provider adapter registers its OPERATIONS here: each operation is a
 * declaration (operation class + effect class + the opaque capability it
 * exercises), an ENDPOINT-SPECIFIC idempotency contract (mandatory for
 * state-changing operations — INV-06 fail-closed), a response parser
 * (provider answer → provider references + retained object state) and a
 * credential binder (sealed material → provider auth headers, executed
 * ONLY inside the credential seal).
 *
 * This is the adapter-discipline core adapted from the old repo's Stripe
 * production connector (payswap.org@8a735bf packages/rails/src/stripe.ts):
 * no provider SDKs, no ambient fetch, no Stripe SDK types — the connector
 * speaks its provider through the injected transport, and every
 * provider-specific decision lives in data + pure functions the adapter
 * owns, never in the framework.
 */

import { ValidationError } from './errors.ts';
import type { CapabilityRef } from './refs.ts';
import type {
  EffectClass,
  OperationClass,
} from './connection-scope.ts';
import type { OperationIdempotencyContract } from './idempotency.ts';

/** What one provider operation is (the bridge's admission request shape). */
export interface OperationDeclaration {
  readonly operationId: string;
  readonly operationClass: OperationClass;
  readonly effectClass: EffectClass;
  /** The opaque capability reference this operation exercises. */
  readonly capability: CapabilityRef;
  /** Provider-facing operation identity (provenance; never a secret). */
  readonly providerEndpoint: string;
}

/** What a delivered provider answer parses into. */
export interface OperationResponseParse {
  /** Provider-side object references the provider acknowledged. */
  readonly providerReferences: readonly string[];
  /** The object state to retain losslessly (when the answer carries one). */
  readonly objectState?: {
    readonly objectType: string;
    readonly externalId: string;
    readonly revision: string;
    readonly state: unknown;
  };
}

/** The pluggable response parser: provider answer → parse result. */
export interface OperationResponseParser {
  parse(response: { readonly status: number; readonly body: unknown }): OperationResponseParse;
}

/**
 * The credential binder: constructs provider auth headers from the sealed
 * material INSIDE the seal. The returned headers map may carry secret
 * material — it exists ONLY for the transport call and is never recorded
 * (redaction guards every artifact boundary; INV-19).
 */
export interface CredentialMaterialBinder {
  bindHeaders(material: unknown): Readonly<Record<string, string>>;
}

/**
 * One registered adapter operation: declaration + idempotency contract +
 * response parser + credential binder. STATE_CHANGING operations MUST
 * carry an idempotency contract at registration (fail-closed INV-06).
 */
export interface OperationBinding {
  readonly declaration: OperationDeclaration;
  readonly idempotencyContract?: OperationIdempotencyContract;
  readonly parseResponse: OperationResponseParser['parse'];
  readonly bindHeaders: CredentialMaterialBinder['bindHeaders'];
}

/** Registry of adapter operation bindings (the adapter surface). */
export class OperationBindingRegistry {
  private readonly bindings = new Map<string, OperationBinding>();

  register(binding: OperationBinding): OperationBinding {
    if (binding === null || typeof binding !== 'object') {
      throw new ValidationError('operation binding must be an object');
    }
    const declaration = binding.declaration;
    if (declaration === null || typeof declaration !== 'object') {
      throw new ValidationError('operation binding requires a declaration');
    }
    if (typeof declaration.operationId !== 'string' || declaration.operationId.length === 0) {
      throw new ValidationError('operation declaration requires operationId');
    }
    if (typeof declaration.providerEndpoint !== 'string' || declaration.providerEndpoint.length === 0) {
      throw new ValidationError('operation declaration requires providerEndpoint');
    }
    if (typeof declaration.capability !== 'object' || declaration.capability === null) {
      throw new ValidationError('operation declaration requires a capability reference');
    }
    if (typeof binding.parseResponse !== 'function') {
      throw new ValidationError('operation binding requires a parseResponse function');
    }
    if (typeof binding.bindHeaders !== 'function') {
      throw new ValidationError('operation binding requires a bindHeaders function');
    }
    if (declaration.effectClass === 'STATE_CHANGING') {
      if (binding.idempotencyContract === undefined) {
        throw new ValidationError(
          `INV-06 fail-closed: state-changing operation '${declaration.operationId}' cannot register without its endpoint-specific idempotency contract`,
          { operationId: declaration.operationId },
        );
      }
      if (binding.idempotencyContract.operationId !== declaration.operationId) {
        throw new ValidationError(
          'the idempotency contract operationId must equal the declaration operationId',
          {
            declaration: declaration.operationId,
            contract: binding.idempotencyContract.operationId,
          },
        );
      }
    }
    const existing = this.bindings.get(declaration.operationId);
    if (existing !== undefined) {
      throw new ValidationError(
        `operation '${declaration.operationId}' is already registered — adapters never re-register`,
      );
    }
    this.bindings.set(declaration.operationId, binding);
    return binding;
  }

  /** Fail-closed lookup. */
  require(operationId: string): OperationBinding {
    const binding = this.bindings.get(operationId);
    if (binding === undefined) {
      throw new ValidationError(`unknown operation '${operationId}' — no adapter binding registered`);
    }
    return binding;
  }

  has(operationId: string): boolean {
    return this.bindings.has(operationId);
  }

  list(): readonly OperationDeclaration[] {
    return [...this.bindings.values()].map((binding) => binding.declaration);
  }
}

/**
 * Validate a full parse result (fail-closed against malformed adapter
 * output — an adapter cannot fabricate a CONFIRMED shape).
 */
export function validateOperationResponseParse(parse: OperationResponseParse): void {
  if (parse === null || typeof parse !== 'object') {
    throw new ValidationError('parseResponse must return an OperationResponseParse object');
  }
  if (!Array.isArray(parse.providerReferences)) {
    throw new ValidationError('parseResponse.providerReferences must be an array');
  }
  for (const ref of parse.providerReferences) {
    if (typeof ref !== 'string' || ref.length === 0) {
      throw new ValidationError('provider references must be non-empty strings');
    }
  }
  if (parse.objectState !== undefined) {
    const state = parse.objectState;
    if (
      typeof state.objectType !== 'string' ||
      state.objectType.length === 0 ||
      typeof state.externalId !== 'string' ||
      state.externalId.length === 0 ||
      typeof state.revision !== 'string' ||
      state.revision.length === 0
    ) {
      throw new ValidationError('objectState requires objectType, externalId and revision');
    }
  }
}
