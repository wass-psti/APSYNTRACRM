// Read-only evidence of the original React ticket-number generation paths.
// This deliberately does not decide that the new RPC can be installed.
export function auditOriginalTicketNumbering(tabSource,wizardSource){
 if(typeof tabSource!=='string'||typeof wizardSource!=='string'||!tabSource.length||!wizardSource.length)throw Error('Original React ticket creation sources are required.');
 const tab={
  source:'CreateTicketTab.jsx',
  ftsSequence:/fueltrans_ticket_seq/.test(tabSource)&&/storageSet\s*\(/.test(tabSource)&&/FTS-\$\{year\}/.test(tabSource),
  sharedPostgresTransaction:/fueltrans_create_ticket_v1/.test(tabSource)
 };
 const wizard={
  source:'CreateTicketWizard.jsx',
  clientPrefixed:/CLIENT_PREFIXES/.test(wizardSource)&&/ticketPrefix/.test(wizardSource)&&/newTicketId/.test(wizardSource),
  sharedPostgresTransaction:/fueltrans_create_ticket_v1/.test(wizardSource)
 };
 return Object.freeze({tab,wizard,compatible:Boolean(tab.sharedPostgresTransaction&&wizard.sharedPostgresTransaction),blockers:[
  ...(!tab.ftsSequence?['Original FTS sequence path not recognized; verify baseline.']:[]),
  ...(!wizard.clientPrefixed?['Original client-prefixed path not recognized; verify baseline.']:[]),
  ...(!tab.sharedPostgresTransaction?['CreateTicketTab does not use the staged transactional RPC.']:[]),
  ...(!wizard.sharedPostgresTransaction?['CreateTicketWizard does not use the staged transactional RPC.']:[])
 ]});
}
