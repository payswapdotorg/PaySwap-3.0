/**
 * PaySwap Desktop (P7-W2 + P10-B) — the shell integration barrel.
 *
 * Window/session/transport seams per the ZCode-derived substrate, the
 * product service contract (console workspace members included since
 * P10-B), and the host composition root.
 */

export {
  PAYSWAP_DESKTOP_SERVICE_CHANNEL,
} from "./contracts.js";
export type {
  PaySwapDesktopSessionScope,
  PaySwapDesktopClientMode,
  PaySwapDesktopSession,
  PaySwapDesktopWindowBinding,
  PaySwapDesktopTransportSeam,
  IPaySwapDesktopService,
  PaySwapDesktopHostSeam,
  PaySwapDesktopCompositionRecord,
} from "./contracts.js";

export {
  IPaySwapDesktopService as IPaySwapDesktopServiceDescriptor,
  registerPaySwapDesktopService,
  PAYSWAP_DESKTOP_TRANSPORT_SEAM,
  WORKSPACE_STORE_NODE_FILE_SYSTEM,
  PAYMENTS_STORE_NODE_FILE_SYSTEM,
  composePaymentMissionRuntime,
  derivePaymentsStoreDirectory,
} from "./composition.js";

export { createPaySwapDesktopService } from "./service.js";
export type { PaySwapDesktopServiceOptions } from "./service.js";
export {
  ConnectionPlaneNotConfiguredError,
  PaymentPlaneNotConfiguredError,
  SessionModelCatalogNotConfiguredError,
} from "./service.js";
// (P21-D Gap C, ADR-0014 D4) The session-model-catalog seam: the PURE
// substrate-settings→DTO mapping + the channel member over the injected
// substrate read + the agent-service-backed product wiring.
export {
  sessionModelCatalogFromSettings,
  type SessionModelCatalogEntryDto,
} from "./session-model-catalog.js";
export {
  createAbsentSessionModelCatalogChannelMembers,
  createSessionModelCatalogChannelMembers,
} from "./session-model-members.js";
export type { SessionModelCatalogChannelDeps } from "./session-model-members.js";
export { createSubstrateSessionSettingsRead } from "./session-model-substrate-read.js";
export { createPaymentMissionChannelMembers } from "./payment-mission-members.js";
export type { PaymentMissionChannelDeps, PaymentMissionChannelMemberSurface } from "./payment-mission-members.js";
// (P21-A, ADR-0014 D5) The connection-ACTIVATION members (the
// Flutterwave/Paystack key-entry verbs + the host-side REAL probe
// runner) + the probe DTO/vocabulary surface.
export { createConnectionProbeChannelMembers } from "../connections/probe-members.js";
export type { ConnectionProbeChannelDeps } from "../connections/probe-members.js";
export {
  PAYSWAP_PROBE_PROVIDER_IDS,
  CONNECTION_PROBE_OUTCOME_KINDS,
  CONNECTION_PROBE_EVIDENCE_TIERS,
  CONNECTION_PROBE_KEY_CLASSES,
  CONNECTION_PROBE_OPERATIONS,
  CONNECTION_PROBE_HONEST_NOTES,
  type PaySwapProbeProviderId,
  type ConnectionProbeOutcomeKind,
  type ConnectionProbeEvidenceTier,
  type ConnectionProbeKeyClass,
  type ConnectionProbeResultDto,
  type ConnectionProbeOutcomeDto,
} from "../connections/probe-contracts.js";
export { openProbeEvidenceStore } from "../connections/probe-evidence.js";
export type { ProbeEvidenceRecord, ProbeEvidenceInput, ProbeEvidenceStore } from "../connections/probe-evidence.js";
// (P21-A, ADR-0014 D6/D8) The connection→capability bridge + the
// gate-environment composition seam + the lane-aware REAL kernel
// composition.
export {
  BRIDGE_PROVIDER_OBSERVATION_TIER,
  BRIDGE_READ_ONLY_OPERATION_CLASSES,
  BRIDGE_STRIPE_SANDBOX_EXECUTION_OPERATION_CLASSES,
  BRIDGE_OBSERVATION_FRESHNESS_POLICY,
  deriveConnectionCapabilityBridge,
  type BridgeConnectedInstance,
  type BridgeCapabilityObservation,
  type BridgeDerivation,
} from "../connections/capability-bridge.js";
export {
  DECLARED_STRIPE_TEST_CORRIDOR,
  createGateEnvironmentFromConnections,
  type DeclaredTestCorridorInput,
} from "../connections/gate-environment.js";
export {
  createLaneAwareExecutionAuthority,
  createLaneAwareStripeReadBack,
  LANE_NOT_WIRED_REASON_PREFIX,
  type LaneAwareExecutionAuthorityOptions,
  type LaneAwareConnectionSeam,
} from "../payments/execution-lane-composition.js";
// (P21-A, ADR-0014 D6) The labeled TEST_DATA merchant directory.
export {
  MERCHANT_DIRECTORY_EVIDENCE_TIER,
  listMerchantDirectoryEntries,
  findMerchantDirectoryEntry,
  type MerchantDirectoryEntry,
} from "../payments/merchant-directory.js";
// (P18-A, ADR-0011 D2/D3) The approval members + the attempt-state projection.
export { createPaymentApprovalChannelMembers, projectAttemptStates } from "./approval-members.js";
// (P19-A, ADR-0012 D1/D2) The dispatch members (the armed-effect read + the lane-choice act).
export { createPaymentDispatchChannelMembers } from "./dispatch-members.js";
export type { PaymentDispatchChannelDeps } from "./dispatch-members.js";
// (P20-A, ADR-0013 D1/D2/D3) The reconciliation members (the pending read + the evidence act).
export {
  CHANNEL_RECONCILIATION_ORIGIN,
  CHANNEL_RECONCILIATION_PRINCIPAL,
  createPaymentReconciliationChannelMembers,
} from "./reconcile-members.js";
// (P21-D reviewer-gate, Gap C) The verification member (the single-act
// authoritative read-back) + the read-back port surface.
export {
  createAbsentPaymentVerifyChannelMembers,
  createPaymentVerifyChannelMembers,
} from "./verify-members.js";
export type { PaymentVerifyChannelDeps } from "./verify-members.js";
export type {
  IPaySwapDesktopVerifyMembers,
  PaymentMissionVerificationOutcomeDto,
} from "./verify-contracts.js";
export {
  createStripeReadBack,
  type StripeReadBackPort,
  type StripeReadBackResult,
  type StripeReadBackOptions,
} from "../payments/stripe-read-back.js";
export {
  projectAttemptVerification,
  type AttemptVerificationDecision,
} from "../payments/attempt-verification.js";
export { createWorkspaceStoreChannelMembers } from "./workspace-store-members.js";
export type { WorkspaceStoreChannelDeps, WorkspaceStoreChannelMembers } from "./workspace-store-members.js";
export {
  PAYMENT_ATTEMPT_OUTCOMES,
  type PaymentAttemptOutcome,
  type PaymentAuthorizationRequestDto,
  type PaymentAuthorizationResolutionDto,
  type PaymentAuthorizationScopeDto,
  type PaymentMissionAttemptStateDto,
  type PaymentDispatchLaneDto,
  type PaymentMissionArmedEffectDto,
  type PaymentMissionDispatchOutcomeDto,
  type PaymentMissionPendingAttemptDto,
  type PaymentMissionPendingReconciliationDto,
  type PaymentMissionReconcileEvidenceDto,
  type PaymentMissionReconcileInputDto,
  type PaymentMissionReconciliationOutcomeDto,
  type PaymentReconciliationSourceKind,
} from "./payment-mission-contracts.js";
export { PAYMENT_RECONCILIATION_SOURCE_KINDS } from "./payment-mission-contracts.js";
export {
  resolveDispatchLanes,
  eligibleLanesOf,
  LIVE_LANE_INELIGIBLE_REASON,
  type DispatchLane,
  type DispatchLaneCandidateRecord,
  type DispatchLaneCandidateRecordsPort,
} from "../payments/dispatch-lane-resolver.js";
