# PaySwap 3.0 Non-Custody Boundary

PaySwap is an orchestration and economic-coordination layer, not hidden custody.

PaySwap may model obligations/reservations, calculate routes and positions, authorize scoped external execution, observe external balances/positions, reconcile results and record protocol obligations, fees, incentives, credit and recourse.

PaySwap may not claim an internal balance proves custody, unilaterally withdraw user/provider funds, move a smart account outside its permitted authorization path, or infer account-level authority from catalogue data.

SmartAccountCapability may support policy-limited automation, session keys, batching or sponsorship where supported. Root credentials remain outside model context.

Value-holding contracts must expose and be assessed for source/bytecode correspondence, upgrade/admin powers, pause powers, custody/withdrawal paths, oracle/bridge dependencies, attack surface and recovery.