/**
 * CP-TL-NATIVE-01 — TradeLink native domain adapter entrypoint.
 *
 * The existing TradeLinkDomainClient remains the single implementation of
 * signed RPC transport, session/workspace checks, payload validation and
 * authoritative domain projections. This module gives the host application
 * the same explicit *-native.js contract used by TimeTracker without
 * introducing a second client, RPC implementation or state store.
 *
 * Keep the legacy domain-client exports available for existing consumers.
 */
export * from './tradelink-domain-client.js?v=cp-tl-gm-06f-20261126-01';
export {TradeLinkDomainClient as TradeLinkNativeClient} from './tradelink-domain-client.js?v=cp-tl-gm-06f-20261126-01';
