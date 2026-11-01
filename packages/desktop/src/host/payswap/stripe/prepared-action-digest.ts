/**
 * PaySwap Desktop (P24-2, ADR-0017 D10) — the prepared-action DIGEST:
 * the canonical binding serialization + the SHA-256 computation + the
 * user-visible confirmation inputs.
 *
 * THE DIGEST LAW (the frozen contract's load-bearing field): the digest
 * binds the EXACT normalized parameters + the operation + the account
 * context. Change one byte of any of those → a different digest → the
 * authorization no longer matches → a NEW preview is required. The
 * canonical form is deterministic (recursively key-sorted JSON), so the
 * same logical binding always digests identically and a different
 * binding never collides by serialization order.
 *
 * NO CRYPTO INJECTION HERE (unlike provider-runtime's F-2 seam): the
 * desktop host is a node package whose session authority already binds
 * node:crypto directly (randomUUID); SHA-256 via node:crypto is
 * deterministic and injecting it would add a seam with no test value.
 */

import { createHash } from "node:crypto";
import type {
  StripeActionAccountContext,
  StripeActionParameter,
  StripePreparedAction,
} from "./prepared-action-contracts.js";
import { carriesStripeSecretShape } from "./stripe-pins.js";

/** The canonical-serialization size bound (a typed refusal, not a hang). */
export const MAX_CANONICAL_BINDING_BYTES = 65_536;

/** A typed digest refusal. */
export type StripeDigestRefusal =
  | { readonly kind: "PARAMETERS_TOO_LARGE"; readonly detail: string }
  | { readonly kind: "SECRET_SHAPED_PARAMETER"; readonly name: string };

/** Deterministically order object keys, recursively (arrays keep order). */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const ordered: Record<string, unknown> = {};
    for (const [key, item] of entries) {
      ordered[key] = canonicalize(item);
    }
    return ordered;
  }
  return value;
}

/** The canonical binding object (the digest's preimage, as data). */
export function canonicalBindingOf(input: {
  readonly operationId: string;
  readonly catalogueRelease: string;
  readonly accountContext: StripeActionAccountContext;
  readonly parameters: readonly StripeActionParameter[];
}): Record<string, unknown> {
  return {
    accountContext: {
      accountModel: input.accountContext.accountModel,
      connectionId: input.accountContext.connectionId,
      environment: input.accountContext.environment,
      stripeAccountId: input.accountContext.stripeAccountId,
    },
    catalogueRelease: input.catalogueRelease,
    operationId: input.operationId,
    parameters: [...input.parameters]
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map((parameter) => ({
        location: parameter.location,
        name: parameter.name,
        value: canonicalize(parameter.value),
      })),
  };
}

/**
 * Compute the SHA-256 hex digest of the canonical binding, or refuse:
 * - over the size bound (a typed refusal — never an unbounded hash);
 * - a SECRET-SHAPED parameter value (a credential never enters a
 *   prepared action, not even hashed — fail-closed, handoff §9.1).
 */
export function digestOf(
  binding: Record<string, unknown>,
): { readonly ok: true; readonly digest: string } | { readonly ok: false; readonly refusal: StripeDigestRefusal } {
  const serialized = JSON.stringify(binding);
  if (serialized.length > MAX_CANONICAL_BINDING_BYTES) {
    return {
      ok: false,
      refusal: {
        kind: "PARAMETERS_TOO_LARGE",
        detail: `the canonical binding serializes to ${serialized.length} bytes (bound: ${MAX_CANONICAL_BINDING_BYTES})`,
      },
    };
  }
  const bindingObject = binding as { parameters?: unknown };
  if (Array.isArray(bindingObject.parameters)) {
    for (const parameter of bindingObject.parameters) {
      if (
        parameter !== null &&
        typeof parameter === "object" &&
        typeof (parameter as { name?: unknown }).name === "string"
      ) {
        const valueText = JSON.stringify((parameter as { value?: unknown }).value ?? null);
        if (carriesStripeSecretShape(valueText)) {
          return {
            ok: false,
            refusal: {
              kind: "SECRET_SHAPED_PARAMETER",
              name: (parameter as { name: string }).name,
            },
          };
        }
      }
    }
  }
  return { ok: true, digest: createHash("sha256").update(serialized, "utf8").digest("hex") };
}

/** The digest of one prepared action (recomputed from its own fields). */
export function preparedActionDigestOf(action: StripePreparedAction): string {
  const binding = canonicalBindingOf({
    operationId: action.operationId,
    catalogueRelease: action.catalogueRelease,
    accountContext: action.accountContext,
    parameters: action.parameters,
  });
  const digested = digestOf(binding);
  if (!digested.ok) {
    // A persisted action that can no longer digest is a construction
    // defect (it was digested at mint time) — fail closed.
    throw new Error(`a persisted prepared action failed its own digest law: ${digested.refusal.kind}`);
  }
  return digested.digest;
}

/** The bounded parameter summary for confirmation inputs (secret-free). */
const MAX_CONFIRMATION_INPUT_LENGTH = 200;

/** Render one parameter as a bounded human-readable confirmation line. */
function confirmationLineOf(parameter: StripeActionParameter): string {
  const valueText =
    typeof parameter.value === "string"
      ? parameter.value
      : JSON.stringify(canonicalize(parameter.value)) ?? "null";
  const bounded =
    valueText.length > MAX_CONFIRMATION_INPUT_LENGTH
      ? `${valueText.slice(0, MAX_CONFIRMATION_INPUT_LENGTH)}…`
      : valueText;
  return `${parameter.location} ${parameter.name} = ${bounded}`;
}

/**
 * The exact user-visible confirmation inputs (handoff §4.3): what the
 * preview MUST show before a human confirms. Deterministic, bounded,
 * secret-free — derived from the census facts + the account context +
 * the normalized parameters.
 */
export function confirmationInputsOf(input: {
  readonly operationId: string;
  readonly summary: string;
  readonly effectClass: string;
  readonly approvalTier: string;
  readonly accountContext: StripeActionAccountContext;
  readonly parameters: readonly StripeActionParameter[];
}): readonly string[] {
  const lines: string[] = [
    `operation: ${input.operationId} — ${input.summary}`,
    `effect class: ${input.effectClass} (approval tier: ${input.approvalTier})`,
    `account: ${input.accountContext.stripeAccountId} (${input.accountContext.accountModel}, ${input.accountContext.environment})`,
    `connection: ${input.accountContext.connectionId}`,
  ];
  for (const parameter of [...input.parameters].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )) {
    lines.push(confirmationLineOf(parameter));
  }
  return Object.freeze(lines);
}
