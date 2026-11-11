import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeExcelSerial,normalizeTextDate,normalizeExcelCellDate,
 excelDateFormat} from '../excel-date-normalization.js';

test('Excel 1900 leap-year anomaly and early serials are deterministic',()=>{
 assert.equal(normalizeExcelSerial(1),'1900-01-01');
 assert.equal(normalizeExcelSerial(59),'1900-02-28');
 assert.throws(()=>normalizeExcelSerial(60),/nonexistent date 1900-02-29/);
 assert.throws(()=>normalizeExcelSerial(60.5),/nonexistent date 1900-02-29/);
 assert.equal(normalizeExcelSerial(61),'1900-03-01');
 assert.throws(()=>normalizeExcelSerial(0),/no valid calendar date/);
});
test('Excel 1904 date system has no fictitious leap day',()=>{
 assert.equal(normalizeExcelSerial(0,{date1904:true}),'1904-01-01');
 assert.equal(normalizeExcelSerial(60,{date1904:true}),'1904-03-01');
 assert.equal(normalizeExcelSerial(1,{date1904:true}),'1904-01-02');
});
test('Uploaded workbook genuine date serials normalize as expected',()=>{
 assert.equal(normalizeExcelSerial(46233),'2026-07-30');
 assert.equal(normalizeExcelSerial(46232),'2026-07-29');
 assert.equal(normalizeExcelSerial(46252),'2026-08-18');
 assert.equal(normalizeExcelSerial(46212),'2026-07-09');
});
test('Fractional serial, date-time and pure time retain deterministic precision',()=>{
 assert.equal(normalizeExcelSerial(46233.5,{hasTime:true}),
  '2026-07-30T12:00:00Z');
 assert.equal(normalizeExcelSerial(46233.500001,{hasTime:true}),
  '2026-07-30T12:00:00.086Z');
 assert.equal(normalizeExcelSerial(0.5,{hasDate:false,hasTime:true}),
  '12:00:00');
 assert.throws(()=>normalizeExcelSerial(1.5,{hasDate:false,hasTime:true}),
  /time-only field/);
});
test('Typed formatted text date ranges are preserved rather than parsed as numeric',()=>{
 assert.equal(normalizeExcelCellDate('2026-07-09 to 2026-08-18',{
  cellType:'str',format:{date:true,time:false}}),
  '2026-07-09 to 2026-08-18');
 assert.equal(normalizeExcelCellDate('2026-07-09',{
  cellType:'str',format:{date:true,time:false}}),'2026-07-09');
 assert.throws(()=>normalizeExcelCellDate('2026-07-09 to 2026-08-18',{
  cellType:'n',format:{date:true,time:false}}),/Expected a numeric Excel date serial/);
});
test('ISO text dates accept valid calendar values and reject invalid or ambiguous ones',()=>{
 assert.equal(normalizeTextDate('2026-07-09'),'2026-07-09');
 assert.equal(normalizeTextDate('2026-07-09 23:59:59.125',{dateTime:true}),
  '2026-07-09T23:59:59.125Z');
 assert.equal(normalizeTextDate('2026-01-27 03:36:15 UTC',{dateTime:true}),
  '2026-01-27T03:36:15Z');
 assert.equal(normalizeTextDate('2026-01-27T03:36:15Z',{dateTime:true}),
  '2026-01-27T03:36:15Z');
 assert.equal(normalizeTextDate('2026-01-27 03:36:15 utc',{dateTime:true}),
  '2026-01-27T03:36:15Z');
 assert.throws(()=>normalizeTextDate('2026-02-29'),/Calendar date is invalid/);
 assert.throws(()=>normalizeTextDate('2026-13-01'),/Calendar date is invalid/);
 assert.throws(()=>normalizeTextDate('07/09/2026'),/date ranges and locale-dependent/);
 assert.throws(()=>normalizeTextDate('2026-07-09T09:00:00'),/date-only column/);
 assert.throws(()=>normalizeTextDate('2026-07-09T25:00',{dateTime:true}),/invalid hour/);
 assert.equal(normalizeTextDate(''),'');
});
test('Number formats detect dates but ignore quoted text and general numbers',()=>{
 assert.deepEqual(excelDateFormat('yyyy-mm-dd'),{date:true,time:false});
 assert.deepEqual(excelDateFormat('yyyy-mm-dd hh:mm:ss'),{date:true,time:true});
 assert.deepEqual(excelDateFormat('hh:mm:ss'),{date:false,time:true});
 assert.equal(excelDateFormat('0.00'),null);
 assert.equal(excelDateFormat('0 "days"'),null);
});
test('Invalid numeric values are rejected with explicit reasons',()=>{
 assert.throws(()=>normalizeExcelSerial('NaN'),/numeric Excel date serial/);
 assert.throws(()=>normalizeExcelSerial('-1'),/numeric Excel date serial/);
 assert.throws(()=>normalizeExcelSerial(1e20),/finite nonnegative date/);
});
