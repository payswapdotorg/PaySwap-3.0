/**
 * @payswap/app — the CONVERSATION PLANE PUBLIC SURFACE (P24-D, ADR
 * -0017 D8/D9/D10): the one module the package barrel re-exports for
 * the desktop renderer's composition root — split from index.ts for
 * the ≤400-line file law (the missionIntakePins pattern).
 *
 * The desktop renderer binds the REAL host plane behind these ports at
 * its business root; the web tier binds nothing — the honest unbound
 * conversation tier (never a simulated conversation).
 */

export type { AgentConversationPlane } from "./agentConversationWiring.js";
export type {
  AgentModelConversationPort,
  AgentModelTurnRequest,
  AgentModelTurnChunk,
  AgentModelTurnFinish,
  AgentModelSupportReport,
  AgentModelToolContractPin,
  AgentConversationMessage,
} from "./modelConversationPort.js";
export type {
  StripeToolCataloguePort,
  StripeAccountFactsPort,
  StripeOperationFactPin,
  StripeOperationFactFilter,
  StripeAccountFactsPin,
} from "./stripeToolCataloguePort.js";
export type {
  StripeResourceReadPort,
  StripePreparedActionPort,
  StripeReadExecutionError,
} from "./stripeToolExecutionPort.js";
export type {
  StripePreparedActionPin,
  StripeActionAuthorizationPin,
  StripeActionExecutionOutcomePin,
  StripeActionParameterPin,
} from "./stripePreparedActionPins.js";
export {
  AgentModelConversationError,
  AGENT_MODEL_CONVERSATION_UNBOUND_NOTE,
} from "./modelConversationPort.js";
