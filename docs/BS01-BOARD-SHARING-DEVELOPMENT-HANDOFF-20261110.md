# APSYNTRA BS01 — Full source handoff (2026-11-10)

**Branch:** \`feat/board-scoped-guest-invites-20261110\`  
**Status:** UI PREVIEW WIRED; PRIVATE BACKEND SCHEMA STAGED FOR DISPOSABLE TESTING ONLY; **INVITATIONS NOT OPERATIONAL**.

This is a deliberately non-disruptive integration pass for a permission-sensitive feature. No production schema, existing account, board member, Storage file, workspace membership, role or Auth trigger was changed.

## Files and exact purpose

| Path | Modification | Deployment impact |
| --- | --- | --- |
| \`frontend/app.js\` | Complete existing 6,770+-line source retained; integrates Share & access under signed active board, handles logout/navigation cleanup | UI only, no mutations |
| \`frontend/board-share.js\` | New complete share-preview module, false activation flag, policy receipt validation, private-by-default and CSP-safe modal | No link issuance, no network |
| \`frontend/tests/board-share.test.mjs\` | New Node tests for unsafe scope, policy forgery, UI escaping, original invite flags, private SQL source | Local/CI only |
| \`sql/bs01-board-guest-sharing-disposable-candidate.sql\` | New **disposable-only** schema: private policy, false flags, salted SHA256 one-use links, per-board grants, audit, signed actor, issuance, redemption, revocation, future upper-bound predicate | Refuses to install unless database name is \`workspace_disposable\`; no public/browser execution grants |
| \`docs/BOARD-SCOPED-GUEST-INVITES-ARCHITECTURE-20261110.md\` | Complete architecture, permissions and release gates | Documentation |

\`frontend/workspace-invitation-client.js\`, \`frontend/auth-account-flows.js\`, existing \`work_board_access\`, \`work_board_members\` and module RPCs remain unchanged.

## Pull latest development-branch source locally

In GitHub Desktop, verify that **Current branch** is \`feat/board-scoped-guest-invites-20261110\`, choose **Fetch origin**, then **Pull origin** if it appears. No changes should be applied to \`main\`.

In VS Code from the repository root:

\`\`\`powershell
git branch --show-current
git pull --ff-only origin feat/board-scoped-guest-invites-20261110
node --check frontend/app.js
node --check frontend/board-share.js
node --test frontend/tests/board-share.test.mjs
node --test frontend/tests/*.test.mjs
py -m http.server 8000 --bind 127.0.0.1
\`\`\`

For Python server, use a separate terminal from Node tests and open \`http://127.0.0.1:8000\`.

## Preview behavior

Sign in with an existing allowed account; open any authorized board. A **Share & access** action is now present in the board header. It displays the selected board's identity, conservatively reports the unavailable policy, explains why external sharing is disabled and includes a non-functional **Copy guest invitation link — pending backend approval** control. No URL or guest permission is generated.

For standalone apps represented as boards (FuelTrack, TradeLink, FRT, Employee Evaluation, etc.), this is an additional display gate, not proof their independent backend reads/writes are safe for guests. Private-by-default applies to *external sharing*, not a change to existing internal resource permissions.

## Security and rollout blockers

1. **Disposable SQL runtime acceptance** is not yet executed. This candidate is a reviewable design, not a production migration. Test PostgreSQL 17 source compatibility, verified/new GoTrue identities, concurrent single-use redemption, replay, revoke, email binding, policy downgrade, workspace-less guest and audit persistence.
2. **New account onboarding:** legacy signup triggers/registration approval must be hardened and independently verified before external unregistered users can complete an invitation. Never merely flip \`REGISTRATION_ADMISSION_ENABLED\`.
3. **Dedicated guest API:** \`private.bs01_guest_read_allowed\` is *ungranted* and intentionally not wired into broad \`work_board_access\`. Implement an approved signed, field-redacted, resource-exact guest read endpoint; require negative tests for *every* module RPC, Storage, exports, Realtime and direct reads.
4. **Policy administration:** implement reviewed server-side enable/disable and per-application classification. A browser/client flag is not policy authority. Sensitive application approvals need application and record-level evidence.
5. **Trusted Edge adapters:** verify real GoTrue sessions and check board manage rights at issuance, plus receipt safety, rate limits, logging, origin/CORS, token scrubbing, idempotency, revocation and abuse prevention. Keep all activation flags false until complete.
6. **Approval and recovery:** follow existing production backup/rollback and explicit migration authorization process. A merge into \`main\` is *not* approval to deploy SQL.

## Do not run this SQL on production

\`sql/bs01-board-guest-sharing-disposable-candidate.sql\` has an explicit test database-name guard; don't remove it as a shortcut. Under no circumstances use the production Supabase SQL Editor to install the candidate.

## Validation state

Source changes are committed to the **feature branch only**. Unit tests are provided but must be run on a Node-capable checkout or in reviewed GitHub CI. No claim of PostgreSQL acceptance, signed guest access, local application sign-in beyond earlier user testing, or end-to-end invitation functionality is made.
