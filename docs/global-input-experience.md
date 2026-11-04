# APSYNTRA CRM — Global Input-Field Experience

Milestone: **CP-CRM-INPUT-01**. Incremental presentation and local validation only; no authentication, role, data, or backend contract changes.

## Scope and technology

The shared frontend module enhances existing native HTML5 text, email, password, URL, telephone, numeric, date/time and textarea inputs across APSYNTRA CRM, including sign-in, board editors, inline items, role configuration, settings, TimeTracker workflows and dialogs. It uses Vanilla JavaScript ES Modules, CSS3, CSS Custom Properties, CSS Transforms, one-shot Web Animations API, native Constraint Validation API, locally rendered Lucide status SVG, and accessible form patterns.

Motion for JS is optional and not introduced: native Web Animations API already handles the short entrance feedback without another dependency. The module does not replace search bars, native selects, checkboxes, file controls, color pickers, submit buttons, or other non-text inputs. These remain under their existing components and handlers.

## Form behavior and validation

The original input element stays in the same DOM parent and form. All original IDs, names, attributes, autofill, values, input modes, keyboard handlers, input/change events, and native form submission/validation are preserved. There are no simulated submissions and no modifications to checkValidity, reportValidity, setCustomValidity or HTML form noValidate flags.

The shared layer listens for native input, change, blur, invalid and form reset events. On untouched fields it does not display premature errors. On blur or the native invalid event, it reads the built-in validity flags and displays a safe, generic error. Validity is only local syntax/format, not evidence of server authorization or acceptance. Native invalid events are never cancelled. On correction/reset, error state and the generated aria-describedby reference are cleared; existing helper descriptions and pre-existing aria-invalid attributes are preserved. Errors never echo secrets or entered values.

The generated status is connected through aria-describedby, uses aria-live polite/role status, and includes a decorative Lucide circle-alert SVG. Compact board-inline input forms show the visual invalid border without changing their grid layout, while error text remains accessible to assistive technology. Focus-visible, mobile, reduced-motion, high-contrast and forced-colors styles are included. Native password visibility buttons remain unchanged.

## Security, performance and compatibility

A single MutationObserver detects dynamically added input elements and removes listeners with AbortController on unmount. No persistent timer, network request, credential logging, telemetry, storage, Web Worker or new external dependency is added. Input focus/blur and CSS states use short transitions only. Existing CSP remains unchanged, including style-src-attr none, and the JavaScript never writes inline CSS or unsafe HTML. Frontend validation does not replace existing signed backend RBAC, RLS, concurrency controls or server-side integrity checks.

## Acceptance boundary

Regression tests cover eligibility and protected exclusions, validity flag messaging, privacy of error strings, ARIA announcement and cleanup, native invalid event behavior, reset behavior, preserved input dispatch, CSS accessibility/animation constraints, startup and Pages asset manifests. GitHub CI/build/disposable database and exact-commit live Pages smoke are required before describing a deployment as verified. Authenticated visual/keyboard/screen-reader acceptance, mobile input-mode checks and measured 120 FPS performance remain independent acceptance gates.
