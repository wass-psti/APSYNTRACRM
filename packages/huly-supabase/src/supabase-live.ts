/** Concrete Supabase HTTP adapters. No service-role key, privileged bypass or local DB. */
import { Denied, ServiceUnavailable, VersionConflict, HulySupabaseGateway, isUuid, type BoardPermissionProvider, type DocumentInput, type HulyDocument, type Principal, type Scope, type ScopedDocumentStore, type SignedTokenVerifier } from './sb02.js';

type FetchLike = typeof fetch;
type JsonObject = Record<string, unknown>;

function obj(input: unknown): input is JsonObject { return typeof input === 'object' && input !== null && !Array.isArray(input); }
function nonblank(s: unknown): s is string { return typeof s === 'string' && s.length > 0; }

export class SupabaseHttp {
  private readonly base: string;
  constructor(url: string, private readonly publishableKey: string, private readonly request: FetchLike = fetch) {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !!u.username || !!u.password || !!u.search || !!u.hash) throw new Error('Supabase URL must be HTTPS');
    if (!/^sb_publishable_[A-Za-z0-9_]+$/.test(publishableKey) && !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(publishableKey)) throw new Error('A publishable (or legacy anon) key is required');
    this.base = u.origin;
  }

  async json(path: string, token: string, init: { method?: 'GET'|'POST'|'PATCH'; body?: unknown; query?: Record<string,string>; prefer?: string } = {}): Promise<unknown> {
    if (!nonblank(token) || /[\r\n]/.test(token) || token.length > 8192) throw new Denied();
    const u = new URL(path, this.base);
    if (u.origin !== this.base) throw new Denied();
    for (const [key,value] of Object.entries(init.query ?? {})) u.searchParams.set(key,value);
    let response: Response;
    try {
      response = await this.request(u, {
        method: init.method ?? 'GET',
        headers: {
          'apikey': this.publishableKey,
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(init.prefer ? { 'Prefer': init.prefer } : {})
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        redirect: 'error',
        signal: AbortSignal.timeout(10000)
      });
    } catch { throw new ServiceUnavailable(); }
    if (response.status === 401 || response.status === 403) throw new Denied();
    if (response.status === 409) throw new VersionConflict();
    if (!response.ok) throw new ServiceUnavailable();
    if (response.status === 204) return null;
    try { return await response.json() as unknown; } catch { throw new ServiceUnavailable(); }
  }
}

export class SupabaseAuthVerifier implements SignedTokenVerifier {
  constructor(private readonly http: SupabaseHttp) {}
  async verify(token: string): Promise<Principal | null> {
    try {
      const data = await this.http.json('/auth/v1/user', token);
      if (!obj(data) || !nonblank(data.id) || !isUuid(data.id)) return null;
      return { id: data.id, ...(nonblank(data.email) ? {email:data.email}: {}) };
    } catch (err) { if (err instanceof Denied) return null; throw err; }
  }
}

/** Reuses installed authoritative RPCs rather than introducing an app-local membership table. */
export class WatchdogBoardPermissions implements BoardPermissionProvider {
  constructor(private readonly http: SupabaseHttp) {}
  async authorize(token: string, scope: Scope, permission: 'view'|'edit'): Promise<void> {
    const context = await this.http.json('/rest/v1/rpc/wm_auth_access_context', token, {method:'POST',body:{}});
    if (!obj(context) || context.user_id !== scope.userId || context.workspace_id !== scope.workspaceId || !obj(context.profile) || context.profile.status !== 'active') throw new Denied();
    const allowed = await this.http.json('/rest/v1/rpc/work_board_access', token, {
      method:'POST', body:{p_board_id:scope.boardId,p_required:permission}
    });
    if (allowed !== true) throw new Denied();
  }
}

function parseDocument(row: unknown): HulyDocument {
  if (!obj(row) || !nonblank(row.document_id) || !nonblank(row.board_id) || !nonblank(row.workspace_id) || !Number.isSafeInteger(row.revision) || (row.revision as number) < 1) throw new ServiceUnavailable();
  if (!Object.hasOwn(row,'payload')) throw new ServiceUnavailable();
  return { id:row.document_id, boardId:row.board_id, workspaceId:row.workspace_id, payload:row.payload, revision:row.revision as number };
}
function rows(data: unknown): unknown[] { if (!Array.isArray(data)) throw new ServiceUnavailable(); return data; }

/** Uses an RLS-protected, updatable security_invoker view over the isolated huly_rewrite schema. */
export class SupabaseDocumentRepository implements ScopedDocumentStore {
  private readonly path = '/rest/v1/huly_sb02_documents';
  constructor(private readonly http: SupabaseHttp) {}
  async read(token: string, scope: Scope, id: string): Promise<HulyDocument | null> {
    const result = rows(await this.http.json(this.path, token, {query:{
      select:'document_id,board_id,workspace_id,payload,revision',
      document_id:`eq.${id}`,board_id:`eq.${scope.boardId}`,workspace_id:`eq.${scope.workspaceId}`,limit:'1'
    }}));
    return result.length === 0 ? null : parseDocument(result[0]);
  }
  async save(token: string, scope: Scope, input: DocumentInput, expectedRevision: number | null): Promise<HulyDocument> {
    if (expectedRevision === null) {
      const data = rows(await this.http.json(this.path, token, {
        method:'POST',prefer:'return=representation',
        query:{select:'document_id,board_id,workspace_id,payload,revision'},
        body:{document_id:input.id,board_id:scope.boardId,workspace_id:scope.workspaceId,payload:input.payload}
      }));
      if (data.length !== 1) throw new ServiceUnavailable();
      return parseDocument(data[0]);
    }
    const data = rows(await this.http.json(this.path, token, {
      method:'PATCH',prefer:'return=representation',
      query:{select:'document_id,board_id,workspace_id,payload,revision',document_id:`eq.${input.id}`,
        board_id:`eq.${scope.boardId}`,workspace_id:`eq.${scope.workspaceId}`,revision:`eq.${expectedRevision}`},
      body:{payload:input.payload}
    }));
    if (data.length === 0) throw new VersionConflict();
    if (data.length !== 1) throw new ServiceUnavailable();
    const result = parseDocument(data[0]);
    if (result.revision !== expectedRevision + 1) throw new ServiceUnavailable();
    return result;
  }
}

export function createLiveHulyGateway(url: string, publishableKey: string, request?: FetchLike) {
  const http = new SupabaseHttp(url,publishableKey,request);
  return new HulySupabaseGateway(new SupabaseAuthVerifier(http),new WatchdogBoardPermissions(http),new SupabaseDocumentRepository(http));
}

import { HulyTransactionGateway, type AtomicBoardStore, type HulyMutation, type HulyReceipt } from './transactions.js';

function receiptRows(data:unknown): readonly HulyReceipt[] {
  if (!Array.isArray(data)) throw new ServiceUnavailable();
  return data.map(row=>{
    if (!obj(row) || !nonblank(row.id) || !nonblank(row.boardId) || !isUuid(row.boardId) || !nonblank(row.workspaceId) || !isUuid(row.workspaceId)
      || !Number.isSafeInteger(row.revision) || Number(row.revision)<1) throw new ServiceUnavailable();
    return {id:row.id, boardId:row.boardId, workspaceId:row.workspaceId, revision:row.revision as number};
  });
}
export class SupabaseAtomicBoardStore implements AtomicBoardStore {
  constructor(private readonly http:SupabaseHttp) {}
  async commit(token:string,scope:Scope,operations:readonly HulyMutation[]):Promise<readonly HulyReceipt[]> {
    return receiptRows(await this.http.json('/rest/v1/rpc/huly_sb04_transact',token,{
      method:'POST',body:{p_board_id:scope.boardId,p_workspace_id:scope.workspaceId,p_operations:operations}
    }));
  }
}
export function createLiveHulyTransactions(url:string,publishableKey:string,request?:FetchLike):HulyTransactionGateway {
  const http=new SupabaseHttp(url,publishableKey,request);
  return new HulyTransactionGateway(new SupabaseAuthVerifier(http),new WatchdogBoardPermissions(http),new SupabaseAtomicBoardStore(http));
}

/** CP-HULY-SB05: native Issue CUD subset using existing Supabase gateway and RPC. */
import { NativeHulyIssueGateway } from './native-huly.js';
export function createLiveNativeHulyIssues(url:string,publishableKey:string,request?:FetchLike): NativeHulyIssueGateway {
  const http=new SupabaseHttp(url,publishableKey,request);
  const identity=new SupabaseAuthVerifier(http);
  const permissions=new WatchdogBoardPermissions(http);
  return new NativeHulyIssueGateway(identity,
    new HulySupabaseGateway(identity,permissions,new SupabaseDocumentRepository(http)),
    new HulyTransactionGateway(identity,permissions,new SupabaseAtomicBoardStore(http)));
}

/** SB06: atomic transaction RPC with reversible tombstones and event ledger. */
export class SupabaseSb06AtomicStore implements AtomicBoardStore {
 constructor(private readonly http:SupabaseHttp){}
 async commit(token:string,scope:Scope,operations:readonly HulyMutation[]):Promise<readonly HulyReceipt[]>{
  return receiptRows(await this.http.json('/rest/v1/rpc/huly_sb06_transact',token,{
   method:'POST',body:{p_board_id:scope.boardId,p_workspace_id:scope.workspaceId,p_operations:operations}
  }));
 }
}
export function createLiveSb06NativeIssues(url:string,publishableKey:string,request?:FetchLike):NativeHulyIssueGateway{
 const http=new SupabaseHttp(url,publishableKey,request);
 const identity=new SupabaseAuthVerifier(http),permissions=new WatchdogBoardPermissions(http);
 return new NativeHulyIssueGateway(identity,
  new HulySupabaseGateway(identity,permissions,new SupabaseDocumentRepository(http)),
  new HulyTransactionGateway(identity,permissions,new SupabaseSb06AtomicStore(http)));
}
