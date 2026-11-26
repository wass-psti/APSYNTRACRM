# CP-CRM-INPUT-PLACEHOLDERS-01 — CRM-wide input guidance

## Objective

Provide consistent, context-aware placeholder guidance for text-entry, search,
and multiline controls throughout APSYNTRA CRM and its integrated applications.

## Implementation

- Extend the existing shared input experience instead of adding separate
  placeholder logic to each native application.
- Derive missing placeholder text from the control's accessible label, wrapping
  label, ARIA label, title, or field name.
- Use action-oriented Search guidance for search controls and Enter guidance
  for ordinary text, email, telephone, URL, number, and textarea fields.
- Preserve every explicitly authored placeholder.
- Observe newly inserted DOM nodes so dynamically rendered forms, dialogs,
  repeated rows, and application routes receive the same enhancement.
- Keep native date/time pickers, hidden inputs, file inputs, checkboxes, radios,
  range/color controls, buttons, and read-only fields outside placeholder
  enhancement. These controls have different native interaction semantics.
- Retain existing select prompts and option values; HTML select elements do not
  support the native placeholder attribute.
- Add a dedicated class only to controls whose placeholder is supplied by the
  shared enhancement, with light/dark contrast styling.

## Data and behavior invariants

Placeholder text is never assigned to .value, form defaults, draft state,
serialized payloads, or database fields. Existing names, IDs, values, native
validation, event handlers, form submission, and select options remain intact.
No database migration, API change, permission change, or new dependency is
introduced.

## Acceptance criteria

1. Missing placeholders are generated from accessible control context.
2. Existing descriptive placeholders are not overwritten.
3. Search controls receive action-oriented guidance.
4. Dynamically inserted controls are enhanced without polling.
5. Typing hides the placeholder and clearing restores it through native browser
   behavior.
6. Form serialization remains unchanged by the enhancement.
7. Native date/time, file, hidden, checkbox, and radio controls remain intact.
8. Light/dark placeholder contrast is at least 4.5:1 in tested browsers.
9. Chromium, Firefox, and WebKit desktop/mobile checks pass.
10. Full repository tests, checks, lint, and production build pass.

## Verification

The browser acceptance script is scripts/cp-crm-input-placeholders-browser.mjs.
It tests text, email, telephone, number, password, URL, textarea, search, dynamic
insertion, existing placeholders, excluded native controls, form serialization,
and placeholder contrast.
