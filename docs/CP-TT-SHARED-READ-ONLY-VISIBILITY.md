# TimeTracker shared read-only visibility

Status: proposed; implementation and acceptance pending. Do not merge this specification alone as a functional fix.

## Required behavior

- Authorized regular employees and OJT interns can view regular employee and intern attendance records (active and completed) and overtime requests (pending, approved and rejected) across departments in the same authorized company/workspace. All sessions, Today, Completed, Active, date filtering, search and counts use this authorized read scope.
- The OT list retains the duration-only presentation. Employees may file and withdraw their own eligible pending requests under existing rules. OJT filing eligibility remains unchanged. No ordinary employee or intern may approve, reject or administratively delete OT, or correct, edit, add or delete attendance records. Existing authorized System Admin, platform Admin, HR and other role-specific privileges must not be widened or reduced.
- Keep Clock, My Hours, active session resolution and writes tied to the authenticated employee or validated selected OJT identity. Shared read visibility must never allow clock actions against another person's session. Do not change auto-clockout, approved OT extension, manual attendance synchronization, historical isolation, OJT scheduler or Employees directory authorization.

## Implementation requirements

- Inspect the current main branch's native TimeTracker attendance and OT snapshot paths, signed RPCs, policies and OJT shared-account identity flow. Replace personal-only list scope with a narrowly authorized workspace read projection where needed, not a global table grant or unrestricted client-side fetch.
- Enforce workspace membership and validated selected OJT identity server-side; reject anonymous, disabled and unauthorized cross-workspace callers. Return only attendance/OT display fields needed for the shared pages, not precise GPS or unrelated private fields. Preserve owner-only personal reads and existing privileged detail access. Do not infer write capabilities from visibility. Retain signed row-level review capabilities and all server-side write guards; hide unavailable actions in UI.
- Use forward-only Supabase migration(s) if necessary; update migration source manifest and CI path filters as applicable. Never rewrite applied migrations. Account for recent signed OT duration/review and cancellation changes in PRs #921, #927, #928 and #929 where present in main.

## Merge acceptance gates

- [ ] Regular employee sees other regular employees and OJT logs and authorized OT statuses; date/search/status filters and counts reflect the visible rows.
- [ ] Selected OJT intern sees regular employees and other interns; changing selection preserves personal clock identity and does not confer mutation privileges.
- [ ] Ordinary employee and OJT cannot correct/edit/delete/add administrative attendance or approve/reject/administratively delete OT through UI or direct signed API; own eligible operations remain intact.
- [ ] Existing authorized reviewers retain their signed capabilities, including self-review restrictions and existing cancellation policy.
- [ ] Anonymous, inactive and unauthorized cross-workspace callers cannot retrieve shared data; no GPS leakage through shared list projection.
- [ ] Clock, My Hours, active session binding, nine-hour auto-clockout, OT extension, historical attendance and OJT worker regression tests pass.
- [ ] Signed browser and disposable database tests exercise the real authorization boundary; required GitHub CI checks pass; review migration/deployment order before merging.
