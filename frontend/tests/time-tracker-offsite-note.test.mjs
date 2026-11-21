import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isTimeTrackerHomeNoteRequired} from '../time-tracker-offsite-note.js';

test('only verified-account allowlist bypasses the Home requirement',()=>{
 for(const email of ['asenagan@watchdogautomation.com.ph','mvasquez@watchdogautomation.com.ph']){
  assert.equal(isTimeTrackerHomeNoteRequired('Offsite (Home)',email),false);
  assert.equal(isTimeTrackerHomeNoteRequired('Offsite (Home)',' '+email.toUpperCase()+' '),false);
 }
 for(const email of ['',null,'other@watchdogautomation.com.ph'])
  assert.equal(isTimeTrackerHomeNoteRequired('Offsite (Home)',email),true);
 for(const location of ['Office-Base Duty','Local Field Works','International Field Assignments'])
  assert.equal(isTimeTrackerHomeNoteRequired(location,''),false);
});

test('SQL keeps actor identity authoritative and atomic write behavior unchanged',()=>{
 const sql=readFileSync('supabase/migrations/20261121060625_cp_tt_offsite_home_note_account_exemptions.sql','utf8');
 assert.match(sql,/FROM auth\.users u WHERE u\.id=v_user/);
 assert.match(sql,/p_action='clock-in' AND p_location='Offsite \(Home\)' AND v_note IS NULL/);
 assert.match(sql,/asenagan@watchdogautomation\.com\.ph/);
 assert.match(sql,/mvasquez@watchdogautomation\.com\.ph/);
 assert.doesNotMatch(sql,/v_role<>'System Admin' AND v_note IS NULL/);
 assert.match(sql,/timetracker_commit_attendance_raw_gps03/);
 assert.match(sql,/tt_board_projection_upsert/);
 assert.match(sql,/INSERT INTO public\.timetracker_attendance_mutation_audit/);
});
