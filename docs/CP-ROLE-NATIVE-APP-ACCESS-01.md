# CP-ROLE-NATIVE-APP-ACCESS-01 — Native Application Access in Role Configuration

## Objective

Integrate Native Application Access configuration into the existing APSYNTRA CRM Role Configuration module. The Role Configuration navigation uses the **Native Application Access** section instead of the incorrectly introduced Board Access section. Board Access remains in the existing Teams / User Role Management workflow.

## Delivered

- Add **Native Application Access** to the six-section Role Configuration navigation.
- Reuse the existing User Role Management snapshot, application assignment client, and module-specific role mutation services.
- Provide individual member selection and the existing per-application Assign / Change and Revoke controls for all twelve native applications.
- Provide bulk member selection, multi-application selection, a separate role selector for each selected application, and bulk Assign / Change or Revoke.
- Plan each member/application pair independently so a pair that cannot use its existing assignment contract is reported as skipped without preventing other valid pairs from being processed.
- Refresh the authoritative application assignment snapshot after the batch and show per-member/per-application results: Saved & verified, Unchanged, Skipped, Failed, or Not attempted.
- Compare the reviewed plan with a fresh signed snapshot before any bulk writes; stale plans are not silently rebased.
- Preserve the existing Teams Board Access section and the other Role Configuration proposal sections.
- Add responsive styling, keyboard focus states, and regression coverage.

## Existing assignment contracts reused

- `UserRoleManagementClient.snapshot()` for the active workspace, including specialized FuelTrans, Fund Released Tracker, scoped-six, and Charter sources.
- Existing module-role RPC mutation for centrally managed application assignments.
- Existing workspace-specific setters for FuelTrans, Charter Navigator, the scoped-six application set, Fund Released Tracker, and Tool Traceability.
- Existing per-application role catalog and application-specific role values.

## Boundaries

- No new application role hierarchy, membership table, permission model, RPC, or database migration.
- No change to application role names, role semantics, or effective-access computation.
- No change to the existing Teams board-access workflow.
- No additional authorization restrictions are introduced. Existing signed assignment services and their established behavior remain authoritative.
- Role catalog, permission-matrix, and workspace-policy proposals remain staged-only.

## Acceptance

- Role Configuration displays **Native Application Access** and does not display a Board Access tab.
- Individual configuration displays all twelve applications and the selected member's current stored role, with existing Assign / Change and Revoke actions.
- Bulk configuration supports multiple members and multiple applications, with an independent role selection for each application.
- Bulk Assign / Change and Revoke use existing module-specific assignment services.
- Each pair is independently classified; a skipped or failed pair does not falsely mark other pairs as successful.
- Every successful write is confirmed from a refreshed authoritative assignment snapshot before the UI reports **Saved & verified**.
- The Teams route continues to render and operate its existing Board Access section.
