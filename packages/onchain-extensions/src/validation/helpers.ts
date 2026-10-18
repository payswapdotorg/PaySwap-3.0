/**
 * @payswap/onchain-extensions — shared validation rule helpers (Work Order
 * P5-W2, lane R3-W2; internal, NOT exported from the barrel). Every helper
 * is pure and fail-closed: it pushes deterministic, human-readable defect
 * messages into the caller's accumulate bag (the accepted accumulate law).
 */

import { isNonEmptyString, isNonNegativeInteger, isStringRecord } from '../shared.ts';
import { isValidChainKey } from '../pins/onchain-domain.ts';

export function inVocabulary(
  vocabulary: readonly string[],
  value: unknown,
  subject: string,
  errors: string[],
): void {
  if (typeof value !== 'string' || !(vocabulary as readonly unknown[]).includes(value)) {
    errors.push(`${subject} must be one of [${vocabulary.join(', ')}]`);
  }
}

export function nonEmptyStringArray(
  value: unknown,
  subject: string,
  errors: string[],
): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${subject} must be a non-empty array`);
    return;
  }
  value.forEach((entry, index) => {
    if (!isNonEmptyString(entry)) {
      errors.push(`${subject}[${index}] must be a non-empty string`);
    }
  });
}

export function canonicalChainKeyArray(
  value: unknown,
  subject: string,
  errors: string[],
): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${subject} must be a non-empty array`);
    return;
  }
  value.forEach((entry, index) => {
    if (!isValidChainKey(entry)) {
      errors.push(
        `${subject}[${index}] must be a canonical \`\${namespace}:\${network}\` chain key`,
      );
    }
  });
}

export function memberOfVocabularyArray(
  vocabulary: readonly string[],
  value: unknown,
  subject: string,
  errors: string[],
): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${subject} must be a non-empty array`);
    return;
  }
  value.forEach((entry, index) => {
    if (typeof entry !== 'string' || !(vocabulary as readonly unknown[]).includes(entry)) {
      errors.push(`${subject}[${index}] must be one of [${vocabulary.join(', ')}]`);
    }
  });
}

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return isStringRecord(value);
}

export function nonNegativeInteger(value: unknown): boolean {
  return isNonNegativeInteger(value);
}
