const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const NATIVE_APPLICATIONS=Object.freeze({
 'time-tracker':Object.freeze({
  boardId:'46bf4ee7-368a-4c35-842c-8593ea1f6ac3',
  name:'TimeTracker Attendance',marker:'[APSYNTRA:MODULE:timetracker:v1]'
 }),
 'fund-released-tracker':Object.freeze({
  boardId:'f36da8fe-8d9d-4629-9938-12533cb3ca39',
  name:'Fund Released Tracker',marker:'[APSYNTRA:MODULE:frt:v1]'
 }),
 'fueltrack-plus':Object.freeze({
  boardId:'7af78b3f-67bf-4600-9aa1-9006d19d486e',
  name:'FuelTrack+ v3',marker:'[APSYNTRA:MODULE:fueltrack:v1]'
 }),
 tradelink:Object.freeze({
  boardId:'264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
  name:'TradeLink',marker:'[APSYNTRA:MODULE:tradelink:v1]'
 })
});

export function normalizeNativeApplicationBoardContext(payload,{
 moduleId,userId,workspaceId
}={}){
 const expected=NATIVE_APPLICATIONS[moduleId];
 const board=payload?.board;
 const columns=payload?.columns,groups=payload?.groups;
 if(!expected||payload?.contract!=='native-app-board-v1'||
  payload.moduleId!==moduleId||payload.userId!==userId||
  payload.workspaceId!==workspaceId||!UUID.test(userId||'')||
  !UUID.test(workspaceId||'')||!board||board.id!==expected.boardId||
  board.name!==expected.name||board.workspace_id!==workspaceId||
  board.status!=='active'||board.archived_at!==null||board.trashed_at!==null||
  typeof board.description!=='string'||!board.description.startsWith(expected.marker)||
  typeof payload.role!=='string'||!payload.role.trim()||
  !Array.isArray(columns)||!Array.isArray(groups))
  throw new Error('Native application context does not match the signed user, workspace or canonical board.');
 if(moduleId!=='tradelink'&&(columns.length!==0||groups.length!==0))
  throw new Error('Unexpected generic board schema in native application context.');
 if(moduleId==='tradelink'&&(
  columns.some(column=>!column||!UUID.test(column.id||'')||
   typeof column.column_key!=='string'||typeof column.name!=='string'||
   typeof column.data_type!=='string'||typeof column.visible!=='boolean'||
   typeof column.required!=='boolean'||
   (column.system_key!==null&&typeof column.system_key!=='string')||
   !column.config||typeof column.config!=='object'||Array.isArray(column.config))||
  groups.some(group=>!group||!UUID.test(group.id||'')||
   typeof group.title!=='string'||!Number.isInteger(group.position)||
   (group.accent_color!==null&&typeof group.accent_color!=='string'))))
  throw new Error('TradeLink application schema projection is invalid.');
 const normalizedBoard={...board,member_role:null,view_mode:'table'};
 return {
  contract:payload.contract,moduleId,userId,workspaceId,role:payload.role,
  board:normalizedBoard,
  detail:{
   board:normalizedBoard,groups:groups.map(group=>({...group})),members:[],
   columns:columns.map(column=>({...column})),items:[],values:[]
  }
 };
}

export function nativeApplicationModuleForBoardRoute(boardId,tab){
 const mapping={
  attendance:'time-tracker',
  finance:'fund-released-tracker',
  fueltrack:'fueltrack-plus',
  tradelink:'tradelink'
 };
 const moduleId=mapping[tab];
 return moduleId&&NATIVE_APPLICATIONS[moduleId]?.boardId===boardId?moduleId:null;
}
