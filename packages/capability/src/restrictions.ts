/**
 * Corridor restrictions — the versioned inputs of the corridor discovery
 * projection (P2-W1; NET-NEW contract, Wise §4.1 discipline).
 *
 * A corridor is NOT a new authority and NOT a currency pair alone: it is a
 * DETERMINISTIC DISCOVERY PROJECTION over versioned capabilities +
 * restrictions + fresh observations (see corridor.ts). This module owns the
 * RESTRICTION SET contract: the versioned declaration of what a capability
 * (product level) or provider implementation (provider level) actually
 * serves — country/currency, customer type, amount bounds, recipient/
 * funding/payout method, required fields, limits, pricing/delivery terms
 * and cutoffs.
 *
 * Amount-typed limits use the pinned AmountSpec wire type consumed TYPE-ONLY
 * from @payswap/trust (the single accepted sibling import; see
 * capability-definition.ts for the pin law). Ordering enforcement uses the
 * internal canonical-order helpers (structural comparison, not money
 * arithmetic — no Money type, no currency semantics).
 *
 * NARROWING LAW: attaching a restriction set at the IMPLEMENTATION level can
 * only NARROW the DEFINITION-level set (evaluateRestrictionNarrowing):
 * scopes shrink (subset), amount bounds tighten inside the parent interval,
 * required fields grow. Widening is a validation error — a provider
 * implementation can never claim more than the capability it implements.
 */

import type { AmountSpec } from '@payswap/trust';
import { ValidationError } from './errors.ts';
import { compareMinorUnitStrings } from './canonical.ts';

/** Customer types the corridor discipline distinguishes (Wise §4.1). */
export const CUSTOMER_TYPES = ['PERSONAL', 'BUSINESS'] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export function isCustomerType(value: unknown): value is CustomerType {
  return (
    typeof value === 'string' && (CUSTOMER_TYPES as readonly unknown[]).includes(value)
  );
}

/** Inclusive amount bounds for one corridor direction. */
export interface CorridorAmountLimits {
  /** Minimum send amount; absent = no minimum. */
  readonly min?: AmountSpec;
  /** Maximum send amount; absent = no maximum. */
  readonly max?: AmountSpec;
}

/**
 * One required input field (recipient/funding/payout context). `fieldId` is
 * an opaque corridor-scoped identifier (the Surface lane owns presentation).
 */
export interface RequiredFieldDeclaration {
  readonly fieldId: string;
  readonly description: string;
  /** Which side the field belongs to. */
  readonly appliesTo: 'RECIPIENT' | 'SENDER' | 'FUNDING' | 'PAYOUT';
}

/**
 * A declared cutoff (as DATA — never evaluated against an ambient clock).
 * `cutoffTimeUtc` is HH:MM (24h) UTC; `processingDayRule` describes which
 * days the cutoff applies to. The corridor projection evaluates cutoffs
 * against the caller-supplied asOf timestamp.
 */
export interface CorridorCutoff {
  readonly cutoffId: string;
  readonly description: string;
  readonly appliesTo: 'FUNDING' | 'PAYOUT';
  readonly cutoffTimeUtc: string;
  readonly processingDayRule: 'BUSINESS_DAYS' | 'CALENDAR_DAYS' | 'PROVIDER_DEFINED';
}

/**
 * Versioned reference to pricing/delivery terms (the quote/economic-terms
 * CONTRACT itself is owned by the economic/protocol + Surface lanes; the
 * corridor carries only an opaque, versioned reference plus the delivery
 * estimate LABEL discipline — an estimate is not a guarantee unless the
 * provider-backed contract says so).
 */
export interface CorridorTermsReference {
  readonly termsRef: string;
  readonly termsVersion: string;
  readonly deliveryEstimateLabel: 'GUARANTEED' | 'INDICATIVE';
}

/**
 * The versioned corridor restriction set: what the declaring layer actually
 * serves. Every dimension is OPTIONAL: an absent dimension is UNRESTRICTED
 * (the parent's declaration governs); a present dimension is a hard
 * constraint the corridor projection evaluates deterministically.
 */
export interface CorridorRestrictionSet {
  readonly restrictionSetId: string;
  readonly version: string;
  /** ISO 3166-1 alpha-2 source countries served; absent = unrestricted. */
  readonly sourceCountries?: readonly string[];
  /** ISO 3166-1 alpha-2 destination countries served; absent = unrestricted. */
  readonly destinationCountries?: readonly string[];
  /**
   * Currency codes relevant to the restricted route (both source and target
   * currency must be members when the dimension is present); absent =
   * unrestricted.
   */
  readonly currencies?: readonly string[];
  /** Customer types served; absent = all. */
  readonly customerTypes?: readonly CustomerType[];
  /** Funding method identifiers served; absent = unrestricted. */
  readonly fundingMethods?: readonly string[];
  /** Payout method identifiers served; absent = unrestricted. */
  readonly payoutMethods?: readonly string[];
  /** Recipient types served; absent = unrestricted. */
  readonly recipientTypes?: readonly string[];
  /** Inclusive send-amount bounds; absent = unrestricted amounts. */
  readonly amountLimits?: CorridorAmountLimits;
  /** Fields the route requires before execution. */
  readonly requiredFields: readonly RequiredFieldDeclaration[];
  /** Declared cutoffs (data; evaluated against caller-supplied asOf). */
  readonly cutoffs: readonly CorridorCutoff[];
  /** Versioned pricing/delivery terms reference. */
  readonly terms?: CorridorTermsReference;
  /** Who declared this restriction set (provenance, opaque). */
  readonly declaredBy: string;
}

const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const CUTOFF_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNonEmptyStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => isNonEmptyString(item));
}

function isCountryArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && COUNTRY_PATTERN.test(item));
}

function isCurrencyArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && CURRENCY_PATTERN.test(item));
}

/**
 * Structural validation of a restriction set. Absent dimensions are legal
 * (unrestricted); PRESENT dimensions must be well-formed. Amount bounds,
 * when both present, must satisfy min <= max in the SAME currency (else a
 * validation error — cross-currency bounds are meaningless).
 */
export function validateCorridorRestrictionSet(
  candidate: unknown,
): CorridorRestrictionSet {
  const errors: string[] = [];
  if (candidate === null || typeof candidate !== 'object') {
    throw new ValidationError('corridor restriction set must be an object');
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  if (!isNonEmptyString(record.restrictionSetId)) {
    errors.push('restrictionSetId must be a non-empty string');
  }
  if (!isNonEmptyString(record.version)) {
    errors.push('version must be a non-empty string (versioned restriction law)');
  }
  if (!isNonEmptyString(record.declaredBy)) {
    errors.push('declaredBy must be a non-empty string (provenance)');
  }
  if (record.sourceCountries !== undefined && !isCountryArray(record.sourceCountries)) {
    errors.push('sourceCountries, when present, must be ISO 3166-1 alpha-2 codes');
  }
  if (
    record.destinationCountries !== undefined &&
    !isCountryArray(record.destinationCountries)
  ) {
    errors.push('destinationCountries, when present, must be ISO 3166-1 alpha-2 codes');
  }
  if (record.currencies !== undefined && !isCurrencyArray(record.currencies)) {
    errors.push('currencies, when present, must be 3-letter currency codes');
  }
  if (record.customerTypes !== undefined) {
    if (
      !Array.isArray(record.customerTypes) ||
      !record.customerTypes.every(isCustomerType)
    ) {
      errors.push(`customerTypes, when present, must be members of [${CUSTOMER_TYPES.join(', ')}]`);
    }
  }
  if (record.fundingMethods !== undefined && !isNonEmptyStringArray(record.fundingMethods)) {
    errors.push('fundingMethods, when present, must be an array of method ids');
  }
  if (record.payoutMethods !== undefined && !isNonEmptyStringArray(record.payoutMethods)) {
    errors.push('payoutMethods, when present, must be an array of method ids');
  }
  if (record.recipientTypes !== undefined && !isNonEmptyStringArray(record.recipientTypes)) {
    errors.push('recipientTypes, when present, must be an array of recipient type ids');
  }
  const limits = record.amountLimits as
    | Partial<CorridorAmountLimits>
    | undefined;
  if (limits !== undefined) {
    if (limits === null || typeof limits !== 'object') {
      errors.push('amountLimits, when present, must be { min?, max? } AmountSpec bounds');
    } else {
      if (limits.min !== undefined && limits.max !== undefined) {
        if (limits.min.currency !== limits.max.currency) {
          errors.push(
            `amountLimits min/max must share one currency (got '${limits.min.currency}' vs '${limits.max.currency}')`,
          );
        } else if (compareMinorUnitStrings(limits.min.minorUnits, limits.max.minorUnits) > 0) {
          errors.push('amountLimits min must be <= max (canonical minor-unit order)');
        }
      }
    }
  }
  if (!Array.isArray(record.requiredFields)) {
    errors.push('requiredFields must be an array (may be empty)');
  } else {
    for (const [index, field] of record.requiredFields.entries()) {
      const entry = field as Readonly<Record<string, unknown>> | null;
      if (
        entry === null ||
        typeof entry !== 'object' ||
        !isNonEmptyString(entry.fieldId) ||
        !isNonEmptyString(entry.description) ||
        (entry.appliesTo !== 'RECIPIENT' &&
          entry.appliesTo !== 'SENDER' &&
          entry.appliesTo !== 'FUNDING' &&
          entry.appliesTo !== 'PAYOUT')
      ) {
        errors.push(
          `requiredFields[${index}] must be { fieldId, description, appliesTo: RECIPIENT|SENDER|FUNDING|PAYOUT }`,
        );
      }
    }
  }
  if (!Array.isArray(record.cutoffs)) {
    errors.push('cutoffs must be an array (may be empty)');
  } else {
    for (const [index, cutoff] of record.cutoffs.entries()) {
      const entry = cutoff as Readonly<Record<string, unknown>> | null;
      if (
        entry === null ||
        typeof entry !== 'object' ||
        !isNonEmptyString(entry.cutoffId) ||
        !isNonEmptyString(entry.description) ||
        (entry.appliesTo !== 'FUNDING' && entry.appliesTo !== 'PAYOUT') ||
        typeof entry.cutoffTimeUtc !== 'string' ||
        !CUTOFF_TIME_PATTERN.test(entry.cutoffTimeUtc) ||
        (entry.processingDayRule !== 'BUSINESS_DAYS' &&
          entry.processingDayRule !== 'CALENDAR_DAYS' &&
          entry.processingDayRule !== 'PROVIDER_DEFINED')
      ) {
        errors.push(
          `cutoffs[${index}] must be { cutoffId, description, appliesTo, cutoffTimeUtc HH:MM, processingDayRule }`,
        );
      }
    }
  }
  const terms = record.terms as Partial<CorridorTermsReference> | undefined;
  if (terms !== undefined) {
    if (
      terms === null ||
      typeof terms !== 'object' ||
      !isNonEmptyString(terms.termsRef) ||
      !isNonEmptyString(terms.termsVersion) ||
      (terms.deliveryEstimateLabel !== 'GUARANTEED' &&
        terms.deliveryEstimateLabel !== 'INDICATIVE')
    ) {
      errors.push(
        'terms, when present, must be { termsRef, termsVersion, deliveryEstimateLabel: GUARANTEED|INDICATIVE }',
      );
    }
  }
  if (errors.length > 0) {
    throw new ValidationError(`Invalid corridor restriction set: ${errors.join('; ')}`, {
      errors: [...errors],
    });
  }
  return candidate as CorridorRestrictionSet;
}

function scopeNarrows(
  child: readonly string[] | undefined,
  parent: readonly string[] | undefined,
): boolean {
  // Absent child = unrestricted by the child, which would WIDEN a restricted
  // parent: the narrowing law requires the child to re-declare within it.
  if (parent === undefined) {
    return true;
  }
  if (child === undefined) {
    return false;
  }
  const parentSet = new Set(parent);
  return child.every((item) => parentSet.has(item));
}

/**
 * NARROWING LAW: does `child` narrow (or preserve) `parent` on every
 * dimension? Present dimensions must be subsets; a restricted parent cannot
 * be unrestricted by the child; amount bounds tighten; required fields grow.
 * Returns the list of widened dimensions (empty = lawful narrowing).
 */
export function restrictionWideningViolations(
  child: CorridorRestrictionSet,
  parent: CorridorRestrictionSet,
): readonly string[] {
  const violations: string[] = [];
  if (!scopeNarrows(child.sourceCountries, parent.sourceCountries)) {
    violations.push('sourceCountries widen beyond the definition-level scope');
  }
  if (!scopeNarrows(child.destinationCountries, parent.destinationCountries)) {
    violations.push('destinationCountries widen beyond the definition-level scope');
  }
  if (!scopeNarrows(child.currencies, parent.currencies)) {
    violations.push('currencies widen beyond the definition-level scope');
  }
  if (!scopeNarrows(child.customerTypes, parent.customerTypes)) {
    violations.push('customerTypes widen beyond the definition-level scope');
  }
  if (!scopeNarrows(child.fundingMethods, parent.fundingMethods)) {
    violations.push('fundingMethods widen beyond the definition-level scope');
  }
  if (!scopeNarrows(child.payoutMethods, parent.payoutMethods)) {
    violations.push('payoutMethods widen beyond the definition-level scope');
  }
  if (!scopeNarrows(child.recipientTypes, parent.recipientTypes)) {
    violations.push('recipientTypes widen beyond the definition-level scope');
  }
  const parentLimits = parent.amountLimits;
  const childLimits = child.amountLimits;
  if (parentLimits !== undefined) {
    if (childLimits === undefined) {
      violations.push('amountLimits dropped: a restricted parent cannot be unrestricted');
    } else {
      if (
        parentLimits.min !== undefined &&
        (childLimits.min === undefined ||
          childLimits.min.currency !== parentLimits.min.currency ||
          compareMinorUnitStrings(childLimits.min.minorUnits, parentLimits.min.minorUnits) < 0)
      ) {
        violations.push('amountLimits.min narrows downward (widening)');
      }
      if (
        parentLimits.max !== undefined &&
        (childLimits.max === undefined ||
          childLimits.max.currency !== parentLimits.max.currency ||
          compareMinorUnitStrings(childLimits.max.minorUnits, parentLimits.max.minorUnits) > 0)
      ) {
        violations.push('amountLimits.max narrows upward (widening)');
      }
    }
  }
  const childFields = new Set(child.requiredFields.map((field) => field.fieldId));
  if (!parent.requiredFields.every((field) => childFields.has(field.fieldId))) {
    violations.push('requiredFields dropped fields declared by the parent');
  }
  return violations;
}
