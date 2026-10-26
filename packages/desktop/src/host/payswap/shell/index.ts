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
export { ConnectionPlaneNotConfiguredError, PaymentPlaneNotConfiguredError } from "./service.js";
export { createPaymentMissionChannelMembers } from "./payment-mission-members.js";
export type { PaymentMissionChannelDeps, PaymentMissionChannelMemberSurface } from "./payment-mission-members.js";
// (P18-A, ADR-0011 D2/D3) The approval members + the attempt-state projection.
export { createPaymentApprovalChannelMembers, projectAttemptStates } from "./approval-members.js";
export { createWorkspaceStoreChannelMembers } from "./workspace-store-members.js";
export type { WorkspaceStoreChannelDeps, WorkspaceStoreChannelMembers } from "./workspace-store-members.js";
export {
  PAYMENT_ATTEMPT_OUTCOMES,
  type PaymentAttemptOutcome,
  type PaymentAuthorizationRequestDto,
  type PaymentAuthorizationResolutionDto,
  type PaymentAuthorizationScopeDto,
  type PaymentMissionAttemptStateDto,
} from "./payment-mission-contracts.js";
