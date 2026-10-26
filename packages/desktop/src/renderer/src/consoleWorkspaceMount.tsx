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
 *   cannot drift apart.
 * - STORE PORT: createDesktopWorkspaceStorePort adapts the channel
 *   service to the pinned WorkspaceStorePort (§5 of
 *   spec/surface/CONSOLE-WORKSPACE.md) with durability DESKTOP_PROFILE.
 *   The store holds DEMAND-SIDE MISSION INTENT ONLY — never financial
 *   truth, never authorization, never capability state.
 * (The P15 strip unmounted the workspace COMPONENT — the renderer now
 * boots the ORIGINAL ZCode UI; this module keeps the channel client +
 * the store-port adapter for the agent-led payment UX integration.)
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
  // plan-selection-record; authorization stays minted host-side behind
  // the origin law, ADR-0010 D2 — no approval member exists here).
  "paymentMissionBoard",
  "paymentMissionDetail",
  "paymentMissionSeed",
  "paymentMissionAskNextField",
  "paymentMissionCapture",
  "paymentMissionPresentPreview",
  "paymentMissionRecordPlanSelection",
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

// ---------------------------------------------------------------------------
// The payment-mission wire types (P17-A) — structurally re-declared for
// the renderer: the host DTOs live in src/host/payswap (not renderer-
// importable), so this mirror carries the pinned shapes BY VALUE, the
// established two-sided drift discipline. NO authorization member and
// NO artifact plane exists on this surface (ADR-0010 D2).
// ---------------------------------------------------------------------------

/** The mission direction vocabulary (mirrors the host pin). */
export type PaySwapPaymentMissionDirection = "PAY" | "RECEIVE" | "MOVE" | "CONVERT";

/** The mission status vocabulary (mirrors the host pin). */
export type PaySwapPaymentMissionStatus =
  | "DRAFT"
  | "ACTIVE"
  | "AWAITING_EXTERNAL_RETURN"
  | "PAUSED"
  | "WAITING_FOR_OPPORTUNITIES"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";

/** The append-only event-kind vocabulary (mirrors the host pin: the shared 21 + PLAN_SELECTION_RECORDED). */
export type PaySwapPaymentMissionEventKind =
  | "CREATED" | "RESUMED" | "FIELD_CAPTURED" | "MISSING_FIELD_ASKED" | "VALIDATED"
  | "PREVIEW_PRESENTED" | "AUTHORIZATION_GRANTED" | "AUTHORIZATION_DECLINED"
  | "EXTERNAL_RETURN_VALIDATED" | "EXTERNAL_RETURN_REJECTED" | "ATTEMPT_STARTED"
  | "ATTEMPT_CONFIRMED" | "ATTEMPT_FAILED" | "OUTCOME_UNKNOWN" | "RECONCILED"
  | "CANCELLED" | "EXPIRED" | "WAIT_STARTED" | "WAIT_CRITERIA_RECORDED"
  | "OPPORTUNITY_MATCHED" | "WAIT_EXPIRED" | "PLAN_SELECTION_RECORDED";

/** The exact-money wire shape (integer minor units). */
export interface PaySwapPaymentAmountDto {
  readonly currency: string;
  readonly minorUnits: string;
}

/** One timeline event on the wire (append-only; people-language summary). */
export interface PaySwapPaymentMissionEventDto {
  readonly id: string;
  readonly at: string;
  readonly kind: PaySwapPaymentMissionEventKind;
  readonly summary: string;
  readonly correlationRef?: string;
}

/** The stage-9a plan selection — a RECORD, never an authorization (ADR-0010 D3). */
export interface PaySwapPaymentMissionPlanSelectionDto {
  readonly planId: string;
  readonly viewDigest: string;
  readonly routineId: string;
  readonly routineVersion: string;
  readonly selectedAt: string;
}

/** The compiled 11-key canonical intent (advisory demand record only). */
export interface PaySwapPaymentIntentDto {
  readonly intentId: string;
  readonly principalRef: string;
  readonly origin: { readonly locationRef: string; readonly currency: string; readonly observationRef: string };
  readonly destination: { readonly locationRef: string; readonly currency: string; readonly observationRef: string };
  readonly originAmount: PaySwapPaymentAmountDto;
  readonly arrivalCurrency: string;
  readonly constraints: { readonly maxSettlementMs: number; readonly maxRouteHops: number };
  readonly intentAuthorizationRef: string;
  readonly declaredAt: number;
  readonly expiresAt: number;
  readonly commerceRef: string;
}

/** Field capture state: MISSING until an explicit capture exists. */
export type PaySwapPaymentIntakeFieldState<T> =
  | { readonly status: "MISSING" }
  | { readonly status: "CAPTURED"; readonly value: T };

/** The nine-field intake state (every field explicit; none defaulted). */
export interface PaySwapPaymentIntakeFieldsDto {
  readonly amountAndCurrency: PaySwapPaymentIntakeFieldState<PaySwapPaymentAmountDto>;
  readonly fundingSource: PaySwapPaymentIntakeFieldState<string>;
  readonly recipient: PaySwapPaymentIntakeFieldState<string>;
  readonly countryCorridor: PaySwapPaymentIntakeFieldState<{
    readonly sourceCountry: string;
    readonly destinationCountry: string;
    readonly destinationCurrency: string;
  }>;
  readonly speedDeadline: PaySwapPaymentIntakeFieldState<{ readonly deadlineAt: string }>;
  readonly feeCap: PaySwapPaymentIntakeFieldState<
    | { readonly kind: "CAPPED"; readonly amount: PaySwapPaymentAmountDto }
    | { readonly kind: "UNCAPPED" }
  >;
  readonly purpose: PaySwapPaymentIntakeFieldState<string>;
  readonly privacyCompliance: PaySwapPaymentIntakeFieldState<
    | { readonly kind: "CONSTRAINED"; readonly notes: string }
    | { readonly kind: "NONE_STATED" }
  >;
  readonly partialPaymentPreference: PaySwapPaymentIntakeFieldState<
    | { readonly kind: "REQUIRE_FULL" }
    | { readonly kind: "ALLOW_PARTIAL" }
  >;
}

/** The full mission detail on the wire (attempt COUNT only — the attempt records stay host-side). */
export interface PaySwapPaymentMissionDetailDto {
  readonly id: string;
  readonly direction: PaySwapPaymentMissionDirection;
  readonly goalStatement: string;
  readonly origin: string;
  readonly status: PaySwapPaymentMissionStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly events: readonly PaySwapPaymentMissionEventDto[];
  readonly fields: PaySwapPaymentIntakeFieldsDto;
  readonly intent?: PaySwapPaymentIntentDto;
  readonly previewId?: string;
  readonly planSelection?: PaySwapPaymentMissionPlanSelectionDto;
  readonly attemptCount: number;
}

/** One board row (the payments read model — demand-side facts only). */
export interface PaySwapPaymentMissionBoardItemDto {
  readonly missionId: string;
  readonly direction: PaySwapPaymentMissionDirection;
  readonly goalStatement: string;
  readonly status: PaySwapPaymentMissionStatus;
  readonly hasCompiledIntent: boolean;
  readonly hasPreview: boolean;
  readonly planSelection?: PaySwapPaymentMissionPlanSelectionDto;
  readonly updatedAt: string;
}

/** The gate aggregate on the wire (reasons carried VERBATIM). */
export interface PaySwapPaymentPreviewGatesDto {
  readonly decision: "BLOCK" | "PROCEED";
  readonly decisions: readonly {
    readonly gate: string;
    readonly decision: "BLOCK" | "PROCEED";
    readonly reason: string;
  }[];
  readonly reasons: readonly string[];
}

/** The presented preview on the wire (the typed BLOCK is surfaced honestly, never fabricated away). */
export interface PaySwapPaymentPreviewDto {
  readonly previewId: string;
  readonly missionId: string;
  readonly gates: PaySwapPaymentPreviewGatesDto;
  readonly dispatchable: boolean;
  readonly presentedAt: string;
  readonly planSelection?: PaySwapPaymentMissionPlanSelectionDto;
}

/** The channel seed input (the host pins the origin to COMPOSER_TEXT). */
export interface PaySwapPaymentMissionSeedInputDto {
  readonly direction: PaySwapPaymentMissionDirection;
  readonly goalStatement: string;
}

/** The stage-9a plan-selection input (the host stamps selectedAt). */
export interface PaySwapPaymentPlanSelectionInputDto {
  readonly planId: string;
  readonly viewDigest: string;
  readonly routineId: string;
  readonly routineVersion: string;
}

/**
 * The payswap-desktop channel service as the console mount consumes it.
 * Over the channel every method resolves through a Promise (the proxy
 * marshals calls over the MessagePort); the mission wire types are the
 * pinned §3 shapes carried by @payswap/app.
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
  // The payment-mission plane (P17-A — read/input members only; the
  // authorization/dispatch plane stays host-side, ADR-0010 D2)
  // -----------------------------------------------------------------------
  /** The mission board, newest-updated-first (demand-side facts only). */
  paymentMissionBoard(): Promise<readonly PaySwapPaymentMissionBoardItemDto[]>;
  /** The full mission detail, or null when no such mission exists. */
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

// ---------------------------------------------------------------------------
