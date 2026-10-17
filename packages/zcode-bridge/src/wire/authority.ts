/**
 * Pinned wire shapes: authority boundary vocabulary (P3-W3, net-new).
 *
 * The bridge's ABSOLUTE constraint (spec/architecture/MODULE-OWNERSHIP.yaml
 * dependency_rules.no_parallel_financial_authority; spec/MIGRATION-FROM-
 * ZCODE.md critical boundary: "ZCode application permission is not PaySwap
 * financial authorization"): the bridge NEVER holds financial authority.
 * Every bridged surface is classified under the migration map's product
 * neutrality law (KEEP where product-neutral / PAYSWAP-ADAPT where the UX
 * must adapt) and stamped with an AuthorityBoundary record that is
 * structurally incapable of expressing financial authority.
 */

/**
 * The only authority domain this bridge can ever declare. There is
 * deliberately no "FINANCIAL" member: the type system itself refuses it.
 */
export type BridgeAuthorityDomain = "SUBSTRATE";

/** The repository law that forbids a parallel financial authority here. */
export const AUTHORITY_BOUNDARY_LAW = "no_parallel_financial_authority" as const;

/**
 * The frozen authority boundary stamped on every bridged surface
 * observation. `financialAuthority: false` and `applicationPermissionOnly:
 * true` are literal types — a record claiming financial authority is not a
 * valid AuthorityBoundary.
 */
export interface AuthorityBoundary {
  readonly domain: BridgeAuthorityDomain;
  readonly financialAuthority: false;
  readonly applicationPermissionOnly: true;
  readonly law: typeof AUTHORITY_BOUNDARY_LAW;
}

/**
 * Migration-map classification for a bridged substrate surface
 * (spec/MIGRATION-FROM-ZCODE.md): KEEP where product-neutral;
 * KEEP_WITH_ADAPTATIONS where the migration map lists the capability under
 * PAYSWAP-ADAPT or where the bridge pins a generalized/product-neutral form
 * of a coding-specific shape.
 */
export type ZcodeBridgeSurfaceClassification =
  | "KEEP"
  | "KEEP_WITH_ADAPTATIONS";

/**
 * A bridged substrate surface: a typed, versioned OBSERVATION of what the
 * pinned ZCode substrate exposes. This describes capability; it never
 * grants, proxies, or authorizes anything — the authority record is
 * structurally SUBSTRATE-only.
 */
export interface ZcodeBridgeSurfaceObservation {
  /** Stable surface id (kebab-case; unique across the inventory). */
  readonly surfaceId: string;
  /** Human title of the bridged surface. */
  readonly title: string;
  /** Migration-map classification. */
  readonly classification: ZcodeBridgeSurfaceClassification;
  /** Repo-relative source paths verified ON DISK in this worktree. */
  readonly sourcePaths: readonly string[];
  /** Substrate capabilities this surface exposes (descriptive only). */
  readonly capabilities: readonly string[];
  /** The never-financial-authority stamp. */
  readonly authority: AuthorityBoundary;
  /** Substrate pin the observation was verified against. */
  readonly substratePin: string;
  /** Bridge contract version the observation ships with. */
  readonly bridgeVersion: string;
  /** Required for KEEP_WITH_ADAPTATIONS: what was adapted and why. */
  readonly adaptationNotes: readonly string[];
  /** Optional free-form pin notes (serialization pins, exclusions). */
  readonly notes: readonly string[];
}

/**
 * The single authority domain value. Frozen string — a law constant, not a
 * configurable.
 */
export const BRIDGE_AUTHORITY_DOMAIN: BridgeAuthorityDomain = "SUBSTRATE";

/**
 * Vocabulary of financial-authority semantics that must NEVER appear in a
 * capability description crossing this bridge. Advisory lint vocabulary
 * (whole-word, case-insensitive, with enumerated inflections — no stems, so
 * "network" can never trip a "net*" rule): obligation/clearing/settlement/
 * reservation/netting/custody/finality are the financial-protocol layer's
 * words (P1-W2), and authorize/capture/payout/refund/chargeback/
 * disbursement are its verbs. The bridge DESCRIBES substrate capabilities;
 * it must never claim the power to perform any of these.
 */
export const FORBIDDEN_FINANCIAL_AUTHORITY_TERMS: readonly string[] =
  Object.freeze([
    "authorize",
    "authorizes",
    "authorized",
    "authorization",
    "authorise",
    "authorises",
    "authorised",
    "authorisation",
    "approve",
    "approves",
    "approved",
    "approval",
    "settle",
    "settles",
    "settled",
    "settlement",
    "settlements",
    "clearing",
    "clearance",
    "obligation",
    "obligations",
    "netting",
    "netted",
    "reservation",
    "reservations",
    "custody",
    "custodial",
    "finality",
    "capture",
    "captures",
    "captured",
    "payout",
    "payouts",
    "refund",
    "refunds",
    "refunded",
    "chargeback",
    "chargebacks",
    "disbursement",
    "disbursements",
    "reserve",
    "reserves",
    "reserved",
    "debit",
    "debits",
    "debited",
  ]);
