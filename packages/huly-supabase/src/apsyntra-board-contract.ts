/** CP-A12: domain-to-board projection envelope for the existing TypeScript gateway.
 * Contract only: storage and authorization remain the existing Work Management
 * backend and PostgreSQL. No parallel item/document repository is introduced.
 */
export type ApsyntraModuleKey =
  | 'fueltrans' | 'tools' | 'toolbox' | 'frt' | 'fueltrack' | 'tradelink'
  | 'timetracker' | 'orders' | 'evaluation' | 'charter' | 'aims' | 'materials';

export type ProjectionIdentity = Readonly<{
  workspaceId: string;
  boardId: string;
  moduleKey: ApsyntraModuleKey;
  sourceRecordId: string;
}>;

export type SourceProjection = Readonly<ProjectionIdentity & {
  sourceRevision: number;
  sourceEventId: string;
  sourceUpdatedAt: string;
  /** Only approved non-sensitive fields, by board-specific schema key. */
  visibleFields: Readonly<Record<string,string|number|boolean|null>>;
}>;

export type ProjectionSequence = 'initial' | 'next' | 'duplicate' | 'gap' | 'stale' | 'conflict';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const modules=new Set<ApsyntraModuleKey>([
  'fueltrans','tools','toolbox','frt','fueltrack','tradelink',
  'timetracker','orders','evaluation','charter','aims','materials'
]);
const keys=/^[a-z][a-z0-9_]{0,79}$/;
const sourceIds=/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/;
function isRecord(v:unknown): v is Record<string,unknown>{
 return typeof v==='object'&&v!==null&&!Array.isArray(v);
}
export function validateSourceProjection(input:unknown): SourceProjection {
 if(!isRecord(input) ||
  typeof input.workspaceId!=='string'||!UUID.test(input.workspaceId) ||
  typeof input.boardId!=='string'||!UUID.test(input.boardId) ||
  !modules.has(input.moduleKey as ApsyntraModuleKey) ||
  typeof input.sourceRecordId!=='string'||!sourceIds.test(input.sourceRecordId) ||
  !Number.isSafeInteger(input.sourceRevision)||Number(input.sourceRevision)<1 ||
  typeof input.sourceEventId!=='string'||!sourceIds.test(input.sourceEventId) ||
  typeof input.sourceUpdatedAt!=='string'||Number.isNaN(Date.parse(input.sourceUpdatedAt)) ||
  !isRecord(input.visibleFields) ||
  Object.keys(input.visibleFields).length>30
 ) throw new TypeError('Invalid APSYNTRA source projection envelope');
 for(const [key,value] of Object.entries(input.visibleFields)){
  if(!keys.test(key) || ['__proto__','prototype','constructor'].includes(key) ||
    !(value===null||typeof value==='string'||typeof value==='boolean'||
      (typeof value==='number'&&Number.isFinite(value))) ||
    (typeof value==='string'&&value.length>1000))
   throw new TypeError('Unsupported projection field or value');
 }
 const encoded=JSON.stringify(input);
 if(new TextEncoder().encode(encoded).byteLength>25000)
  throw new TypeError('Source projection is too large');
 return input as SourceProjection;
}
export function projectedRecordKey(value:ProjectionIdentity): string {
 if(!UUID.test(value.workspaceId)||!UUID.test(value.boardId) ||
 !modules.has(value.moduleKey)||!sourceIds.test(value.sourceRecordId))
  throw new TypeError('Invalid projected source identity');
 // Stable logical composite key; NOT a substitute for a database unique constraint.
 return [value.workspaceId,value.boardId,value.moduleKey,value.sourceRecordId].join('|');
}
export function classifyProjection(previous:SourceProjection|null,next:SourceProjection): ProjectionSequence {
 const curr=validateSourceProjection(next);
 if(!previous)return 'initial';
 const prev=validateSourceProjection(previous);
 if(projectedRecordKey(prev)!==projectedRecordKey(curr))throw new TypeError('Source identity changed');
 if(curr.sourceRevision<prev.sourceRevision)return 'stale';
 if(curr.sourceRevision===prev.sourceRevision)return curr.sourceEventId===prev.sourceEventId?'duplicate':'conflict';
 return curr.sourceRevision===prev.sourceRevision+1?'next':'gap';
}
/** Phase B backend implementation MUST enforce sequence and unique source identity atomically.
 * Client-side classification alone is not an authoritative persistence guarantee.
 */
