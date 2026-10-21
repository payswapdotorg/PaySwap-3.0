/**
 * @payswap/app — shared console section primitives (presentation-only).
 *
 * The scaffold every workspace section renders (§2 identity: title +
 * purpose verbatim; §8 landmarks: sections with accessible names), the
 * honest empty-state renderer (SV-8: typed reason + a real next action —
 * console section, in-page anchor, or product surface), the clearly
 * labeled reference card (§6: vocabulary renders as REFERENCE, never as
 * live data) and the honest loading/error blocks.
 */

import type { ReactNode } from "react";
import {
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  StatusPill,
} from "@zcode/ui/payswap";
import type { ConsoleSectionRecord, ModelProviderStatus } from "../contracts.js";
import type {
  ConsoleEmptyStateSpec,
  ReferenceTerm,
} from "../section-vocabulary.js";
import { MODEL_PROVIDERS_NONE } from "../section-vocabulary.js";
import type { PaySwapNavigation } from "../../shell/navigation.js";
import { ProductLink } from "../../shell/ProductLink.js";
import type { WorkspaceStoreError } from "../useWorkspaceStore.js";

/** The per-section scaffold: an accessible section + title + purpose. */
export function SectionScaffold({
  section,
  children,
}: {
  readonly section: ConsoleSectionRecord;
  readonly children: ReactNode;
}) {
  const headingId = `ps-console-${section.id}-heading`;
  return (
    <section aria-labelledby={headingId} className="ps-console-section">
      <header className="ps-console-section-header">
        <p className="ps-console-eyebrow">PaySwap Agent Console</p>
        <h1 id={headingId} className="ps-console-section-title">
          {section.title}
        </h1>
        <p className="ps-console-section-lede">{section.purpose}</p>
      </header>
      {children}
    </section>
  );
}

/**
 * The honest empty state: the typed reason + the REAL next action from
 * the vocabulary spec — a console-section route, an in-page anchor, or
 * the product surface via the mount's back affordance. Never a dead
 * button, never a fabricated row.
 */
export function ConsoleEmptyStateView({
  spec,
  navigation,
  backToProduct,
  title,
}: {
  readonly spec: ConsoleEmptyStateSpec;
  readonly navigation?: PaySwapNavigation;
  readonly backToProduct?: { readonly label: string; readonly onActivate: () => void };
  readonly title: string;
}) {
  let action: ReactNode | undefined;
  if (spec.nextAction.kind === "console-section") {
    action = (
      <ProductLink
        to={`/console/${spec.nextAction.target}`}
        navigation={navigation}
        className="ps-console-action ps-console-action--primary"
      >
        {spec.nextAction.label}
      </ProductLink>
    );
  } else if (spec.nextAction.kind === "in-page") {
    action = (
      <a href={`#${spec.nextAction.target}`} className="ps-console-action">
        {spec.nextAction.label}
      </a>
    );
  } else if (backToProduct !== undefined) {
    action = (
      <button
        type="button"
        className="ps-console-action ps-console-action--primary"
        onClick={backToProduct.onActivate}
      >
        {spec.nextAction.label}
      </button>
    );
  }
  return (
    <EmptyState
      title={title}
      description={spec.reason}
      action={action}
      className="ps-console-empty"
    />
  );
}

/**
 * The clearly-labeled REFERENCE card (§6): vocabulary terms render here
 * as reference — the label says so, the tone stays neutral, and nothing
 * in it is live data.
 */
export function ReferenceCard({
  id,
  title,
  note,
  terms,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly note: string;
  readonly terms?: readonly ReferenceTerm[];
  readonly children?: ReactNode;
}) {
  const headingId = `${id}-heading`;
  return (
    <Card className="ps-console-reference" id={id}>
      <div className="ps-console-reference-head">
        <h2 id={headingId} className="ps-console-reference-title">
          {title}
        </h2>
        <StatusPill tone="disabled">Reference</StatusPill>
      </div>
      <p className="ps-console-reference-note">{note}</p>
      {terms !== undefined && terms.length > 0 ? (
        <dl className="ps-console-reference-list">
          {terms.map((term) => (
            <div key={term.term} className="ps-console-reference-row">
              <dt className="ps-console-reference-term">{term.term}</dt>
              <dd className="ps-console-reference-line">{term.line}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {children}
    </Card>
  );
}

/**
 * The model-binding projection (agents/connections): the optional REAL
 * substrate model-provider connection state from the mount — absent
 * renders the honest "none configured" line, present renders each real
 * row with its truthful connected state. Never invented.
 */
export function ModelProvidersCard({
  modelProviders,
  id,
}: {
  readonly modelProviders?: readonly ModelProviderStatus[];
  readonly id: string;
}) {
  const headingId = `${id}-heading`;
  return (
    <Card className="ps-console-card" id={id}>
      <div className="ps-console-reference-head">
        <h2 id={headingId} className="ps-console-card-title">
          Model provider connections
        </h2>
        <StatusPill tone="disabled">Substrate state</StatusPill>
      </div>
      <p className="ps-console-card-note">
        The substrate model providers the mount reports — model
        configuration, distinct from agent capabilities and from
        authorization.
      </p>
      {modelProviders === undefined || modelProviders.length === 0 ? (
        <p className="ps-console-line">{MODEL_PROVIDERS_NONE}</p>
      ) : (
        <ul className="ps-console-provider-list">
          {modelProviders.map((provider) => (
            <li key={provider.id} className="ps-console-provider-row">
              <span className="ps-console-provider-label">{provider.label}</span>
              <StatusPill tone={provider.connected ? "ok" : "disabled"}>
                {provider.connected ? "Connected" : "Not connected"}
              </StatusPill>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The honest loading block (Skeleton carries role=status itself). */
export function LoadingBlock({ count = 3 }: { readonly count?: number }) {
  return <Skeleton count={count} className="ps-console-skeleton" />;
}

/** The honest error block: a real failure, announced as an alert. */
export function ErrorBlock({
  error,
  onRetry,
}: {
  readonly error: WorkspaceStoreError;
  readonly onRetry?: () => void;
}) {
  return (
    <ErrorState
      title="The workspace store failed"
      description={`${error.operation}: ${error.message}`}
      onRetry={onRetry}
      retryLabel="Retry loading"
      className="ps-console-error"
    />
  );
}
