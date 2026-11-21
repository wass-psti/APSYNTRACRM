# Workspace invitation dialog — dark-mode adaptation

## Defect

The signed workspace invitation form (`Invite people to Work Management`) already defines dark variables, but earlier white-surface styles within `soft-minimalist.css` use more-specific selectors for its card, title, subtitle and inputs. As a result, dark mode looks partially light, including fields, close/actions and invitation history.

## Scoped correction

Append a final dark-only stylesheet, `frontend/dark-workspace-invitations.css`, covering the `.ws01-overlay.ws01-invite .ws02-invite-card` dialog. Use the existing compact charcoal enterprise palette: dark card, title/description, labels, input and placeholder colors, hover/focus/invalid/disabled states, access membership panel, footer actions, refresh and revoke actions, history rows and status badges. Retain the existing HTML, form validation, session, invitation send/list/revoke callbacks, roles, APIs and storage without modifications. The theme cache-busting key is `cp-crm-dark-invite-01`.

## Verification

A representative Chromium fixture compares the published baseline and new CSS at 390/768/1440 CSS pixels in light/dark modes. It asserts no white dialog/form/control surfaces, 4.5:1 contrast for ordinary text and controls, keyboard focus, reduced motion, no horizontal page overflow, and unchanged light-mode foreground/background. Screenshots in `docs/visual/cp-crm-dark-invite-01` are illustrative fixtures, not authenticated signed production screenshots. Signed server email delivery is outside this visual-only checkpoint.
