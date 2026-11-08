import {mountFuelTrans} from './fueltrans/app.js';
import {connectFuelTrans} from './fueltrans/supabase-client.js';
let mounted=null;
/** Retain form state across host redraws, dispose on identity/workspace/board exit. */
export function syncFuelTrans({container,auth,api,boardId,workspaceId,userId,route='dashboard'}){
 const key=[boardId,workspaceId,userId].join(':');
 if(mounted&&(!container||mounted.key!==key)){
  mounted.dispose();mounted.disconnect();mounted=null;
 }
 if(!container)return;
 if(mounted){container.append(mounted.element);return;}
 const element=document.createElement('section');
 element.setAttribute('aria-label','FuelTrans application');
 const shadow=element.attachShadow({mode:'open'});
 const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';
 stylesheet.href=new URL('./fueltrans/styles.css',import.meta.url).href;
 const root=document.createElement('div');shadow.append(stylesheet,root);container.append(element);
 const context={auth,api,boardId,workspaceId,userId,
  isCurrent:()=>element.isConnected&&auth.userId===userId&&
   location.hash.startsWith('#/boards/'+boardId+'/fueltrans')};
 const disconnect=connectFuelTrans(context);
 const dispose=mountFuelTrans(root,{workspaceId,route,base:'#/boards/'+boardId+'/fueltrans'});
 mounted={key,element,disconnect,dispose};
}
