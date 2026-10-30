/** CP-HULY-SB05 — Huly tracker Issue TxCreateDoc/TxUpdateDoc subset.
 * Reference contracts: Huly foundations/core/packages/core/src/tx.ts and
 * foundations/server/packages/middleware/src/normalizeTx.ts (EPL-2.0).
 * Not a replacement for full TxProcessor, domain pipelines or collaboration.
 */
import { Denied, ServiceUnavailable, type HulySupabaseGateway, type SignedTokenVerifier } from './sb02.ts';
import { type HulyMutation, type HulyReceipt, HulyTransactionGateway } from './transactions.ts';
import { documentToIssue, issueDocumentId, issueToDocument, type HulyIssueSnapshot } from './huly-issue.ts';
import { applyIssueOperations } from './native-operators.ts';

export const HULY_TX_CREATE = 'core:class:TxCreateDoc';
export const HULY_TX_UPDATE = 'core:class:TxUpdateDoc';
export const HULY_TX_REMOVE = 'core:class:TxRemoveDoc';
export const HULY_ISSUE = 'tracker:class:Issue';
export type NativeTx = Readonly<Record<string, unknown>>;
export type NativeTxResult = Readonly<{ receipts: readonly HulyReceipt[]; applied: number }>;
const SERVER_FIELDS = new Set(['_id','_class','space','modifiedBy','modifiedOn','createdBy','createdOn','attachedTo','attachedToClass','collection']);
const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,95}$/;
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function str(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 192; }
function safeKey(key: string): boolean {
  return KEY_PATTERN.test(key) && key !== '__proto__' && key !== 'prototype' && key !== 'constructor';
}
function boundedClone<T>(value: T): T {
  let data: string | undefined;
  try { data = JSON.stringify(value); } catch { throw new Denied(); }
  if (!data || new TextEncoder().encode(data).byteLength > 225000) throw new Denied();
  return JSON.parse(data) as T;
}
function assertTx(tx: NativeTx): asserts tx is NativeTx & { _class: string; objectClass: string; objectSpace: string; objectId: string; modifiedBy: string } {
  if (!record(tx) || (tx._class !== HULY_TX_CREATE && tx._class !== HULY_TX_UPDATE && tx._class !== HULY_TX_REMOVE)
    || tx.objectClass !== HULY_ISSUE || !str(tx.objectId) || !str(tx.objectSpace)
    || !str(tx.modifiedBy) || !str(tx._id) || !str(tx.space)
    || !Number.isSafeInteger(tx.modifiedOn) || (tx.modifiedOn as number) < 0
    || (tx.createdBy !== undefined && !str(tx.createdBy))
    || (tx.createdOn !== undefined && (!Number.isSafeInteger(tx.createdOn) || (tx.createdOn as number)<0))
    || ((tx.attachedTo !== undefined || tx.attachedToClass !== undefined || tx.collection !== undefined)
        && !(tx._class === HULY_TX_CREATE && str(tx.attachedTo) && tx.attachedToClass === HULY_ISSUE && tx.collection === 'subIssues'))
    || (tx.retrieve !== undefined && tx.retrieve !== false)) throw new Denied();
  issueDocumentId(tx.objectId);
}
function assertFieldMap(value: unknown): asserts value is Record<string, unknown> {
  if (!record(value) || Object.keys(value).length === 0) throw new Denied();
  for (const key of Object.keys(value)) if (!safeKey(key) || SERVER_FIELDS.has(key)) throw new Denied();
}
function updateIssue(snapshot:HulyIssueSnapshot,ops:unknown,actorId:string,timestamp:number):HulyIssueSnapshot{
 const result=applyIssueOperations(snapshot as Record<string,unknown>,ops);
 result.modifiedBy=actorId;result.modifiedOn=timestamp;
 return result as HulyIssueSnapshot;
}

/** RLS-read/materialize, then one atomic CAS Supabase RPC. Unsupported Tx classes,
 * operators, attached collections, and identity spoofing are rejected.
 */
export class NativeHulyIssueGateway {
  constructor(private readonly identity: SignedTokenVerifier, private readonly documents: HulySupabaseGateway, private readonly atomic: HulyTransactionGateway) {}
  async commit(token: string, workspaceId: string, boardId: string,
    txes: readonly NativeTx[]): Promise<NativeTxResult> {
    if (!Array.isArray(txes) || txes.length < 1 || txes.length > 25) throw new Denied();
    boundedClone(txes);
    const principal = await this.identity.verify(token);
    if (!principal) throw new Denied();
    const seen = new Set<string>();
    const mutations: HulyMutation[] = [];
    for (const tx of txes) {
      assertTx(tx);
      const id = issueDocumentId(tx.objectId);
      if (seen.has(id)) throw new Denied();
      seen.add(id);
      if (tx.modifiedBy !== principal.id || (tx.createdBy !== undefined && tx.createdBy !== principal.id)) throw new Denied();
      const input = tx._class !== HULY_TX_CREATE ? await this.documents.read(token, workspaceId, boardId, id) : null;
      if(tx._class !== HULY_TX_CREATE && !input)throw new Denied();
      if(tx._class === HULY_TX_REMOVE){
        const prev=documentToIssue(input!);
        if(prev.space!==tx.objectSpace || prev._class!==HULY_ISSUE)throw new Denied();
        mutations.push({action:'remove',documentId:id,expectedRevision:input!.revision});
        continue;
      }
      let snapshot: HulyIssueSnapshot;
      if (tx._class === HULY_TX_CREATE) {
        assertFieldMap(tx.attributes);
        const fields = boundedClone(tx.attributes);
        snapshot = {
          ...(fields as Record<string, unknown>),
          _id: tx.objectId, _class: HULY_ISSUE, space: tx.objectSpace,
          modifiedBy: tx.modifiedBy, modifiedOn: tx.modifiedOn,
          createdBy: tx.modifiedBy, createdOn: tx.modifiedOn,
          ...(tx.attachedTo !== undefined ? {attachedTo:tx.attachedTo,attachedToClass:tx.attachedToClass} : {})
        } as unknown as HulyIssueSnapshot;
      } else {
        const prior = documentToIssue(input!);
        if (prior.space !== tx.objectSpace || prior._class !== HULY_ISSUE) throw new Denied();
        snapshot = updateIssue(prior, tx.operations, tx.modifiedBy, tx.modifiedOn as number);
      }
      const document = issueToDocument(snapshot, boardId, workspaceId);
      mutations.push({
        action: tx._class === HULY_TX_CREATE ? 'create' : 'update',
        documentId: document.id, payload: document.payload,
        ...(input ? { expectedRevision: input.revision } : {})
      });
    }
    const receipts = await this.atomic.commit(token, workspaceId, boardId, mutations);
    if (receipts.length !== mutations.length) throw new ServiceUnavailable();
    return { receipts, applied: receipts.length };
  }
}
