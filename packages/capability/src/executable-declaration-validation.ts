/**
 * Fail-closed validation of the fourteen-part executable capability
 * declaration (P2-W1; see executable-declaration.ts for the contract law).
 *
 * `validateExecutableCapabilityDeclaration` rejects ANY omission: every
 * missing part is named (CAPABILITY-MODEL law — an undeclared property is
 * never an assumption). The embedded jurisdiction/eligibility restriction
 * set is validated through the restrictions contract; the declared
 * execution modes through the execution-modes vocabulary.
 */

import { ValidationError } from './errors.ts';
import { validateDeclaredExecutionModes } from './execution-modes.ts';
import { isProviderStateFamily, PROVIDER_STATE_FAMILIES } from './provider-state-envelope.ts';
import { validateCorridorRestrictionSet } from './restrictions.ts';
import { isNonEmptyString } from './shared.ts';
import {
  CAPABILITY_EVIDENCE_KINDS,
  EXECUTABLE_DECLARATION_CONTRACT_VERSION,
  FINANCIAL_EFFECT_CLASSES,
  isFinancialEffectClass,
} from './executable-declaration.ts';
import type {
  CapabilityStateMachine,
  CapabilitySemantics,
  CapabilityPrecondition,
  DeclaredState,
  DeclaredTransition,
  ExecutableCapabilityDeclaration,
  AuthorizationRequirement,
  IdempotencyBehavior,
  CompensationPolicy,
  PartialExecutionPolicy,
  UserActionDeclaration,
  ProviderStateMappingDeclaration,
  ExternalReferencePolicy,
  EvidenceRequirement,
  EconomicTermsDeclaration,
} from './executable-declaration.ts';

function validateStateMachine(machine: unknown, errors: string[]): void {
  const candidate = machine as Partial<CapabilityStateMachine> | null;
  if (candidate === null || typeof candidate !== 'object' || !Array.isArray(candidate.states)) {
    errors.push('stateMachine.states must be a non-empty array of DeclaredState');
    return;
  }
  if (!isNonEmptyString(candidate.initial)) {
    errors.push('stateMachine.initial must name the initial state');
  }
  const names = new Set<string>();
  const terminal = new Set<string>();
  for (const [index, state] of candidate.states.entries()) {
    const entry = state as Partial<DeclaredState> | null;
    if (
      entry === null ||
      typeof entry !== 'object' ||
      !isNonEmptyString(entry.name) ||
      typeof entry.isTerminal !== 'boolean'
    ) {
      errors.push(`stateMachine.states[${index}] must be { name, isTerminal }`);
      continue;
    }
    if (names.has(entry.name)) {
      errors.push(`stateMachine declares duplicate state '${entry.name}'`);
    }
    names.add(entry.name);
    if (entry.isTerminal) {
      terminal.add(entry.name);
    }
  }
  if (isNonEmptyString(candidate.initial) && !names.has(candidate.initial)) {
    errors.push(`stateMachine.initial '${candidate.initial}' is not a declared state`);
  }
  if (!Array.isArray(candidate.transitions)) {
    errors.push('stateMachine.transitions must be an array (may be empty)');
    return;
  }
  for (const [index, transition] of candidate.transitions.entries()) {
    const entry = transition as Partial<DeclaredTransition> | null;
    if (
      entry === null ||
      typeof entry !== 'object' ||
      !isNonEmptyString(entry.from) ||
      !isNonEmptyString(entry.to) ||
      !isNonEmptyString(entry.trigger)
    ) {
      errors.push(`stateMachine.transitions[${index}] must be { from, to, trigger }`);
      continue;
    }
    if (!names.has(entry.from) || !names.has(entry.to)) {
      errors.push(
        `stateMachine.transitions[${index}] references undeclared state '${entry.from}'->'${entry.to}'`,
      );
      continue;
    }
    if (terminal.has(entry.from)) {
      errors.push(
        `stateMachine terminality law: transition '${entry.from}'->'${entry.to}' leaves terminal state '${entry.from}'`,
      );
    }
  }
}

/**
 * Fail-closed validation of the fourteen-part declaration. Every missing
 * part is named. This function is the CAPABILITY-MODEL law's enforcement
 * surface.
 */
export function validateExecutableCapabilityDeclaration(
  candidate: unknown,
): ExecutableCapabilityDeclaration {
  const errors: string[] = [];
  if (candidate === null || typeof candidate !== 'object') {
    throw new ValidationError('executable capability declaration must be an object');
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  if (record.contractVersion !== EXECUTABLE_DECLARATION_CONTRACT_VERSION) {
    errors.push(
      `contractVersion must be '${EXECUTABLE_DECLARATION_CONTRACT_VERSION}' (versioned declaration contract)`,
    );
  }
  const semantics = record.semantics as Partial<CapabilitySemantics> | undefined;
  if (
    semantics === undefined ||
    typeof semantics !== 'object' ||
    !isNonEmptyString(semantics.summary) ||
    !isNonEmptyString(semantics.effectDescription)
  ) {
    errors.push('part 1 semantics must be { summary, effectDescription }');
  }
  validateStateMachine(record.stateMachine, errors);
  if (!Array.isArray(record.preconditions)) {
    errors.push('part 3 preconditions must be an array (may be empty)');
  } else {
    for (const [index, precondition] of record.preconditions.entries()) {
      const entry = precondition as Partial<CapabilityPrecondition> | null;
      if (
        entry === null ||
        typeof entry !== 'object' ||
        !isNonEmptyString(entry.preconditionId) ||
        !isNonEmptyString(entry.description) ||
        (entry.confirmedBy !== 'PROVIDER' &&
          entry.confirmedBy !== 'PAYSWAP_RUNTIME' &&
          entry.confirmedBy !== 'CUSTOMER')
      ) {
        errors.push(
          `preconditions[${index}] must be { preconditionId, description, confirmedBy: PROVIDER|PAYSWAP_RUNTIME|CUSTOMER }`,
        );
      }
    }
  }
  const authorization = record.authorizationRequirements as
    | Partial<AuthorizationRequirement>
    | undefined;
  if (
    authorization === undefined ||
    typeof authorization !== 'object' ||
    !Array.isArray(authorization.requiredScopes) ||
    typeof authorization.requiresHumanApproval !== 'boolean'
  ) {
    errors.push(
      'part 4 authorizationRequirements must be { requiredScopes, requiresHumanApproval, mandateKindRef? }',
    );
  }
  if (!isFinancialEffectClass(record.financialEffectClass)) {
    errors.push(
      `part 5 financialEffectClass must be one of [${FINANCIAL_EFFECT_CLASSES.join(', ')}]`,
    );
  }
  const idempotency = record.idempotency as Partial<IdempotencyBehavior> | undefined;
  if (
    idempotency === undefined ||
    typeof idempotency !== 'object' ||
    (idempotency.keyScope !== 'ENDPOINT_SPECIFIC' &&
      idempotency.keyScope !== 'OPERATION_WIDE' &&
      idempotency.keyScope !== 'PROVIDER_DEFINED') ||
    typeof idempotency.carriesProviderKey !== 'boolean' ||
    (idempotency.retryPolicy !== 'NEVER_RETRY_AFTER_AMBIGUITY' &&
      idempotency.retryPolicy !== 'PROVIDER_DEFINED') ||
    typeof idempotency.reconciliationRequired !== 'boolean'
  ) {
    errors.push(
      'part 6 idempotency must be { keyScope, carriesProviderKey, retryPolicy, reconciliationRequired }',
    );
  }
  const compensation = record.compensation as Partial<CompensationPolicy> | undefined;
  if (
    compensation === undefined ||
    typeof compensation !== 'object' ||
    typeof compensation.cancellable !== 'boolean' ||
    typeof compensation.refundable !== 'boolean' ||
    !isNonEmptyString(compensation.compensationMechanism) ||
    typeof compensation.lateReturnRepresentable !== 'boolean'
  ) {
    errors.push(
      'part 7 compensation must be { cancellable, refundable, compensationMechanism, lateReturnRepresentable }',
    );
  }
  const partial = record.partialExecution as Partial<PartialExecutionPolicy> | undefined;
  if (
    partial === undefined ||
    typeof partial !== 'object' ||
    typeof partial.supported !== 'boolean' ||
    !isNonEmptyString(partial.semantics)
  ) {
    errors.push('part 8 partialExecution must be { supported, semantics }');
  }
  if (!Array.isArray(record.userActions)) {
    errors.push('part 9 userActions must be an array (may be empty)');
  } else {
    for (const [index, action] of record.userActions.entries()) {
      const entry = action as Partial<UserActionDeclaration> | null;
      if (
        entry === null ||
        typeof entry !== 'object' ||
        !isNonEmptyString(entry.actionKind) ||
        !isNonEmptyString(entry.description) ||
        typeof entry.required !== 'boolean'
      ) {
        errors.push(`userActions[${index}] must be { actionKind, description, required }`);
      }
    }
  }
  const stateMapping = record.providerStateMapping as
    | Partial<ProviderStateMappingDeclaration>
    | undefined;
  if (
    stateMapping === undefined ||
    typeof stateMapping !== 'object' ||
    stateMapping.preservedInEnvelope !== true ||
    !Array.isArray(stateMapping.consequentialFamilies) ||
    !stateMapping.consequentialFamilies.every(isProviderStateFamily)
  ) {
    errors.push(
      `part 10 providerStateMapping must be { preservedInEnvelope: true, consequentialFamilies ⊆ [${PROVIDER_STATE_FAMILIES.join(', ')}] } (INV-14)`,
    );
  }
  const externalRefs = record.externalReferences as
    | Partial<ExternalReferencePolicy>
    | undefined;
  if (
    externalRefs === undefined ||
    typeof externalRefs !== 'object' ||
    typeof externalRefs.carriesExternalIds !== 'boolean' ||
    (externalRefs.revisionTracking !== 'PROVIDER_REVISIONS' &&
      externalRefs.revisionTracking !== 'NONE') ||
    typeof externalRefs.correlationIdRequired !== 'boolean'
  ) {
    errors.push(
      'part 11 externalReferences must be { carriesExternalIds, revisionTracking, correlationIdRequired }',
    );
  }
  if (!Array.isArray(record.evidenceRequirements)) {
    errors.push('part 12 evidenceRequirements must be an array');
  } else {
    for (const [index, evidence] of record.evidenceRequirements.entries()) {
      const entry = evidence as Partial<EvidenceRequirement> | null;
      if (
        entry === null ||
        typeof entry !== 'object' ||
        !(CAPABILITY_EVIDENCE_KINDS as readonly unknown[]).includes(entry.evidenceKind) ||
        typeof entry.required !== 'boolean'
      ) {
        errors.push(
          `evidenceRequirements[${index}] must be { evidenceKind ∈ [${CAPABILITY_EVIDENCE_KINDS.join(', ')}], required }`,
        );
      }
    }
  }
  const terms = record.economicTerms as Partial<EconomicTermsDeclaration> | undefined;
  if (
    terms === undefined ||
    typeof terms !== 'object' ||
    !isNonEmptyString(terms.termsRef) ||
    !isNonEmptyString(terms.termsVersion) ||
    !isNonEmptyString(terms.pricingModel)
  ) {
    errors.push('part 13 economicTerms must be { termsRef, termsVersion, pricingModel }');
  }
  const jurisdiction = record.jurisdictionEligibility as
    | Readonly<Record<string, unknown>>
    | undefined;
  if (jurisdiction === undefined || typeof jurisdiction !== 'object') {
    errors.push(
      'part 14 jurisdictionEligibility must be declared (RESTRICTION_SET or an explicit NONE with justification)',
    );
  } else if (jurisdiction.declaredVia === 'RESTRICTION_SET') {
    try {
      validateCorridorRestrictionSet(jurisdiction.restrictionSet);
    } catch (error) {
      errors.push(
        `part 14 embedded restrictionSet is invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else if (jurisdiction.declaredVia === 'NONE') {
    if (!isNonEmptyString(jurisdiction.justification)) {
      errors.push(
        'part 14 declaredVia NONE requires a justification string (silent absence is impossible)',
      );
    }
  } else {
    errors.push("part 14 declaredVia must be 'RESTRICTION_SET' or 'NONE'");
  }
  try {
    validateDeclaredExecutionModes(record.executionModes);
  } catch (error) {
    errors.push(
      `execution modes: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (errors.length > 0) {
    throw new ValidationError(
      `Invalid executable capability declaration (all 14 parts are mandatory — CAPABILITY-MODEL law): ${errors.join('; ')}`,
      { errors: [...errors] },
    );
  }
  return candidate as ExecutableCapabilityDeclaration;
}
