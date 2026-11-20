import React,{useEffect,useState} from 'react';
import {WorkspacePage} from './WorkspacePage.jsx';
import {AppRolesPage} from './AppRolesPage.jsx';
import {BoardInvitePage} from './BoardInvitePage.jsx';
import {OverviewPage} from './OverviewPage.jsx';
export function AccessPreview(){
 const fromUrl=new URLSearchParams(window.location.search).get('screen');
 const [screen,setScreen]=useState(['workspace','board','app','overview'].includes(fromUrl)?fromUrl:'workspace');
 const [appKey,setAppKey]=useState('fueltrans');
 const [toast,setToast]=useState('');
 useEffect(()=>{const url=new URL(window.location.href);url.searchParams.set('screen',screen);
  history.replaceState(null,'',url.toString());},[screen]);
 useEffect(()=>{if(!toast)return;const id=setTimeout(()=>setToast(''),3000);return()=>clearTimeout(id);},[toast]);
 const props={onScreen:setScreen,appKey,onAppKey:setAppKey,toast:setToast};
 return <>
  {screen==='workspace'?<WorkspacePage {...props}/>:
   screen==='board'?<BoardInvitePage {...props}/>:
   screen==='app'?<AppRolesPage {...props}/>:
   <OverviewPage {...props}/>}
  {toast&&<div className="ap-toast" role="status">{toast}</div>}
 </>;
}
