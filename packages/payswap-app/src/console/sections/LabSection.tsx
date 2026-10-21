/**
 * @payswap/app — the LAB workspace section (console surface).
 *
 * §6: the honest empty (no experiments — typed reason) + the Lab law
 * VERBATIM (simulation is advisory/test evidence only — never
 * production financial authority) + the opportunities-family framing.
 */

import { Card } from "@zcode/ui/payswap";
import type { ConsoleSectionRecord } from "../contracts.js";
import {
  LAB_EMPTY_STATE,
  LAB_LAW,
  OPPORTUNITIES_FAMILY,
  REFERENCE_SECTION_ANCHORS,
} from "../section-vocabulary.js";
import {
  ConsoleEmptyStateView,
  ReferenceCard,
  SectionScaffold,
} from "./shared.js";

export function LabSection({
  section,
}: {
  readonly section: ConsoleSectionRecord;
}) {
  return (
    <SectionScaffold section={section}>
      <ConsoleEmptyStateView
        spec={LAB_EMPTY_STATE}
        title="No experiments — the honest state"
      />
      <ReferenceCard
        id={REFERENCE_SECTION_ANCHORS.lab}
        title="The Lab law and the opportunities family"
        note="Reference only — what the Lab is and what it may never be. No experiment is simulated here."
      >
        <Card className="ps-console-card">
          <p className="ps-console-law">
            <span className="ps-console-law-label">The Lab law:</span> {LAB_LAW}
          </p>
        </Card>
        <ul className="ps-console-reference-list">
          {OPPORTUNITIES_FAMILY.map((line) => (
            <li key={line} className="ps-console-reference-line">
              {line}
            </li>
          ))}
        </ul>
      </ReferenceCard>
    </SectionScaffold>
  );
}
