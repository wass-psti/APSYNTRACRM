import {mountFuelTrans} from './fueltrans/app.js';
import {connectFuelTrans} from './fueltrans/supabase-client.js';
let mounted=null;
/** Retain form state across host redraws, dispose on identity/workspace/board exit. */
export function syncFuelTrans({container,auth,api,boardId,workspaceId,userId,route='dashboard',refresh=false,onMutation}){
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
 const root=document.createElement('div');shadow.append(stylesheet,referenceStyles,operationalStyles,root);container.append(element);
 const context={auth,api,boardId,workspaceId,userId,onMutation,
  isCurrent:()=>element.isConnected&&auth.userId===userId&&
   location.hash.startsWith('#/boards/'+boardId+'/fueltrans')};
 const disconnect=connectFuelTrans(context);
 const dispose=mountFuelTrans(root,{workspaceId,route,base:'#/boards/'+boardId+'/fueltrans'});
 mounted={key,element,root,disconnect,dispose,refresh:()=>root.dispatchEvent(new Event('apsyntra:refresh'))};
}
