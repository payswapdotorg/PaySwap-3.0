/**
 * @payswap/client-certification — sandbox/live structural separation
 * (P8-W2, hard law 6).
 *
 * NET-NEW law on the canonical architecture, with the vocabulary PINNED
 * from @payswap/ui (environment kinds `test` / `live`; the TEST mark is
 * an INVERTED stone mark so test can never read as error or success)
 * and the custody discipline pinned from @payswap/onchain-security
 * (opaque vault references are the only lawful secret reference):
 *
 * - modes are STRUCTURALLY DISTINCT: a sandbox (test) surface state can
 *   never present as live, and a test state never declares live
 *   finality;
 * - LIVE credentials can never leak into sandbox paths: credential
 *   references are bound to an environment and to vault custody, and a
 *   test-pinned state may only reference test-bound credentials;
 * - mode is PINNED PER SURFACE STATE — a surface whose mode resolution
 *   depends on an ambient flag fails the gate (ambient state is not a
 *   contract).
 *
 * Deterministic only: pure folds over the declared state registry.
 */

import type { PinnedEnvironmentKind } from "./pins/ui.ts";
import { CLIENT_GATE_HALT_ACTION, CLIENT_GATE_SEVERITY } from "./verdict.ts";
import type { ClientGateResult, CertificationViolation } from "./verdict.ts";
import { violationOf } from "./verdict.ts";
import { contentDigest } from "./digest.ts";

/** The law this gate enforces (hard law 6). */
const LAW = "sandbox-live-separation" as const;

/** The two environment kinds (pinned from @payswap/ui). */
export type SurfaceEnvironment = PinnedEnvironmentKind;

/** How a credential is held (the custody law). */
export const CREDENTIAL_CUSTODY_KINDS = Object.freeze([
  "vault-only",
  "inline",
] as const);

export type CredentialCustodyKind = (typeof CREDENTIAL_CUSTODY_KINDS)[number];

/** One mode-pinned surface state (mode is a FIELD, never ambient). */
export interface ModePinnedSurfaceState {
  readonly stateId: string;
  /** The environment this state is pinned to. */
  readonly environment: SurfaceEnvironment;
  /** The environment the customer-visible presentation claims. */
  readonly presentsAs: SurfaceEnvironment;
  /** Whether the state claims LIVE finality (money moved, settled...). */
  readonly declaresLiveFinality: boolean;
  /** Opaque credential references the state's payload carries. */
  readonly credentialRefs: readonly string[];
}

/** One credential binding (environment + custody). */
export interface CredentialBinding {
  /** Opaque vault reference (never material — the boundary law). */
  readonly credentialRef: string;
  readonly environment: SurfaceEnvironment;
  readonly custody: CredentialCustodyKind;
}

/** The surface's mode-resolution declaration + registries. */
export interface SandboxLiveSeparationInput {
  /**
   * TRUE when the surface resolves mode from an AMBIENT flag at render
   * time. This is a violation of the pinning law by construction.
   */
  readonly ambientModeInheritance: boolean;
  readonly states: readonly ModePinnedSurfaceState[];
  readonly credentialBindings: readonly CredentialBinding[];
}

/**
 * The sandbox/live separation gate (hard law 6). Any violation is a
 * HALT for the release.
 */
export function runSandboxLiveSeparationGate(
  input: SandboxLiveSeparationInput,
): ClientGateResult {
  const violations: CertificationViolation[] = [];

  if (input.ambientModeInheritance) {
    violations.push(
      violationOf(
        LAW,
        "ambient_mode_dependency",
        "the surface resolves mode from an ambient flag — mode must be pinned per surface state, not per ambient flag",
      ),
    );
  }

  const bindings = new Map<string, CredentialBinding>();
  for (const binding of input.credentialBindings) {
    bindings.set(binding.credentialRef, binding);
    if (binding.custody !== "vault-only") {
      violations.push(
        violationOf(
          LAW,
          "credential_not_vault_custody",
          `credential '${binding.credentialRef}' declares custody '${binding.custody}' — credentials live in the vault, surfaces carry opaque references only`,
        ),
      );
    }
  }

  for (const state of input.states) {
    if (state.environment === "test" && state.presentsAs === "live") {
      violations.push(
        violationOf(
          LAW,
          "sandbox_presenting_as_live",
          `state '${state.stateId}' is pinned to the test environment but presents as live — a sandbox surface can never present as live`,
        ),
      );
    }
    if (state.environment === "test" && state.declaresLiveFinality) {
      violations.push(
        violationOf(
          LAW,
          "test_state_declares_live_finality",
          `state '${state.stateId}' is pinned to the test environment but declares live finality — test is an inverted-stone mark, never a money-moved claim`,
        ),
      );
    }
    for (const ref of state.credentialRefs) {
      const binding = bindings.get(ref);
      if (binding === undefined) {
        violations.push(
          violationOf(
            LAW,
            "unbound_credential_reference",
            `state '${state.stateId}' references credential '${ref}' with no declared binding`,
          ),
        );
        continue;
      }
      if (state.environment === "test" && binding.environment === "live") {
        violations.push(
          violationOf(
            LAW,
            "live_credential_in_test_path",
            `test-pinned state '${state.stateId}' references live credential '${ref}' — live credentials can never leak into sandbox paths`,
          ),
        );
      }
    }
  }

  return Object.freeze({
    law: LAW,
    severity: CLIENT_GATE_SEVERITY,
    passed: violations.length === 0,
    violations: Object.freeze(violations),
    checked: input.states.length,
    digest: contentDigest({
      law: LAW,
      haltAction: CLIENT_GATE_HALT_ACTION,
      ambientModeInheritance: input.ambientModeInheritance,
      violations,
    }),
  });
}
