/** Dedicated TradeLink CRM application route. The existing Board remains authoritative. */
import {TRADELINK_BOARD_ID,isTradeLinkBoard} from './tradelink-board-items.js';

export const TRADELINK_APPLICATION_ROUTE='#/tradelink';
export const TRADELINK_LEGACY_BASE='#/boards/'+TRADELINK_BOARD_ID+'/tradelink';
export const TRADELINK_APPLICATION_SECTIONS=Object.freeze([
 'drafts','documents','activity','analytics','esi','packing','delivery','payment','quotation','po'
]);

/** Do not create or infer a Board when this signed workspace has none. */
export function findTradeLinkApplicationBoard(boards){
 if(!Array.isArray(boards))return null;
 return boards.find(board=>isTradeLinkBoard(board))||null;
}

export function tradeLinkApplicationHref(path='drafts/quotation'){
 return TRADELINK_APPLICATION_ROUTE+'/'+String(path).replace(/^[/]+/, '');
}

/** Translate only the dedicated hash route to the existing signed Board host contract. */
export function parseTradeLinkApplicationRoute(parts){
 if(!Array.isArray(parts)||parts[0]!=='tradelink')return null;
 const requested=parts[1];
 const rest=!requested||requested==='overview'?['drafts','quotation']:parts.slice(1);
 if(!TRADELINK_APPLICATION_SECTIONS.includes(rest[0]))return null;
 return {
  canonicalHash:TRADELINK_APPLICATION_ROUTE+'/'+rest.join('/'),
  boardRouteParts:['boards',TRADELINK_BOARD_ID,'tradelink',...rest]
 };
}
