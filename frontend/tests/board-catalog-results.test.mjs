import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {boardCatalogResultLabel} from '../board-catalog-results.js';
test('board directory labels reflect status, query, plural and readable count',()=>{
 assert.equal(boardCatalogResultLabel(182),'182 active boards');
 assert.equal(boardCatalogResultLabel(1),'1 active board');
 assert.equal(boardCatalogResultLabel(1200,{status:'Archived'}),'1,200 archived boards');
 assert.equal(boardCatalogResultLabel(0,{query:'invoice',status:'Trash'}),'0 matching trash boards');
 assert.equal(boardCatalogResultLabel(2,{query:'  ',status:'Active'}),'2 active boards');
 assert.equal(boardCatalogResultLabel(1,{query:'supply',status:'Active'}),'1 matching active board');
});
test('catalog search remains local and actions retain signed checks',()=>{
 const source=readFileSync('frontend/app.js','utf8');
 const css=readFileSync('frontend/board-catalog-experience.css','utf8');
 assert.match(source,/boardCatalogResultLabel\(items\.length/);
 assert.match(source,/boardCatalogResultLabel\(matched/);
 assert.match(source,/aria-atomic="true"/);
 assert.match(source,/if\(hint\)hint\.hidden=matched!==0/);
 assert.match(source,/matchBoardSearch\(b,state\.boardSearch\)/);
 assert.match(source,/BOARD_CARD_LIFECYCLE_ENABLED/);
 assert.match(css,/boards-status-segments \.segment\{[\s\S]*?min-height:44px/);
 assert.match(css,/boards-catalog-grid \.board-card-actions>summary\{[\s\S]*?min-height:44px/);
});
