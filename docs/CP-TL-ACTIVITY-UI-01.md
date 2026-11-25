# CP-TL-ACTIVITY-UI-01 — TradeLink Activity Presentation

## Scope
Refine the TradeLink Activity screen using the existing light-mode design system.

## Implementation
- Improve the page heading, audit-feed context, refresh affordance and event count.
- Present existing signed events as readable timeline cards with timestamps, actor initials, actor attribution and optional entity metadata.
- Improve loading, empty and error states, responsive layouts, keyboard focus and reduced-motion behavior.
- Keep event ordering, normalization, escaping and the 100-event limit unchanged.

## Preserved contracts
- Read-only `tl03_native_activity` RPC remains the only activity source.
- No board-event fallback, collaboration feed inference, new endpoints, migrations or data writes.
- Existing refresh action and session/workspace route checks remain unchanged.

## Acceptance
- Existing TradeLink activity tests continue to cover signed source, route checks, escaping, deduplication, loading and error behavior.
- Presentation tests cover the new heading, actor, entity and count elements.
- Generated CSS bundle matches the ordered style manifest.
