/**
 * PaySwap Desktop (P7-W2) — the desktop shell integration seams.
 *
 * The PaySwap product rides the ZCode-derived native shell (Electron):
 * windows, sessions and transports follow the SUBSTRATE's semantics
 * (docs/ZCODE-PLATFORM-BASELINE.md is binding for these platform
 * mechanics). This module records the seams the product composes through:
 *
 * - WINDOW: the product surface binds to the primary desktop window via
 *   the substrate's single window-creation path (createWindow in
 *   src/main/desktopWindowLifecycle.ts); the product declares WHAT it
 *   needs from a window (webContents identity + attachment scope), never
 *   its own window machinery.
 * - SESSION: the product session derives from the substrate's window-host
 *   attachment scope (local vs remote — WindowHostAttachmentScope in
 *   @zcode/shared), with the desktop's own client mode.
 * - TRANSPORT: the product service is exposed over the substrate's RPC
 *   stack (MessagePortProtocol -> ChannelServer -> ProxyChannel.fromService,
 *   with LoggingChannelServer + NetworkTelemetryChannelServer discipline),
 *   registered in the host's ServiceCollection — the same path every
 *   host-owned service takes.
 */

import type {
  DesktopDelegatedMovementRef,
  DesktopDelegationReceipt,
  DesktopJourneyStateView,
  DesktopMissionBoardView,
  DesktopProgressFoldInput,
  DesktopProgressTimelineView,
  DesktopQuoteDisclosureInput,
  DesktopQuoteDisclosureView,
  DesktopSecurityGateInput,
  DesktopSecurityGateView,
  PaySwapDesktopDeploymentFacts,
} from "../product/contracts.js";

// ---------------------------------------------------------------------------
// Channel identity (substrate ServiceChannels convention: kebab-case)
// ---------------------------------------------------------------------------

/**
 * The single service channel the PaySwap Desktop product exposes over the
 * host's ChannelServer (mirrors the substrate's ServiceChannels naming
 * convention — kebab-case, one channel per service).
 */
export const PAYSWAP_DESKTOP_SERVICE_CHANNEL = "payswap-desktop" as const;

// ---------------------------------------------------------------------------
// Session seam (substrate window-host attachment semantics)
// ---------------------------------------------------------------------------

/**
 * The PaySwap session scope — mirrors the substrate's
 * WindowHostAttachmentScope semantics: `local` (the per-window host owns
 * the services) or `remote` (a remote workspace session owns them).
 */
export type PaySwapDesktopSessionScope =
  | { readonly kind: "local" }
  | { readonly kind: "remote"; readonly remoteSessionId: string };

/**
 * The client mode the desktop product session runs under (mirrors the
 * substrate's ZCodeAgentV4ClientMode vocabulary for attachment: the
 * desktop runs "desktop-continuous").
 */
export type PaySwapDesktopClientMode = "desktop-continuous";

/** One PaySwap desktop session (created at service construction). */
export interface PaySwapDesktopSession {
  readonly sessionId: string;
  readonly scope: PaySwapDesktopSessionScope;
  readonly clientMode: PaySwapDesktopClientMode;
  /** When the session was created (ISO-8601 string). */
  readonly createdAt: string;
}

// ---------------------------------------------------------------------------
// Window seam (substrate window semantics — the product has no own window machinery)
// ---------------------------------------------------------------------------

/**
 * What the PaySwap product needs from a desktop window. The window itself
 * is created and owned by the substrate's single window-creation path; this
 * spec is the BINDING contract between the product surface and the shell.
 */
export interface PaySwapDesktopWindowBinding {
  /** The webContents id of the window hosting the product surface. */
  readonly webContentsId: number;
  /** The window label (substrate host-process naming anchor). */
  readonly windowLabel: string;
  /** The attachment scope the host bound for this window. */
  readonly attachmentScope: PaySwapDesktopSessionScope;
}

// ---------------------------------------------------------------------------
// Transport seam (substrate RPC semantics)
// ---------------------------------------------------------------------------

/**
 * The transport law the product service rides (substrate semantics,
 * recorded as the product's binding transport contract):
 * - Port: a MessagePort-like port handed over from the window host
 *   (wrapElectronPort -> MessagePortProtocol);
 * - Server: a ChannelServer wrapped by LoggingChannelServer and
 *   NetworkTelemetryChannelServer (logger discipline + network telemetry
 *   are inherited safeguards — never removed);
 * - Exposure: ProxyChannel.fromService over the registered service
 *   instance, via the host ServiceCollection's exposeOnChannelServer.
 */
export interface PaySwapDesktopTransportSeam {
  readonly kind: "message-port-rpc";
  readonly channelName: typeof PAYSWAP_DESKTOP_SERVICE_CHANNEL;
  /** The logging + telemetry middleware chain is REQUIRED (baseline law). */
  readonly requiresLoggingMiddleware: true;
  readonly requiresNetworkTelemetryMiddleware: true;
}

// ---------------------------------------------------------------------------
// The service contract (what the renderer consumes over the port)
// ---------------------------------------------------------------------------

/**
 * The PaySwap Desktop service — the product surface the renderer consumes
 * over the substrate's service port. Every method is a pure projection or
 * a typed-reference delegation: there is NO method that executes money
 * movement, mints authorization, or writes financial truth (the
 * no-parallel-engine law, enforced structurally).
 */
export interface IPaySwapDesktopService {
  /** The session this service instance serves (window/session seam). */
  readonly session: PaySwapDesktopSession;

  /** The mission board: five outcome actions with honest dispatchability. */
  missionBoard(facts: PaySwapDesktopDeploymentFacts): Promise<DesktopMissionBoardView>;

  /** Fold a quote terms source into the disclosure view (clock explicit). */
  quoteDisclosure(input: DesktopQuoteDisclosureInput): Promise<DesktopQuoteDisclosureView>;

  /** Fold stage observations into the progress timeline view. */
  progressTimeline(input: DesktopProgressFoldInput): Promise<DesktopProgressTimelineView>;

  /** Fold a security gate decision into the people-language view. */
  securityDecision(input: DesktopSecurityGateInput): Promise<DesktopSecurityGateView>;

  /** Derive one journey's honest state from a provider-verified observation. */
  journeyState(
    observation: import("../product/contracts.js").DesktopJourneyObservationInput,
  ): Promise<DesktopJourneyStateView>;

  /**
   * Delegate a money movement via typed reference — the ONLY money-
   * movement affordance on the desktop, and it moves nothing itself: the
   * backend plane that accepts the reference owns execution.
   */
  delegateMoneyMovement(
    movement: DesktopDelegatedMovementRef,
  ): Promise<DesktopDelegationReceipt>;
}

// ---------------------------------------------------------------------------
// Host composition seam (where the product wires into the shell)
// ---------------------------------------------------------------------------

/**
 * The seam the host bootstrap composes the product through. Keeps the
 * substrate's logger discipline: the product logs through the injected
 * host log function (never its own console bypass).
 */
export interface PaySwapDesktopHostSeam {
  /** The session scope the host bound for this product instance. */
  readonly scope: PaySwapDesktopSessionScope;
  /**
   * The host log discipline (writeHostLog-shaped): level + message + args
   * — the product never bypasses it with console calls.
   */
  readonly log: (level: "info" | "warn" | "error", message: string, ...args: unknown[]) => void;
}

/** Composition diagnostics returned by the host registration helper. */
export interface PaySwapDesktopCompositionRecord {
  readonly channelName: typeof PAYSWAP_DESKTOP_SERVICE_CHANNEL;
  readonly sessionId: string;
  readonly scopeKind: PaySwapDesktopSessionScope["kind"];
  readonly clientMode: PaySwapDesktopClientMode;
  readonly transport: PaySwapDesktopTransportSeam;
}
