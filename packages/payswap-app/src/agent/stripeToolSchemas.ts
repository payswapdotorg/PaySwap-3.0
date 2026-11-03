/**
 * @payswap/app — the STRIPE TOOL SCHEMAS + strict argument validation
 * (P24-3, ADR-0017 D9).
 *
 * The input schemas of the always-available tool set (the D9 small
 * core) and the fail-closed argument validator every tool call passes
 * through BEFORE execution: unknown fields are REJECTED, never coerced
 * (the handoff's schema law); a malformed call is a typed validation
 * error returned to the model with the violation named, bounded by the
 * loop's failed-call budget — never an exception that breaks the loop.
 *
 * NO universal `stripe.request(url, …)` tool exists here or anywhere in
 * the registry (battery-asserted): the only execution primitives are
 * registered READ operations (operationId + schema-validated arguments)
 * and the two-phase prepare/execute contract.
 */

import type { StripeActionParameterPin } from "./stripePreparedActionPins.js";

/* --------------------- the always-available names -------------------- */

/**
 * The D9 always-available set (the small core every Stripe-bound task
 * starts with): discovery, search, describe, prepare — plus the
 * mid-task tool request. Resource READ tools register per task from the
 * catalogue (intent + permission filtered) in ./stripeToolRegistry.ts.
 */
export const STRIPE_ALWAYS_AVAILABLE_TOOL_NAMES = Object.freeze([
  "stripe.discover_capabilities",
  "stripe.search_operations",
  "stripe.describe_operation",
  "stripe.prepare_action",
  "stripe.request_tools",
] as const);
export type StripeAlwaysAvailableToolName = (typeof STRIPE_ALWAYS_AVAILABLE_TOOL_NAMES)[number];

/* --------------------------- the input schemas ----------------------- */

/** A JSON-Schema-shaped object (the registry's contracts are data). */
export type ToolInputSchema = Readonly<Record<string, unknown>>;

export const DISCOVER_CAPABILITIES_INPUT: ToolInputSchema = Object.freeze({
  type: "object",
  properties: Object.freeze({
    packId: { type: "string", description: "Optional pack filter (e.g. D_PRODUCTS_PRICING_CATALOG)." },
  }),
  additionalProperties: false,
});

export const SEARCH_OPERATIONS_INPUT: ToolInputSchema = Object.freeze({
  type: "object",
  properties: Object.freeze({
    query: { type: "string", description: "Free text matched against operation ids, families and summaries." },
    packId: { type: "string" },
    effectClass: { type: "string", description: "Optional effect-class filter (e.g. READ_ONLY)." },
  }),
  required: Object.freeze(["query"]),
  additionalProperties: false,
});

export const DESCRIBE_OPERATION_INPUT: ToolInputSchema = Object.freeze({
  type: "object",
  properties: Object.freeze({
    operationId: { type: "string", description: "The catalogue operation id (e.g. PostProducts)." },
  }),
  required: Object.freeze(["operationId"]),
  additionalProperties: false,
});

export const PREPARE_ACTION_INPUT: ToolInputSchema = Object.freeze({
  type: "object",
  properties: Object.freeze({
    operationId: { type: "string", description: "The REGISTERED catalogue operation to prepare (never a URL)." },
    parameters: {
      type: "array",
      description: "The proposed parameters, each { name, value, location: path|query|body }.",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          value: {},
          location: { type: "string", enum: ["path", "query", "body"] },
        },
        required: ["name", "value", "location"],
        additionalProperties: false,
      },
    },
  }),
  required: Object.freeze(["operationId", "parameters"]),
  additionalProperties: false,
});

export const REQUEST_TOOLS_INPUT: ToolInputSchema = Object.freeze({
  type: "object",
  properties: Object.freeze({
    operationIds: {
      type: "array",
      items: { type: "string" },
      description: "Catalogue operation ids whose READ tools to register for this task.",
    },
    packIds: {
      type: "array",
      items: { type: "string" },
      description: "Packs whose READ tools to register for this task.",
    },
  }),
  additionalProperties: false,
});

/* ------------------------- the typed validation ---------------------- */

/** The typed, fail-closed tool-argument validation error. */
export class StripeToolArgumentError extends Error {
  readonly code: "NOT_AN_OBJECT" | "UNKNOWN_FIELD" | "MISSING_FIELD" | "INVALID_VALUE";
  constructor(code: StripeToolArgumentError["code"], message: string) {
    super(message);
    this.name = "StripeToolArgumentError";
    this.code = code;
  }
}

/**
 * Validate an unknown argument object against a closed property set
 * with per-field validators. Fail-closed: unknown fields rejected,
 * missing required fields named, no coercion (handoff §13.1: "strict
 * rejection of unknown fields").
 */
export function validateToolArguments(
  toolName: string,
  args: unknown,
  schema: {
    readonly required?: readonly string[];
    readonly optional?: readonly string[];
    readonly validate?: (field: string, value: unknown) => void;
  },
): Readonly<Record<string, unknown>> {
  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    throw new StripeToolArgumentError(
      "NOT_AN_OBJECT",
      `${toolName}: arguments must be a JSON object`,
    );
  }
  const record = args as Readonly<Record<string, unknown>>;
  const allowed = new Set([...(schema.required ?? []), ...(schema.optional ?? [])]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new StripeToolArgumentError(
        "UNKNOWN_FIELD",
        `${toolName}: unknown argument field '${key}' (allowed: ${[...allowed].sort().join(", ") || "none"}) — the schema rejects unknown fields`,
      );
    }
  }
  for (const field of schema.required ?? []) {
    if (!(field in record)) {
      throw new StripeToolArgumentError(
        "MISSING_FIELD",
        `${toolName}: required argument '${field}' is missing`,
      );
    }
  }
  for (const [field, value] of Object.entries(record)) {
    schema.validate?.(field, value);
  }
  return record;
}

/** Require a non-empty string field value. */
export function requireNonEmptyString(toolName: string, field: string, value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new StripeToolArgumentError(
      "INVALID_VALUE",
      `${toolName}.${field} must be a non-empty string`,
    );
  }
  return value;
}

/** Require a boolean field value. */
export function requireBoolean(toolName: string, field: string, value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new StripeToolArgumentError(
      "INVALID_VALUE",
      `${toolName}.${field} must be a boolean`,
    );
  }
  return value;
}

/** Require an array of non-empty strings. */
export function requireStringArray(
  toolName: string,
  field: string,
  value: unknown,
): readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new StripeToolArgumentError(
      "INVALID_VALUE",
      `${toolName}.${field} must be an array of non-empty strings`,
    );
  }
  return value as readonly string[];
}

/** Validate a prepare_action parameters array (the frozen parameter shape). */
export function requireActionParameters(
  value: unknown,
): readonly StripeActionParameterPin[] {
  if (!Array.isArray(value)) {
    throw new StripeToolArgumentError(
      "INVALID_VALUE",
      "stripe.prepare_action.parameters must be an array of { name, value, location }",
    );
  }
  return value.map((entry, index) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new StripeToolArgumentError(
        "INVALID_VALUE",
        `stripe.prepare_action.parameters[${index}] must be an object`,
      );
    }
    const record = entry as Readonly<Record<string, unknown>>;
    const keys = Object.keys(record).sort().join(",");
    if (keys !== "location,name,value") {
      throw new StripeToolArgumentError(
        "UNKNOWN_FIELD",
        `stripe.prepare_action.parameters[${index}] has unexpected fields [${keys}] — want exactly [name, value, location]`,
      );
    }
    if (typeof record.name !== "string" || (record.name as string).length === 0) {
      throw new StripeToolArgumentError(
        "INVALID_VALUE",
        `stripe.prepare_action.parameters[${index}].name must be a non-empty string`,
      );
    }
    if (record.location !== "path" && record.location !== "query" && record.location !== "body") {
      throw new StripeToolArgumentError(
        "INVALID_VALUE",
        `stripe.prepare_action.parameters[${index}].location must be path, query or body`,
      );
    }
    return {
      name: record.name,
      value: record.value,
      location: record.location,
    } satisfies StripeActionParameterPin;
  });
}
