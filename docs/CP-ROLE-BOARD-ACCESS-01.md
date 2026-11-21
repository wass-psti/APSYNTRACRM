# CP-ROLE-BOARD-ACCESS-01 — Superseded Scope Notice

This earlier implementation incorrectly placed Board Access in the Role Configuration module. The corrected requirement is **Native Application Access**, implemented in `docs/CP-ROLE-NATIVE-APP-ACCESS-01.md`.

- Role Configuration now exposes Native Application Access for the twelve native applications.
- Individual and multi-user / multi-application assignment use the existing application-role services.
- Board Access remains in its existing Teams / User Role Management workflow and is not part of Role Configuration.

Do not use the former Board Access-in-Role-Configuration implementation as the acceptance target.
