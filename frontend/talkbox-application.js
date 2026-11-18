/** CRM-native TalkBox board resolution. No board creation or migration. */
export const TALKBOX_APPLICATION_ROUTE='#/talkbox';
export function findTalkBoxBoard(boards,resolveModule){
 if(!Array.isArray(boards)||typeof resolveModule!=='function')return null;
 return boards.find(board=>board?.status!=='trashed'&&resolveModule(board?.name)?.key==='toolbox')||null;
}
export function talkBoxIssueHref(id){return /^[1-9][0-9]{0,18}$/.test(String(id||''))?'#/talkbox/issue/'+id:'#/talkbox';}
