/**
 * Extension manifest contracts (P2-W1; PORT of payswap.org@8a735bf
 * packages/capabilities/src/extension.ts, old "FROZEN-ARCHITECTURE §13/
 * §24, INV-C04").
 *
 * Extensions compose through typed protocol tokens and NEVER hold direct
 * ledger-write or rail-execute authority. An extension may consume and emit
 * only the token families declared in its manifest; financial effects
 * still require a protocol-authorized command.
 *
 * Canonical citation: the no-direct-financial-authority law transfers as
 * the permission union below — it deliberately contains NO ledger-write
 * and NO rail-execute member. Extensions and packages can never directly
 * write financial state: everything an extension does is propose, observe,
 * read or emit typed tokens; effects flow through protocol commands.
 */

import { ValidationError } from './errors.ts';
import { cloneAndFreeze, isNonEmptyString, isRecord } from './shared.ts';

/** Typed protocol token families. */
export const TOKEN_FAMILIES = [
  'Intent',
  'Capability',
  'Authorization',
  'Identity_Evidence',
  'Quote',
  'Liquidity',
  'Credit',
  'Execution',
  'Settlement',
  'Netting',
  'Dispute_Recourse',
  'Expert',
  'Policy',
  'Participation_Incentive',
] as const;

export type TokenFamily = (typeof TOKEN_FAMILIES)[number];

export function isTokenFamily(value: unknown): value is TokenFamily {
  return (
    typeof value === 'string' && (TOKEN_FAMILIES as readonly unknown[]).includes(value)
  );
}

/**
 * Extension permissions. The union deliberately contains NO ledger-write
 * and NO rail-execute member — extensions and packages can never directly
 * write financial state.
 */
export const EXTENSION_PERMISSIONS = [
  'read_tokens',
  'emit_tokens',
  'observe_capabilities',
  'propose_actions',
  'request_approval',
] as const;

export type ExtensionPermission = (typeof EXTENSION_PERMISSIONS)[number];

export function isExtensionPermission(value: unknown): value is ExtensionPermission {
  return (
    typeof value === 'string' &&
    (EXTENSION_PERMISSIONS as readonly unknown[]).includes(value)
  );
}

export interface ExtensionManifest {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly consumedTokenFamilies: readonly TokenFamily[];
  readonly emittedTokenFamilies: readonly TokenFamily[];
  readonly permissions: readonly ExtensionPermission[];
}

/** Raised when a manifest fails runtime validation. Lists every problem found. */
export class ExtensionManifestValidationError extends ValidationError {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super(`Invalid extension manifest: ${errors.join('; ')}`, { errors: [...errors] });
    this.errors = errors;
  }
}

/**
 * Runtime validator for manifests arriving from untyped sources (files, RPC,
 * packages). Rejects unknown permission strings (e.g. 'ledger-write',
 * 'rail-execute'), unknown token families and inconsistent declarations.
 */
export function validateExtensionManifest(candidate: unknown): ExtensionManifest {
  const errors: string[] = [];

  if (!isRecord(candidate)) {
    throw new ExtensionManifestValidationError(['manifest must be an object']);
  }
  const record = candidate as Readonly<Record<string, unknown>>;

  for (const field of ['id', 'version', 'name'] as const) {
    if (!isNonEmptyString(record[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }

  const consumed = readFamilies(record, 'consumedTokenFamilies', errors);
  const emitted = readFamilies(record, 'emittedTokenFamilies', errors);

  const permissionsValue = record['permissions'];
  if (!Array.isArray(permissionsValue)) {
    errors.push('permissions must be an array');
  } else {
    for (const permission of permissionsValue) {
      if (!isExtensionPermission(permission)) {
        errors.push(
          `unknown permission '${String(permission)}': permitted permissions are [${EXTENSION_PERMISSIONS.join(', ')}] (extensions cannot write ledgers or execute rails)`,
        );
      }
    }
  }

  const permissions = Array.isArray(permissionsValue)
    ? (permissionsValue.filter(isExtensionPermission) as readonly ExtensionPermission[])
    : [];

  if (permissions.includes('read_tokens') && consumed.length === 0) {
    errors.push("permission 'read_tokens' requires at least one consumed token family");
  }
  if (permissions.includes('emit_tokens') && emitted.length === 0) {
    errors.push("permission 'emit_tokens' requires at least one emitted token family");
  }

  if (errors.length > 0) {
    throw new ExtensionManifestValidationError(errors);
  }

  return cloneAndFreeze({
    id: record['id'] as string,
    version: record['version'] as string,
    name: record['name'] as string,
    consumedTokenFamilies: consumed,
    emittedTokenFamilies: emitted,
    permissions,
  });
}

function readFamilies(
  record: Readonly<Record<string, unknown>>,
  field: 'consumedTokenFamilies' | 'emittedTokenFamilies',
  errors: string[],
): readonly TokenFamily[] {
  const value = record[field];
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array`);
    return [];
  }
  const families: TokenFamily[] = [];
  for (const item of value) {
    if (!isTokenFamily(item)) {
      errors.push(
        `unknown token family '${String(item)}' in ${field}: known families are [${TOKEN_FAMILIES.join(', ')}]`,
      );
      continue;
    }
    if (families.includes(item)) {
      errors.push(`duplicate token family '${item}' in ${field}`);
      continue;
    }
    families.push(item);
  }
  return Object.freeze(families);
}
