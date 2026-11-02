import test from 'node:test';
import assert from 'node:assert/strict';
import {TT_TEAM_ROLES} from '../time-tracker-team.js';
test('TimeTracker team role list is restricted',()=>assert.equal(TT_TEAM_ROLES.length,7));
import {projectTimeTrackerTeamDirectory} from '../time-tracker-team.js';
test('Missing signed Team snapshot is denied',()=>assert.throws(()=>projectTimeTrackerTeamDirectory(null,{}),/bootstrap Team directory contract/));
import {renderTimeTrackerNative} from '../time-tracker-ui.js';
test('Team navigation not present for nonbootstrap actor',()=>{const html=renderTimeTrackerNative({result:{status:'VERIFIED_READ',access:{moduleRole:'Employee'},records:[]},view:'team',teamEligible:false});assert.doesNotMatch(html,/data-target="team"|Team Directory/);});
