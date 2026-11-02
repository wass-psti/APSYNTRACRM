import test from 'node:test';
import assert from 'node:assert/strict';
import {TT_TEAM_ROLES} from '../time-tracker-team.js';
test('TimeTracker team role list is restricted',()=>assert.equal(TT_TEAM_ROLES.length,7));
