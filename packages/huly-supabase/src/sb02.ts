/** CP-HULY-SB02: authenticated, board-scoped Supabase document boundary.
 * Supabase server keys and client-supplied role claims are never trusted.
 * Permission decisions use the existing authoritative Work Management RPCs.
 */
export type Principal = Readonly<{ id: string; email?: string }>;
export type Scope = Readonly<{ userId: string; workspaceId: string; boardId: string }>;
export type HulyDocument = Readonly<{
  id: string; boardId: string; workspaceId: string; payload: unknown; revision: number;
}>;
export type DocumentInput = Readonly<{ id: string; boardId: string; workspaceId: string; payload: unknown }>;
export interface SignedTokenVerifier {
  verify(token: string): Promise<Principal | null>;
}
export interface BoardPermissionProvider {
  authorize(token: string, scope: Scope, permission: 'view' | 'edit'): Promise<void>;
}
export interface ScopedDocumentStore {
  read(token: string, scope: Scope, id: string): Promise<HulyDocument | null>;
  save(token: string, scope: Scope, input: DocumentInput, expectedRevision: number | null): Promise<HulyDocument>;
}
export class Denied extends Error {
  constructor() { super('Access denied'); this.name = 'Denied'; }
}
export class VersionConflict extends Error {
  constructor() { super('Document version conflict'); this.name = 'VersionConflict'; }
}
export class ServiceUnavailable extends Error {
  constructor() { super('Supabase backend unavailable'); this.name = 'ServiceUnavailable'; }
}
export const isUuid = (s: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
export const validDocumentId = (s: string): boolean => /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,191}$/.test(s);

export class HulySupabaseGateway {
  constructor(
    private readonly identity: SignedTokenVerifier,
    private readonly permissions: BoardPermissionProvider,
    private readonly documents: ScopedDocumentStore
  ) {}

  private async establish(token: string, workspaceId: string, boardId: string, permission: 'view' | 'edit'): Promise<Scope> {
    if (!token || !isUuid(workspaceId) || !isUuid(boardId)) throw new Denied();
    const verified = await this.identity.verify(token);
    if (!verified || !isUuid(verified.id)) throw new Denied();
    const scope = { userId: verified.id, workspaceId, boardId };
    await this.permissions.authorize(token, scope, permission);
    return scope;
  }

  async read(token: string, workspaceId: string, boardId: string, id: string): Promise<HulyDocument | null> {
    if (!validDocumentId(id)) throw new Denied();
    const scope = await this.establish(token, workspaceId, boardId, 'view');
    const result = await this.documents.read(token, scope, id);
    if (result && (result.id !== id || result.boardId !== boardId || result.workspaceId !== workspaceId)) throw new Denied();
    return result;
  }

  async save(token: string, input: DocumentInput, expectedRevision: number | null): Promise<HulyDocument> {
    if (!validDocumentId(input.id) || (expectedRevision !== null && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1))) throw new Denied();
    if (input.payload === undefined || input.payload === null) throw new Denied();
    const scope = await this.establish(token, input.workspaceId, input.boardId, 'edit');
    const result = await this.documents.save(token, scope, input, expectedRevision);
    if (result.id !== input.id || result.boardId !== input.boardId || result.workspaceId !== input.workspaceId) throw new Denied();
    return result;
  }
}
