/** Classify an immutable CI source commit against authoritative main.
 * A newer descendant supersedes an old source-specific CDN probe. Anything
 * other than a proven fast-forward descendant fails closed.
 */
const SHA=/^[a-f0-9]{40}$/;
export function classifyPagesSmokeHead(expected,head,comparison=null){
 if(!SHA.test(expected||'')||!SHA.test(head||''))
  throw Error('Invalid Git SHA in Pages verification');
 if(expected===head)return 'CURRENT';
 if(comparison?.status==='ahead'&&comparison?.merge_base_commit?.sha===expected&&
    Number.isInteger(comparison.ahead_by)&&comparison.ahead_by>0&&
    comparison.behind_by===0)
  return 'SUPERSEDED';
 throw Error('Pages verification encountered unexpected main history; refusing to skip');
}
