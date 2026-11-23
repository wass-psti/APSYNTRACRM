import { WORK_MANAGEMENT_WORKSPACE_ID } from './workspace-identity.js';
import { WORK_MANAGEMENT_BOARD_IDS } from './workspace-application-ownership.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const NATIVE_APPLICATIONS=Object.freeze({
 'time-tracker':Object.freeze({
  boardId:WORK_MANAGEMENT_BOARD_IDS.timetracker,
  workspaceId:WORK_MANAGEMENT_WORKSPACE_ID,
  name:'TimeTracker Attendance',marker:'[APSYNTRA:MODULE:timetracker:v1]'
 }),
 'fund-released-tracker':Object.freeze({
  boardId:WORK_MANAGEMENT_BOARD_IDS.frt,
  workspaceId:WORK_MANAGEMENT_WORKSPACE_ID,
  name:'Fund Released Tracker',marker:'[APSYNTRA:MODULE:frt:v1]'
 }),
 'fueltrack-plus':Object.freeze({
  boardId:WORK_MANAGEMENT_BOARD_IDS.fueltrack,
  workspaceId:WORK_MANAGEMENT_WORKSPACE_ID,
  name:'FuelTrack+ v3',marker:'[APSYNTRA:MODULE:fueltrack:v1]'
 }),
 tradelink:Object.freeze({
  boardId:WORK_MANAGEMENT_BOARD_IDS.tradelink,
  workspaceId:WORK_MANAGEMENT_WORKSPACE_ID,
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
  !UUID.test(workspaceId||'')||workspaceId.toLowerCase()!==expected.workspaceId||
  !board||board.id!==expected.boardId||
  String(board.workspace_id||'').toLowerCase()!==expected.workspaceId||
  board.name!==expected.name||
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

const NATIVE_APPLICATION_ROUTE_MODULES=Object.freeze({
 'time-tracker':'time-tracker',
 'fund-tracker':'fund-released-tracker',
 'fueltrack':'fueltrack-plus',
 'tradelink':'tradelink'
});

export function nativeApplicationModuleForRoute(hash){
 const path=String(hash||'').split('?')[0].replace(/^#\/?/,'');
 const route=path.split('/')[0];
 return NATIVE_APPLICATION_ROUTE_MODULES[route]||null;
}

export function workspaceRouteAllowsBoardCatalogFallback(hash){
 const path=String(hash||'').split('?')[0].replace(/^#\/?/,'');
 const route=path.split('/')[0]||'overview';
 return route==='overview'||route==='fueltrans'||nativeApplicationModuleForRoute(hash)!==null;
}

export function nativeApplicationModuleForBoardId(boardId){
 for(const [moduleId,application] of Object.entries(NATIVE_APPLICATIONS))
  if(application.boardId===boardId)return moduleId;
 return null;
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
