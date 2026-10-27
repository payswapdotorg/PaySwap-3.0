/**
 * @payswap/app — the CONNECTIONS ACTIVATION panel (P21-B run 4 / Part E,
 * ADR-0014 D5/D6/D11): the real key-entry + verification-probe surface
 * over the shared ConnectionsActivationPort.
 *
 * THE HONEST FLOW (per provider): seed setup (create-or-resume) → key
 * entry (the ONE material path — sealed host-side, the input clears on
 * submit, the receipt carries counts + the opaque handle only) → the
 * verification probe (host-side, inside the seal — the ONLY ACTIVE
 * path) → the outcome rendered with its PROVIDER_OBSERVATION tier label
 * + the honest scope note.
 *
 * LAWS:
 * - SECRETS NEVER RENDER/ECHO/PERSIST: the key input clears on submit;
 *   no state field, log line or receipt carries key material (the
 *   battery asserts the store carries none after submit).
 * - A card's state pill reflects the authority's own recorded state —
 *   never a UI assertion (a connection is ACTIVE only through a
 *   probe-CONFIRMED outcome recorded by the authority).
 * - The unbound tier (web) renders the honest unbound note — never a
 *   simulated activation.
 */

import { useCallback, useEffect, useState } from "react";
import { Button, Card, StatusPill } from "@zcode/ui/payswap";
import {
  CONNECTIONS_ACTIVATION_SEAL_NOTE,
  CONNECTIONS_ACTIVATION_TIER_NOTE,
  CONNECTIONS_ACTIVATION_UNBOUND_NOTE,
  type ConnectionsProbeOutcomePin,
  type ConnectionsSealReceiptPin,
  type ConnectionsActivationProviderId,
} from "../connectionsActivationPins.js";
import { sharedConnectionsActivationPlane } from "../connectionsActivationShared.js";

/** One provider's activation card view-state (no key material — ever). */
interface ProviderActivationState {
  /** The authority's connection id once seeded (absent until then). */
  readonly connectionId?: string;
  /** The authority's recorded state (rendered verbatim). */
  readonly connectionState?: string;
  /** The seal receipt (counts + handle only; absent until a key is sealed). */
  readonly receipt?: ConnectionsSealReceiptPin;
  /** The probe outcome (absent until the operator runs the probe). */
  readonly probe?: ConnectionsProbeOutcomePin;
  /** The honest error line (rendered, never masked). */
  readonly error?: string;
  /** The busy phases (the buttons disable honestly). */
  readonly busy: "idle" | "seeding" | "submitting" | "probing";
}

const IDLE_STATE: ProviderActivationState = { busy: "idle" };

/** The provider card descriptors (the honest catalogue lines). */
const PROVIDERS: readonly {
  readonly id: ConnectionsActivationProviderId;
  readonly label: string;
  readonly mark: string;
  readonly line: string;
  readonly useCaseRef: string;
}[] = [
  {
    id: "stripe",
    label: "Stripe",
    mark: "S",
    line: "Connect a Stripe test-mode account, seal its restricted key, then verify by probe.",
    useCaseRef: "own-store-test-mode",
  },
  {
    id: "flutterwave",
    label: "Flutterwave",
    mark: "F",
    line: "Connect a Flutterwave test-mode account, seal its secret key, then verify by probe (read-only evidence — a confirmed probe proves balance read, never send).",
    useCaseRef: "own-store-test-mode",
  },
  {
    id: "paystack",
    label: "Paystack",
    mark: "P",
    line: "Connect a Paystack test-mode account, seal its secret key, then verify by probe.",
    useCaseRef: "own-store-test-mode",
  },
];

function stateTone(state: string | undefined): "ok" | "attention" | "disabled" {
  if (state === "ACTIVE") {
    return "ok";
  }
  if (state !== undefined && state !== "UNCONFIGURED") {
    return "attention";
  }
  return "disabled";
}

export function ConnectionsActivationPanel(): React.ReactElement | null {
  const plane = sharedConnectionsActivationPlane();
  const [states, setStates] = useState<Record<string, ProviderActivationState>>({});
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    const planeNow = sharedConnectionsActivationPlane();
    if (planeNow === undefined) {
      return;
    }
    let cancelled = false;
    void planeNow
      .statuses()
      .then((statuses) => {
        if (cancelled) {
          return;
        }
        setStates((prev) => {
          const next = { ...prev };
          for (const status of statuses) {
            next[status.providerId] = {
              ...(next[status.providerId] ?? IDLE_STATE),
              connectionId: status.connectionId,
              connectionState: status.state,
            };
          }
          return next;
        });
      })
      .catch(() => {
        /* the statuses read is best-effort on mount; the honest error
           paths render through the act buttons below. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const seed = useCallback(
    async (provider: (typeof PROVIDERS)[number]): Promise<void> => {
      const planeNow = sharedConnectionsActivationPlane();
      if (planeNow === undefined) {
        return;
      }
      setStates((prev) => ({ ...prev, [provider.id]: { ...(prev[provider.id] ?? IDLE_STATE), busy: "seeding", error: undefined } }));
      try {
        const outcome = await planeNow.seedSetup({
          providerId: provider.id,
          useCaseRef: provider.useCaseRef,
        });
        setStates((prev) => ({
          ...prev,
          [provider.id]:
            outcome.kind === "REFUSED"
              ? { ...(prev[provider.id] ?? IDLE_STATE), busy: "idle", error: outcome.reason }
              : {
                  ...(prev[provider.id] ?? IDLE_STATE),
                  busy: "idle",
                  connectionId: outcome.connectionId,
                  connectionState: outcome.state,
                },
        }));
      } catch (error) {
        setStates((prev) => ({
          ...prev,
          [provider.id]: { ...(prev[provider.id] ?? IDLE_STATE), busy: "idle", error: String(error) },
        }));
      }
    },
    [],
  );

  const submitKey = useCallback(
    async (provider: (typeof PROVIDERS)[number]): Promise<void> => {
      const planeNow = sharedConnectionsActivationPlane();
      if (planeNow === undefined) {
        return;
      }
      const current = states[provider.id] ?? IDLE_STATE;
      if (current.connectionId === undefined) {
        return;
      }
      const secretKey = keyDrafts[provider.id] ?? "";
      if (secretKey.length === 0) {
        return;
      }
      setStates((prev) => ({ ...prev, [provider.id]: { ...current, busy: "submitting", error: undefined } }));
      // THE ONE MATERIAL PATH: the key crosses once and is cleared from
      // this page's state BEFORE the receipt renders — no echo, no log,
      // no persistence (the seal-law battery asserts the store is clean).
      setKeyDrafts((prev) => ({ ...prev, [provider.id]: "" }));
      try {
        const input = { connectionId: current.connectionId, secretKey };
        const receipt =
          provider.id === "stripe"
            ? await planeNow.submitStripeKey(input)
            : provider.id === "flutterwave"
              ? await planeNow.submitFlutterwaveSecretKey(input)
              : await planeNow.submitPaystackSecretKey(input);
        setStates((prev) => ({
          ...prev,
          [provider.id]: { ...(prev[provider.id] ?? IDLE_STATE), busy: "idle", receipt },
        }));
      } catch (error) {
        setStates((prev) => ({
          ...prev,
          [provider.id]: { ...(prev[provider.id] ?? IDLE_STATE), busy: "idle", error: String(error) },
        }));
      }
    },
    [states, keyDrafts],
  );

  const probe = useCallback(
    async (provider: (typeof PROVIDERS)[number]): Promise<void> => {
      const planeNow = sharedConnectionsActivationPlane();
      if (planeNow === undefined) {
        return;
      }
      setStates((prev) => ({ ...prev, [provider.id]: { ...(prev[provider.id] ?? IDLE_STATE), busy: "probing", error: undefined } }));
      try {
        const outcome = await planeNow.runVerificationProbe(provider.id);
        setStates((prev) => ({
          ...prev,
          [provider.id]: { ...(prev[provider.id] ?? IDLE_STATE), busy: "idle", probe: outcome },
        }));
      } catch (error) {
        setStates((prev) => ({
          ...prev,
          [provider.id]: { ...(prev[provider.id] ?? IDLE_STATE), busy: "idle", error: String(error) },
        }));
      }
    },
    [],
  );

  if (plane === undefined) {
    return (
      <Card className="ps-console-card ps-connections-activation-unbound" data-testid="ps-connections-activation-unbound">
        <p className="ps-connections-card-line">{CONNECTIONS_ACTIVATION_UNBOUND_NOTE}</p>
      </Card>
    );
  }

  return (
    <div className="ps-connections-activation" data-testid="ps-connections-activation">
      {PROVIDERS.map((provider) => {
        const state = states[provider.id] ?? IDLE_STATE;
        const seeded = state.connectionId !== undefined;
        return (
          <Card key={provider.id} className="ps-console-card ps-connections-card ps-connections-activation-card" data-testid={`ps-connections-activation-${provider.id}`}>
            <div className="ps-connections-card-head">
              <span className={`ps-connections-mark ps-connections-mark--${provider.id === "stripe" ? "stripe" : provider.id === "flutterwave" ? "flutterwave" : "paystack"}`} aria-hidden="true">
                {provider.mark}
              </span>
              <div className="ps-connections-card-titles">
                <h3 className="ps-connections-card-title">{provider.label}</h3>
                <StatusPill tone={stateTone(state.connectionState)}>
                  {state.connectionState ?? "Not connected"}
                </StatusPill>
              </div>
            </div>
            <p className="ps-connections-card-line">{provider.line}</p>
            <div className="ps-connections-activation-actions">
              {!seeded ? (
                <Button type="button" variant="primary" disabled={state.busy !== "idle"} onClick={() => void seed(provider)} data-testid={`ps-connections-seed-${provider.id}`}>
                  {state.busy === "seeding" ? "Connecting…" : `Connect ${provider.label}`}
                </Button>
              ) : (
                <>
                  <label className="ps-connections-activation-keylabel" htmlFor={`ps-connections-key-${provider.id}`}>
                    Secret key (test mode only)
                  </label>
                  <input
                    id={`ps-connections-key-${provider.id}`}
                    type="password"
                    autoComplete="off"
                    value={keyDrafts[provider.id] ?? ""}
                    onChange={(event) => setKeyDrafts((prev) => ({ ...prev, [provider.id]: event.target.value }))}
                    className="ps-connections-activation-keyinput"
                    data-testid={`ps-connections-key-input-${provider.id}`}
                  />
                  <Button
                    type="button"
                    variant="primary"
                    disabled={state.busy !== "idle" || (keyDrafts[provider.id] ?? "").length === 0}
                    onClick={() => void submitKey(provider)}
                    data-testid={`ps-connections-key-submit-${provider.id}`}
                  >
                    {state.busy === "submitting" ? "Sealing…" : "Seal key"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={state.busy !== "idle"}
                    onClick={() => void probe(provider)}
                    data-testid={`ps-connections-probe-${provider.id}`}
                  >
                    {state.busy === "probing" ? "Verifying…" : "Verify by probe"}
                  </Button>
                </>
              )}
            </div>
            <p className="ps-connections-activation-note">{CONNECTIONS_ACTIVATION_SEAL_NOTE}</p>
            {state.receipt !== undefined ? (
              <p className="ps-connections-activation-receipt" data-testid={`ps-connections-receipt-${provider.id}`}>
                Sealed {state.receipt.sealedSecretCount} secret{state.receipt.sealedSecretCount === 1 ? "" : "s"} (handle{" "}
                {state.receipt.credentialHandleRef}) — next state: {state.receipt.nextState}. Verification is still required for ACTIVE.
              </p>
            ) : null}
            {state.probe !== undefined ? (
              <div className="ps-connections-activation-probe" data-testid={`ps-connections-probe-outcome-${provider.id}`}>
                <p className="ps-connections-activation-probe-head">
                  Probe ({state.probe.evidenceTier}) — {state.probe.probedOperation}
                </p>
                {state.probe.results.map((result) => (
                  <p key={result.connectionId} className="ps-connections-activation-probe-result">
                    {result.outcome} — {result.summary}
                    {result.providerReferences.length > 0 ? ` (${result.providerReferences.length} provider references)` : ""}
                    {result.failureCode !== undefined ? ` [failure code: ${result.failureCode}]` : ""}
                  </p>
                ))}
                <p className="ps-connections-activation-note">{state.probe.note}</p>
                <p className="ps-connections-activation-note">{CONNECTIONS_ACTIVATION_TIER_NOTE}</p>
              </div>
            ) : null}
            {state.error !== undefined ? (
              <p className="ps-connections-activation-error" data-testid={`ps-connections-error-${provider.id}`} role="alert">
                {state.error}
              </p>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
