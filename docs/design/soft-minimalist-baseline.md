# APSYNTRA CRM — Soft Minimalist Enterprise Design Baseline

**Status:** Authoritative UI/UX direction, unless explicitly superseded.  
**Repository:** `wass-psti/APSYNTRACRM` · **Branch:** `main`  
**Scope:** Frontend presentation only. This document does **not** authorize backend, role, database, or deployment-policy changes.

## Design intent

Calm surfaces, precise hierarchy, functional elegance, enterprise efficiency. Favor readable, dense operational interfaces over decorative effects. No bounce or spring motion; avoid WebGL or new runtime dependencies for ordinary controls. Treat 120 Hz as a performance aspiration, never a guarantee.

## Source of truth

- **Design tokens and reconciliation:** `frontend/soft-minimalist.css`
- **Load order:** last CSS link in `index.html`, after existing route and integration CSS
- **Original scoped modules retained:** `frontend/styles.css`, `sidebar-experience.css`, `overview-experience.css`, `board-catalog-experience.css`, `board-visual-refresh.css`, `auth-experience.css`, `settings-experience.css`, dedicated TimeTracker and TradeLink styles
- **Deployment asset verification:** `scripts/pages-smoke.mjs`

Design refinements should use existing tokens and scoped selectors. Avoid competing CSS themes, excessive specificity, unbounded global overrides, or changing markup just to achieve a visual effect. Consolidate duplicate overrides into owning stylesheets gradually after verifying them.

## Token palette and component system

| Token | Default | Usage |
|---|---|---|
| `--sm-bg` | `#F7F8FA` | Work area |
| `--sm-surface` | `#FFFFFF` | Content panels |
| `--sm-surface-soft` | `#F1F3F7` | Grouping |
| `--sm-surface-raised` | `#FAFBFD` | Subtle inset / controls |
| `--sm-ink` | `#253047` | Titles and main text |
| `--sm-text` | `#405068` | Body content |
| `--sm-sub` | `#626C7D` | Supporting text |
| `--sm-muted` | `#647083` | Lower emphasis readable labels |
| `--sm-accent` | `#6667AB` | Primary actions / selections |
| `--sm-accent-hover` | `#51528D` | Hover / dark accent |
| `--sm-accent-soft` | `#EEEEF8` | Quiet active states |
| `--sm-border` | `#E3E7ED` | Light separators |
| `--sm-success` | `#26745D` | Positive |
| `--sm-warning` | `#946527` | Warning |
| `--sm-danger` | `#B34755` | Error / destructive |

Spacing, radii, shadows, and motion tokens live in the same stylesheet. Check text contrast in its actual surface context, not just against white. State must remain distinguishable without color alone. Preserve visible focus, labels, keyboard interactions, reduced-motion behavior, and readable numbers.

## Route coverage

1. **Foundation:** tokens and compatibility aliases for existing components.
2. **App shell:** sidebar, workspaces, navigation, topbar, page width.
3. **Overview / My Boards:** light headers, metrics, directory cards, search, empty surfaces.
4. **Board workspace:** headers, tabs, toolbar, group panels, tables; retain sticky cells and per-group horizontal scroll.
5. **Auth / Settings:** sign-in, profile, change-password and dialogs; retain all Supabase Auth behavior.
6. **Integrated apps:** common controls and board surfaces for the twelve integrated applications; targeted TradeLink and TimeTracker presentation only. Preserve specialized layouts and workflows.
7. **Consolidation:** calmer sign-in preview, contrast-conscious colors, responsive and reduced-motion rules; deployment smoke includes the new CSS.
8. **12-board foundation:** application readiness, status metrics, administrator-restricted provisioning controls and signed module table use the same tokens. Existing signed authorization and board contracts are unchanged.
9. **Access acceptance:** soft neutral security panels, signed-session checkpoint controls, reports and responsive tables; includes appended TradeLink, Workspace B2/B3, and board-recovery acceptance sections. No test execution, role change, privilege widening, or session action is introduced by the stylesheet.

## Non-negotiable behavior

- Do not modify Supabase Auth, RLS, workspace isolation, RBAC, data contracts, sessions, audits, or business logic for a visual goal.
- Session security and sensitive diagnostics remain restricted to verified bootstrap administrators. A generic platform-admin role is **not** equivalent.
- The Change Password action remains available to signed-in users.
- The default board is Item-only; never restore removed Status, Priority, or Owner defaults.
- Preserve the existing horizontal scrolling **per board group** and vertical page scrolling.
- Avoid clipping dropdowns, portal menus, dialogs, and input validation messages.
- Do not represent mock metrics or placeholders as production data.

## Verification and release status

The stylesheet and its load reference have been committed to GitHub. This alone does **not** establish deployment, production readiness, WCAG compliance, 120 Hz rendering, or absence of runtime regressions.

The existing exact-commit GitHub Pages smoke script includes `frontend/soft-minimalist.css`. Confirm that it passes for the deployed main SHA before claiming deployment verification.

For final acceptance, check authenticated Overview, My Boards, a regular board, TimeTracker, TradeLink, Settings, sign-in, mobile/tablet layouts, keyboard focus, menus, sticky cells, per-group scrolling, non-bootstrap concealment, password change, and the other application boards. Record any unexecuted check as **PENDING**, never **PASS**.
