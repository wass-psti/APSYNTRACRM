/** CP-WS-02D/D: reserved trusted route — production activation is OFF.
 * JWT verification remains enabled in Supabase Edge gateway configuration.
 */
import {dormantWorkspaceInvitationHandler} from '../_shared/ws02d-inactive.mjs';
Deno.serve(dormantWorkspaceInvitationHandler);
