/**
 * @payswap/merchant — the connected-instance boundary guard (P5-W3,
 * lane R3-W3; ADAPT of the old merchant-crypto/checkout
 * `assertConnectedInstance` law onto the pinned capability shapes).
 *
 * INV-13 / the rule-18 law: a PROVIDER CATALOGUE ENTRY may never scope
 * a merchant settlement route, refund observation or eligibility
 * observation — only a genuinely CONNECTED capability instance can.
 * The guard is fail-closed: a catalogue-shaped value (no instanceId /
 * no authorization / no eligibility) is rejected before anything else
 * runs. Connection eligibility is an OBSERVATION against the connected
 * instance, never an onboarding fact and never a catalogue claim.
 */

import { ValidationError } from "./errors.ts";
import { requireNonEmptyString } from "./secrets.ts";
import { pinnedLooksLikeConnectedInstance } from "./pins/capability.ts";
import type { PinnedConnectedInstance } from "./pins/capability.ts";

/**
 * Fail-closed guard: the value must be a CONNECTED capability instance
 * (pinned capability-lane shape — instanceId/authorization/eligibility
 * present). A provider catalogue entry (structurally non-overlapping:
 * no instanceId, no authorization, no eligibility) throws
 * `ValidationError` — INV-13: catalogue presence is never connection.
 */
export function assertConnectedInstance(
  value: PinnedConnectedInstance,
  label = "connected instance",
): PinnedConnectedInstance {
  if (value === null || typeof value !== "object") {
    throw new ValidationError(`a ${label} is required (INV-13: catalogue presence is never connection)`);
  }
  if (!pinnedLooksLikeConnectedInstance(value)) {
    throw new ValidationError(
      `the ${label} is not a connected capability instance — a provider catalogue entry can never scope merchant settlement (INV-13)`,
      {
        found: {
          instanceId: typeof value.instanceId === "string" ? value.instanceId : undefined,
          hasAuthorization: value.authorization !== undefined,
          hasEligibility: value.eligibility !== undefined,
        },
      },
    );
  }
  requireNonEmptyString(value.instanceId, "connected instance instanceId");
  requireNonEmptyString(value.providerName, "connected instance providerName");
  requireNonEmptyString(value.accountRef, "connected instance accountRef");
  if (value.currencies.some((currency) => typeof currency !== "string" || currency.length === 0)) {
    throw new ValidationError("the connected instance currency scope carries an empty currency", {
      instanceId: value.instanceId,
    });
  }
  return value;
}

/**
 * Deterministic eligibility view of a connected instance for a given
 * settlement currency: ACTIVE authorization + eligible instance +
 * currency in scope. Reasons are machine keys; instance-level
 * disqualification reasons are appended after INSTANCE_NOT_ELIGIBLE.
 */
export function connectedInstanceEligibilityReasons(
  instance: PinnedConnectedInstance,
  settlementCurrency: string,
): readonly string[] {
  assertConnectedInstance(instance);
  if (typeof settlementCurrency !== "string" || settlementCurrency.length !== 3) {
    throw new ValidationError("the settlement currency must be a 3-character code", {
      settlementCurrency,
    });
  }
  const reasons: string[] = [];
  if (instance.authorization.status !== "ACTIVE") {
    reasons.push("AUTHORIZATION_NOT_ACTIVE");
  }
  if (instance.eligibility.eligible !== true) {
    reasons.push("INSTANCE_NOT_ELIGIBLE");
    reasons.push(...instance.eligibility.reasons);
  }
  if (!instance.currencies.includes(settlementCurrency)) {
    reasons.push("SETTLEMENT_CURRENCY_NOT_IN_INSTANCE_SCOPE");
  }
  return Object.freeze([...reasons]);
}
