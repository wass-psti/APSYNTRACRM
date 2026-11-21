# CP-CRM-DARK-05 — Board sharing and people/group picker

## Audit finding
The board `Share & access` dialog (`board-share-clean.css`) and embedded people/groups picker (`workspace-board-groups.css`) retain white cards, dark-on-light labels and pale disabled controls independently of the existing workspace invitation theme. These components were omitted from prior shared modal work. The problem is a separate stylesheet boundary, not access control.

## Changes
A dark-only `frontend/dark-board-sharing.css` is last in the deterministic bundle. It makes the board-share frame, title, descriptive text, privacy pill, icon tiles, section borders, secondary/primary/disabled actions, inputs, people/group picker tabs, search fields, result rows and disabled group controls match the existing charcoal and blue reference theme. Focus and reduced motion are preserved. No routes, backend/API calls, membership assignments, access checks, RLS, permissions, invitation lifecycle, light-mode presentation or layout geometry are altered.

## Browser evidence
`node scripts/cp-crm-dark-05-browser.mjs` renders identical representative Share & access HTML with the prior and new CSS in real Chromium at 390/768/1440 CSS pixels for both themes. It checks dark surface colors, representative text contrast >=4.5:1, focus, reduced motion, no horizontal overflow and unchanged computed light-mode colors. `docs/visual/cp-crm-dark-05/` contains before/after 1440px fixture screenshots (NOT authenticated production screenshots). Full tests/build and GitHub CI are independent acceptance gates.
