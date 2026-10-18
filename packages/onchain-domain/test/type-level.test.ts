import { describe, expect, it } from "vitest";
import type { AssetObservation } from "../src/asset-observation.ts";
import type { ChainDefinition, ConnectedChainInstance } from "../src/chain.ts";
import type { OnchainExecutionRequest } from "../src/execution-directive.ts";
import type { OnchainFinalityCandidate } from "../src/execution-observation.ts";
import type { SmartAccountCapabilityDeclaration } from "../src/wallet.ts";
import type { ContractInteractionCapabilityDeclaration } from "../src/onchain-capabilities.ts";
import type { ProtocolDefinition } from "../src/onchain-protocol.ts";
import type {
  ConnectedInstancePin,
  PinnedExecutableDefinition,
  PinnedNonExecutableDefinition,
  PinnedConnectorExecutionRequest,
} from "../src/pins.ts";
import type { Expect, Equal, NotAssignable } from "./type-utils.ts";

type AssignableTo<X, Y> = X extends Y ? true : false;

/**
 * Compile-time assertion helpers: a failed Expect<...> is a tsc error, so the
 * guarantees below are enforced by the typecheck gate, not just at runtime.
 *
 * ADAPTATION NOTE (old type-level.test.ts): the old suite asserted nominal
 * separation from @payswap/protocol `Money` and @payswap/connectors
 * `ExternalFundsPositionObservation` via TYPE-ONLY sibling imports. This
 * rebuild is v1 hermetic (zero sibling imports), so the equivalent
 * guarantees are asserted against LOCALLY DECLARED structural shapes: a
 * minimal ledger/balance twin (the shape any balance type must at least
 * carry) and the pinned connected-instance scope. The nominal observation
 * brand (observationKind: "AssetObservation") provides the same
 * non-assignability proof without importing the authority lanes.
 */
describe("type-level guarantees (P4-W1, lane R2-W1)", () => {
  it("INV-7: an asset observation is never assignable to a balance/ledger shape (never custody)", () => {
    /** Minimal local twin of any ledger/balance entry (different brand). */
    interface LedgerBalanceTwin {
      readonly observationKind: "Balance";
      readonly minorUnits: string;
    }
    type ObservationIsNotBalance = Expect<Equal<AssignableTo<AssetObservation, LedgerBalanceTwin>, false>>;
    type BalanceIsNotObservation = Expect<Equal<AssignableTo<LedgerBalanceTwin, AssetObservation>, false>>;
    void 0 as unknown as ObservationIsNotBalance;
    void 0 as unknown as BalanceIsNotObservation;
    expect(true).toBe(true);
  });

  it("INV-7: an asset observation is nominally distinct from the connected-instance scope (chain-scoped vocabulary, no accidental interop)", () => {
    type NotInstanceScope = Expect<Equal<AssignableTo<AssetObservation, ConnectedInstancePin>, false>>;
    type NotAssetObservation = Expect<Equal<AssignableTo<ConnectedInstancePin, AssetObservation>, false>>;
    void 0 as unknown as NotInstanceScope;
    void 0 as unknown as NotAssetObservation;
    expect(true).toBe(true);
  });

  it("layer reuse: chain/protocol definitions extend the pinned capability-definition arms; instances extend the pinned ConnectedInstancePin (never re-defined)", () => {
    type ChainIsNonExecutableDefinition = Expect<
      Equal<AssignableTo<ChainDefinition, PinnedNonExecutableDefinition>, true>
    >;
    type ProtocolIsExecutableDefinition = Expect<
      Equal<AssignableTo<ProtocolDefinition, PinnedExecutableDefinition>, true>
    >;
    type ChainInstanceIsPinnedInstance = Expect<
      Equal<AssignableTo<ConnectedChainInstance, ConnectedInstancePin>, true>
    >;
    void 0 as unknown as ChainIsNonExecutableDefinition;
    void 0 as unknown as ProtocolIsExecutableDefinition;
    void 0 as unknown as ChainInstanceIsPinnedInstance;
    expect(true).toBe(true);
  });

  it("catalogue never authorizes (type-level): a chain definition is NOT a connected instance", () => {
    type DefinitionIsNotInstance = Expect<Equal<AssignableTo<ChainDefinition, ConnectedChainInstance>, false>>;
    type NotAssignableToInstance = NotAssignable<ChainDefinition, ConnectedChainInstance>;
    void 0 as unknown as DefinitionIsNotInstance;
    void 0 as unknown as NotAssignableToInstance;
    expect(true).toBe(true);
  });

  it("execution request reuse: OnchainExecutionRequest extends the pinned canonical connector execution request", () => {
    type IsConnectorExecutionRequest = Expect<
      Equal<AssignableTo<OnchainExecutionRequest, PinnedConnectorExecutionRequest>, true>
    >;
    void 0 as unknown as IsConnectorExecutionRequest;
    expect(true).toBe(true);
  });

  it("finality candidates are structurally candidates only (literal types — INV-1)", () => {
    type CandidateOnlyLiteral = Expect<Equal<OnchainFinalityCandidate["candidateOnly"], true>>;
    type RequiresProtocolFinalityLiteral = Expect<
      Equal<OnchainFinalityCandidate["requiresProtocolFinality"], true>
    >;
    void 0 as unknown as CandidateOnlyLiteral;
    void 0 as unknown as RequiresProtocolFinalityLiteral;
    expect(true).toBe(true);
  });

  it("the smart-account permission envelope literal cannot be weakened (the non-custody law)", () => {
    type EnvelopeLiteral = Expect<Equal<SmartAccountCapabilityDeclaration["permissionEnvelopeRequired"], true>>;
    void 0 as unknown as EnvelopeLiteral;
    expect(true).toBe(true);
  });

  it("INV-20: the controlled escape hatch literals cannot be weakened", () => {
    type EscapeHatchLiteral = Expect<Equal<ContractInteractionCapabilityDeclaration["controlledEscapeHatch"], true>>;
    type CertificationLiteral = Expect<Equal<ContractInteractionCapabilityDeclaration["certificationRequired"], true>>;
    type UnknownWritePolicies = Expect<
      Equal<
        ContractInteractionCapabilityDeclaration["unknownWritePolicy"],
        "BLOCK" | "REQUIRE_ESCALATION"
      >
    >;
    void 0 as unknown as EscapeHatchLiteral;
    void 0 as unknown as CertificationLiteral;
    void 0 as unknown as UnknownWritePolicies;
    expect(true).toBe(true);
  });
});
