# CP-WS-02D/D — Recipient Acceptance Landing (Disabled by Default)

This increment adds the Pages hash-route recipient handoff to the existing CRM without activating invitation acceptance. It is part of CP-WS-02D/D and does not grant membership.

- A one-time email fragment `#/invitations/accept/<token>` is validated and immediately replaced with the token-free `#/invitations/accept` route via `history.replaceState`. The token is held only in volatile module memory; malformed or unscrubbable links are rejected. Signed-out recipients see a sign-in prompt and may continue in the same tab without local persistence of the token.
- The landing screen contains no bearer URL or email address. It displays a clear non-activation message and a disabled acceptance button until the backend is installed and signed verification passes. Navigation, logout and session expiry clear the volatile token.
- The typed acceptance client requires fresh signed identity and current authorized workspace context, performs a one-shot bearer-authorized request to the intended trusted server endpoint, validates `member`/no-switch receipt and never automatically retries uncertain acceptance. It is `WS02D_ACCEPTANCE_ENABLED=false`.
- The existing user-profile role, current workspace and board access are unchanged. The server remains solely responsible for recipient verified-email matching, one-use token hashing, same-session actor checks, anti-replay, and atomic membership/audit.

Do not enable the client flag until the production acceptance route, private DB function/grant, GoTrue session-revocation guard and signed permission tests are deployed and independently verified. Never log tokens or send them to analytics. No real invitations, auth changes or backend migrations were performed here.
