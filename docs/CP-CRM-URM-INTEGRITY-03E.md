# CP-CRM-URM-INTEGRITY-03E — Owner Native Integration and Signed Role Acceptance

**Scope:** Nonproduction, disposable policy-integration candidate for four already-native modules. **Not a production migration.**

The existing 03D verified owner mapping is evaluated as a final fallback inside the existing workspace scoped role resolver. Explicit workspace assignments, including explicit disabled entries, remain authoritative. Legacy enabled module assignments take precedence. An explicit workspace CRM override disables the owner-role fallback. Nonowner users, inactive users/memberships, nonpersonal workspaces and eight remaining applications do not inherit the fallback. The central `module_role_for` and `has_module_access` code paths remain the consuming APIs; no broad platform-admin change, new role grant, RLS change, or user assignment is part of this proposal.

`sql/cp-crm-urm-integrity-03e-owner-native-integration-candidate.sql` is **disposable CI only**; the dedicated workflow provisions synthetic PostgreSQL 17 fixtures and checks native roles, positive access, explicit disabled overrides, legacy precedence, CRM role override, foreign selected workspace and inactive membership. Neither this candidate nor the 03D candidate is an activation migration.

**Genuine signed acceptance remains independent:** Two distinct signed Employee accounts were previously verified in the shared Work Management workspace, but no eligible genuine signed administrator/employee pair was present. No production role mutation, refresh/re-login propagation, target action allow/deny or browser cross-session acceptance may be claimed from synthetic SQL. A genuine administrator signed into the same test workspace and a reversible nonproduction target assignment are prerequisites to closing the milestone.

**Production activation gate:** Changes to server-side native authority and any production role/membership records require separate explicit approval, deployment review and signed functional acceptance. No new Supabase project or extra authority restrictions are proposed.
