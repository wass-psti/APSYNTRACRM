/** Canonical standalone TradeLink routes; board identity remains an internal data-source detail. */
import {validUuid} from '../../data.js';

export const TRADELINK_APPLICATION_ROUTE = '#/tradelink';
export const TRADELINK_MODULE_ID = 'tradelink';

const documentTypes = new Set(['esi','packing','delivery','payment','quotation','po']);
const sections = new Set(['drafts','documents','activity','analytics','manual']);

export function tradeLinkApplicationHref(path = '') {
 const suffix = String(path ?? '').replace(/^\/+|\/+$/g, '');
 return suffix ? TRADELINK_APPLICATION_ROUTE + '/' + suffix : TRADELINK_APPLICATION_ROUTE;
}

/** Parse a native route and return a canonical path plus bounded deep-link state. */
export function parseTradeLinkApplicationRoute(parts) {
 if (!Array.isArray(parts) || parts[0] !== 'tradelink') return null;
 const raw = parts.slice(1);
 let section = 'drafts';
 let draftType = null;
 let editId = null;
 let recordId = null;
 let canonical = ['drafts','quotation'];

 if (!raw.length) {
  // The application root opens the primary Create New workspace.
 } else if (documentTypes.has(raw[0])) {
  draftType = raw[0];
  canonical = ['drafts', draftType];
 } else if (raw[0] === 'drafts') {
  if (raw[1] === 'edit' && validUuid(raw[2] || '')) {
   editId = raw[2];
   canonical = ['drafts','edit',editId];
  } else {
   draftType = documentTypes.has(raw[1]) ? raw[1] : 'quotation';
   canonical = ['drafts',draftType];
  }
 } else if (sections.has(raw[0])) {
  section = raw[0];
  canonical = [section];
  if (section === 'documents' && raw[1] === 'record' && validUuid(raw[2] || '')) {
   recordId = raw[2];
   canonical = ['documents','record',recordId];
  }
 }

 if (canonical[0] === 'drafts') section = 'drafts';
 return Object.freeze({
  section, draftType, editId, recordId,
  canonicalHash: tradeLinkApplicationHref(canonical.join('/'))
 });
}
