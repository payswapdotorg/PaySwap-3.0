/**
 * PaySwap Desktop (P7-W2 + P10-B) — the host composition root.
 *
 * Registers the PaySwap Desktop product service into the substrate host's
 * ServiceCollection, following the substrate's own service-exposure path
 * (ZCode Platform Baseline: platform DI between environments):
 *
 * - DESCRIPTOR: one ServiceDescriptor on the kebab-case channel
 *   "payswap-desktop" (the substrate's ServiceChannels convention);
 * - EXPOSURE: the host's exposeOnChannelServer exposes the registered
 *   service through ProxyChannel.fromService over the ChannelServer —
 *   wrapped by LoggingChannelServer + NetworkTelemetryChannelServer
 *   (inherited safeguards; never removed);
 * - SESSION: the product session derives from the window-host attachment
 *   scope the host bound (local vs remote — substrate semantics);
 * - LOGGER: the product logs through the host seam (writeHostLog-shaped);
 * - WORKSPACE STORE (P10-B): when the seam carries a storeDirectory, the
 *   node:fs binding for the JSON snapshot persistence is injected HERE —
 *   the composition edge — keeping the pure store modules fs-free.
 *
 * The renderer consumes the service over its service port exactly like
 * every other host-owned service — no bespoke transport exists.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createServiceDescriptor, type ServiceCollection } from "@zcode/services";

import type {
  IPaySwapDesktopService as IPaySwapDesktopServiceContract,
  PaySwapDesktopCompositionRecord,
  PaySwapDesktopHostSeam,
  PaySwapDesktopTransportSeam,
} from "./contracts.js";
import { PAYSWAP_DESKTOP_SERVICE_CHANNEL } from "./contracts.js";
import { createPaySwapDesktopService, type PaySwapDesktopServiceOptions } from "./service.js";
import { openPaymentMissionStore } from "../payments/payment-mission-store.js";
import {
  createPaymentMissionRuntime,
  type PaymentMissionRuntime,
} from "../payments/payment-mission-runtime.js";
import { createUnwiredExecutionAuthority } from "../payments/execution-authority.js";

/**
 * The node:fs binding for the DESKTOP_PROFILE workspace store snapshot,
 * injected at THIS composition edge (the pure persistence module takes an
 * injected {readFile, writeFile, mkdir} seam and never imports fs).
 */
export const WORKSPACE_STORE_NODE_FILE_SYSTEM = {
  readFile: (path: string) => readFile(path, "utf8"),
  writeFile: (path: string, data: string) => writeFile(path, data, "utf8"),
  mkdir: async (path: string) => {
    await mkdir(path, { recursive: true });
  },
} as const;

/**
 * The node:fs binding for the payment-mission store snapshot (the same
 * injected seam shape — the pure payments-store module never imports
 * fs; P17-A).
 */
export const PAYMENTS_STORE_NODE_FILE_SYSTEM = {
  readFile: (path: string) => readFile(path, "utf8"),
  writeFile: (path: string, data: string) => writeFile(path, data, "utf8"),
  mkdir: async (path: string) => {
    await mkdir(path, { recursive: true });
  },
} as const;

/**
 * Derive the sibling payments directory under the same user-data root
 * as the workspace store (PAYSWAP_WORKSPACE_STORE_DIR is
 * <userData>/workspace → <userData>/payments). The host bootstrap has
 * no node:path import; this edge owns the derivation (P17-A).
 */
export function derivePaymentsStoreDirectory(workspaceStoreDirectory: string): string {
  return join(dirname(workspaceStoreDirectory), "payments");
}

/**
 * Compose the payment-mission runtime at this edge (the p14 script
 * precedent, scripts/p14/a1-stripe-execution-real-flow-e2e.ts:135-157):
 * open the durable store over the injected node:fs under the seam's
 * payments directory, compose the runtime with the HONEST UNWIRED
 * execution authority (the deployment fact — the real kernel is a TL
 * integration), and run recoverInterruptions ONCE at composition,
 * before any channel member can dispatch. Returns undefined when the
 * seam carries no payments directory (the runtime stays un-injected
 * and the channel members fail closed with the typed error — the
 * workspace-store posture).
 */
export async function composePaymentMissionRuntime(
  seam: PaySwapDesktopHostSeam,
  log: (level: "info" | "warn" | "error", message: string) => void,
): Promise<PaymentMissionRuntime | undefined> {
  const directory = seam.paymentsStoreDirectory?.trim();
  if (directory === undefined || directory.length === 0) {
    log("warn", "payswap-desktop: payment-mission plane NOT composed (no payments store directory on the seam) — payment-mission channel members fail closed");
    return undefined;
  }
  const store = await openPaymentMissionStore({
    fileSystem: PAYMENTS_STORE_NODE_FILE_SYSTEM,
    directory,
  });
  const runtime = createPaymentMissionRuntime({
    store,
    // The honest unwired default: every dispatch fails closed, typed
    // (NO_AUTHORITY_WIRED) — nothing simulates an execution.
    executionAuthority: createUnwiredExecutionAuthority(),
    // The trust plane owns identity; this deployment's host process
    // serves the single local user (the composition edge supplies it).
    principalRef: "principal:payswap-desktop-local",
    log,
  });
  // ONCE at composition: the honest restart sweep over any write-ahead
  // left interrupted by a previous process (a no-op is truthful here).
  await runtime.dispatch.recoverInterruptions(new Date().toISOString());
  log("info", `payswap-desktop: payment-mission runtime composed (directory ${directory})`);
  return runtime;
}

/**
 * The service descriptor — the substrate's channel-identity pattern
 * (createServiceDescriptor over a kebab-case channel name; the interface +
 * const share one name in the substrate convention).
 */
export const IPaySwapDesktopService = createServiceDescriptor<IPaySwapDesktopServiceContract>(
  PAYSWAP_DESKTOP_SERVICE_CHANNEL,
);

/** The transport law the product service rides (recorded, binding). */
export const PAYSWAP_DESKTOP_TRANSPORT_SEAM: PaySwapDesktopTransportSeam = Object.freeze({
  kind: "message-port-rpc",
  channelName: PAYSWAP_DESKTOP_SERVICE_CHANNEL,
  requiresLoggingMiddleware: true,
  requiresNetworkTelemetryMiddleware: true,
});

/**
 * Compose + register the PaySwap Desktop product into a host service
 * collection. Returns the composition record (auditable: channel, session,
 * scope, transport). Pure registration: no window is created, no port is
 * opened — exposure follows the host's existing service-port path.
 * ASYNC since P17-A: the payment-mission runtime (when the seam carries
 * a payments directory) is composed and interruption-recovered HERE,
 * before the service is registered — the p14 script precedent.
 */
export async function registerPaySwapDesktopService(
  services: ServiceCollection,
  seam: PaySwapDesktopHostSeam,
  options: PaySwapDesktopServiceOptions = {},
): Promise<PaySwapDesktopCompositionRecord> {
  // The composition edge injects node:fs when a store directory is
  // configured and no file system was injected (tests inject fakes).
  const composedOptions: PaySwapDesktopServiceOptions =
    seam.storeDirectory !== undefined && options.workspaceStoreFileSystem === undefined
      ? { ...options, workspaceStoreFileSystem: WORKSPACE_STORE_NODE_FILE_SYSTEM }
      : options;
  const paymentMissionRuntime = await composePaymentMissionRuntime(seam, (level, message) => {
    seam.log(level, message);
  });
  const service = createPaySwapDesktopService(
    seam,
    paymentMissionRuntime === undefined
      ? composedOptions
      : { ...composedOptions, paymentMissionRuntime },
  );
  services.register(IPaySwapDesktopService, service);
  const record: PaySwapDesktopCompositionRecord = {
    channelName: PAYSWAP_DESKTOP_SERVICE_CHANNEL,
    sessionId: service.session.sessionId,
    scopeKind: seam.scope.kind,
    clientMode: service.session.clientMode,
    transport: PAYSWAP_DESKTOP_TRANSPORT_SEAM,
  };
  seam.log(
    "info",
    "payswap-desktop: product registered into host service collection",
    JSON.stringify({
      channel: record.channelName,
      scopeKind: record.scopeKind,
      transport: record.transport.kind,
      workspaceStoreConfigured: seam.storeDirectory !== undefined,
      paymentMissionPlaneConfigured: paymentMissionRuntime !== undefined,
    }),
  );
  return record;
}
