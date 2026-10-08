# PaySwap 3.0 Economic Execution Graph

The Economic Execution Graph (EEG) is the canonical typed, versioned representation of a proposed or authorized multi-step economic plan.

Goal -> Intent -> Candidate Graphs -> Eligibility/Policy -> Strategy/Organization -> Authorization -> Execution -> Observation/Finality -> Reconciliation/Evidence.

Each node/edge carries stable identity/version, capability reference, economic inputs/outputs, authority lineage, policy/security verdict, freshness dependencies, idempotency boundary, evidence, finality and recourse/compensation semantics.

Representative routes include crypto -> DEX -> stablecoin -> off-ramp -> bank; fiat -> PSP -> stablecoin -> chain -> recipient; chain A -> bridge -> chain B; eligible crypto -> Stripe capability -> merchant fiat settlement; and bank -> FX -> PSP -> recipient.

Compilation is deterministic for fixed inputs. Material changes to route, destination, asset, amount, risk or capability observations invalidate affected authorization.

Supported lifecycle: observe -> prepare -> simulate where supported -> policy/security -> authorize -> immediate recheck -> execute -> observe -> finality -> reconcile -> evidence.