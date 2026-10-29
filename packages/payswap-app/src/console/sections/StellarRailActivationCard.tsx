/**
 * @payswap/app — the STELLAR RAIL ACTIVATION CARD (P22-B, ADR-0016 D9):
 * the onchain rail's own activation surface inside the connections
 * activation panel — the keypair wallet (BOTH halves cross once as ONE
 * material, sealed host-side, cleared from this page's state before the
 * receipt renders) + the Horizon testnet account read (the rail's only
 * ACTIVE path; an unfunded account is honestly FAILED — never a
 * fabricated position).
 *
 * Extracted from ConnectionsActivationPanel.tsx (the ≤400-line file law).
 * The rail is NOT a payment provider: the card renders only when the
 * bound plane exposes the stellar members (the composed-port-extension
 * guard); otherwise the honest rail-unavailable note stands.
 */

import { Button, Card, StatusPill } from "@zcode/ui/payswap";
import {
  CONNECTIONS_ACTIVATION_STELLAR_SEAL_NOTE,
  CONNECTIONS_ACTIVATION_STELLAR_UNAVAILABLE_NOTE,
  CONNECTIONS_ACTIVATION_TIER_NOTE,
  type ConnectionsActivationPortWithStellarRail,
} from "../connectionsActivationPins.js";

/** The Stellar rail card descriptor (the honest catalogue line). */
export const STELLAR_RAIL = {
  id: "stellar:testnet",
  label: "Stellar testnet (onchain rail)",
  mark: "✦",
  line: "Connect your own Stellar testnet wallet with a keypair: both halves cross once and are sealed as one material, then a read-only Horizon account read verifies the wallet and its issuer-scoped assets (an unfunded account is honestly FAILED — never a fabricated position).",
  useCaseRef: "testnet-keypair-wallet",
} as const;

/** The stellar card's view-state slice (owned by the panel; no key material — ever). */
export interface StellarRailCardState {
  readonly connectionId?: string;
  readonly connectionState?: string;
  readonly receipt?: { readonly sealedSecretCount: number; readonly credentialHandleRef: string; readonly nextState: string };
  readonly stellarProbe?: {
    readonly evidenceTier: string;
    readonly probedOperation: string;
    readonly providerRef: string;
    readonly note: string;
    readonly results: readonly {
      readonly connectionId: string;
      readonly outcome: string;
      readonly summary: string;
      readonly providerReferences: readonly string[];
      readonly failureCode?: string;
    }[];
  };
  readonly error?: string;
  readonly busy: "idle" | "seeding" | "submitting" | "probing";
}

/** The rail card's action bundle (the panel's wired callbacks). */
export interface StellarRailCardActions {
  readonly onSeedRail: () => void;
  readonly onSubmitKeypair: () => void;
  readonly onRunProbe: () => void;
}

function stateTone(state: string | undefined): "ok" | "attention" | "disabled" {
  if (state === "ACTIVE") {
    return "ok";
  }
  if (state !== undefined && state !== "UNCONFIGURED") {
    return "attention";
  }
  return "disabled";
}

/** The Stellar testnet onchain-rail activation card. */
export function StellarRailActivationCard({
  stellarRail,
  state,
  publicDraft,
  secretDraft,
  onPublicDraftChange,
  onSecretDraftChange,
  actions,
}: {
  /** The bound rail plane (null when the port lacks the stellar members). */
  readonly stellarRail: ConnectionsActivationPortWithStellarRail | null;
  readonly state: StellarRailCardState;
  readonly publicDraft: string;
  readonly secretDraft: string;
  readonly onPublicDraftChange: (value: string) => void;
  readonly onSecretDraftChange: (value: string) => void;
  readonly actions: StellarRailCardActions;
}): React.ReactNode {
  return (
    <Card
      className="ps-console-card ps-connections-card ps-connections-activation-card"
      data-testid={`ps-connections-activation-${STELLAR_RAIL.id}`}
    >
      <div className="ps-connections-card-head">
        <span className="ps-connections-mark ps-connections-mark--stellar" aria-hidden="true">
          {STELLAR_RAIL.mark}
        </span>
        <div className="ps-connections-card-titles">
          <h3 className="ps-connections-card-title">{STELLAR_RAIL.label}</h3>
          <StatusPill tone={stateTone(state.connectionState)}>
            {state.connectionState ?? "Not connected"}
          </StatusPill>
        </div>
      </div>
      <p className="ps-connections-card-line">{STELLAR_RAIL.line}</p>
      {stellarRail === null ? (
        <p className="ps-connections-activation-note">{CONNECTIONS_ACTIVATION_STELLAR_UNAVAILABLE_NOTE}</p>
      ) : (
        <div className="ps-connections-activation-actions">
          {state.connectionId === undefined ? (
            <Button
              type="button"
              variant="primary"
              disabled={state.busy !== "idle"}
              onClick={actions.onSeedRail}
              data-testid={`ps-connections-seed-${STELLAR_RAIL.id}`}
            >
              {state.busy === "seeding" ? "Connecting…" : `Connect ${STELLAR_RAIL.label}`}
            </Button>
          ) : (
            <>
              <label className="ps-connections-activation-keylabel" htmlFor="ps-connections-stellar-public">
                Public key (G… — the account address)
              </label>
              <input
                id="ps-connections-stellar-public"
                type="text"
                autoComplete="off"
                value={publicDraft}
                onChange={(event) => onPublicDraftChange(event.target.value)}
                className="ps-connections-activation-keyinput"
                data-testid="ps-connections-key-input-stellar-public"
              />
              <label className="ps-connections-activation-keylabel" htmlFor="ps-connections-stellar-secret">
                Secret key (S… — testnet only)
              </label>
              <input
                id="ps-connections-stellar-secret"
                type="password"
                autoComplete="off"
                value={secretDraft}
                onChange={(event) => onSecretDraftChange(event.target.value)}
                className="ps-connections-activation-keyinput"
                data-testid="ps-connections-key-input-stellar-secret"
              />
              <Button
                type="button"
                variant="primary"
                disabled={state.busy !== "idle" || publicDraft.length === 0 || secretDraft.length === 0}
                onClick={actions.onSubmitKeypair}
                data-testid={`ps-connections-key-submit-${STELLAR_RAIL.id}`}
              >
                {state.busy === "submitting" ? "Sealing…" : "Seal keypair"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={state.busy !== "idle"}
                onClick={actions.onRunProbe}
                data-testid={`ps-connections-probe-${STELLAR_RAIL.id}`}
              >
                {state.busy === "probing" ? "Reading…" : "Read account on Horizon"}
              </Button>
            </>
          )}
        </div>
      )}
      {stellarRail !== null ? (
        <p className="ps-connections-activation-note">{CONNECTIONS_ACTIVATION_STELLAR_SEAL_NOTE}</p>
      ) : null}
      {state.receipt !== undefined ? (
        <p className="ps-connections-activation-receipt" data-testid={`ps-connections-receipt-${STELLAR_RAIL.id}`}>
          Sealed {state.receipt.sealedSecretCount} secret
          {state.receipt.sealedSecretCount === 1 ? "" : "s"} (handle {state.receipt.credentialHandleRef}) —
          next state: {state.receipt.nextState}. The Horizon account read is still required for ACTIVE.
        </p>
      ) : null}
      {state.stellarProbe !== undefined ? (
        <div className="ps-connections-activation-probe" data-testid={`ps-connections-probe-outcome-${STELLAR_RAIL.id}`}>
          <p className="ps-connections-activation-probe-head">
            Account read ({state.stellarProbe.evidenceTier}) — {state.stellarProbe.probedOperation} on{" "}
            {state.stellarProbe.providerRef}
          </p>
          {state.stellarProbe.results.map((result) => (
            <p key={result.connectionId} className="ps-connections-activation-probe-result">
              {result.outcome} — {result.summary}
              {result.providerReferences.length > 0
                ? ` (${result.providerReferences.length} issuer-scoped asset positions)`
                : ""}
              {result.failureCode !== undefined ? ` [failure code: ${result.failureCode}]` : ""}
            </p>
          ))}
          <p className="ps-connections-activation-note">{state.stellarProbe.note}</p>
          <p className="ps-connections-activation-note">{CONNECTIONS_ACTIVATION_TIER_NOTE}</p>
        </div>
      ) : null}
      {state.error !== undefined ? (
        <p className="ps-connections-activation-error" data-testid={`ps-connections-error-${STELLAR_RAIL.id}`} role="alert">
          {state.error}
        </p>
      ) : null}
    </Card>
  );
}
