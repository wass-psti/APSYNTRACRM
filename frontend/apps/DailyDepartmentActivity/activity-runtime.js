import {createActivityController} from './activity-controller.js';
import {createActivityRepository} from './activity-repository.js';
import {mountDailyDepartmentActivity} from './activity-screen.js';

export function mountActivityRuntime(container,{auth,api,workspaceId,userId,storage}){
  const draftStorage=storage??window.localStorage;
  const repository=createActivityRepository({auth,api,workspaceId,storage:draftStorage});
  const controller=createActivityController({repository,workspaceId,userId,draftStorage});
  // Load scoped styles only on the native route; no new startup request.
  const doc=container.ownerDocument;
  const href=new URL('./activity-screen.css',import.meta.url).href;
  if(!Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).some(link=>link.href===href)){
    const link=doc.createElement('link');
    link.rel='stylesheet';link.href=href;doc.head.append(link);
  }
  return mountDailyDepartmentActivity(container,controller);
}
