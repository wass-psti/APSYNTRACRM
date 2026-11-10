# BS01 — Working Local Invitation Lab

**Status:** Functional **LOCAL SIMULATOR ONLY**, not live Supabase collaboration.  
**Branch:** \`feat/board-scoped-guest-invites-20261110\`  
**Never expose port 8765 outside your own computer.** No real records, real users, production policies, or external access are created.

## Run it on Windows

In GitHub Desktop, select the feature branch, Fetch origin and Pull origin. Open VS Code at the repository root. Node.js 22 or newer is recommended.

### Terminal 1 — APSYNTRA local frontend

\`\`\`powershell
py -m http.server 8000 --bind 127.0.0.1
\`\`\`

Browse to \`http://127.0.0.1:8000\`, sign in to the existing APSYNTRA UI, and open any board's **Share & access** popup.

The **Open local invitation lab (demo only)** button is visible **only** from \`127.0.0.1\` or \`localhost\`. The actual CRM board stays protected, and its Copy guest invitation link control stays disabled.

### Terminal 2 — isolated invitation lab

\`\`\`powershell
node server/bs01-local-lab-server.mjs
\`\`\`

Visit \`http://127.0.0.1:8765\`. The lab binds only to loopback; it doesn't read \`frontend/config.js\`, doesn't contact Supabase and doesn't mutate APSYNTRA's live tables.

## Demonstration walkthrough

1. Select **Board manager**, enter \`owner@example.test\`, and click **Enter demo session**.
2. **Demo Project Collaboration** starts Private. Switch its policy to **Guest Shareable**, click **Save policy**. The demo HR application stays locked and cannot be externally shared.
3. Click **Generate demo link**, then **Copy link**. One-use 256-bit random secret, with 24-hour expiry.
4. Open a second browser tab, navigate to the copied link. The page captures and removes the token from browser history immediately.
5. Sign in as simulated **External guest** \`guest@example.test\`, then click **Accept invitation**. The guest sees only sample records of the selected demo board and never gains workspace membership.
6. Try another board's API (or the demo HR board) with that session: the server denies access. A second redemption of the same link also fails.
7. Return to the manager and click **Revoke this invitation**. The guest's subsequent board read is denied. Setting the policy back to Private also revokes the guest grant.

Simulation identities are **not real authentication**; the manager role is intentionally self-selected for development. The isolated server state disappears when restarted, including tokens and permissions. Use only synthetic test emails and demonstration records.

## Automated verification

\`\`\`powershell
node --check server/bs01-local-sandbox-core.mjs
node --check server/bs01-local-lab-server.mjs
node --check frontend/bs01-local-lab.js
node --test server/tests/bs01-local-lab.test.mjs
node --test frontend/tests/board-share.test.mjs frontend/tests/board-share-phase2.test.mjs server/tests/bs01-policy-http-boundary.test.mjs server/tests/bs01-local-lab.test.mjs
\`\`\`

The branch-specific GitHub Action checks source and local API behavior; CI passing is not evidence of genuine GoTrue authentication, production RBAC, PostgreSQL RLS or data redaction acceptance.

## What is STILL missing for real invitations

A real guest invitation system needs production-suitable, independently reviewed and tested components:

- Resolve the existing signup admission and legacy trigger defects; verify email before provisioning a non-workspace guest. Don't enable registration by flipping a frontend flag.
- Build trusted deployed Supabase Edge handlers for per-board policy, link issue/redeem/revoke, and actor-bound grants. Genuine user JWT + live \`auth.sessions\` must be checked server-side. The staged BS01 PostgreSQL candidate has **not** been runtime-tested or installed on shared Supabase.
- Add resource-specific redacted guest read endpoints and deny independent app RPCs, direct table reads, Storage signed URLs, exports, Realtime, workspace catalog and administrative APIs. The 12 integrated apps remain blocked from external sharing until individually audited.
- Perform a disposable PostgreSQL 17 and genuine signed-session security test matrix, including concurrent redemption, wrong-recipient, foreign-board, revoked session, protected data and audit. Review recoverability and controlled deployment with the IT partner.
- Reconcile branch divergence with \`main\` before any merge. The local lab is not a substitute for these controls.

## Relevant source

\`server/bs01-local-sandbox-core.mjs\` · \`server/bs01-local-lab-server.mjs\` · \`frontend/bs01-local-lab.html\` · \`frontend/bs01-local-lab.js\` · \`frontend/bs01-local-lab.css\` · \`server/tests/bs01-local-lab.test.mjs\`.

The CRM modal integration is in \`frontend/board-share.js\`; it adds a local-only launch control without changing real permission checks.
