/**
 * CP-TL-NATIVE-01 — TradeLink semantic renderer entrypoint.
 *
 * The existing TradeLink application renderer owns the source-aligned
 * semantic HTML and remains the single presentation implementation.
 * This module exposes that renderer through the explicit *-ui.js contract
 * used by the TimeTracker native integration. Host state and all domain
 * events remain in frontend/app.js.
 */
export * from './tradelink-application.js?v=cp-tl-document-menu-02-20261126-01';
