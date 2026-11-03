/**
 * @payswap/app — the STRIPE TOOL REGISTRY + progressive discovery
 * (P24-3, ADR-0017 D9 — binding).
 *
 * The task-scoped registry the conversation loop offers to the model:
 *
 * - ALWAYS-AVAILABLE SET (small by law): stripe.discover_capabilities,
 *   stripe.search_operations, stripe.describe_operation,
 *   stripe.prepare_action and the mid-task stripe.request_tools —
 *   nothing else is unconditional.
 * - DOMAIN TOOLS register per task from the catalogue port's census
 *   facts, filtered by (a) the task intent text, (b) the connection's
 *   VERIFIED granted permissions and (c) the dispatchable support
 *   states — READ operations only (every mutation follows the
 *   two-phase prepare → confirm contract, never a direct tool).
 * - THE MODEL CAN REQUEST MORE mid-task (stripe.request_tools): the
 *   registry verifies permission + support + effect class BEFORE
 *   exposing; DISCOVERY NEVER ELEVATES PERMISSION — a request for an
 *   operation whose permission rule is not already granted is refused
 *   with the exact reason.
 * - NO universal `stripe.request(url, method, headers, body)` tool
 *   exists (battery-asserted): the only execution primitives are
 *   registered operation ids with schema-validated arguments.
 * - NO FLOODING: the registered set is capped; discovery answers are
 *   bounded and data-minimized (./stripeToolOutput.ts).
 *
 * ZERO FINANCIAL AUTHORITY: the registry describes and resolves tools;
 * execution happens host-side behind the ports.
 */

import type { AgentModelToolContractPin } from "./modelConversationPort.js";
import type {
  StripeAccountFactsPin,
  StripeOperationFactPin,
  StripeToolCataloguePort,
} from "./stripeToolCataloguePort.js";
import {
  STRIPE_TOOL_AUTO_WALK_ARGUMENT_NAME,
  STRIPE_TOOL_AUTO_WALK_ARGUMENT_SCHEMA,
} from "./stripeToolAutoWalk.js";
import {
  DESCRIBE_OPERATION_INPUT,
  DISCOVER_CAPABILITIES_INPUT,
  PREPARE_ACTION_INPUT,
  REQUEST_TOOLS_INPUT,
  SEARCH_OPERATIONS_INPUT,
  STRIPE_ALWAYS_AVAILABLE_TOOL_NAMES,
} from "./stripeToolSchemas.js";

/* ------------------------------ the entry ---------------------------- */

/** One registered tool (the model-visible name + its provenance). */
export interface StripeRegisteredTool {
  readonly name: string;
  readonly kind: "DISCOVERY" | "RESOURCE_READ" | "ACTION_PREPARE" | "REQUEST_TOOLS";
  /** Present on RESOURCE_READ tools — the catalogue operation they execute. */
  readonly operationId?: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly readOnly: boolean;
  /** The census fact the tool derives from (never invented). */
  readonly fact?: StripeOperationFactPin;
}

/** The registration report (honest counts, never a silent drop). */
export interface StripeToolRegistrationReport {
  readonly registeredTools: readonly string[];
  readonly domainTools: readonly string[];
  readonly accountFacts: StripeAccountFactsPin;
  /** Facts loaded for discovery answers (the task's catalogue snapshot). */
  readonly factCount: number;
}

/* ------------------------ the dispatchability laws ------------------- */

/** The support states a tool may be registered from (the DENY law's flip side). */
export const STRIPE_TOOL_DISPATCHABLE_STATES: readonly string[] = Object.freeze([
  "IMPLEMENTED",
  "IMPLEMENTED_WITH_LIMITS",
]);

/** May this fact become a tool at all? (read-only + dispatchable + permitted). */
export function isRegistrableReadFact(
  fact: StripeOperationFactPin,
  account: StripeAccountFactsPin,
): boolean {
  return (
    fact.effectClass === "READ_ONLY" &&
    STRIPE_TOOL_DISPATCHABLE_STATES.includes(fact.supportState) &&
    account.grantedPermissionRules.includes(fact.requiredPermissionRule)
  );
}

/** Derive the model-visible tool name from a census fact (deterministic). */
export function stripeReadToolName(fact: StripeOperationFactPin): string {
  const family = fact.resourceFamily.split("/").join(".");
  const verb = fact.operationId.startsWith("List")
    ? "list"
    : fact.operationId.includes("Search")
      ? "search"
      : "get";
  return `stripe.resources.${family}.${verb}`;
}

/* -------------------------- the intent filter ------------------------ */

/** Tokenize intent text like the deterministic router (lowercase stems).
 *  P25: the threshold is 3 characters — 4 silently blinded the short
 *  families (`tax`, `core`, `apps`) from ever intent-matching. */
function tokenize(text: string): readonly string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
}

/** Does the intent text name this fact's resource family? (deterministic) */
function intentNamesFamily(intentText: string, fact: StripeOperationFactPin): boolean {
  const tokens = tokenize(intentText);
  const segments = fact.resourceFamily
    .split("/")
    .map((segment) => segment.split("_")[0] as string)
    .filter((segment) => segment.length >= 3);
  return segments.some((segment) =>
    tokens.some((token) => token === segment || token === `${segment}s` || segment.startsWith(token)),
  );
}

/* ------------------------------ the registry -------------------------- */

export interface StripeToolRegistryOptions {
  readonly facts: StripeToolCataloguePort;
  /** The per-task domain-tool cap (the no-flooding law; default 10). */
  readonly maxDomainTools?: number;
  /** The hard registry cap including mid-task grants (default 24). */
  readonly maxRegisteredTools?: number;
}

export interface StripeToolRegistry {
  /** Load the task snapshot: always-available + intent/permission-filtered domain tools. */
  load(
    account: StripeAccountFactsPin,
    intentText: string | undefined,
  ): Promise<StripeToolRegistrationReport>;
  /** The registered tools (registration order; always-available first). */
  list(): readonly StripeRegisteredTool[];
  /** Resolve one tool by its model-visible name (undefined = unknown → DENY). */
  resolve(name: string): StripeRegisteredTool | undefined;
  /** Project the registry to the model-facing contracts (D9 — the bounded set). */
  toModelContracts(): readonly AgentModelToolContractPin[];
  /** The mid-task request path (verified; never elevates permission). */
  requestAdditionalTools(input: {
    readonly operationIds?: readonly string[];
    readonly packIds?: readonly string[];
  }): Promise<{
    readonly granted: readonly string[];
    readonly refused: readonly { readonly name: string; readonly reason: string }[];
  }>;
  /** The loaded census facts (the discovery tools' data source). */
  listFacts(): readonly StripeOperationFactPin[];
  /** The account the registry is scoped to (the task's ONE binding). */
  account(): StripeAccountFactsPin | undefined;
}

/** The always-available entries (D9's small, unconditional core). */
function alwaysAvailableEntries(): StripeRegisteredTool[] {
  return [
    {
      name: "stripe.discover_capabilities",
      kind: "DISCOVERY",
      description:
        "What this Stripe connection can do: the account context, the capability census by support state and pack, and the tools currently registered for this task. Read-only; derives from verified connection facts.",
      inputSchema: DISCOVER_CAPABILITIES_INPUT,
      readOnly: true,
    },
    {
      name: "stripe.search_operations",
      kind: "DISCOVERY",
      description:
        "Search the pinned Stripe operation catalogue (operation ids, resource families, summaries). Returns bounded, data-minimized facts with each operation's honest support state and required permission. Read-only.",
      inputSchema: SEARCH_OPERATIONS_INPUT,
      readOnly: true,
    },
    {
      name: "stripe.describe_operation",
      kind: "DISCOVERY",
      description:
        "Describe one catalogue operation: schema-level facts, effect class, approval tier, support state, required permission rule and read-back expectations. Read-only; never executes anything.",
      inputSchema: DESCRIBE_OPERATION_INPUT,
      readOnly: true,
    },
    {
      name: "stripe.prepare_action",
      kind: "ACTION_PREPARE",
      description:
        "Propose a state-changing Stripe operation as a PREPARED ACTION: takes a registered operationId and typed parameters, and returns an exact preview (digest, effect class, approval tier, confirmation inputs, expiry). Preparing never executes anything — a human must confirm the exact preview and the host mints the authorization.",
      inputSchema: PREPARE_ACTION_INPUT,
      readOnly: false,
    },
    {
      name: "stripe.request_tools",
      kind: "REQUEST_TOOLS",
      description:
        "Request additional READ tools for this task from the catalogue (by operation ids or pack ids). Each request is verified against the connection's granted permissions and the operation's support state before exposure — discovery never elevates permission.",
      inputSchema: REQUEST_TOOLS_INPUT,
      readOnly: true,
    },
  ];
}

export function createStripeToolRegistry(
  options: StripeToolRegistryOptions,
): StripeToolRegistry {
  const maxDomainTools = options.maxDomainTools ?? 10;
  const maxRegisteredTools = options.maxRegisteredTools ?? 24;
  const entries = new Map<string, StripeRegisteredTool>();
  let loadedFacts: readonly StripeOperationFactPin[] = [];
  let boundAccount: StripeAccountFactsPin | undefined;

  const registerFactTool = (fact: StripeOperationFactPin): string => {
    let name = stripeReadToolName(fact);
    if (entries.has(name)) {
      // Deterministic uniqueness: a collided name falls back to the
      // operation-id-derived name (never a silent overwrite).
      name = `stripe.op.${fact.operationId}`;
    }
    entries.set(name, {
      name,
      kind: "RESOURCE_READ",
      operationId: fact.operationId,
      description: `${fact.summary} Read-only ${fact.apiNamespace} ${fact.method} ${fact.path}. Requires permission '${fact.requiredPermissionRule}' (verified against this connection). Support state: ${fact.supportState}.`,
      inputSchema: readToolInputSchema(fact),
      readOnly: true,
      fact,
    });
    return name;
  };

  return {
    async load(account, intentText) {
      boundAccount = account;
      entries.clear();
      const always = alwaysAvailableEntries();
      // The D9 pin check: the unconditional core must match the pinned
      // always-available names EXACTLY (drift fails closed, never silently
      // adds or drops an unconditional tool).
      if (
        always.length !== STRIPE_ALWAYS_AVAILABLE_TOOL_NAMES.length ||
        always.some((entry, index) => entry.name !== STRIPE_ALWAYS_AVAILABLE_TOOL_NAMES[index])
      ) {
        throw new Error(
          "the always-available Stripe tool set drifted from the pinned D9 names — the registry fails closed",
        );
      }
      for (const entry of always) {
        entries.set(entry.name, entry);
      }
      loadedFacts = await options.facts.listOperationFacts();
      // The D9 filter chain: READ_ONLY + dispatchable + permission-
      // granted, then the task intent narrows the families, capped.
      const registrable = loadedFacts
        .filter((fact) => isRegistrableReadFact(fact, account))
        .filter((fact) => intentText === undefined || intentText.length === 0 || intentNamesFamily(intentText, fact))
        .sort((a, b) => (a.operationId < b.operationId ? -1 : a.operationId > b.operationId ? 1 : 0));
      const domainTools: string[] = [];
      for (const fact of registrable) {
        if (domainTools.length >= maxDomainTools || entries.size >= maxRegisteredTools) {
          break;
        }
        domainTools.push(registerFactTool(fact));
      }
      return {
        registeredTools: [...entries.keys()],
        domainTools,
        accountFacts: account,
        factCount: loadedFacts.length,
      };
    },

    list() {
      return [...entries.values()];
    },

    resolve(name) {
      return entries.get(name);
    },

    toModelContracts() {
      return [...entries.values()].map((entry) => ({
        name: entry.name,
        description: entry.description,
        inputSchema: entry.inputSchema,
        readOnly: entry.readOnly,
        needsApproval: entry.kind === "ACTION_PREPARE",
      }));
    },

    async requestAdditionalTools(input) {
      const granted: string[] = [];
      const refused: { name: string; reason: string }[] = [];
      const wanted: StripeOperationFactPin[] = [];
      const wantedIds = new Set(input.operationIds ?? []);
      for (const fact of loadedFacts) {
        if (wantedIds.has(fact.operationId)) {
          wanted.push(fact);
        } else if (input.packIds?.includes(fact.packId)) {
          wanted.push(fact);
        }
      }
      const seenIds = new Set<string>();
      for (const fact of wanted) {
        if (seenIds.has(fact.operationId)) {
          continue;
        }
        seenIds.add(fact.operationId);
        const alreadyRegistered = [...entries.values()].some(
          (entry) => entry.operationId === fact.operationId,
        );
        if (alreadyRegistered) {
          continue; // idempotent: an already-registered tool is a no-op grant
        }
        if (fact.effectClass !== "READ_ONLY") {
          refused.push({
            name: fact.operationId,
            reason:
              "effect class is not READ_ONLY — state-changing operations follow the two-phase prepare/confirm contract, never a direct tool",
          });
          continue;
        }
        if (!STRIPE_TOOL_DISPATCHABLE_STATES.includes(fact.supportState)) {
          refused.push({
            name: fact.operationId,
            reason: `support state is ${fact.supportState} — not dispatchable (the overlay's DENY law); the prerequisite is stated in the operation's census record`,
          });
          continue;
        }
        if (boundAccount === undefined || !boundAccount.grantedPermissionRules.includes(fact.requiredPermissionRule)) {
          refused.push({
            name: fact.operationId,
            reason: `permission rule '${fact.requiredPermissionRule}' is not granted to this connection — discovery never elevates permission`,
          });
          continue;
        }
        if (entries.size >= maxRegisteredTools) {
          refused.push({
            name: fact.operationId,
            reason: "the task's registered-tool cap is reached (the no-flooding law) — release scope or continue with the registered set",
          });
          continue;
        }
        granted.push(registerFactTool(fact));
      }
      const unknownIds = (input.operationIds ?? []).filter(
        (id) => !loadedFacts.some((fact) => fact.operationId === id),
      );
      for (const id of unknownIds) {
        refused.push({
          name: id,
          reason: "unknown operation id in the pinned catalogue — unknown operations are DENIED",
        });
      }
      return { granted, refused };
    },

    listFacts() {
      return loadedFacts;
    },

    account() {
      return boundAccount;
    },
  };
}

/**
 * The read tool's input schema: path params + bounded list options. The
 * paginated list tools additionally offer the P26-C opt-in `autoWalk`
 * boolean (the bounded page-walking affordance — offered ONLY where the
 * census fact says listPaginated; non-paginated reads reject it).
 */
function readToolInputSchema(fact: StripeOperationFactPin): Readonly<Record<string, unknown>> {
  const properties: Record<string, unknown> = {};
  for (const param of fact.pathParams) {
    properties[param] = { type: "string", description: `Path parameter ${param}.` };
  }
  if (fact.listPaginated) {
    properties.limit = { type: "integer", minimum: 1, maximum: 100, description: "Page size (1-100)." };
    properties.starting_after = { type: "string", description: "Pagination cursor from a previous page." };
    properties[STRIPE_TOOL_AUTO_WALK_ARGUMENT_NAME] = STRIPE_TOOL_AUTO_WALK_ARGUMENT_SCHEMA;
  }
  return Object.freeze({
    type: "object",
    properties: Object.freeze(properties),
    required: Object.freeze([...fact.pathParams]),
    additionalProperties: false,
  });
}
