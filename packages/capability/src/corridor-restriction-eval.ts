/**
 * Corridor restriction-set evaluation (P2-W1; see corridor-evaluation.ts).
 *
 * Deterministic evaluation of ONE versioned CorridorRestrictionSet against
 * the corridor query: country/currency scopes, customer type, amount
 * bounds (canonical minor-unit ordering over the pinned AmountSpec wire
 * type — structural comparison, never money arithmetic), funding/payout/
 * recipient methods, required fields and cutoffs (evaluated against the
 * caller-supplied asOf DATA, never an ambient clock).
 */

import { compareMinorUnitStrings, parseIsoUtcTimestamp } from './canonical.ts';
import type { CorridorQuery, CorridorExclusion } from './corridor-types.ts';
import type { CorridorRestrictionSet, RequiredFieldDeclaration } from './restrictions.ts';
import { isNonEmptyString } from './shared.ts';

function exclusion(
  code: CorridorExclusion['code'],
  cause: CorridorExclusion['cause'],
  layer: CorridorExclusion['layer'],
  message: string,
  detail?: Readonly<Record<string, unknown>>,
): CorridorExclusion {
  return { code, cause, layer, message, ...(detail !== undefined ? { detail } : {}) };
}

export function evaluateRestrictionSet(
  set: CorridorRestrictionSet,
  query: CorridorQuery,
  exclusions: CorridorExclusion[],
): void {
  const label = `restriction set ${set.restrictionSetId}@${set.version}`;
  if (set.sourceCountries !== undefined && !set.sourceCountries.includes(query.sourceCountry)) {
    exclusions.push(
      exclusion(
        'SOURCE_COUNTRY_NOT_SERVED',
        'CAPABILITY',
        'RESTRICTION',
        `${label} does not serve source country '${query.sourceCountry}'`,
        { restrictionSetId: set.restrictionSetId, sourceCountry: query.sourceCountry },
      ),
    );
  }
  if (
    set.destinationCountries !== undefined &&
    !set.destinationCountries.includes(query.destinationCountry)
  ) {
    exclusions.push(
      exclusion(
        'DESTINATION_COUNTRY_NOT_SERVED',
        'CAPABILITY',
        'RESTRICTION',
        `${label} does not serve destination country '${query.destinationCountry}'`,
        { restrictionSetId: set.restrictionSetId, destinationCountry: query.destinationCountry },
      ),
    );
  }
  if (set.currencies !== undefined) {
    if (!set.currencies.includes(query.sourceCurrency)) {
      exclusions.push(
        exclusion(
          'SOURCE_CURRENCY_NOT_SUPPORTED',
          'CAPABILITY',
          'RESTRICTION',
          `${label} does not support source currency '${query.sourceCurrency}'`,
          { restrictionSetId: set.restrictionSetId, currency: query.sourceCurrency },
        ),
      );
    }
    if (!set.currencies.includes(query.destinationCurrency)) {
      exclusions.push(
        exclusion(
          'DESTINATION_CURRENCY_NOT_SUPPORTED',
          'CAPABILITY',
          'RESTRICTION',
          `${label} does not support destination currency '${query.destinationCurrency}'`,
          { restrictionSetId: set.restrictionSetId, currency: query.destinationCurrency },
        ),
      );
    }
  }
  if (set.customerTypes !== undefined && !set.customerTypes.includes(query.customerType)) {
    exclusions.push(
      exclusion(
        'CUSTOMER_TYPE_NOT_SERVED',
        'REGULATORY',
        'RESTRICTION',
        `${label} does not serve customer type '${query.customerType}'`,
        { restrictionSetId: set.restrictionSetId, customerType: query.customerType },
      ),
    );
  }
  if (set.fundingMethods !== undefined && isNonEmptyString(query.fundingMethod ?? '')) {
    if (!set.fundingMethods.includes(query.fundingMethod as string)) {
      exclusions.push(
        exclusion(
          'FUNDING_METHOD_NOT_SERVED',
          'CAPABILITY',
          'RESTRICTION',
          `${label} does not serve funding method '${query.fundingMethod}'`,
          { restrictionSetId: set.restrictionSetId, fundingMethod: query.fundingMethod },
        ),
      );
    }
  }
  if (set.payoutMethods !== undefined && isNonEmptyString(query.payoutMethod ?? '')) {
    if (!set.payoutMethods.includes(query.payoutMethod as string)) {
      exclusions.push(
        exclusion(
          'PAYOUT_METHOD_NOT_SERVED',
          'CAPABILITY',
          'RESTRICTION',
          `${label} does not serve payout method '${query.payoutMethod}'`,
          { restrictionSetId: set.restrictionSetId, payoutMethod: query.payoutMethod },
        ),
      );
    }
  }
  if (set.recipientTypes !== undefined && isNonEmptyString(query.recipientType ?? '')) {
    if (!set.recipientTypes.includes(query.recipientType as string)) {
      exclusions.push(
        exclusion(
          'RECIPIENT_TYPE_NOT_SERVED',
          'CAPABILITY',
          'RESTRICTION',
          `${label} does not serve recipient type '${query.recipientType}'`,
          { restrictionSetId: set.restrictionSetId, recipientType: query.recipientType },
        ),
      );
    }
  }
  evaluateAmountLimits(set, query, exclusions);
  evaluateRequiredFields(set, query, exclusions);
  evaluateCutoffs(set, query, exclusions);
}

function evaluateAmountLimits(
  set: CorridorRestrictionSet,
  query: CorridorQuery,
  exclusions: CorridorExclusion[],
): void {
  const limits = set.amountLimits;
  if (limits === undefined) {
    return;
  }
  const currencyToCheck = limits.min?.currency ?? limits.max?.currency;
  if (currencyToCheck !== undefined && currencyToCheck !== query.sendAmount.currency) {
    exclusions.push(
      exclusion(
        'AMOUNT_CURRENCY_MISMATCH',
        'CAPABILITY',
        'RESTRICTION',
        `restriction set ${set.restrictionSetId} bounds amounts in '${currencyToCheck}' but the query sends '${query.sendAmount.currency}'`,
        { restrictionSetId: set.restrictionSetId, boundedCurrency: currencyToCheck },
      ),
    );
    return;
  }
  if (
    limits.min !== undefined &&
    compareMinorUnitStrings(query.sendAmount.minorUnits, limits.min.minorUnits) < 0
  ) {
    exclusions.push(
      exclusion(
        'AMOUNT_BELOW_MINIMUM',
        'COMMERCIAL',
        'RESTRICTION',
        `send amount ${query.sendAmount.minorUnits} is below the minimum ${limits.min.minorUnits} (${limits.min.currency})`,
        { restrictionSetId: set.restrictionSetId, minimum: limits.min.minorUnits },
      ),
    );
  }
  if (
    limits.max !== undefined &&
    compareMinorUnitStrings(query.sendAmount.minorUnits, limits.max.minorUnits) > 0
  ) {
    exclusions.push(
      exclusion(
        'AMOUNT_ABOVE_MAXIMUM',
        'COMMERCIAL',
        'RESTRICTION',
        `send amount ${query.sendAmount.minorUnits} is above the maximum ${limits.max.minorUnits} (${limits.max.currency})`,
        { restrictionSetId: set.restrictionSetId, maximum: limits.max.minorUnits },
      ),
    );
  }
}

function evaluateRequiredFields(
  set: CorridorRestrictionSet,
  query: CorridorQuery,
  exclusions: CorridorExclusion[],
): void {
  if (set.requiredFields.length === 0) {
    return;
  }
  const presented = new Set(query.presentedFieldIds ?? []);
  const missing = set.requiredFields
    .filter((field) => !presented.has(field.fieldId))
    .map((field) => field.fieldId);
  if (missing.length > 0) {
    exclusions.push(
      exclusion(
        'MISSING_REQUIRED_FIELDS',
        'CAPABILITY',
        'RESTRICTION',
        `required fields not presented: ${missing.join(', ')}`,
        { restrictionSetId: set.restrictionSetId, missingFields: [...missing] },
      ),
    );
  }
}

/**
 * Cutoff evaluation (deterministic, data-only): a cutoff flags CUTOFF_PASSED
 * when the asOf time-of-day is at/after the cutoff time AND the day rule
 * applies to asOf's weekday (CALENDAR_DAYS: every day; BUSINESS_DAYS:
 * Monday-Friday; PROVIDER_DEFINED: never flags — surfaced as data only).
 * Weekends under BUSINESS_DAYS are a delivery-estimate concern, not an
 * eligibility exclusion (documented discipline).
 */
function evaluateCutoffs(
  set: CorridorRestrictionSet,
  query: CorridorQuery,
  exclusions: CorridorExclusion[],
): void {
  if (set.cutoffs.length === 0) {
    return;
  }
  const asOf = parseIsoUtcTimestamp(query.asOf, 'query.asOf');
  for (const cutoff of set.cutoffs) {
    if (cutoff.processingDayRule === 'PROVIDER_DEFINED') {
      continue;
    }
    if (cutoff.processingDayRule === 'BUSINESS_DAYS' && (asOf.dayOfWeek < 1 || asOf.dayOfWeek > 5)) {
      continue;
    }
    if (asOf.timeOfDayUtc >= cutoff.cutoffTimeUtc) {
      exclusions.push(
        exclusion(
          'CUTOFF_PASSED',
          'CAPACITY',
          'RESTRICTION',
          `asOf ${query.asOf} is at/after the ${cutoff.appliesTo} cutoff ${cutoff.cutoffTimeUtc} UTC (${cutoff.processingDayRule})`,
          { restrictionSetId: set.restrictionSetId, cutoffId: cutoff.cutoffId },
        ),
      );
    }
  }
}

export function collectRequiredFields(
  restrictionSets: readonly CorridorRestrictionSet[],
): readonly RequiredFieldDeclaration[] {
  const byId = new Map<string, RequiredFieldDeclaration>();
  for (const set of restrictionSets) {
    for (const field of set.requiredFields) {
      byId.set(field.fieldId, field);
    }
  }
  return [...byId.values()];
}

