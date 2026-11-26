/** Canonical sidebar selection from the current route, not stale view flags.
 * This is presentation-only; route resolution and authorization remain in the host.
 */
const PRIMARY_ROUTES=new Set([
 'overview','boards','fm1','time-tracker','fund-tracker','fueltrack','tradelink','talkbox',
 'paseo','order-intake','daily-department-activity','foundation','security','role-configuration','user-role-management','settings','acceptance'
]);
export function sidebarActiveRoute(hash,{
 tradelinkBoardId='',fundTrackerBoardId='',fueltrackBoardId='',
 timeTrackerBoardId='',recentBoardIds=[]
}={}){
 const path=String(hash||'#/overview').split('?')[0];
 const [section,boardId,tab]=path.replace(/^#\/?/,'').split('/');
 if(section==='boards'&&boardId){
  if(boardId===tradelinkBoardId)return 'tradelink';
  if(boardId===fundTrackerBoardId&&tab==='finance')return 'fund-tracker';
  if(boardId===fueltrackBoardId&&tab==='fueltrack')return 'fueltrack';
  if(boardId===timeTrackerBoardId&&tab==='attendance')return 'time-tracker';
  return recentBoardIds.includes(boardId)?'recent:'+boardId:'';
 }
 return PRIMARY_ROUTES.has(section)?section:'';
}
