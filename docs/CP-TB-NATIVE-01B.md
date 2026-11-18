# CP-TB-NATIVE-01B — TalkBox source reconciliation and signed lifecycle

## Evidence boundary (2026-11-18)

- Original monday.com source board: `18370784140`; source subitem board: `18371220520` (as supplied by user).
- The user's captured TalkBox UI displays **87 issues**; this is screenshot evidence, not a verified full export.
- Live APSYNTRA Supabase project `jtlusodorfnyzgyuewkz` contains **2** `public.toolbox_issues` rows at inspection time, both without the inspected monday source-ID keys.
- Existing live RPC definitions: `toolbox_issues_list_issues`, `get_issue`, `create_issue`, `update_issue`, `add_update`, `create_subitem`, `update_subitem`. All are in the original backend and use its existing authentication and workspace checks. No new grants, roles, schemas, or policy migrations are introduced here.
- The monday.com browser tab cannot be queried by the current ChatGPT session; a real source export or authorized signed browser access is required to prove the complete source record set.
- Live private projection `private.toolbox_issue_subitem_json` emits `boardId=18370784141`, conflicting with the provided source subitem board ID `18371220520`. This is a provenance mismatch, **not** proof of an incorrect underlying subtask. The migration path must not silently equate these identifiers.

## Implemented on feature branch

1. `talkbox-reconciliation.js`: read-only deterministic source issue-ID and subitem-ID reconciliation, with distinct authoritative board identities. It rejects duplicate IDs, wrong source boards, and incomplete evidence; it never matches records using title, and never writes.
2. `talkbox-native.js`: readback-verified issue creation, versioned updates, comment posts, and subtask create/status updates. Response receipts alone are not treated as persistence evidence.
3. `talkbox-ui.js` and `app.js`: delegated subtask controls in the existing TalkBox drawer; creation, edits, and posts now await independent signed readback before displaying success.
4. `data.js`: existing post-commit cache invalidation registry includes the two subtask write RPCs.
5. `frontend/tests/talkbox-native-01b.test.mjs`: identity collision, partial-source, readback, subtask and DOM escaping tests.

## Acceptance not yet claimed

- Genuine monday.com full-board and subitem export (including stable source IDs, status/date/person columns, update-thread IDs and history).
- Authoritative source-to-CRM identity ledger and non-destructive import/refresh plan with duplicate prevention and transactional restart behavior.
- Signed user create, edit, comment, subtask, and reload verification on disposable records, with safe cleanup.
- Live browser regression and cross-tab data freshness; final CI build and deployment.

Do not mass import, backfill, overwrite existing operational records, infer historical users by name, or claim TalkBox source parity without this evidence. Maintain the existing workspace and authentication boundary; do not add any new authorization feature.
