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
import { createServiceDescriptor, type ServiceCollection } from "@zcode/services";

import type {
  IPaySwapDesktopService as IPaySwapDesktopServiceContract,
  PaySwapDesktopCompositionRecord,
  PaySwapDesktopHostSeam,
  PaySwapDesktopTransportSeam,
} from "./contracts.js";
import { PAYSWAP_DESKTOP_SERVICE_CHANNEL } from "./contracts.js";
import { createPaySwapDesktopService, type PaySwapDesktopServiceOptions } from "./service.js";

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
 */
export function registerPaySwapDesktopService(
  services: ServiceCollection,
  seam: PaySwapDesktopHostSeam,
  options: PaySwapDesktopServiceOptions = {},
): PaySwapDesktopCompositionRecord {
  // The composition edge injects node:fs when a store directory is
  // configured and no file system was injected (tests inject fakes).
  const composedOptions: PaySwapDesktopServiceOptions =
    seam.storeDirectory !== undefined && options.workspaceStoreFileSystem === undefined
      ? { ...options, workspaceStoreFileSystem: WORKSPACE_STORE_NODE_FILE_SYSTEM }
      : options;
  const service = createPaySwapDesktopService(seam, composedOptions);
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
    }),
  );
  return record;
}
