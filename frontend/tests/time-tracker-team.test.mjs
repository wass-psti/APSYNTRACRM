import test from 'node:test';
import assert from 'node:assert/strict';
import {TT_TEAM_ROLES} from '../time-tracker-team.js';
test('TimeTracker team role list is restricted',()=>assert.equal(TT_TEAM_ROLES.length,7));
import {projectTimeTrackerTeamDirectory} from '../time-tracker-team.js';
test('Missing signed Team snapshot is denied',()=>assert.throws(()=>projectTimeTrackerTeamDirectory(null,{}),/bootstrap Team directory contract/));
