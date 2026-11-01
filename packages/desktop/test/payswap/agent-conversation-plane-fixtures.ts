/**
 * PaySwap Desktop (P24-D) — the composition-battery fixtures: the fake
 * payswap-desktop channel client that drives the REAL renderer
 * composition (src/renderer/src/agentConversationComposition.ts — the
 * missionIntakeComposition test precedent) and the fake substrate
 * surfaces behind it.
 */

import {
  composeAgentConversationBinding,
  type AgentConversationChannelClient,
} from "../../src/renderer/src/agentConversationComposition.js";
import type { DesktopConsoleChannelServices } from "../../src/renderer/src/consoleWorkspaceMount.js";
import type { AgentConversationPlane } from "@payswap/app";

/** The scripted model-turn answer the fake channel serves. */
export interface ScriptedModelTurn {
  readonly text: string;
  readonly toolCalls?: readonly { id: string; name: string; input: unknown }[];
  readonly finish?: "STOP" | "TOOL_CALLS" | "LENGTH";
}

/** One scripted read answer. */
export type ScriptedRead =
  | { readonly ok: true; readonly output: unknown }
  | { readonly ok: false; readonly error: { code: string; message: string; retryable: boolean } };

/** The fake channel's behavior knobs. */
export interface FakeConversationChannel {
  readonly modelTurns: ScriptedModelTurn[];
  readonly refuseStripePlane: boolean;
  readonly release: string;
  readonly accountFacts: readonly {
    readonly connectionId: string;
    readonly stripeAccountId: string;
    readonly accountModel: string;
    readonly environment: string;
    readonly grantedPermissionRules: readonly string[];
  }[];
  readonly operationFacts: readonly Record<string, unknown>[];
  readonly reads: readonly ScriptedRead[];
}

/** Build the fake channel client (the member surface, structural). */
export function fakeConversationChannelClient(
  script: Partial<FakeConversationChannel> = {},
): AgentConversationChannelClient {
  const modelTurns = script.modelTurns ?? [{ text: "hello", finish: "STOP" as const }];
  const refuseStripePlane = script.refuseStripePlane ?? false;
  const release = script.release ?? "v2596@2026-09-30.endive";
  const accountFacts = script.accountFacts ?? [
    {
      connectionId: "conn:composition-1",
      stripeAccountId: "acct_test_0001",
      accountModel: "OWN_ACCOUNT_RESTRICTED_KEY",
      environment: "SANDBOX",
      grantedPermissionRules: ["customers: Read", "customers: Write"],
    },
  ];
  const reads = script.reads ?? [];
  let readSeq = 0;
  const notConfigured = (): never => {
    const error = new Error("not configured");
    (error as { readonly name?: string }).name = "StripePlaneNotConfiguredError";
    throw error;
  };
  return {
    async agentModelTurn() {
      const turn = modelTurns[0];
      if (turn === undefined) {
        return { ok: false, error: { code: "PROVIDER_FAILURE", message: "no scripted turn", retryable: false } };
      }
      return {
        ok: true,
        text: turn.text,
        ...(turn.toolCalls !== undefined ? { toolCalls: turn.toolCalls } : {}),
        finish: turn.finish ?? "STOP",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      };
    },
    async stripeCatalogueRelease() {
      if (refuseStripePlane) notConfigured();
      return release;
    },
    async stripeListOperationFacts() {
      if (refuseStripePlane) notConfigured();
      return script.operationFacts ?? [];
    },
    async stripeOperationFact() {
      if (refuseStripePlane) notConfigured();
      return null;
    },
    async stripeListAccountFacts() {
      if (refuseStripePlane) notConfigured();
      return accountFacts;
    },
    async stripeAccountFacts() {
      if (refuseStripePlane) notConfigured();
      return accountFacts[0] ?? null;
    },
    async stripeExecuteRead() {
      const answer = reads[readSeq] ?? { ok: false, error: { code: "UNBOUND", message: "none", retryable: false } };
      readSeq += 1;
      return answer;
    },
    async stripePrepareAction() {
      if (refuseStripePlane) notConfigured();
      return { ok: false, reason: "not scripted" };
    },
    async stripeAuthorizeAction() {
      if (refuseStripePlane) notConfigured();
      return { ok: false, reason: "not scripted" };
    },
    async stripeExecuteAction() {
      if (refuseStripePlane) notConfigured();
      return { kind: "FAILED", reason: "REFUSED_BEFORE_DISPATCH", detail: "not scripted" };
    },
    async stripeInspectAction() {
      if (refuseStripePlane) notConfigured();
      return null;
    },
    stripePlanePrincipalId() {
      return "principal:local-desktop-operator";
    },
  };
}

/** The fake channel services (the payswap-desktop proxy shape the composition reads). */
function fakeServices(client: AgentConversationChannelClient): DesktopConsoleChannelServices {
  return { payswapDesktopService: client } as unknown as DesktopConsoleChannelServices;
}

/** Compose the REAL renderer binding over the fake channel. */
export async function composeOverFakeChannel(
  script: Partial<FakeConversationChannel> = {},
): Promise<AgentConversationPlane> {
  const handle = await composeAgentConversationBinding({ services: fakeServices(fakeConversationChannelClient(script)) });
  return handle.plane;
}

/** The battery's compose helpers (kept tiny — the battery's vocabulary). */
export function channelConversationPlaneForTest(): {
  readonly compose: () => Promise<{ readonly plane: AgentConversationPlane; readonly reset: () => void }>;
  readonly composeRefusing: () => Promise<AgentConversationPlane>;
} {
  return {
    async compose() {
      const handle = await composeAgentConversationBinding({
        services: fakeServices(fakeConversationChannelClient()),
      });
      return { plane: handle.plane, reset: handle.reset };
    },
    async composeRefusing() {
      return await composeOverFakeChannel({ refuseStripePlane: true });
    },
  };
}
