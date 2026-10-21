/**
 * RECORDED FIXTURE — the canonical console workspace mission vocabulary
 * as registered by the TL for Phase 10 (P10-B).
 *
 * Recording method (auditable):
 * - The vocabulary below was READ VERBATIM from spec/surface/
 *   CONSOLE-WORKSPACE.md §3/§4/§5 (registered at commit 54f7977) and the
 *   TL's cross-lane compile seam stub carrying the same pinned shapes,
 *   packages/payswap-app/src/console/PaySwapAgentWorkspace.tsx (commit
 *   645a56c2fe8b6580370da4d14ff435f1414a3c82): the four intent
 *   directions, the three draft statuses, the seven lifecycle rungs, the
 *   four event kinds, the intake field bounds, the two store durability
 *   labels, the six store port method names, and the seven §4 typed
 *   prerequisite strings (character-exact, em-dashes included).
 *
 * NOTE FOR THE TL (P10 integration): the PREFERRED drift check is a
 * test-only relative import of packages/surface/src/console-*.ts (the
 * P10-A lane's @payswap/surface console contracts). On this lane's base
 * those modules DO NOT EXIST yet (parallel lane in flight), so the
 * vocabulary is recorded HERE; when P10-A lands, extend
 * test/payswap/pin-fidelity.test.ts to import the surface modules
 * directly and assert equality (mirroring the P7-W2 recorded-fixture →
 * direct-import upgrade path).
 *
 * The desktop's structural mission-intake pins MUST equal this recording
 * — drift fails the battery rather than silently widening a contract.
 */

export const recordedConsoleWorkspaceSourceCommit: string =
  "645a56c2fe8b6580370da4d14ff435f1414a3c82";

export const recordedMissionIntentDirections: readonly string[] = [
  "PAY",
  "RECEIVE",
  "MOVE",
  "CONVERT",
];

export const recordedMissionDraftStatuses: readonly string[] = [
  "DRAFT",
  "INTENT_RECORDED",
  "ARCHIVED",
];

export const recordedMissionLifecycleRungs: readonly string[] = [
  "INTENT",
  "ELIGIBILITY",
  "PLANNING",
  "APPROVAL",
  "EXECUTION",
  "OBSERVATION",
  "EVIDENCE",
];

export const recordedMissionEventKinds: readonly string[] = [
  "CREATED",
  "REVISED",
  "INTENT_VALIDATED",
  "ARCHIVED",
];

export const recordedMissionIntakeBounds: {
  readonly goalStatementMaxLength: number;
  readonly locationHintMaxLength: number;
  readonly noteMaxLength: number;
} = {
  goalStatementMaxLength: 2000,
  locationHintMaxLength: 200,
  noteMaxLength: 2000,
};

export const recordedWorkspaceStoreDurability: readonly string[] = [
  "DESKTOP_PROFILE",
  "BROWSER_PROFILE",
];

export const recordedWorkspaceStorePortMethods: readonly string[] = [
  "listMissions",
  "recordMissionDraft",
  "recordMissionIntent",
  "missionDetail",
  "reviseMissionDraft",
  "archiveMissionDraft",
];

export const recordedLadderPrerequisites: Readonly<Record<string, string>> = {
  INTENT:
    "The intent has not been recorded yet — complete the intake review to record it.",
  ELIGIBILITY:
    "Capability discovery is not configured in this deployment. Missions cannot be evaluated for eligibility until a capability discovery plane exists — nothing here may guess eligibility.",
  PLANNING:
    "No planning plane is configured. Candidate plans are compiled by the economic execution graph when a planning plane exists; this deployment has none — the honest state is planning unavailable, never an invented plan.",
  APPROVAL:
    "No approval plane is configured. Consequential actions require PaySwap authorization — material terms and authority scope — before execution; with no trust plane configured there is nothing to approve and nothing approved.",
  EXECUTION:
    "No execution plane is configured. PaySwap never executes money movement from the console; execution requires the financial protocol with a connected capability, and no capability is connected in this deployment.",
  OBSERVATION:
    "No observations exist. Observations are provider-verified facts recorded by the execution plane; with no execution there is nothing to observe, and UNKNOWN is never rendered as success or failure.",
  EVIDENCE:
    "No evidence records exist. Evidence is produced by reconciliation of executed effects; no effect has been executed.",
};
