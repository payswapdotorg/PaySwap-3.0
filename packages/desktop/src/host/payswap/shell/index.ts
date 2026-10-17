/**
 * PaySwap Desktop (P7-W2) — the shell integration barrel.
 *
 * Window/session/transport seams per the ZCode-derived substrate, the
 * product service contract, and the host composition root.
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
} from "./composition.js";

export { createPaySwapDesktopService } from "./service.js";
export type { PaySwapDesktopServiceOptions } from "./service.js";
