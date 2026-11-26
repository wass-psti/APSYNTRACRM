# Daily Department Activity — CP-DDA-FE-02

Independent frontend prototype, separate from APS Group Traceability. Six departments, two Engineering units, fictional personnel and supervisors. Dashboard, department directory, activity creation/editing, and team overview with date/personnel/status filtering. Multiple entries per day are supported. Dates default to Asia/Manila.

No backend, CRM connection, authentication, roles, deployment, AI or training. Personnel selection is a demonstration control, not an authenticated identity. The browser stores local activity records on its own origin; do not enter real employee information. No runtime or development package dependencies.

Run:
```sh
npm test
npm run build
npm run test:browser
npm start
```
Open http://127.0.0.1:4188/. Stop the server with Ctrl+C. The browser test uses isolated Chromium and its own ephemeral server and closes both.

Source: src/data for directory and activity rules, src/ui for screen templates, src/app.js for interactions, src/styles for responsive styling. Backend integration should replace the local data source with the existing CRM personnel/department directory and activity persistence after frontend acceptance; preserve stable person IDs and department association. No changes to APS Group Traceability or CRM are needed for this preview.


## Department and personnel management (0.2.0)

- Departments: add/edit name, abbreviation and newline-separated organizational units.
- Personnel: add/edit/search name, unique employee ID, position, company, department and unit.
- Supervisor: designate one person per department-level or unit-level scope. Explicit designation replaces the previous supervisor for that scope. Unit personnel report to their unit supervisor or the department-level head when available. This is organizational metadata, not authorization.
- Transfers: change the department/unit on the Personnel edit form. Existing activities retain their recorded department ID even after transfer, edits and refresh. New activities use the current assignment. Team Overview includes former members with activity for the selected date and recorded department.
- Existing activity storage key and schema are preserved; the separately stored directory is seeded on first use and saved upon a successful directory edit. No real employee data is imported.
- To remove or rename an occupied unit, first reassign its personnel. Department/employee deletion, effective-dated transfers, historical unit/supervisor snapshots, shared persistence, multi-tab conflict resolution and unsaved form recovery are not included.
- Refresh the existing preview tab after updating the build. Do not use actual personnel data in this browser-only prototype.

Verification: npm test (13 tests); npm run build (syntax/static build); npm run test:browser (original workflow plus directory management, transfer, historical readback and all five screens at 1440/768/390 px).