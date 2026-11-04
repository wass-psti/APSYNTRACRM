# Shared dropdown selection experience (APSYNTRA CRM)

## Scope

A progressive, global select-only combobox enhancement wraps existing single-selection HTML select elements across APSYNTRA CRM, including dynamically rendered forms and dialogs. The underlying native select remains in the same form with its original name, value, required and disabled semantics. Programmatic selection dispatches bubbling input and change events so all existing board, TimeTracker, access, and role workflows retain their authoritative handlers.

The enhancement deliberately does not replace multi-select controls, listbox-sized native selects, empty selects, menus opted out with data-aps-select-native, or selects with more than 400 options. These remain native instead of risking an incomplete ARIA implementation or excessive work. Failed library loading also leaves native controls operational.

## Technology

- Vanilla JavaScript ES modules; HTML5 semantics; scoped CSS3 and CSS custom properties
- CSS transforms for the chevron and Web Animations API for one-shot popup entrance
- Floating UI DOM 1.8.0 loaded from its version-pinned documented jsDelivr ESM endpoint, with offset, flip, shift, size and autoUpdate
- WAI-ARIA select-only combobox/listbox pattern with aria-expanded, aria-controls, aria-activedescendant, aria-selected and accessible labels; Home, End, arrows, Enter, Space, Escape, Tab and typeahead
- A single body-level dropdown portal and a MutationObserver for route, modal, optgroup and disabled-control updates. Positioning observers exist only while a menu is open.

## Security and privacy

The new script-src allowance is limited to cdn.jsdelivr.net for the pinned Floating UI ESM package; other existing CSP directives are preserved. External script delivery is a third-party supply-chain dependency; review for future self-hosted bundling if needed. No credentials, workspace/role state, employee records, geolocation data, or telemetry are passed into Floating UI: only trigger and listbox DOM elements are used for positioning.

Options are created using textContent (never innerHTML), and selection is committed to the unchanged native select. No direct API or database writes are added. The existing server-side RBAC, RLS and signed-session rules continue to govern actions.

## Acceptance boundary

Node tests validate option/keyboard policy, native form event dispatch in a small DOM harness, CSP/asset registration, and reduced-motion styles. CI and Pages smoke check deployed hashes. Signed-session visual, keyboard/screen-reader, and mobile browser acceptance remain separate manual gates until observed. No measured 120 FPS claim is made.
