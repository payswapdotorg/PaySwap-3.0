/**
 * @payswap/agents — Agent Body, Agent Instance, Agent Package, Organization,
 * proposals, runtime contract and smart-account/session-key contracts
 * (Work Order P3-W1).
 *
 * THE AGENT MODEL (FROZEN-ARCHITECTURE §7, §12, §13, §20):
 * - AgentBody declares WHAT an agent can do — model-independent by
 *   construction (no model/soul/provider/prompt fields).
 * - AgentInstance binds a Body version to a principal with a REPLACEABLE
 *   model binding.
 * - AgentPackage is the certifiable distributable (bodies, org templates,
 *   extensions, epoch/runtime/model requirements, evaluation suite,
 *   provenance) with an explicit, evidence-carrying lifecycle.
 * - Organization is a VERSIONED GRAPH of Bodies/Instances with
 *   communication, delegation, memory, budgets, evaluators, termination
 *   and safety policy; released versions are immutable and
 *   content-addressed, with explicit derivedFrom version lineage.
 * - Strategy answers WHAT happens; Organization answers WHO/WHAT executes
 *   it (src/strategy.ts pins the law in code and types).
 * - AgentProposal is a typed, VERSIONED recommendation record that NEVER
 *   authorizes: no idempotency key, no authority fields, no signatures, no
 *   obligation/clearing/settlement calls (INV-9/INV-10; layer law
 *   `cannot_authorize_financial_effects: true`).
 *
 * LAYER LAW (MODULE-OWNERSHIP.yaml layer `intelligence`): zero runtime
 * dependencies. The ONE accepted sibling import is TYPE-ONLY from
 * @payswap/trust (AmountSpec + the authority wire types), erased at runtime
 * and resolved at typecheck time via tsconfig paths — the accepted P1/P2
 * integration pattern (mirrors packages/capability). Organization execution
 * resolves every acting node through the INJECTED authority adapter
 * (src/authority-port.ts); this package never re-implements authority.
 * Machine-checked by test/boundary.test.ts.
 */

export const PACKAGE_NAME = "@payswap/agents" as const;

// Exact money wire type (owned by @payswap/trust; TYPE-ONLY sibling link).
export * from "./amount.ts";

// Deterministic canonical serialization + content digest.
export * from "./canonical.ts";

// Agent Body (model-independent contract) + possession (commit 2).
export * from "./body.ts";

// Agent Instance (Body + replaceable model binding).
export * from "./instance.ts";

// Agent Package (§13) + lifecycle state machine + evidence ledger.
export * from "./package.ts";
export * from "./package/lifecycle.ts";

// Organization as a versioned graph (§7): release/amend/derive + the
// execution engine (authority-resolved), memory boundary, communications,
// budgets, termination and safety gate.
export * from "./organization.ts";
export * from "./organization/execution.ts";
export * from "./organization/memory.ts";
export * from "./organization/communication.ts";
export * from "./organization/budget.ts";
export * from "./organization/termination.ts";

// The injected authority port (organization execution resolves every acting
// node through it; the trust lane owns evaluate/attenuate).
export * from "./authority-port.ts";

// Agent proposals: typed, versioned, advisory recommendation records.
export * from "./proposal.ts";

// Strategy vs Organization law (§7): the WHAT is advisory; the WHO/WHAT
// executes is a released organization version.
export * from "./strategy.ts";

// §20 agent runtime contract + the deterministic reference runtime and its
// injection seams (clocks, ids, tools, decisions, executors) + the
// fail-closed financial tool gate.
export * from "./runtime.ts";
export * from "./runtime/runtime-seams.ts";
export * from "./runtime/tool-gate.ts";
export * from "./runtime/reference-runtime.ts";

// Smart-account / session-key contracts (§12, INV-19).
export * from "./smart-account.ts";
