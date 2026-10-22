/**
 * PaySwap Desktop (P13-B) — the provider-return STATE BINDING registry
 * (ADR-0007 D3), split from ./session-authority.ts for the ≤400-line
 * file law.
 *
 * THE D3 CONTRACT: each outbound auth attempt mints a single-use,
 * crypto-random state bound to {connectionId, providerId, form} with a
 * 10-MINUTE default lifetime. On return: the state must be known +
 * unconsumed + unexpired. Consumed states are RETAINED as consumed
 * (monotonic — a second attempt gets the truthful "already consumed"
 * refusal, never conflated with unknown). Expired states are deleted
 * (their mint is dead; a fresh authorization mints a fresh state).
 */

import type { DesktopProviderCallbackView } from "./contracts.js";

/** The D3 state-binding lifetime (10 minutes, the ADR default). */
export const PROVIDER_STATE_BINDING_LIFETIME_MS = 10 * 60 * 1000;

/** One minted provider-return state binding. */
export interface ProviderStateBinding {
  readonly state: string;
  readonly connectionId: string;
  readonly providerId: string;
  readonly form: string;
  readonly mintedAtMs: number;
  readonly expiresAtMs: number;
  consumed: boolean;
}

/**
 * The in-session binding registry. Constructed inside the session
 * authority; every input is injectable for deterministic tests.
 */
export class ProviderStateBindingRegistry {
  readonly #bindings = new Map<string, ProviderStateBinding>();
  readonly #createState: () => string;
  readonly #nowMs: () => number;

  constructor(input: {
    readonly createState: () => string;
    readonly nowMs: () => number;
  }) {
    this.#createState = input.createState;
    this.#nowMs = input.nowMs;
  }

  /** Mint a single-use binding for one connection + form. */
  mint(input: {
    readonly connectionId: string;
    readonly providerId: string;
    readonly form: string;
  }): { readonly state: string; readonly expiresAtMs: number } {
    const mintedAtMs = this.#nowMs();
    const binding: ProviderStateBinding = {
      state: this.#createState(),
      connectionId: input.connectionId,
      providerId: input.providerId,
      form: input.form,
      mintedAtMs,
      expiresAtMs: mintedAtMs + PROVIDER_STATE_BINDING_LIFETIME_MS,
      consumed: false,
    };
    this.#bindings.set(binding.state, binding);
    return { state: binding.state, expiresAtMs: binding.expiresAtMs };
  }

  /** The connection a live (unconsumed, unexpired) binding belongs to, if any. */
  liveConnectionOf(state: string): string | null {
    const binding = this.#bindings.get(state);
    if (binding === undefined || binding.consumed || this.#nowMs() > binding.expiresAtMs) {
      return null;
    }
    return binding.connectionId;
  }

  /**
   * Validate + consume one return. The honest-refusal vocabulary is the
   * D3 law: unknown state / already consumed / expired — each refused
   * with its truthful reason, never silently retried.
   */
  consume(input: {
    readonly state: string;
    /** The honest provider error param, when the return carries one. */
    readonly error?: string;
    readonly resolveConnection: (connectionId: string) => {
      readonly providerId: string;
    } | null;
    readonly onErrorRecorded: (connectionId: string, error: string) => void;
  }): DesktopProviderCallbackView {
    const binding = this.#bindings.get(input.state);
    if (binding === undefined) {
      return {
        accepted: false,
        reason: "The return carries an unknown state — it is refused (never retried blindly).",
        connectionId: null,
        providerId: null,
      };
    }
    if (binding.consumed) {
      return {
        accepted: false,
        reason: "The return state was already consumed — states are single-use and monotonic.",
        connectionId: null,
        providerId: null,
      };
    }
    if (this.#nowMs() > binding.expiresAtMs) {
      // Expired: delete the dead mint; the task stays resumable.
      this.#bindings.delete(binding.state);
      return {
        accepted: false,
        reason:
          "The return state expired (10-minute lifetime). The setup task stays resumable — a fresh authorization may be started safely.",
        connectionId: null,
        providerId: null,
      };
    }
    // Monotonic consumption: RETAINED as consumed (never re-usable).
    binding.consumed = true;
    const connection = input.resolveConnection(binding.connectionId);
    if (connection === null) {
      return {
        accepted: false,
        reason: "The return state is valid but its connection no longer exists.",
        connectionId: null,
        providerId: null,
      };
    }
    if (input.error !== undefined) {
      // User-denied / provider error: surfaced honestly; the caller
      // records the reason on the connection (the task stays resumable
      // — never silently retried).
      input.onErrorRecorded(binding.connectionId, input.error);
      return {
        accepted: true,
        reason: `The provider return carried an error: ${input.error}. The reason is recorded and the task is resumable.`,
        connectionId: binding.connectionId,
        providerId: connection.providerId,
      };
    }
    return {
      accepted: true,
      reason: null,
      connectionId: binding.connectionId,
      providerId: connection.providerId,
    };
  }
}
