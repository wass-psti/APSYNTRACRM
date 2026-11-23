import test from 'node:test';
import assert from 'node:assert/strict';
import {
 parseStationSourceCsv,reconcileStationSource,stationReconciliationCsv,
 STATION_SOURCE_MAX_BYTES,STATION_SOURCE_MAX_ROWS
} from '../fueltrans/station-source04.js';

test('CSV source accepts client/station header aliases and quoted station names',()=>{
 const input='Client Organization,Site ID,Station Name,AnyDesk Password\r\nUNIOIL,1013C,"UNIOIL AIRPORT, ROAD",not imported\r\nARAMCO,1071B,ARAMCO MARCELO GREEN,not imported\r\n';
 const result=parseStationSourceCsv(input);
 assert.equal(result.rows.length,2);
 assert.equal(result.rows[0].stationName,'UNIOIL AIRPORT, ROAD');
 assert.equal(result.ignoredColumnCount,1);
 assert.equal(result.rows[0].password,undefined);
 assert.deepEqual(result.issues,[]);
 assert.ok(Object.isFrozen(result.rows));
});

test('duplicates are counted and conflicting source names are reported, not overwritten',()=>{
 const csv='client,station_id,station_name\nUNIOIL,1013C,Airport Road\nUNIOIL,1013c,Airport Road\nUNIOIL,1013C,Other Station\nREPHIL,X00,Valid Station\n';
 const result=parseStationSourceCsv(csv);
 assert.equal(result.duplicates,1);
 assert.equal(result.rows.length,2);
 assert.equal(result.issues.length,1);
 assert.equal(result.issues[0].line,4);
 assert.equal(result.rows[0].stationName,'Airport Road');
});

test('out-of-client and invalid stations are not presented as reconciled',()=>{
 const result=parseStationSourceCsv('client,site_id,station\nUNIOIL,1013C,Airport Road\nARAMCO,1071B,Marcelo Green\nUNIOIL,10!,Bad name\n',{assignedClient:'UNIOIL'});
 assert.equal(result.rows.length,1);
 assert.equal(result.issues.length,2);
 assert.match(result.issues[0].reason,/outside/);
});

test('rejects malformed CSV, unknown required column, excessive size, and oversized row count',()=>{
 assert.throws(()=>parseStationSourceCsv('client,site_id,station\nUNIOIL,1013C,"broken'),/Unterminated/);
 assert.throws(()=>parseStationSourceCsv('network,foo,station\nUNIOIL,1013C,Airport Road'),/stationId/);
 assert.throws(()=>parseStationSourceCsv('client,site_id,station\nUNIOIL,1013C,Bad\"Name'),/Malformed/);
 assert.throws(()=>parseStationSourceCsv('x'.repeat(STATION_SOURCE_MAX_BYTES+1)),/smaller/);
 const lines=['client,site_id,station'];
 for(let i=0;i<=STATION_SOURCE_MAX_ROWS;i++)lines.push('UNIOIL,1013C,Airport Road');
 assert.throws(()=>parseStationSourceCsv(lines.join('\n')),/5,000/);
});

test('comparison does not claim global absence from page-scoped ticket history',()=>{
 const candidates=parseStationSourceCsv('client,station_id,station_name\nUNIOIL,1013C,Airport Road\nARAMCO,1071B,Marcelo Green\nREPHIL,1010A,Rephil Station').rows;
 const observations=[{client:'UNIOIL',stationId:'1013C',stationName:'Airport Road'},{client:'ARAMCO',stationId:'1071B',stationName:'Old Station'}];
 const rows=reconcileStationSource(candidates,observations);
 assert.deepEqual(rows.map(row=>row.status),['matched_on_visible_page','name_difference_on_visible_page','not_on_visible_page']);
 assert.equal(rows[2].recordedStationName,'');
 assert.ok(Object.isFrozen(rows[0]));
});

test('exported comparison CSV neutralizes spreadsheet formulas and omits unused source columns',()=>{
 const candidate=[{client:'UNIOIL',stationId:'1013C',stationName:'=HYPERLINK("https://example.test")',status:'not_on_visible_page',recordedStationName:''}];
 const result=stationReconciliationCsv(candidate,{ticketPage:3});
 assert.match(result,/Visible Ticket Page/);
 assert.match(result,/'=HYPERLINK/);
 assert.equal(result.includes('AnyDesk Password'),false);
 assert.equal(result.includes('secret'),false);
});

test('source fields cannot silently accept malicious or incomplete rows',()=>{
 const candidate=parseStationSourceCsv('client,site_id,station\nUNIOIL,1013C,<script>\nUNIOIL,,Missing ID\nUNIOIL,1014C,Valid Station');
 assert.equal(candidate.rows.length,2); // Browser output escapes text; it is never injected as markup.
 assert.equal(candidate.issues.length,1);
 assert.equal(candidate.rows[0].stationName,'<script>');
});
