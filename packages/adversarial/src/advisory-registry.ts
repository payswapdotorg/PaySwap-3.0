/**
 * @payswap/adversarial — the network-wide security advisory registry
 * (P6-W3, lane r4-w3; PORT+ADAPT of payswap.org@8a735bf
 * packages/security/src/advisories.ts, split for the <=400-line file
 * law — the contracts + the GLOBAL restriction view live in
 * ./advisories.ts).
 *
 * THE REGISTRY: append-only lifecycle, deterministic ordering
 * (publication order), content-addressed advisories. Publish is ACTIVE
 * immediately and globally; close requires VERIFIED remediation (the
 * precondition for quarantine release — ./quarantine-ledger.ts).
 *
 * Deterministic only: every decision is a pure function of the
 * registry state and the input; fail-closed on malformed input.
 */

import { contentDigest, ValidationError } from "./pins/index.ts";
import type { ComponentIdentity } from "./component-identity.ts";
import { componentKey, isComponentKind } from "./component-identity.ts";
import {
  actionAtLeast,
  advisoryAffects,
  isAdvisoryAction,
  isAdvisorySeverity,
  SEVERITY_RANK,
  SecurityAdvisoryError,
  type AdvisoryAction,
  type AdvisoryEvent,
  type AdvisorySeverity,
  type AffectedComponentRef,
  type ComponentRestriction,
  type RemediationGuidance,
  type SecurityAdvisory,
} from "./advisories.ts";

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

/** Input for publishing an advisory; provenance contentHash is computed. */
export interface PublishAdvisoryInput {
  readonly advisoryId: string;
  readonly title: string;
  readonly severity: AdvisorySeverity;
  readonly description: string;
  readonly affected: readonly AffectedComponentRef[];
  readonly action: AdvisoryAction;
  readonly remediation: RemediationGuidance;
  readonly declaredBy: string;
  readonly publishedAt: number;
}

/**
 * The network-wide security advisory registry: append-only lifecycle,
 * deterministic ordering (publication order), content-addressed
 * advisories. `restrictionFor` is the GLOBAL restriction view — the
 * single source of truth every caller in the network model reads.
 */
export class SecurityAdvisoryRegistry {
  readonly #advisoriesById = new Map<string, SecurityAdvisory>();
  readonly #events: AdvisoryEvent[] = [];
  readonly #order: string[] = [];

  /** Publishes a new advisory. It is ACTIVE immediately and globally. */
  publish(input: PublishAdvisoryInput): SecurityAdvisory {
    if (input.advisoryId.length === 0) {
      throw new SecurityAdvisoryError("advisoryId must not be empty");
    }
    if (input.title.length === 0) {
      throw new SecurityAdvisoryError("title must not be empty");
    }
    if (input.declaredBy.length === 0) {
      throw new SecurityAdvisoryError("declaredBy must not be empty");
    }
    if (!isAdvisorySeverity(input.severity)) {
      throw new ValidationError(`unknown advisory severity '${String(input.severity)}'`);
    }
    if (!isAdvisoryAction(input.action)) {
      throw new ValidationError(`unknown advisory action '${String(input.action)}'`);
    }
    if (input.remediation.summary.length === 0) {
      throw new SecurityAdvisoryError("remediation summary must not be empty");
    }
    if (input.affected.length === 0) {
      throw new SecurityAdvisoryError(
        "an advisory must affect at least one component (an empty advisory cannot restrict anything)",
      );
    }
    for (const affected of input.affected) {
      if (!isComponentKind(affected.kind)) {
        throw new SecurityAdvisoryError(
          `unknown affected component kind '${String(affected.kind)}'`,
        );
      }
      if (affected.id.length === 0) {
        throw new SecurityAdvisoryError("affected component id must not be empty");
      }
    }
    if (this.#advisoriesById.has(input.advisoryId)) {
      throw new SecurityAdvisoryError(
        `advisory '${input.advisoryId}' already exists`,
      );
    }
    const advisory: SecurityAdvisory = Object.freeze({
      advisoryId: input.advisoryId,
      title: input.title,
      severity: input.severity,
      description: input.description,
      affected: Object.freeze([...input.affected]),
      action: input.action,
      remediation: input.remediation,
      provenance: Object.freeze({
        declaredBy: input.declaredBy,
        contentHash: contentDigest({
          advisoryId: input.advisoryId,
          title: input.title,
          severity: input.severity,
          description: input.description,
          affected: input.affected,
          action: input.action,
          remediation: input.remediation,
        }),
        publishedAt: input.publishedAt,
      }),
      status: "active",
    });
    this.#advisoriesById.set(advisory.advisoryId, advisory);
    this.#order.push(advisory.advisoryId);
    this.#events.push({ eventType: "published", advisory });
    return advisory;
  }

  /**
   * Closes an advisory. Requires `remediationVerified: true` — closure
   * is the precondition for quarantine release (./quarantine-ledger.ts),
   * so an unverified remediation can never unlock a quarantined
   * component through closure. Appends a `closed` event; the
   * `published` event remains in history.
   */
  close(input: {
    advisoryId: string;
    closedAt: number;
    closureNote: string;
    remediationVerified: boolean;
  }): SecurityAdvisory {
    const advisory = this.#advisoriesById.get(input.advisoryId);
    if (advisory === undefined) {
      throw new SecurityAdvisoryError(`unknown advisory '${input.advisoryId}'`);
    }
    if (advisory.status === "closed") {
      throw new SecurityAdvisoryError(
        `advisory '${input.advisoryId}' is already closed`,
      );
    }
    if (!input.remediationVerified) {
      throw new SecurityAdvisoryError(
        `advisory '${input.advisoryId}' cannot be closed without verified remediation (quarantine release depends on closure)`,
      );
    }
    if (input.closureNote.length === 0) {
      throw new SecurityAdvisoryError("closureNote must not be empty");
    }
    if (input.closedAt < advisory.provenance.publishedAt) {
      throw new SecurityAdvisoryError(
        `closedAt ${input.closedAt} is before the advisory publication at ${advisory.provenance.publishedAt}`,
      );
    }
    const closed: SecurityAdvisory = Object.freeze({
      ...advisory,
      status: "closed",
      closedAt: input.closedAt,
      closureNote: input.closureNote,
    });
    this.#advisoriesById.set(closed.advisoryId, closed);
    this.#events.push({
      eventType: "closed",
      advisoryId: input.advisoryId,
      closedAt: input.closedAt,
      closureNote: input.closureNote,
      remediationVerified: input.remediationVerified,
    });
    return closed;
  }

  byId(advisoryId: string): SecurityAdvisory | undefined {
    return this.#advisoriesById.get(advisoryId);
  }

  /** All advisories in publication order. */
  list(): readonly SecurityAdvisory[] {
    return this.#order.map(
      (id) => this.#advisoriesById.get(id) as SecurityAdvisory,
    );
  }

  /** Active advisories in publication order. */
  listActive(): readonly SecurityAdvisory[] {
    return this.list().filter((advisory) => advisory.status === "active");
  }

  /**
   * The GLOBAL restriction view. Deterministic: same registry state +
   * same identity → same answer, for every caller in the network model.
   */
  restrictionFor(identity: ComponentIdentity): ComponentRestriction {
    const driving: SecurityAdvisory[] = [];
    for (const advisory of this.listActive()) {
      if (advisoryAffects(advisory, identity)) {
        driving.push(advisory);
      }
    }
    // Most severe first, then publication order; deterministic total order.
    driving.sort((a, b) => {
      const rank = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
      if (rank !== 0) {
        return rank;
      }
      return a.advisoryId < b.advisoryId ? -1 : a.advisoryId > b.advisoryId ? 1 : 0;
    });
    const quarantined = driving.some((advisory) =>
      actionAtLeast(advisory.action, "quarantine"),
    );
    const retired = driving.some((advisory) => advisory.action === "retire");
    const restricted = driving.length > 0;
    return Object.freeze({
      component: identity,
      restricted,
      quarantined,
      retired,
      advisoryRefs: Object.freeze(driving.map((advisory) => advisory.advisoryId)),
    });
  }

  /**
   * True iff the component identity is restricted by any active
   * advisory. The scope-free twin of `restrictionFor` for hot paths.
   */
  isRestricted(identity: ComponentIdentity): boolean {
    return this.restrictionFor(identity).restricted;
  }

  /** Append-only lifecycle history. Never rewritten. */
  history(): readonly AdvisoryEvent[] {
    return [...this.#events];
  }

  /** Deterministic label for logs/tests: kind:id of every active restriction. */
  activeRestrictedKeys(): readonly string[] {
    const keys = new Set<string>();
    for (const advisory of this.listActive()) {
      for (const affected of advisory.affected) {
        keys.add(componentKey(affected));
      }
    }
    return [...keys].sort();
  }
}
