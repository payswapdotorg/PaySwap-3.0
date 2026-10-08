# PaySwap 3.0 Capability and Connector Model

Canonical hierarchy:

CapabilityDefinition -> ProviderImplementation -> ConnectedCapabilityInstance -> CapabilityObservation.

A catalogue describes potential provider behavior. A ConnectedCapabilityInstance is the scoped, authorized, eligible execution surface for an actual connection. Observations record current health, scope, eligibility, quota, terms and external state.

Every executable capability must declare semantics, state machine, preconditions, authorization, financial-effect class, idempotency/retry behavior, compensation/cancellation, partial execution, user actions, provider-state mapping, external IDs/revisions, evidence requirements, economic terms and jurisdiction/eligibility constraints.

Consequential provider state is preserved in a ProviderStateEnvelope where required.

Execution modes are explicit: PASS_THROUGH_NATIVE, COMPOSED_PAYSWAP, OPTIMIZED_MULTI_PROVIDER.

Connection forms may include delegated OAuth, connected accounts, scoped API credentials, isolated interactive browser sessions and providerless rails. Credentials remain outside agent/model context.

The same model represents banks, PSPs, cards, mobile money, Stripe/Connect, FX, credit/liquidity, chains, wallets, DEXs, bridges, smart-contract protocols, data providers, experts, agents and future services.