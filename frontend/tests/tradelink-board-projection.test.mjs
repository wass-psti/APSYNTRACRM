import test from 'node:test';
import assert from 'node:assert/strict';
import {tradeLinkBoardProjectionMatches} from '../tradelink-domain-client.js';

const boardItemId='f73321f1-9102-4cc4-b075-84e2fe338beb';
const documentNumber='CP-TL-08C-QA-20261112-01';
const documentUpdatedAt='2026-11-12T10:01:18.564992Z';
const boardItem=overrides=>({
 id:boardItemId,title:documentNumber,archived_at:null,
 updated_at:'2026-11-12T10:01:18.594753Z',...overrides
});

test('accepts a matching Board projection timestamped after initial document creation',()=>{
 assert.equal(tradeLinkBoardProjectionMatches(boardItem(),{
  boardItemId,documentNumber,updatedAt:documentUpdatedAt
 }),true);
});

test('accepts an exactly synchronized Board projection',()=>{
 assert.equal(tradeLinkBoardProjectionMatches(boardItem({
  updated_at:documentUpdatedAt
 }),{boardItemId,documentNumber,updatedAt:documentUpdatedAt}),true);
});

test('rejects a stale Board projection timestamped before the document',()=>{
 assert.equal(tradeLinkBoardProjectionMatches(boardItem({
  updated_at:'2026-11-12T10:01:18.500000Z'
 }),{boardItemId,documentNumber,updatedAt:documentUpdatedAt}),false);
});

test('rejects mismatched item identity, document title, and archived projection',()=>{
 assert.equal(tradeLinkBoardProjectionMatches(boardItem({
  id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
 }),{boardItemId,documentNumber,updatedAt:documentUpdatedAt}),false);
 assert.equal(tradeLinkBoardProjectionMatches(boardItem({
  title:'Different document'
 }),{boardItemId,documentNumber,updatedAt:documentUpdatedAt}),false);
 assert.equal(tradeLinkBoardProjectionMatches(boardItem({
  archived_at:'2026-11-12T10:01:19Z'
 }),{boardItemId,documentNumber,updatedAt:documentUpdatedAt}),false);
});

test('rejects invalid or missing timestamps',()=>{
 assert.equal(tradeLinkBoardProjectionMatches(boardItem({updated_at:'invalid'}),{
  boardItemId,documentNumber,updatedAt:documentUpdatedAt
 }),false);
 assert.equal(tradeLinkBoardProjectionMatches(boardItem(),{
  boardItemId,documentNumber,updatedAt:'invalid'
 }),false);
});
