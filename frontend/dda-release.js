import {WORK_MANAGEMENT_WORKSPACE_ID} from './workspace-identity.js';

// Release coordination only, not a user permission or role. Enable after the
// signed DDA RPCs are installed and the production acceptance gate is approved.
export const DDA_RELEASE_ENABLED=false;
export const DDA_ROUTE_SECTION='daily-department-activity';
export const DDA_HOST_MARKUP='<div id="dda-native-host"></div>';
export const DDA_APPLICATION=Object.freeze({
  id:DDA_ROUTE_SECTION,moduleKey:null,name:'Daily Department Activity',
  label:'Daily Department Activity',routeKind:'auxiliary',
  route:'#/'+DDA_ROUTE_SECTION,navigationOrder:160,boardId:null,
  ownerWorkspaceId:WORK_MANAGEMENT_WORKSPACE_ID
});
