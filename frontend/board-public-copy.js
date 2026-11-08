/** Display-only copy. Never changes board contracts, descriptions or permissions. */
import {moduleByBoardName} from './board-manifest.js';
export function publicBoardDescription(board){
 const name=String(board?.name||'');
 const source=String(board?.description||'');
 if(moduleByBoardName(name)||/^\[APSYNTRA:MODULE:/i.test(source))
  return name==='FuelTrans Standalone'?'Manage station support tickets, assignments, and service reports.':name==='TimeTracker Attendance'?
   'View attendance activity and team updates.':
   'Organize and track work in this board.';
 return source.trim()||'Track your team’s work and updates.';
}
