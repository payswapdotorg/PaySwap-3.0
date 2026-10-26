/**
 * @zcode/desktop — the renderer-side payswap-desktop channel client
 * (P10-B; the P15 strip keeps the plumbing, drops the workspace UI).
 *
 * The glue that connects a renderer consumer to the DESKTOP_PROFILE
 * workspace store living in the host process:
 *
 * - CHANNEL CLIENT: the host exposes the "payswap-desktop" service over
 *   the substrate's message-port RPC (ChannelServer → the renderer's
 *   ChannelClient). The host-side descriptor lives in
 *   src/host/payswap/shell/contracts.ts, which is NOT importable from
 *   the renderer — so this module RE-DECLARES the client descriptor
 *   here (the substrate's client-descriptor pattern, mirrored), and
 *   test/payswap/desktop-console-client.test.ts asserts the member sets
 *   cannot drift apart. The payment-mission WIRE TYPES are mirrored in
 *   ./consolePaymentMissionWire.ts (split at P18-A for the file law)
 *   and re-exported below.
 * - STORE PORT: createDesktopWorkspaceStorePort adapts the channel
 *   service to the pinned WorkspaceStorePort (§5 of
 *   spec/surface/CONSOLE-WORKSPACE.md) with durability DESKTOP_PROFILE.
 *   The store holds DEMAND-SIDE MISSION INTENT ONLY — never financial
 *   truth, never authorization, never capability state.
 * (The P15 strip unmounted the workspace COMPONENT — the renderer now
 *   boots the ORIGINAL ZCode UI; this module keeps the channel client +
 *   the store-port adapter for the agent-led payment UX integration.)
 */

import type { IChannelClient } from "@zcode/rpc";
import { ChannelClient, MessagePortProtocol, ProxyChannel } from "@zcode/rpc";
import { RemoteServiceAccess } from "@zcode/client";
import type {
  MissionDetail,
  MissionIntakeInput,
  MissionRecord,
  MissionSummary,
  WorkspaceStorePort,
} from "@payswap/app";
import type {
  PaySwapPaymentAuthorizationRequestDto,
  PaySwapPaymentAuthorizationResolutionDto,
  PaySwapPaymentMissionArmedEffectDto,
  PaySwapPaymentMissionBoardItemDto,
  PaySwapPaymentMissionDetailDto,
  PaySwapPaymentMissionSeedInputDto,
  PaySwapPaymentDispatchOutcomeDto,
  PaySwapPaymentPlanSelectionInputDto,
  PaySwapPaymentPreviewDto,
} from "./consolePaymentMissionWire.js";

// The payment-mission wire types (the pinned host DTO mirrors, split to
// ./consolePaymentMissionWire.ts at P18-A) — re-exported so the module's
// established import surface is unchanged.
export type {
  PaySwapPaymentMissionDirection,
  PaySwapPaymentMissionStatus,
  PaySwapPaymentMissionEventKind,
  PaySwapPaymentAmountDto,
  PaySwapPaymentMissionEventDto,
  PaySwapPaymentMissionPlanSelectionDto,
  PaySwapPaymentIntentDto,
  PaySwapPaymentIntakeFieldState,
  PaySwapPaymentIntakeFieldsDto,
  PaySwapPaymentMissionDetailDto,
  PaySwapPaymentMissionBoardItemDto,
  PaySwapPaymentPreviewGatesDto,
  PaySwapPaymentPreviewDto,
  PaySwapPaymentMissionSeedInputDto,
  PaySwapPaymentPlanSelectionInputDto,
  PaySwapPaymentAuthorizationScopeDto,
  PaySwapPaymentAuthorizationRequestDto,
  PaySwapPaymentAuthorizationResolutionDto,
  PaySwapPaymentAttemptOutcome,
  PaySwapPaymentMissionAttemptStateDto,
  PaySwapPaymentDispatchLaneDto,
  PaySwapPaymentMissionArmedEffectDto,
  PaySwapPaymentDispatchOutcomeDto,
} from "./consolePaymentMissionWire.js";

// ---------------------------------------------------------------------------
// The re-declared client descriptor (renderer-reachable; drift-tested)
// ---------------------------------------------------------------------------

/**
 * The payswap-desktop channel identity, re-declared for the renderer
 * (mirrors PAYSWAP_DESKTOP_SERVICE_CHANNEL in the host contracts; the
 * substrate convention: one kebab-case channel per service).
 */
export const PAYSWAP_DESKTOP_SERVICE_CHANNEL_NAME = "payswap-desktop" as const;

/**
 * The full payswap-desktop service member set as the renderer knows it
 * (drift-checked against the host IPaySwapDesktopService by
 * test/payswap/desktop-console-client.test.ts — a mismatch fails the
 * build rather than silently widening the channel).
 */
export const PAYSWAP_DESKTOP_CLIENT_MEMBERS = [
  "session",
  "missionBoard",
  "quoteDisclosure",
  "progressTimeline",
  "securityDecision",
  "journeyState",
  "delegateMoneyMovement",
  "deploymentFacts",
  "workspaceListMissions",
  "workspaceRecordMissionDraft",
  "workspaceRecordMissionIntent",
  "workspaceMissionDetail",
  "workspaceReviseMissionDraft",
  "workspaceArchiveMissionDraft",
  "workspaceStoreHealth",
  // P13-B connection-plane members (registry/records/setup-seed/key
  // seal/probe-evidence/callback-consume/revocation — connection
  // orchestration only, never money movement).
  "connectionRegistry",
  "connectionStatuses",
  "connectionSeedSetup",
  "connectionSubmitStripeRestrictedKey",
  "connectionRecordVerificationOutcome",
  "connectionConsumeProviderCallback",
  "connectionRevoke",
  // P17-A payment-mission members (read/input verbs only — board /
  // detail / seed / ask-next-field / capture / preview-present /
  // plan-selection-record).
  "paymentMissionBoard",
  "paymentMissionDetail",
  "paymentMissionSeed",
  "paymentMissionAskNextField",
  "paymentMissionCapture",
  "paymentMissionPresentPreview",
  "paymentMissionRecordPlanSelection",
  // P18-A approval members (ADR-0011 D2 — the approval act crosses as
  // edge-pinned members: the origin + principal are pinned HOST-SIDE,
  // the renderer supplies ONLY requestId + APPROVE|DECLINE, and the
  // authorization artifact NEVER crosses the channel).
  "paymentMissionRequestApproval",
  "paymentMissionResolveApproval",
  // P19-A dispatch members (ADR-0012 D1 — the dispatch act crosses as
  // the armed-effect READ + the lane-choice ACT: the eligible set
  // recomputes HOST-SIDE at act time, the artifact/operation/mode
  // resolve HOST-SIDE, the outcome carries facts only).
  "paymentMissionArmedEffect",
  "paymentMissionDispatch",
] as const;

/**
 * The host-computed deployment facts, structurally re-declared for the
 * renderer (the host type is not renderer-importable). Facts about
 * configured planes — never renderer-invented.
 */
export interface PaySwapDesktopClientDeploymentFacts {
  readonly economicIntakeConfigured: boolean;
  readonly capabilityObservationsAvailable: boolean;
  readonly merchantCheckoutContextBound: boolean;
  readonly providerObservationsAvailable: boolean;
  readonly delegationPlaneReachable: boolean;
}

/**
 * The payswap-desktop channel service as the console mount consumes it.
 * Over the channel every method resolves through a Promise (the proxy
 * marshals calls over the MessagePort); the mission wire types are the
 * pinned shapes mirrored in ./consolePaymentMissionWire.ts.
 */
export interface IPaySwapDesktopClientService {
  /** The host-computed honest deployment facts (all-unconfigured truth today). */
  deploymentFacts(): Promise<PaySwapDesktopClientDeploymentFacts>;
  /** The §5 store surface (demand-side mission intent only). */
  workspaceListMissions(): Promise<readonly MissionSummary[]>;
  workspaceRecordMissionDraft(input: MissionIntakeInput, now: string): Promise<MissionRecord>;
  workspaceRecordMissionIntent(id: string, now: string): Promise<MissionRecord>;
  workspaceMissionDetail(id: string): Promise<MissionDetail | null>;
  workspaceReviseMissionDraft(
    id: string,
    input: MissionIntakeInput,
    now: string,
  ): Promise<MissionRecord>;
  workspaceArchiveMissionDraft(id: string, now: string): Promise<MissionRecord>;
  /** The typed store health report (quarantine surfaced, never dropped). */
  workspaceStoreHealth(): Promise<{
    readonly durability: "DESKTOP_PROFILE";
    readonly durabilityNote: string;
    readonly directory: string;
    readonly snapshotFile: string;
    readonly missionCount: number;
    readonly nextId: number;
    readonly quarantinedCount: number;
    readonly quarantine: readonly {
      readonly index: number;
      readonly recordId: string | null;
      readonly reason: string;
      readonly rawExcerpt: string;
    }[];
  }>;
  // -----------------------------------------------------------------------
  // The payment-mission plane (P17-A read/input members + the P18-A
  // approval members; ADR-0011 D2 — the origin + principal are pinned
  // host-side at the channel edge, the artifact never crosses, and the
  // dispatch act stays host-side per D3)
  // -----------------------------------------------------------------------
  /** The mission board, newest-updated-first (demand-side facts only). */
  paymentMissionBoard(): Promise<readonly PaySwapPaymentMissionBoardItemDto[]>;
  /** The full mission detail (attempt STATES + COUNT — no artifact plane), or null. */
  paymentMissionDetail(missionId: string): Promise<PaySwapPaymentMissionDetailDto | null>;
  /** Seed-or-resume a mission (the host pins the origin to COMPOSER_TEXT). */
  paymentMissionSeed(input: PaySwapPaymentMissionSeedInputDto): Promise<{
    readonly missionId: string;
    readonly action: "CREATED" | "RESUMED";
  }>;
  /** Ask for the next missing intake field, or null when intake is complete. */
  paymentMissionAskNextField(
    missionId: string,
  ): Promise<{ readonly fieldId: string; readonly question: string } | null>;
  /** Capture one intake field (fail-closed validation) → the updated detail. */
  paymentMissionCapture(
    missionId: string,
    fieldId: string,
    value: unknown,
  ): Promise<PaySwapPaymentMissionDetailDto>;
  /** Present the preview over the honest empty gate environment (typed BLOCK surfaced honestly). */
  paymentMissionPresentPreview(missionId: string): Promise<PaySwapPaymentPreviewDto | null>;
  /** Record the stage-9a plan selection (a RECORD, never an authorization). */
  paymentMissionRecordPlanSelection(
    missionId: string,
    input: PaySwapPaymentPlanSelectionInputDto,
  ): Promise<PaySwapPaymentMissionDetailDto>;
  /**
   * Mint the scoped authorization request over the mission's persisted
   * preview (ADR-0011 D2) — the scope the operator decides against; no
   * artifact field exists on the request or any successor shape.
   */
  paymentMissionRequestApproval(
    missionId: string,
  ): Promise<PaySwapPaymentAuthorizationRequestDto>;
  /**
   * Resolve a pending request (ADR-0011 D2): the renderer supplies ONLY
   * the requestId + APPROVE|DECLINE — the origin (PREVIEW_UI_ACT) and
   * the principal are pinned host-side at the channel edge.
   */
  paymentMissionResolveApproval(
    requestId: string,
    decision: "APPROVE" | "DECLINE",
  ): Promise<PaySwapPaymentAuthorizationResolutionDto>;
  /**
   * The armed-effect READ (P19-A, ADR-0012 D1): the armed card — the
   * armed truth, the scope + expiry echo when armed, the verbatim
   * not-armed reason when not, and the resolved executing lanes. No
   * artifactId exists on the card (the artifact never crosses).
   */
  paymentMissionArmedEffect(missionId: string): Promise<PaySwapPaymentMissionArmedEffectDto>;
  /**
   * The dispatch ACT (P19-A, ADR-0012 D1): the operator-picked lane —
   * a CHOICE, never a grant. The eligible set recomputes HOST-SIDE at
   * act time (an outside connectionRef is a typed refusal); the
   * artifact, the operation and the INV-25 mode resolve HOST-SIDE; the
   * outcome carries facts only (kind, attemptId, summary).
   */
  paymentMissionDispatch(
    missionId: string,
    connectionRef: string,
  ): Promise<PaySwapPaymentDispatchOutcomeDto>;
}

/** What the renderer needs from its service connection for the console. */
export interface DesktopConsoleChannelServices {
  readonly payswapDesktopService: IPaySwapDesktopClientService;
}

/**
 * The renderer service access: the substrate's RemoteServiceAccess (every
 * base workspace service proxy, untouched) extended with the
 * payswap-desktop channel proxy built from the SAME ChannelClient — one
 * protocol per port, exactly like connectViaMessagePort composes it.
 */
export class DesktopConsoleServiceAccess extends RemoteServiceAccess
  implements DesktopConsoleChannelServices
{
  readonly payswapDesktopService: IPaySwapDesktopClientService;

  constructor(channelClient: IChannelClient) {
    super(channelClient);
    this.payswapDesktopService = ProxyChannel.toService<IPaySwapDesktopClientService>(
      channelClient.getChannel(PAYSWAP_DESKTOP_SERVICE_CHANNEL_NAME),
    );
  }
}

/**
 * Connect the renderer's base services + the payswap-desktop console
 * channel over one MessagePort (mirrors @zcode/client's
 * connectViaMessagePort: MessagePortProtocol → ChannelClient →
 * RemoteServiceAccess, plus the one extra channel proxy).
 */
export function connectDesktopConsoleServices(port: MessagePort): DesktopConsoleServiceAccess {
  return new DesktopConsoleServiceAccess(new ChannelClient(new MessagePortProtocol(port)));
}

// ---------------------------------------------------------------------------
// The WorkspaceStorePort adapter (§5 — durability DESKTOP_PROFILE)
// ---------------------------------------------------------------------------

/**
 * The DESKTOP_PROFILE WorkspaceStorePort: a thin delegator to the host
 * service channel. Ids are assigned by the host; persistence lives in
 * the host; the renderer invents nothing.
 */
export function createDesktopWorkspaceStorePort(
  services: DesktopConsoleChannelServices,
): WorkspaceStorePort {
  const channel = services.payswapDesktopService;
  return {
    durability: "DESKTOP_PROFILE",
    listMissions: () => channel.workspaceListMissions(),
    recordMissionDraft: (input, now) => channel.workspaceRecordMissionDraft(input, now),
    recordMissionIntent: (id, now) => channel.workspaceRecordMissionIntent(id, now),
    missionDetail: (id) => channel.workspaceMissionDetail(id),
    reviseMissionDraft: (id, input, now) => channel.workspaceReviseMissionDraft(id, input, now),
    archiveMissionDraft: (id, now) => channel.workspaceArchiveMissionDraft(id, now),
  };
}
