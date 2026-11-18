# CP-TB-NATIVE-01P — Genuine Read-Only Provider Connection and Historical Source Recovery

Date: November 19, 2026.
Repository: wass-psti/APSYNTRACRM.
Status: **PROVIDER CREDENTIAL UNAVAILABLE; ONE-SESSION RECOVERY TOOLING VERIFIED; LIVE MEDIA/SUBITEM RECOVERY NOT EXECUTED.**

## Connection and source evidence

The MacBook and its original private evidence files are available. No MONDAY_API_TOKEN, MONDAY_TOKEN, or MONDAY_API_KEY exists in the invoking process environment.

Authenticated browser navigation to the reported original subitem board 18371220520 again redirects to parent TalkBox board 18370784140. This does not constitute a provider-confirmed zero-subitem count.

The pinned original workbook contains 87 issue IDs, 1129 discussion posts, 70 threaded reply links, and 148 unique asset IDs from 51 source posts. **0 original media byte bodies independently retrieved; original subitem IDs not established.**

Official monday.com API authentication requires a personal token, or an authorized application token with appropriate read scopes. A personal token mirrors existing monday user permissions. The signed browser session does not automatically give the Mac terminal an API token. No provider credential was created, regenerated, copied, or extracted during this milestone.

## Read-only single session runner

The new scripts/talkbox-provider-session.py checks exact hashes of the private 01J source manifest and 01L media inventory before using any API credential. It accepts an existing process-local MONDAY_API_TOKEN or an echo-disabled, local interactive Mac Terminal prompt. It never embeds the token in command arguments, shell history, GitHub CI, files, messages, or logs.

The runner sequentially:
1. Calls the 01M provider evidence client, validating all 87 source parent IDs and all 148 asset metadata identities, including any original child IDs/parent relationships.
2. Executes 01N resumable private original-asset download with fresh provider public URLs, byte-length checks, SHA-256 receipts and replay integrity.
3. Executes independent 01N source-only parity readback, validating all original parent identities and original files.

The runner halts on a missing credential, incomplete/incorrect counts, provider errors, or failed media verification. Outputs are private, unique per session and outside the repository. Source-only success never authorizes production migration, and ready_for_production is always false.

## How the existing signed user supplies an authorized token locally

In monday.com, select profile picture > Developers > API token > Show (provider official instructions). Do not regenerate the token; token regeneration would invalidate existing integrations.

In Mac Terminal, run:

    cd "$HOME/.apsyntra-work/cp-tb-native-01p-20261119"
    python3 scripts/talkbox-provider-session.py

The script requests the token in the local Terminal with hidden input and uses it for this session only. Do not paste it into ChatGPT, shell history, screenshots, GitHub, CI, or log files. No token is persisted by the script.

For deterministic blocked-credential acceptance, use:

    python3 scripts/talkbox-provider-session.py --non-interactive

## Acceptance and remaining evidence gates

- One-session recovery orchestration and eight new synthetic tests: VERIFIED locally.
- 54 focused TalkBox source tests: VERIFIED locally.
- Actual live provider API connection: BLOCKED, existing approved token not available.
- Original subitem IDs or provider-confirmed zero, 148 original media byte bodies: BLOCKED.
- History-preserving, separately approved historical production migration and signed archived-inclusive CRM reconciliation: PENDING.

No Supabase project, production schema, historical records, roles, permissions, RLS/RBAC or credential was changed. The existing 01K/01L isolated staging acceptance remains intact.

Next dependency/milestone: CP-TB-NATIVE-01Q — Approved Existing monday.com API Credential Handoff, Genuine Read-Only Historical Capture, and Final Source Reconciliation.
