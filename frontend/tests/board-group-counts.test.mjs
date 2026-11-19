import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {boardGroupArchiveSuffix} from '../board/presentation/group-counts.js';

test('group archive suffix formats authoritative active and archived counts',()=>{
 assert.equal(boardGroupArchiveSuffix(12,3),' · 12 active · 3 archived');
 assert.equal(boardGroupArchiveSuffix(0,2),' · 0 active · 2 archived');
});

test('group archive suffix preserves archived count when active count is unavailable',()=>{
 assert.equal(boardGroupArchiveSuffix(null,2),' · 2 archived');
 assert.equal(boardGroupArchiveSuffix(undefined,2),' · 2 archived');
 assert.equal(boardGroupArchiveSuffix(-1,2),' · 2 archived');
});

test('group archive suffix omits absent or invalid archive totals',()=>{
 assert.equal(boardGroupArchiveSuffix(12,0),'');
 assert.equal(boardGroupArchiveSuffix(12,null),'');
 assert.equal(boardGroupArchiveSuffix(12,1.5),'');
});

test('board heading delegates archive formatting to the null-safe formatter',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/boardGroupArchiveSuffix\(activeCount,archivedCount\)/);
 assert.doesNotMatch(source,/activeCount\.toLocaleString\('en-US'\)/);
});
