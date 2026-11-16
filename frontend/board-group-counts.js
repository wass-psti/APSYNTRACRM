/** Safe display formatting for partially available board group aggregates. */
export function boardGroupArchiveSuffix(activeCount,archivedCount){
 if(!Number.isSafeInteger(archivedCount)||archivedCount<=0)return '';
 const archived=archivedCount.toLocaleString('en-US');
 if(!Number.isSafeInteger(activeCount)||activeCount<0)
  return ' · '+archived+' archived';
 return ' · '+activeCount.toLocaleString('en-US')+' active · '+archived+' archived';
}
