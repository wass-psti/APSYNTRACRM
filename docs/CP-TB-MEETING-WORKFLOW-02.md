# CP-TB-MEETING-WORKFLOW-02 — Persistent Date-Specific Meeting Sheets and Reports

Date: 2026-11-21 (Asia/Manila). Native APSYNTRA CRM TalkBox in the existing `wass-psti/APSYNTRACRM` repository and existing Supabase database.

## Functional contract

- **Meeting creation:** `Enter Meeting` uses the selected valid ISO local calendar date. The native client reads all active issue pages before creation (up to 500 records), then writes a date-specific meeting record to existing signed `toolbox_issues_state_put` with `p_previous_version`; it independently re-reads through `toolbox_issues_state_get`. Reentering an existing date is idempotent and does not duplicate it.
- **Persistence:** Single workspace-scoped state key `talkbox.meetings.v1` stores `{schema:1, meetings:[...]}`. The ledger retains chronological meeting history, per-date issue IDs, issue snapshots at meeting creation, notes, timestamps, and carry-over provenance. Size, count, date, duplicate-ID and note limits are validated in the client. No localStorage, mock backend, schema migration, RLS or permission change.
- **Carry-over:** A new meeting carries unresolved issue IDs from the most recent earlier saved meeting, and includes current unresolved active issues. Previously completed issues are not carried as active work. Existing native issues remain authoritative and no duplicate Toolbox issues are created.
- **History:** The meeting overview lists saved dates and opens historical sheets. Current issue details are read through a bounded paginated signed list rather than one query per issue. Archived or unavailable issues retain their saved meeting snapshot, are labeled unavailable, and cannot be edited from a historical-only row.
- **Meeting notes:** Editable meeting summary/decisions/next actions are saved using the same versioned state RPC and read back. Existing UI edit eligibility is retained for writes; read-only viewers can inspect saved meetings.
- **Reports:** CSV downloads use saved meeting snapshot names/statuses/assignees/target dates, latest available issue status, carry-over provenance and saved notes. Fields are CSV quoted and formula-like leading values are neutralized. The report is created locally from signed readbacks with no additional backend query or external service.
- **New issues:** When an editor creates an issue while a meeting is open, its native issue ID is added to that meeting record with versioned persistence. Inline issue-status edits continue using existing CAS-checked issue updates.

## Verification evidence

- Focused TalkBox tests, including signed-mock meeting create/reopen, notes, idempotency, carry-over, history, conflicts, malformed input, CSV safety and archived snapshots: **79/79 PASS**.
- Full frontend suite: **3218/3218 PASS** on clean rerun. An unrelated timing-sensitive board-import timeout check failed once under parallel test scheduling, then passed in isolation (2/2) and in the full rerun. No board-import source was changed.
- `npm run build`, `npm run lint`, targeted ESLint on all modified JS, `npm run format:check`, CSS source/bundle integrity: **PASS**.
- Real isolated Chromium browser-fixture acceptance at 1440x900, 820x1000 and 390x844: **PASS** for saved meeting notes, CSV control, archived snapshot, editor-only issue status, and contained page width. The report source is independently checked. No production records were written during visual checks.
- Production **read-only** GoTrue-verified owner session successfully read existing workspace meeting state key. It was absent at `version:0` before activation; this implementation does not overwrite existing stored meetings. Signed production write/readback remains pending a legitimate nonproduction or specifically authorized disposable-data acceptance.

## Scope and limitations

No Supabase migrations, role changes, credentials, new data access policies, other module changes, dependency additions, or production operational-data mutations. Saved meetings reference **live** issue records; the snapshot retains meeting-entry values for historical audit, while later status edits remain in the actual issue record. CSV is the implemented report format; PDF/print layouts are not claimed.

The existing state RPC serializes all meetings into one versioned workspace value; this is appropriate for the explicitly bounded meeting ledger but not intended as an unbounded reporting warehouse. Simultaneous state version conflicts are surfaced, not silently retried. If meeting volume exceeds bounds, a separately reviewed schema improvement would be required rather than weakening existing integrity.

**Acceptance distinction:** Code and synthetic contract coverage can be verified locally; merged GitHub Pages deployment can verify the signed read-only UI. Live production meeting writes and independent multi-account acceptance are not implied by local tests and must be separately evidenced if requested.
