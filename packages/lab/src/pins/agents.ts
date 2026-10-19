/**
 * @payswap/lab — the PINNED WIRE SHAPES of the agent organization model
 * (P6-W1, lane R4-W1; commit 1/4 — the type-level pins).
 *
 * LAYER LAW: zero sibling imports. Authority: @payswap/agents (P3-W1,
 * accepted) — the agent Body/Instance/Organization lane.
 *
 * THE PROPOSAL-ONLY LAW (old INV-G03; canonical INV-9/INV-12): a Lab
 * candidate composes building blocks into a candidate Organization DRAFT
 * that is deliberately authority-free — no budgets (a Lab proposal carries
 * no spending authority), no delegation edges (no mandate is granted), no
 * communication edges, ephemeral isolated memory, and a safety policy
 * whose FIRST hard constraint is the proposal-only rule. Releasing,
 * budgeting or delegating happens exclusively on the protocol authority
 * path outside the Lab.
 */

// ---------------------------------------------------------------------------
// Body / instance / principal references (STRUCTURAL PINS)
// ---------------------------------------------------------------------------

/**
 * STRUCTURAL PIN — authority: @payswap/agents src/body.ts `AgentBody`
 * (subset: the identity surface the Lab references; the authority's shape
 * is a superset carrying capabilities, extensions and evaluation).
 */
export interface PinnedAgentBody {
  readonly bodyId: string;
  readonly version: number;
}

/**
 * STRUCTURAL PIN — authority: @payswap/agents `VersionedRef<T>`.
 */
export interface PinnedVersionedRef {
  readonly id: string;
  readonly version: number;
}

/**
 * STRUCTURAL PIN — authority: @payswap/agents src/instance.ts
 * `AgentPrincipalRef` (subset: the agent key fingerprint + owner).
 */
export interface PinnedAgentPrincipalRef {
  readonly agentKeyFingerprint: string;
  readonly ownerRef: string;
}

/**
 * STRUCTURAL PIN — authority: @payswap/agents src/instance.ts
 * `AgentRuntimeState` (subset: the status field).
 */
export interface PinnedAgentRuntimeState {
  readonly status: string;
}

/**
 * STRUCTURAL PIN — authority: @payswap/agents `AgentInstance` (subset).
 */
export interface PinnedAgentInstance {
  readonly id: string;
  readonly bodyRef: PinnedVersionedRef;
  readonly principal: PinnedAgentPrincipalRef;
  readonly runtimeState: PinnedAgentRuntimeState;
}

// ---------------------------------------------------------------------------
// The organization DRAFT (STRUCTURAL PIN — authority: @payswap/agents
// src/organization.ts `OrganizationDraft`, subset)
// ---------------------------------------------------------------------------

/**
 * STRUCTURAL PIN — authority: @payswap/agents src/organization.ts
 * `CommunicationEdge` (subset).
 */
export interface PinnedCommunicationEdge {
  readonly fromInstanceId: string;
  readonly toInstanceId: string;
  readonly channel: string;
}

/**
 * STRUCTURAL PIN — authority: @payswap/agents `DelegationEdge` (subset).
 */
export interface PinnedDelegationEdge {
  readonly fromInstanceId: string;
  readonly toInstanceId: string;
  readonly mandateRef: string;
}

/**
 * STRUCTURAL PIN — authority: @payswap/agents `OrganizationMemoryPolicy`.
 * A Lab candidate organization is ALWAYS isolated + ephemeral.
 */
export interface PinnedOrganizationMemoryPolicy {
  readonly scope: "shared" | "isolated";
  readonly retention: "ephemeral" | "session" | "persistent";
}

/**
 * STRUCTURAL PIN — authority: @payswap/agents `OrganizationBudget`
 * (subset — used only to type the ALWAYS-EMPTY budgets list of a Lab
 * candidate organization: the Lab cannot grant spending authority).
 */
export interface PinnedOrganizationBudget {
  readonly budgetId: string;
  readonly scope: string;
}

/**
 * STRUCTURAL PIN — authority: @payswap/agents `EvaluatorRef`.
 */
export interface PinnedEvaluatorRef {
  readonly evaluationSuiteRef: string;
}

/**
 * STRUCTURAL PIN — authority: @payswap/agents `TerminationPolicy`.
 */
export interface PinnedTerminationPolicy {
  readonly conditions: readonly string[];
  readonly requiresHumanApproval: boolean;
}

/**
 * STRUCTURAL PIN — authority: @payswap/agents `SafetyPolicy`.
 */
export interface PinnedSafetyPolicy {
  readonly hardConstraints: readonly string[];
  readonly escalationSurfaceRef: string;
}

/**
 * STRUCTURAL PIN — authority: @payswap/agents src/organization.ts
 * `OrganizationDraft` (SUBSET: the graph the Lab composes; the authority's
 * shape is a superset carrying version lineage and release machinery —
 * owned by the agents lane). A Lab candidate organization is a DRAFT:
 * never released, never budgeted, never delegated (the proposal-only law).
 */
export interface PinnedOrganizationDraft {
  readonly id: string;
  readonly version: number;
  readonly bodies: readonly PinnedVersionedRef[];
  readonly instances: readonly PinnedAgentInstance[];
  readonly communicationEdges: readonly PinnedCommunicationEdge[];
  readonly delegationEdges: readonly PinnedDelegationEdge[];
  readonly memory: PinnedOrganizationMemoryPolicy;
  readonly budgets: readonly PinnedOrganizationBudget[];
  readonly evaluators: readonly PinnedEvaluatorRef[];
  readonly termination: PinnedTerminationPolicy;
  readonly safetyPolicy: PinnedSafetyPolicy;
}
