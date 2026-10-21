/**
 * @payswap/app — the APPROVALS workspace section (console surface).
 *
 * §6: the honest empty (no approval plane is configured — typed reason)
 * + what approvals gate (material terms + authority scope, per the trust
 * contracts) as clearly-labeled REFERENCE. Nothing can be approved from
 * the workspace: no approval-minting control exists here, and none is
 * implied by the reference material.
 */

import type { ConsoleSectionRecord } from "../contracts.js";
import {
  APPROVALS_EMPTY_STATE,
  APPROVALS_GATE_VOCABULARY,
  REFERENCE_SECTION_ANCHORS,
} from "../section-vocabulary.js";
import {
  ConsoleEmptyStateView,
  ReferenceCard,
  SectionScaffold,
} from "./shared.js";

export function ApprovalsSection({
  section,
}: {
  readonly section: ConsoleSectionRecord;
}) {
  return (
    <SectionScaffold section={section}>
      <ConsoleEmptyStateView
        spec={APPROVALS_EMPTY_STATE}
        title="Nothing to approve — the honest state"
      />
      <ReferenceCard
        id={REFERENCE_SECTION_ANCHORS.approvals}
        title="What approvals gate"
        note="Reference only — the trust-contract facts about approvals. No approval can be minted from this workspace: approvals exist only when a trust plane is configured, and this deployment has none."
        terms={APPROVALS_GATE_VOCABULARY}
      >
        <p className="ps-console-line">
          There is no approval action on this page — by design. When an
          approval plane exists, approvals are minted by that plane under
          its authority scope, never from the workspace views.
        </p>
      </ReferenceCard>
    </SectionScaffold>
  );
}
