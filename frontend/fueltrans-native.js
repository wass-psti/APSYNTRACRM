import {mountFuelTrans} from './fueltrans/app.js';
import {connectFuelTrans} from './fueltrans/supabase-client.js';
let mounted=null;
/** Retain form state across host redraws, dispose on identity/workspace/board exit. */
export function syncFuelTrans({container,auth,api,boardId,workspaceId,userId,route='dashboard',base=null,refresh=false,onMutation}){
 const key=[boardId,workspaceId,userId].join(':');
 if(mounted&&(!container||mounted.key!==key)){
  mounted.dispose();mounted.disconnect();mounted=null;
 }
 if(!container)return;
 if(mounted){if(!container.contains(mounted.element))container.append(mounted.element);if(refresh)mounted.refresh();return;}
 const element=document.createElement('section');
 element.setAttribute('aria-label','FuelTrans application');
 const shadow=element.attachShadow({mode:'open'});
 const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';
 stylesheet.href=new URL('./fueltrans/styles.css',import.meta.url).href;
 const referenceStyles=document.createElement('link');referenceStyles.rel='stylesheet';
 referenceStyles.href=new URL('./fueltrans/reference-design.css',import.meta.url).href;
 const operationalStyles=document.createElement('link');operationalStyles.rel='stylesheet';
 operationalStyles.href=new URL('./fueltrans/operational-design02.css',import.meta.url).href;
 const stationStyles=document.createElement('link');stationStyles.rel='stylesheet';
 stationStyles.href=new URL('./fueltrans/station-design03.css',import.meta.url).href;
 const reconcileStyles=document.createElement('link');reconcileStyles.rel='stylesheet';
 reconcileStyles.href=new URL('./fueltrans/station-reconcile04.css',import.meta.url).href;
 const root=document.createElement('div');shadow.append(stylesheet,referenceStyles,operationalStyles,stationStyles,reconcileStyles,root);container.append(element);
 const appBase=base||('#/boards/'+boardId+'/fueltrans');
 const context={auth,api,boardId,workspaceId,userId,onMutation,
  isCurrent:()=>element.isConnected&&auth.userId===userId&&
   (location.hash===appBase||location.hash.startsWith(appBase+'/'))};
 const disconnect=connectFuelTrans(context);
 const dispose=mountFuelTrans(root,{workspaceId,route,base:appBase});
 mounted={key,element,root,disconnect,dispose,refresh:()=>root.dispatchEvent(new Event('apsyntra:refresh'))};
}
