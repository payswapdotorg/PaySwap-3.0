/**
 * @zcode/desktop — the renderer-side console workspace mount (P10-B).
 *
 * The glue that connects the PaySwap Agent Workspace (the @payswap/app
 * console component) to the DESKTOP_PROFILE workspace store living in
 * the host process:
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
 * - WORKSPACE COMPONENT: DesktopConsoleWorkspace composes the
 *   PaySwapAgentWorkspace (the TL seam stub today; P10-C replaces the
 *   implementation) with the console navigation adapter and the
 *   back-to-product affordance over the SAME injected hash location the
 *   product surface uses — hash navigation never reloads the renderer.
 */

import { useMemo } from "react";
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
import { PaySwapAgentWorkspace } from "@payswap/app";
import type { DesktopHashLocation } from "./payswapDesktop.js";
import { createConsoleWorkspaceNavigation } from "./payswapDesktop.js";

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
// The workspace mount component (the console branch of the switch)
// ---------------------------------------------------------------------------

/**
 * The PaySwap Agent Workspace as mounted on the desktop console surface:
 * the @payswap/app component with the console navigation adapter (the
 * "/console…" hash path space), the DESKTOP_PROFILE store port over the
 * payswap-desktop channel, and the back-to-product affordance — all over
 * the SAME injected hash location the product surface switch uses.
 */
export function DesktopConsoleWorkspace({
  location,
  services,
}: {
  readonly location: DesktopHashLocation;
  readonly services: DesktopConsoleChannelServices;
}) {
  const navigation = useMemo(() => createConsoleWorkspaceNavigation(location), [location]);
  const store = useMemo(() => createDesktopWorkspaceStorePort(services), [services]);
  return (
    <PaySwapAgentWorkspace
      navigation={navigation}
      store={store}
      backToProduct={{ label: "PaySwap", onActivate: () => location.setHash("#/") }}
    />
  );
}
