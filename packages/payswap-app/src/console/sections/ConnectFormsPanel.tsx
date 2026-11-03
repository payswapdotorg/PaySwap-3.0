/**
 * @payswap/app — the CONNECT FORMS PANEL (P27-A, ADR-0020 D4/D11): the
 * Stripe U2 (existing-account delegated-OAuth grant) and U3 (marketplace
 * connected accounts) connection-form surfaces — the app-side twin of the
 * desktop host's connect-connection-views.ts, rendered from the
 * structural pins (src/pins/connect-form-pins.ts; the app never imports
 * the host — the mirror battery proves the pins do not drift).
 *
 * HONESTY LAWS:
 * - THE TYPED OPERATOR GATE: with a form UNCONFIGURED (the current
 *   truth — no Stripe platform application exists), the card renders the
 *   EXACT §B-mapped missing-operator items; the setup action answers
 *   with the typed OPERATOR_GATED verdict — never a dead button, never a
 *   simulated OAuth, never an invented onboarding.
 * - THE TWO-HALF STATE: each card shows BOTH the machinery state
 *   (KEY_READY — implemented and hermetically tested in-repo) AND the
 *   connection status (UNCONFIGURED — the operator gates are open).
 * - INV-30: the U3 card carries the purpose-gate disclosure verbatim —
 *   Connect is not unrestricted P2P; the U2 card never carries it.
 * - ZERO FINANCIAL AUTHORITY: no key inputs, no dispatch, no
 *   authorization, no money movement — the panel seeds setup tasks and
 *   surfaces typed prerequisites only.
 */

import { useState } from "react";
import { Button, Card, StatusPill } from "@zcode/ui/payswap";
import {
  CONNECT_FORMS_GATE_NOTE,
  CONNECT_FORMS_MACHINERY_NOTE,
  CONNECT_LANE_FORM_VIEWS_PIN,
  type ConnectLaneFormViewPin,
  type ConnectSetupSeedResultPin,
  seedConnectSetupTaskPin,
} from "../../pins/connect-form-pins.js";

/** One card's rendered seed verdict (the typed answer, rendered verbatim). */
interface ConnectCardSeedState {
  readonly formId: string;
  readonly result: ConnectSetupSeedResultPin;
}

/** The people-language title of one connect form (the card heading). */
function connectFormTitle(view: ConnectLaneFormViewPin): string {
  return view.form === "DELEGATED_OAUTH"
    ? "Stripe — existing account grant (OAuth)"
    : "Stripe — marketplace connected accounts (Connect)";
}

/** Render one connect-lane form card (the typed-gate surface). */
function ConnectFormCard({
  view,
  seedState,
  onSeed,
}: {
  readonly view: ConnectLaneFormViewPin;
  readonly seedState: ConnectCardSeedState | undefined;
  readonly onSeed: () => void;
}): React.ReactNode {
  return (
    <Card
      className="ps-console-card ps-connections-card ps-connections-connect-form"
      data-testid={`ps-connect-form-${view.formId}`}
    >
      <div className="ps-connections-card-head">
        <span className="ps-connections-mark ps-connections-mark--stripe" aria-hidden="true">
          S
        </span>
        <div className="ps-connections-card-titles">
          <h3 className="ps-connections-card-title">{connectFormTitle(view)}</h3>
          <StatusPill tone={view.status === "CONFIGURED" ? "ok" : "disabled"}>
            {view.status === "CONFIGURED" ? "Configured" : "Not connected — operator gated"}
          </StatusPill>
        </div>
      </div>
      <p className="ps-connections-card-line">{view.summary}</p>
      <p className="ps-connections-card-meta" data-testid={`ps-connect-form-machinery-${view.formId}`}>
        Machinery: {view.machineryState} · Form: {view.form}
      </p>
      <div className="ps-connections-card-actions">
        <Button type="button" variant="secondary" onClick={onSeed} data-testid={`ps-connect-form-seed-${view.formId}`}>
          Seed setup task
        </Button>
      </div>
      {view.missingOperatorConfiguration.length > 0 ? (
        <div className="ps-connections-connect-form-gate" data-testid={`ps-connect-form-gate-${view.formId}`}>
          <p className="ps-connections-activation-probe-head">
            Operator gate — the exact missing configuration (P27 run card §B):
          </p>
          <ul className="ps-connections-connect-form-items">
            {view.missingOperatorConfiguration.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {view.purposeGateDisclosure !== null ? (
        <p
          className="ps-connections-activation-note"
          data-testid={`ps-connect-form-purpose-gate-${view.formId}`}
        >
          {view.purposeGateDisclosure}
        </p>
      ) : null}
      <p className="ps-connections-activation-note">{CONNECT_FORMS_MACHINERY_NOTE}</p>
      {seedState !== undefined && seedState.formId === view.formId ? (
        <p
          className="ps-connections-activation-receipt"
          data-testid={`ps-connect-form-seed-result-${view.formId}`}
        >
          {seedState.result.kind === "OPERATOR_GATED"
            ? `Setup not seeded — OPERATOR_GATED (${seedState.result.machineryState} machinery): ${seedState.result.missingItems.length} operator items stand open. The typed items are listed above; nothing is simulated.`
            : `Setup task seeded (${seedState.result.useCaseRef}) at ${seedState.result.seededAt}.`}
        </p>
      ) : null}
    </Card>
  );
}

/**
 * The connect forms panel: the two P27-A Stripe forms (U2 then U3 — the
 * pinned order). Pure presentation over the pins; the seed answers are
 * the deterministic typed projections (zero authority — the real seed
 * verb lands host-side at the P27-E wiring).
 */
export function ConnectFormsPanel({
  nowIso = "2026-11-03T12:00:00.000Z",
}: {
  /** The timestamp the deterministic seed projection stamps (test seam). */
  readonly nowIso?: string;
}): React.ReactNode {
  const [seedStates, setSeedStates] = useState<readonly ConnectCardSeedState[]>([]);
  return (
    <section
      aria-labelledby="ps-connect-forms-heading"
      className="ps-console-block ps-connections-connect-forms"
      data-testid="ps-connect-forms-panel"
    >
      <h2 id="ps-connect-forms-heading" className="ps-sr-only">
        Stripe connect forms (operator gated)
      </h2>
      <p className="ps-connections-activation-note">{CONNECT_FORMS_GATE_NOTE}</p>
      <div className="ps-connections-grid">
        {CONNECT_LANE_FORM_VIEWS_PIN.map((view) => (
          <ConnectFormCard
            key={view.formId}
            view={view}
            seedState={seedStates.find((state) => state.formId === view.formId)}
            onSeed={() => {
              const result = seedConnectSetupTaskPin(view, nowIso);
              setSeedStates((current) => [
                ...current.filter((state) => state.formId !== view.formId),
                { formId: view.formId, result },
              ]);
            }}
          />
        ))}
      </div>
    </section>
  );
}
