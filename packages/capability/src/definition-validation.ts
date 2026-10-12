/**
 * Runtime validation for capability definitions (P2-W1; the layer-1
 * catalogue contract). Executable definitions fail-closed on the
 * fourteen-part declaration; non-executable definitions fail-closed on the
 * explicit reason; acceptance definitions additionally validate acceptance
 * terms. `defineCapability` constructs a validated, deep-frozen definition.
 */

import { ValidationError } from './errors.ts';
import { asCapabilityDefinitionId, asVersionString } from './identifiers.ts';
import { validateExecutableCapabilityDeclaration } from './executable-declaration-validation.ts';
import { cloneAndFreeze, isNonEmptyString, isNonEmptyStringArray } from './shared.ts';
import {
  CAPABILITY_CLASSES,
  isCapabilityClass,
  PROOF_LEVEL_PIN,
} from './capability-definition.ts';
import type { CapabilityDefinition } from './capability-definition.ts';


function validateBaseMetadata(
  record: Readonly<Record<string, unknown>>,
  errors: string[],
): void {
  if (!isNonEmptyString(record.id)) {
    errors.push('id must be a non-empty string');
  }
  if (!isNonEmptyString(record.version)) {
    errors.push('version must be a non-empty string (versioned contract law)');
  }
  if (!isCapabilityClass(record.capabilityClass)) {
    errors.push(`capabilityClass must be one of [${CAPABILITY_CLASSES.join(', ')}]`);
  }
  if (!Array.isArray(record.conditions)) {
    errors.push('conditions must be an array of CapabilityCondition (may be empty)');
  } else {
    for (const [index, condition] of record.conditions.entries()) {
      const entry = condition as Readonly<Record<string, unknown>> | null;
      if (
        entry === null ||
        typeof entry !== 'object' ||
        !isNonEmptyString(entry.description) ||
        typeof entry.hardConstraint !== 'boolean' ||
        (entry.kind !== 'precondition' &&
          entry.kind !== 'eligibility' &&
          entry.kind !== 'jurisdiction' &&
          entry.kind !== 'compliance')
      ) {
        errors.push(
          `conditions[${index}] must be { kind: precondition|eligibility|jurisdiction|compliance, description, hardConstraint }`,
        );
      }
    }
  }
  if (!Array.isArray(record.cost)) {
    errors.push('cost must be an array of CostComponent (may be empty)');
  } else {
    for (const [index, component] of record.cost.entries()) {
      const entry = component as Readonly<Record<string, unknown>> | null;
      if (
        entry === null ||
        typeof entry !== 'object' ||
        !isNonEmptyString(entry.componentId) ||
        (entry.kind !== 'fixed_fee' &&
          entry.kind !== 'per_use_fee' &&
          entry.kind !== 'variable_fee_bps')
      ) {
        errors.push(
          `cost[${index}] must be { componentId, kind: fixed_fee|per_use_fee|variable_fee_bps, amount?, bps? }`,
        );
      }
    }
  }
  const risk = record.risk as Readonly<Record<string, unknown>> | undefined;
  if (
    risk === undefined ||
    typeof risk !== 'object' ||
    !isNonEmptyString(risk.riskClass) ||
    (risk.severity !== 'low' && risk.severity !== 'medium' && risk.severity !== 'high') ||
    !Array.isArray(risk.mitigations)
  ) {
    errors.push('risk must be { riskClass, severity: low|medium|high, mitigations }');
  }
  const provenance = record.provenance as Readonly<Record<string, unknown>> | undefined;
  if (
    provenance === undefined ||
    typeof provenance !== 'object' ||
    !isNonEmptyString(provenance.declaredBy) ||
    !isNonEmptyString(provenance.artifactRef) ||
    !isNonEmptyString(provenance.contentHash)
  ) {
    errors.push('provenance must be { declaredBy, artifactRef, contentHash }');
  }
  const accountability = record.economicAccountability as
    | Readonly<Record<string, unknown>>
    | undefined;
  if (
    accountability === undefined ||
    typeof accountability !== 'object' ||
    !isNonEmptyString(accountability.accountablePartyRef) ||
    !isNonEmptyString(accountability.ledgerAccountRef) ||
    !isNonEmptyString(accountability.recoursePolicyRef)
  ) {
    errors.push(
      'economicAccountability must be { accountablePartyRef, ledgerAccountRef, recoursePolicyRef }',
    );
  }
  if (!Array.isArray(record.proofRequirements)) {
    errors.push('proofRequirements must be an array (may be empty)');
  } else {
    for (const [index, requirement] of record.proofRequirements.entries()) {
      const entry = requirement as Readonly<Record<string, unknown>> | null;
      if (
        entry === null ||
        typeof entry !== 'object' ||
        !(PROOF_LEVEL_PIN as readonly unknown[]).includes(entry.proofLevel)
      ) {
        errors.push(
          `proofRequirements[${index}].proofLevel must be a pinned trust-lane level [${PROOF_LEVEL_PIN.join(', ')}]`,
        );
      }
    }
  }
}

/**
 * Runtime validation for a capability definition arriving from untyped
 * sources. Executable definitions fail-closed on the fourteen-part
 * declaration; non-executable definitions fail-closed on the explicit
 * reason. Acceptance definitions additionally validate acceptance terms.
 */
export function validateCapabilityDefinition(candidate: unknown): CapabilityDefinition {
  const errors: string[] = [];
  if (candidate === null || typeof candidate !== 'object') {
    throw new ValidationError('capability definition must be an object');
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  validateBaseMetadata(record, errors);
  const definition = candidate as CapabilityDefinition;
  if (record.executable === true) {
    if (record.execution === undefined || record.execution === null) {
      errors.push(
        'an executable definition REQUIRES its fourteen-part execution declaration (CAPABILITY-MODEL law)',
      );
    } else {
      try {
        validateExecutableCapabilityDeclaration(record.execution);
      } catch (error) {
        errors.push(
          `execution declaration invalid: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    if (isNonEmptyString(record.id) && isCapabilityClass(record.capabilityClass)) {
      // executable acceptance is a contradiction: acceptance is advertising
      if (record.capabilityClass === 'merchant_acceptance') {
        errors.push(
          'merchant_acceptance definitions are non-executable by construction (acceptance is an advertisement surface, not an execution surface — funding uses liquidity/credit/lending capabilities)',
        );
      }
    }
  } else if (record.executable === false) {
    if (!isNonEmptyString(record.nonExecutableReason)) {
      errors.push(
        'a non-executable definition REQUIRES an explicit nonExecutableReason (silent absence is impossible)',
      );
    }
    if (record.capabilityClass === 'merchant_acceptance') {
      for (const field of [
        'acceptedPaymentMethods',
        'acceptedCurrencies',
        'acceptedCountries',
      ] as const) {
        if (
          !isNonEmptyStringArray(record[field]) ||
          (record[field] as readonly string[]).length === 0
        ) {
          errors.push(`acceptance definitions must declare a non-empty ${field}`);
        }
      }
      const terms = record.terms as Readonly<Record<string, unknown>> | undefined;
      if (
        terms === undefined ||
        typeof terms !== 'object' ||
        typeof terms.supportsRecurring !== 'boolean' ||
        typeof terms.supportsPartialPayments !== 'boolean' ||
        typeof terms.supportsRefunds !== 'boolean' ||
        !isNonEmptyString(terms.recoursePolicyRef)
      ) {
        errors.push('acceptance definitions must declare terms { supportsRecurring, supportsPartialPayments, supportsRefunds, recoursePolicyRef }');
      }
    }
  } else {
    errors.push("executable must be true or false (discriminated union law)");
  }
  if (errors.length > 0) {
    throw new ValidationError(`Invalid capability definition: ${errors.join('; ')}`, {
      errors: [...errors],
    });
  }
  // Brand + version-normalize (validation above proved shape).
  const branded = candidate as CapabilityDefinition;
  asCapabilityDefinitionId(record.id as string);
  asVersionString(record.version as string, 'capability definition');
  return branded;
}

/** Construct a validated, deep-frozen capability definition. */
export function defineCapability(
  input: Omit<CapabilityDefinition, 'id'> & { readonly id: string },
): CapabilityDefinition {
  const validated = validateCapabilityDefinition({ ...input });
  return cloneAndFreeze(validated);
}
