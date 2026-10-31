/**
 * PaySwap Desktop (P22-D, ADR-0016 D7/D12 — the no-bypass battery) —
 * the shared fixtures (split from ./p22d-no-bypass-corridor.test.ts at
 * the ≤400-line file law — the p21-journey-bridge-fixtures precedent):
 * the composed corridor world, the counting fetch (zero-transport-call
 * proofs), the minimal kernel command, the fake LIVE-mode stellar
 * authority (the kernels battery's escape-scan mirror), and the
 * mission-at-planning-preview + armed-composite drivers.
 */

import type { PaymentDispatchCommand } from "../../src/host/payswap/payments/execution-authority.js";
import {
  corridorPlanDigest,
  type CorridorPlanInput,
} from "../../src/host/payswap/payments/corridor-dispatch.js";
import { deriveConnectionCapabilityBridge } from "../../src/host/payswap/connections/capability-bridge.js";
import { fakeWorld, type World } from "./connections-probe-plane-fixtures.js";
import {
  captureCorridorIntake,
  composeCorridorService,
  corridorPlanningEnvironment,
  scriptCorridorFetch,
  seedCorridorConnections,
  T0,
} from "./p22d-corridor-journey-fixtures.js";

export const NO_BYPASS_GOAL = "Send one thousand cedis to a Kenyan bank account over the corridor";
export const NO_BYPASS_CORRIDOR_QUERY = {
  sourceCountry: "GH",
  destinationCountry: "KE",
  destinationCurrency: "KES",
} as const;

/** The composed service's own type (the bridge battery's composition). */
type ComposedService = Awaited<ReturnType<typeof composeCorridorService>>;
export type ComposedWorld = {
  readonly world: World;
  readonly service: ComposedService["service"];
  readonly runtime: ComposedService["runtime"];
  readonly connections: Awaited<ReturnType<typeof seedCorridorConnections>>;
};

/** The composed corridor world (the bridge battery's own composition). */
export async function composedWorld(): Promise<ComposedWorld> {
  const world = fakeWorld();
  scriptCorridorFetch(world);
  const connections = await seedCorridorConnections(world);
  const composed = await composeCorridorService(world, connections.authority, connections.evidenceStore);
  return { world, connections, ...composed };
}

/** A fetch wrapper that records every URL the transports consult. */
export function countingFetch(world: World) {
  const calls: string[] = [];
  const fetchImpl = async (url: string) => {
    calls.push(url);
    return world.fetchImpl(url);
  };
  return { fetchImpl, calls };
}

/** A minimal lawful kernel command over the named connection. */
export function kernelCommand(input: {
  readonly connectionRef: string;
  readonly executionMode?: "SANDBOX" | "LIVE";
  readonly leg?: Record<string, unknown>;
}): PaymentDispatchCommand {
  return {
    attemptId: "attempt:p22d-nb",
    operation: "CREATE_EXTERNAL_EFFECT",
    intent: {
      intentId: "intent:p22d-nb",
      principalRef: "principal:test",
      origin: { locationRef: "flw:wallet:GHS", currency: "GHS", observationRef: "obs:1" },
      destination: { locationRef: "merchant:kes-bank", currency: "KES", observationRef: "obs:2" },
      originAmount: { currency: "GHS", minorUnits: "100000" },
      arrivalCurrency: "KES",
      constraints: { maxSettlementMs: 86_400_000, maxRouteHops: 4 },
      intentAuthorizationRef: "auth:p22d-nb",
      declaredAt: 1,
      expiresAt: 2,
      commerceRef: "commerce:p22d-nb",
    },
    authorizationArtifactId: "artifact:p22d-nb",
    idempotencyKey: "idem:p22d-nb",
    commandId: "command:p22d-nb",
    correlationId: "corr:p22d-nb",
    connectionRef: input.connectionRef,
    executionMode: input.executionMode ?? "SANDBOX",
    ...(input.leg !== undefined ? { leg: input.leg } : {}),
  } as PaymentDispatchCommand;
}

/** The fake LIVE-mode stellar authority (the kernels battery's escape-scan mirror). */
export function fakeLiveStellarAuthority() {
  const material = {
    publicKey: "G" + "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".repeat(2).slice(0, 55),
    secretKey: "S" + "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".repeat(2).slice(0, 55),
  };
  return {
    async connectionStatuses() {
      return [
        {
          connectionId: "conn:fake-live-stellar",
          providerId: "stellar:testnet",
          state: "ACTIVE",
          executionMode: "LIVE",
        },
      ];
    },
    async withSealedCredential<T>(
      id: string,
      consumer: (material: unknown) => T,
      context: string,
    ): Promise<Awaited<T>> {
      const result = await consumer(material);
      const text = JSON.stringify(result, (_key, item) => (typeof item === "bigint" ? item.toString() : item));
      for (const secret of Object.values(material as Record<string, string>)) {
        if (text.includes(secret)) {
          throw new Error(`a sealed secret string leaked through the consumer result (context: ${context})`);
        }
      }
      return result;
    },
  };
}

/** A mission driven to its planning-tier preview (intake + channel BLOCK + planning PROCEED). */
export async function missionAtPlanningPreview(tier: {
  readonly service: ComposedService["service"];
  readonly runtime: ComposedService["runtime"];
  readonly connections: Awaited<ReturnType<typeof seedCorridorConnections>>;
  readonly planId: string;
  readonly now: string;
}): Promise<string> {
  const seeded = await tier.service.paymentMissionSeed({ direction: "MOVE", goalStatement: NO_BYPASS_GOAL });
  const missionId = seeded.missionId;
  await captureCorridorIntake(tier.service, missionId);
  await tier.service.paymentMissionPresentPreview(missionId);
  const bridge = await deriveConnectionCapabilityBridge({
    statuses: await tier.connections.authority.connectionStatuses(),
    evidence: await tier.connections.evidenceStore.latestProbeEvidence(),
  });
  await tier.runtime.presentPreview(
    missionId,
    corridorPlanningEnvironment({
      now: tier.now,
      bridge,
      planId: tier.planId,
      executingConnectionId: tier.connections.paystackConnectionId,
      corridor: NO_BYPASS_CORRIDOR_QUERY,
    }),
  );
  return missionId;
}

/** Drive a mission to its granted COMPOSITE artifact (the two-act approval). */
export async function armedComposite(
  runtime: ComposedService["runtime"],
  missionId: string,
  plan: CorridorPlanInput,
  now: string,
): Promise<string> {
  const request = await runtime.requestAuthorization(missionId, now, {
    planDigest: corridorPlanDigest(plan),
    planLegCount: plan.legs.length,
  });
  const resolution = await runtime.resolveAuthorization(
    { requestId: request.requestId, decision: "APPROVE", origin: "PREVIEW_UI_ACT" },
    now,
  );
  if (resolution.outcome.kind !== "GRANTED") {
    throw new Error("the composite approval must be GRANTED");
  }
  return resolution.outcome.artifact.artifactId;
}

/** The pinned instant re-export (the no-bypass clauses' clock). */
export { T0 as NO_BYPASS_T0 };
