# APSYNTRA CRM · Three-layer access UI preview

This **sample-data-only** React/Vite project demonstrates the four requested screens.
It is intentionally isolated from Supabase and **cannot change production roles**.

```bash
cd access-preview
npm install
npm run dev
```

Open these routes (all localhost):

- `http://127.0.0.1:5192/?screen=overview` — three-layer help
- `http://127.0.0.1:5192/?screen=workspace` — User Role Management
- `http://127.0.0.1:5192/?screen=board` — Board invite popup
- `http://127.0.0.1:5192/?screen=app` — FuelTrans > Settings > Roles

**Source fidelity:** the user supplied visible images for Workspace and App Roles, but not the illustrations for Overview or Board Invite. The latter are implemented from the supplied written specification. User, board, and role names are demonstrative only.

This React preview is independent of the existing production frontend (which is vanilla JS). See `docs/ACCESS-MODEL-THREE-LAYER-ROLLOUT.md` for staged backend design and migration safeguards.
