# PaySwap 3.0 Invariants

A violation blocks merge or release.

1. One Financial Protocol Authority.
2. Exact/lossless monetary representation only.
3. Historical financial facts are immutable and versioned.
4. UNKNOWN is distinct from FAILED and is reconciled rather than blindly retried.
5. Every consequential financial effect has authorization lineage and evidence lineage.
6. State-changing commands are idempotent and replay-safe.
7. External provider/wallet balances are observations, not PaySwap custody.
8. PaySwap has no unilateral withdrawal authority over user/provider funds.
9. Agents, LLMs, Lab, optimizers and simulations cannot declare financial truth.
10. Opportunity/discovery output cannot directly authorize execution.
11. Simulation is never production financial authority.
12. Child delegation is strictly attenuated.
13. Provider catalogue capability is not executable connected capability.
14. Provider state is preserved where needed for action/reconciliation/audit.
15. Provider-native execution remains a candidate baseline.
16. Provider implementations do not leak into provider-neutral domain contracts.
17. Blockchain is one settlement rail family, not a parallel financial system.
18. Supported onchain writes follow prepare -> simulate where supported -> security -> human-readable diff -> authorize -> immediate recheck -> execute -> observe/finality -> reconcile/evidence.
19. Raw private keys, seed phrases, passwords, MFA material, API secrets and protected session cookies never enter model context or ordinary artifacts.
20. Generic contract writes never execute silently without sufficient identity, semantics, security and authority.
21. Security/adversarial intelligence cannot downgrade BLOCK.
22. Web/Desktop/Mobile/Extension/SDK/API share framework-independent PaySwap Surface contracts.
23. UI never owns financial truth.
24. No dead financial actions, fake success states or fabricated provider effects.
25. Test/sandbox/live/mainnet distinctions are explicit and mechanically enforced.
26. No circular package dependencies.
27. Domain contracts do not import UI/framework/runtime implementation details.
28. Work Orders are pairwise-disjoint.
29. Frozen architecture changes require ADR + dependency-graph + state updates.