/**
 * PaySwap Desktop (P13-C) — the capability-composition adapter: the
 * corridor-projection port and the honest no-observation default.
 *
 * PINS the corridor gate's typed surface on the @payswap/capability
 * projectCorridor contract (P2-W1): a corridor is a DISCOVERY PROJECTION
 * over versioned capabilities + restrictions + fresh observations — it is
 * NOT a new authority and can NEVER make an unsupported route executable.
 * The desktop host layer law forbids @payswap/* imports, so the port is a
 * typed seam; the mirror test drives the REAL projectCorridor with the
 * same query shape (and the empty route set this deployment honestly has)
 * and asserts the pinned behavior matches — the two-step mirror
 * discipline. Live-import composition is the TL's integration step.
 *
 * HONEST DEFAULT (this deployment): ZERO connected capability instances
 * exist, so the projection observes NOTHING — the gate BLOCKS with the
 * typed no-observation reason, never a fabricated corridor fact.
 */

/** The corridor query (pinned CorridorQuery shape, caller-supplied asOf). */
export interface PaymentCorridorQuery {
  readonly sourceCountry: string;
  readonly destinationCountry: string;
  readonly sourceCurrency: string;
  readonly destinationCurrency: string;
  readonly customerType: "PERSONAL" | "BUSINESS";
  readonly sendAmount: { readonly currency: string; readonly minorUnits: string };
  readonly asOf: string;
}

/** One surfaced exclusion reason (code + message, carried verbatim). */
export interface PaymentCorridorExclusion {
  readonly code: string;
  readonly message: string;
}

/** The pinned corridor-view subset the validation gate reads. */
export interface PaymentCorridorView {
  readonly evaluatedAsOf: string;
  /** Every evaluated route's id, in deterministic input order. */
  readonly routeIds: readonly string[];
  /** The eligible subset (empty when no route is eligible). */
  readonly eligibleRouteIds: readonly string[];
  /** Every surfaced exclusion, carried verbatim (never just the first). */
  readonly exclusions: readonly PaymentCorridorExclusion[];
}

/** The corridor-projection port (the capability-composition seam). */
export interface PaymentCorridorProjectionPort {
  /**
   * Project corridor eligibility for the query. Deterministic: asOf and
   * observation stamps are DATA; the projection never reads a clock.
   */
  projectCorridor(query: PaymentCorridorQuery): PaymentCorridorView;
}

/** The typed no-observation reason (rendered verbatim by the gate). */
export const NO_OBSERVED_CORRIDOR_REASON =
  "No connected capability instance exists in this deployment — corridor eligibility has nothing to project over. Corridor facts require connected instances with fresh observations; none are observed, so no corridor is eligible and no corridor fact is invented.";

/**
 * The honest no-observation projection (this deployment's default): zero
 * routes, zero eligible routes, the typed no-observation reason surfaced
 * verbatim. Never a fabricated corridor fact.
 */
export function createNoObservationCorridorProjection(): PaymentCorridorProjectionPort {
  return {
    projectCorridor(query: PaymentCorridorQuery): PaymentCorridorView {
      return Object.freeze({
        evaluatedAsOf: query.asOf,
        routeIds: Object.freeze([]),
        eligibleRouteIds: Object.freeze([]),
        exclusions: Object.freeze([
          Object.freeze({ code: "NO_CONNECTED_INSTANCE", message: NO_OBSERVED_CORRIDOR_REASON }),
        ]),
      });
    },
  };
}

/** Fail-closed structural validation of a corridor query (the pinned shape). */
export function validatePaymentCorridorQuery(query: PaymentCorridorQuery): void {
  const country = (value: string, field: string): void => {
    if (typeof value !== "string" || !/^[A-Z]{2}$/.test(value)) {
      throw new Error(`${field} must be an ISO 3166-1 alpha-2 code`);
    }
  };
  const currency = (value: string, field: string): void => {
    if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) {
      throw new Error(`${field} must be a 3-letter currency code`);
    }
  };
  country(query.sourceCountry, "query.sourceCountry");
  country(query.destinationCountry, "query.destinationCountry");
  currency(query.sourceCurrency, "query.sourceCurrency");
  currency(query.destinationCurrency, "query.destinationCurrency");
  if (query.customerType !== "PERSONAL" && query.customerType !== "BUSINESS") {
    throw new Error("query.customerType must be PERSONAL or BUSINESS");
  }
  currency(query.sendAmount.currency, "query.sendAmount.currency");
  if (
    typeof query.sendAmount.minorUnits !== "string" ||
    !/^(0|[1-9][0-9]*)$/.test(query.sendAmount.minorUnits)
  ) {
    throw new Error("query.sendAmount.minorUnits must be a canonical decimal integer string");
  }
  if (typeof query.asOf !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(query.asOf)) {
    throw new Error("query.asOf must be a strict ISO-8601 UTC instant");
  }
}
