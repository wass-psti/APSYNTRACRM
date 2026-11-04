# APSYNTRA CRM — Shared Search Experience

Milestone: CP-CRM-SEARCH-01. Incremental frontend enhancement; original search contracts remain.

## Scope and visual stack

Search controls across APSYNTRA CRM receive a progressive, native-input-preserving layer built with Vanilla JavaScript ES Modules, HTML5, CSS3, CSS Custom Properties, CSS Transforms, Web Animations API, Floating UI, and local Lucide SVG icons. Per-field AbortController instances own event listeners; one MutationObserver handles dynamically rendered authorized views and cleans up removed fields. Optional Fuse.js and Web Workers are deliberately not installed: only 200 local candidates are examined per search, and suggestions are capped at six.

The original input stays in its form with its existing ID, name, value, editing semantics, autofill, and delegated input handlers. Clear writes an empty value and dispatches the same bubbling input event. The styles cover board catalog, board items/issues, role configuration, TimeTracker Overview, Log, Reports, OT, Team and other standard searches. Passwords, names and ordinary free-form form fields are not search controls.

## WAI-ARIA combobox and privacy boundary

Only seven allowlisted IDs receive local combobox suggestions: board catalog, board items, issues, system roles, workspace members, permission modules, and role proposals. Suggestions come only from visible, locally rendered titles in the active view. Raw server records, hidden rows, metadata, email addresses, GPS positions, cross-workspace data and hidden account privileges are not indexed or suggested. A query must match the visible title; no global search history, remote search, or new permissions exist.

Allowlisted fields use WAI-ARIA combobox, listbox and option roles with aria-autocomplete, aria-haspopup, aria-expanded, aria-controls, aria-activedescendant, and aria-selected. Text input retains DOM focus; Arrow Up/Down, Home, End, Enter, Escape and Tab are supported. Live announcements count suggestions, not total search results. Other search fields use normal searchbox semantics without speculative suggestions.

## CSP, performance and fallback

The component only processes local visible DOM after user input/focus. No background timers, persistent search index, new network queries, telemetry, Web Workers, or storage. Floating UI reuses the existing approved core/DOM v1.8.0 UMD loader from the already allowed unpkg origin shared by select dropdown and action menu experiences. When positioning code is unavailable, CSS fallback remains. Floating UI results only toggle audited CSS classes, not runtime style attributes or CSSOM writes. CSS Anchor Positioning provides further collision fallbacks in supporting browsers.

The existing strict CSP is unchanged, including style-src-attr none. Short WAAPI entry animations honor reduced motion. Local DOM-based Lucide SVG is decorative; user text is assigned using textContent. Existing signed-session RBAC, RLS and workspace isolation continue to govern records and actions.

## Acceptance boundary

Regression checks cover field eligibility, localized suggestions, hidden-data exclusions, candidate limits, keyboard and ARIA semantics, native input delegation, CSP, accessibility, responsiveness and Pages asset registration. CI/build/disposable database and live Pages SHA verification are separate gates. Genuine signed-browser, mobile, screen-reader and measured frame-rate acceptance remain pending until observed.
