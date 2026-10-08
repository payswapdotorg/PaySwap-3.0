# Migration Map: payswapdotorg/payswap.org -> PaySwap 3.0

Reference repository: `payswapdotorg/payswap.org`.

Preserve after source/test review: EconomicGoal; MoneyMovementIntent; payment primitives; Financial Protocol Authority; Trust/Authorization; capability hierarchy; ProviderStateEnvelope; native/composed/multi-provider execution; exact money; UNKNOWN/reconciliation; non-custody; obligations/clearing/netting/settlement/finality; FX/liquidity/credit; FinancialOpportunity; Strategy vs Organization; Lab; proof/evidence lineage; onchain capability/security; mixed-rail routing; merchant crypto/Stripe concepts; framework-independent Surface API.

Do not mechanically copy the old package tree. For every candidate implementation classify REUSE, ADAPT, PORT, REWRITE or RETIRE after mapping its authority owner and ZCode equivalent.

PaySwap 3.0 architecture wins over the old repository. Old source and tests are evidence, not authority for the new system.