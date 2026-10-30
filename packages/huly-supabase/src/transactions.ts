/** CP-HULY-SB04 atomic batch operations: one PostgREST RPC, one PG transaction. */
import { Denied, ServiceUnavailable, isUuid, validDocumentId, type BoardPermissionProvider,
  type Principal, type Scope, type SignedTokenVerifier } from './sb02.js';

export type HulyMutation = Readonly<{
  action: 'create' | 'update';
  documentId: string;
  payload: unknown;
  expectedRevision?: number | null;
}>;
export type HulyReceipt = Readonly<{ id: string; boardId: string; workspaceId: string; revision: number }>;
export interface AtomicBoardStore {
  commit(token: string, scope: Scope, operations: readonly HulyMutation[]): Promise<readonly HulyReceipt[]>;
}

/** Does not trust claimed workspace/board or user-provided roles. */
export class HulyTransactionGateway {
  constructor(private readonly identity: SignedTokenVerifier,
    private readonly authorization: BoardPermissionProvider,
    private readonly store: AtomicBoardStore) {}

  async commit(token: string, workspaceId: string, boardId: string,
    operations: readonly HulyMutation[]): Promise<readonly HulyReceipt[]> {
    if (!token || !isUuid(workspaceId) || !isUuid(boardId) || !Array.isArray(operations)
      || operations.length < 1 || operations.length > 25) throw new Denied();
    const seen = new Set<string>();
    for (const op of operations) {
      if (!op || !validDocumentId(op.documentId) || seen.has(op.documentId)
        || !['create','update'].includes(op.action) || op.payload == null) throw new Denied();
      seen.add(op.documentId);
      if (op.action === 'create' && op.expectedRevision != null) throw new Denied();
      if (op.action === 'update' && (!Number.isSafeInteger(op.expectedRevision) || Number(op.expectedRevision) < 1)) throw new Denied();
    }
    // JSON-compatible, bounded payloads; catches BigInt/circular objects.
    let serialized: string;
    try { serialized = JSON.stringify(operations); }
    catch { throw new Denied(); }
    if (!serialized || new TextEncoder().encode(serialized).byteLength > 230000) throw new Denied();
    const principal: Principal | null = await this.identity.verify(token);
    if (!principal || !isUuid(principal.id)) throw new Denied();
    const scope: Scope = { userId:principal.id, workspaceId, boardId };
    await this.authorization.authorize(token,scope,'edit');
    const result = await this.store.commit(token,scope,operations);
    if (!Array.isArray(result) || result.length !== operations.length) throw new ServiceUnavailable();
    for (let i=0;i<result.length;i++) {
      const receipt=result[i], operation=operations[i];
      if (!receipt || !operation || receipt.id!==operation.documentId || receipt.boardId!==boardId
        || receipt.workspaceId!==workspaceId || !Number.isSafeInteger(receipt.revision) || receipt.revision<1) {
        throw new ServiceUnavailable();
      }
    }
    return result;
  }
}
