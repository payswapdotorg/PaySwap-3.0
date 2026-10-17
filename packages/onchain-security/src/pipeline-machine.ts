/**
 * @payswap/onchain-security — the consequential-write pipeline machine:
 * the declared state/event vocabulary (R2-W2; PORT+ADAPT of
 * payswap.org@8a735bf packages/onchain-security/src/pipeline.ts, split
 * for the ≤400-line law).
 *
 * The pipeline is a DETERMINISTIC STATE MACHINE, not an agent judgment
 * (INV-18):
 *
 *   PREPARED → (simulate when supported) → GATED (deterministic policy/
 *   security) → DIFF_READY (readable expected-state diff) → AUTHORIZED
 *   (trusted-surface artifact only) → RECHECKED (immediate pre-broadcast
 *   recheck; drift VOIDS) → BROADCAST_HANDOFF (signing request handed to
 *   the signer adapter — the kernel never broadcasts).
 *
 * Terminal states: BLOCKED (deterministic BLOCK — no exit, no override,
 * INV-21), VOIDED (stale-state invalidation — re-request, never repair)
 * and BROADCAST_HANDOFF (kernel responsibility ends at the handoff;
 * submitted transactions are not financial finality — INV-11/INV-5:
 * finality comes from observation/evidence/reconciliation).
 *
 * The machine is defined through the pinned declared state machine
 * (pins/state-machine.ts — terminal-state discipline); every transition
 * is guarded and every state change appends to an immutable evidence log
 * (INV-5).
 */

/** Pipeline lifecycle states. BLOCKED / VOIDED / BROADCAST_HANDOFF are terminal. */
export type OnchainWritePipelineState =
  | "PREPARED"
  | "SIMULATED"
  | "GATED_ALLOW"
  | "GATED_UNKNOWN"
  | "DIFF_READY"
  | "AUTHORIZED"
  | "RECHECKED"
  | "BROADCAST_HANDOFF"
  | "BLOCKED"
  | "VOIDED";

/** The declared pipeline states, in order (machine input). */
export const PIPELINE_STATES: readonly OnchainWritePipelineState[] = [
  "PREPARED",
  "SIMULATED",
  "GATED_ALLOW",
  "GATED_UNKNOWN",
  "DIFF_READY",
  "AUTHORIZED",
  "RECHECKED",
  "BROADCAST_HANDOFF",
  "BLOCKED",
  "VOIDED",
];

/** The declared pipeline events (machine input). */
export const PIPELINE_EVENTS = [
  "SIMULATE",
  "GATES_ALLOW",
  "GATES_BLOCK",
  "GATES_UNKNOWN",
  "BUILD_DIFF",
  "AUTHORIZE",
  "RECHECK_OK",
  "RECHECK_DRIFT",
  "HANDOFF",
] as const;

export type OnchainWritePipelineEvent = (typeof PIPELINE_EVENTS)[number];

/** One append-only evidence log entry (INV-5). */
export interface PipelineEvidenceEntry {
  readonly at: number;
  readonly state: OnchainWritePipelineState;
  readonly event: string;
  readonly refs: readonly string[];
}

// ---------------------------------------------------------------------------
// Implementation (the declared machine)
// ---------------------------------------------------------------------------

import { defineStateMachine, type StateMachine } from "./pins/index.ts";

/** The per-pipeline machine context (the pipeline instance itself). */
export interface PipelineContext {
  readonly pipeline: unknown;
}

/**
 * The declared onchain-write pipeline machine. Terminal states: BLOCKED,
 * VOIDED, BROADCAST_HANDOFF (no declared recovery — terminality is the
 * law, INV-3/INV-4). Every transition is content of record: the pipeline
 * class logs each applied event into its append-only evidence log.
 */
export const ONCHAIN_WRITE_PIPELINE_MACHINE: StateMachine<
  OnchainWritePipelineState,
  OnchainWritePipelineEvent,
  PipelineContext
> = defineStateMachine<OnchainWritePipelineState, OnchainWritePipelineEvent, PipelineContext>({
  name: "onchain-write-pipeline",
  initial: "PREPARED",
  states: PIPELINE_STATES,
  events: PIPELINE_EVENTS,
  transitions: [
    { from: "PREPARED", on: "SIMULATE", to: "SIMULATED", description: "simulation observation recorded" },
    { from: "PREPARED", on: "GATES_BLOCK", to: "BLOCKED", description: "deterministic BLOCK (terminal)" },
    { from: "PREPARED", on: "GATES_UNKNOWN", to: "GATED_UNKNOWN", description: "unresolvable dimension" },
    { from: "PREPARED", on: "GATES_ALLOW", to: "GATED_ALLOW", description: "all dimensions pass" },
    { from: "SIMULATED", on: "GATES_BLOCK", to: "BLOCKED", description: "deterministic BLOCK (terminal)" },
    { from: "SIMULATED", on: "GATES_UNKNOWN", to: "GATED_UNKNOWN", description: "unresolvable dimension" },
    { from: "SIMULATED", on: "GATES_ALLOW", to: "GATED_ALLOW", description: "all dimensions pass" },
    { from: "GATED_ALLOW", on: "GATES_BLOCK", to: "BLOCKED", description: "re-evaluation BLOCKed (fresh state)" },
    { from: "GATED_ALLOW", on: "GATES_UNKNOWN", to: "GATED_UNKNOWN", description: "re-evaluation unknown" },
    { from: "GATED_ALLOW", on: "GATES_ALLOW", to: "GATED_ALLOW", description: "re-evaluation still allows" },
    { from: "GATED_UNKNOWN", on: "GATES_BLOCK", to: "BLOCKED", description: "new evidence BLOCKed" },
    { from: "GATED_UNKNOWN", on: "GATES_UNKNOWN", to: "GATED_UNKNOWN", description: "still unresolvable" },
    { from: "GATED_UNKNOWN", on: "GATES_ALLOW", to: "GATED_ALLOW", description: "resolved by new evidence" },
    { from: "GATED_ALLOW", on: "BUILD_DIFF", to: "DIFF_READY", description: "readable expected-state diff built" },
    { from: "DIFF_READY", on: "AUTHORIZE", to: "AUTHORIZED", description: "trusted-surface artifact minted + verified" },
    { from: "AUTHORIZED", on: "RECHECK_OK", to: "RECHECKED", description: "pre-broadcast recheck passed" },
    { from: "AUTHORIZED", on: "RECHECK_DRIFT", to: "VOIDED", description: "stale-state invalidation (terminal)" },
    { from: "RECHECKED", on: "HANDOFF", to: "BROADCAST_HANDOFF", description: "signing request handed to the adapter" },
  ],
  terminalStates: ["BLOCKED", "VOIDED", "BROADCAST_HANDOFF"],
});
