/**
 * PaySwap Desktop (P21-D Gap C, ADR-0014 D4) — the SUBSTRATE
 * session-settings read: the product wiring that feeds the
 * session-model-catalog member from the agent service's EXISTING
 * read-only surface (no services-package change):
 *
 * - `IZCodeAgentService.listSessions` (existing-only) lists the
 *   workspace's sessions; the newest by updatedAt is the read target;
 * - `IZCodeAgentService.readSession` (existing-only, messageLimit 1)
 *   reads that session's state snapshot, whose `.settings` is the
 *   agent-protocol-fed ZCodeSessionSettingsState — the SAME state the
 *   substrate UI projects for the native composer
 *   (packages/ui/src/lib/zcodeSessionProjection.ts).
 *
 * THE OBSERVER LAW (the existing-only semantics, honored verbatim): the
 * read NEVER starts an agent runtime. When no runtime is live the
 * service refuses with the typed ZCODE_AGENT_RUNTIME_UNAVAILABLE error —
 * recognized here as the honest "nothing to report" (undefined), never
 * a fabricated settings state. Zero sessions in the workspace is the
 * same honest undefined. Any OTHER failure propagates (fail-closed —
 * the catalog member rethrows it through to the composition's honest
 * ERROR phase).
 */

import {
  ZCODE_AGENT_RUNTIME_UNAVAILABLE_CODE,
  type IZCodeAgentService,
  type ZCodeAgentWorkspaceTarget,
} from "@zcode/services";
import type { ZCodeSessionSettingsState } from "@zcode/shared";

/** True iff the thrown value is the agent service's runtime-unavailable refusal. */
function isRuntimeUnavailable(thrown: unknown): boolean {
  return (
    thrown !== null &&
    typeof thrown === "object" &&
    (thrown as { readonly code?: unknown }).code === ZCODE_AGENT_RUNTIME_UNAVAILABLE_CODE
  );
}

/**
 * Build the substrate session-settings read over the agent service's
 * existing read-only surface (the desktop host's composition edge
 * injects this into the payswap service's sessionModelCatalog options).
 */
export function createSubstrateSessionSettingsRead(
  agentService: IZCodeAgentService,
  workspace: ZCodeAgentWorkspaceTarget,
): () => Promise<ZCodeSessionSettingsState | undefined> {
  return async () => {
    let sessions: readonly { readonly sessionId: string; readonly updatedAt: number }[];
    try {
      sessions = await agentService.listSessions({
        workspacePath: workspace.workspacePath,
        ...(workspace.workspaceIdentity !== undefined
          ? { workspaceIdentity: workspace.workspaceIdentity }
          : {}),
        runtimePolicy: "existing-only",
      });
    } catch (thrown: unknown) {
      if (isRuntimeUnavailable(thrown)) {
        // The observer's honest refusal: no live runtime, nothing to
        // report — never a fabricated settings state.
        return undefined;
      }
      throw thrown;
    }
    if (sessions.length === 0) {
      // No session in this workspace: the substrate has no model
      // availability to report (the honest empty catalog downstream).
      return undefined;
    }
    const newest = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)[0]!;
    try {
      const snapshot = await agentService.readSession({
        workspacePath: workspace.workspacePath,
        ...(workspace.workspaceIdentity !== undefined
          ? { workspaceIdentity: workspace.workspaceIdentity }
          : {}),
        sessionId: newest.sessionId,
        runtimePolicy: "existing-only",
        messageLimit: 1,
      });
      return snapshot.settings;
    } catch (thrown: unknown) {
      if (isRuntimeUnavailable(thrown)) {
        return undefined;
      }
      throw thrown;
    }
  };
}
