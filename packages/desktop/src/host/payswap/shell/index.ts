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
} from "./composition.js";

export { createPaySwapDesktopService } from "./service.js";
export type { PaySwapDesktopServiceOptions } from "./service.js";
