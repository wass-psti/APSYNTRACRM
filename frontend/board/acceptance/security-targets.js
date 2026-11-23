/** CP-A12.2 signed negative access target snapshot.
 * Canonical IDs are shared with the workspace application ownership manifest.
 * IDs and module names are routing metadata, not access tokens or privileges.
 * They are NEVER accepted as proof of authorization: the server decides.
 */
import { WORK_MANAGEMENT_WORKSPACE_ID } from '../../workspace-identity.js';
import { WORK_MANAGEMENT_BOARD_APPLICATIONS } from '../../workspace-application-ownership.js';

export const TARGET_WORKSPACE_ID = WORK_MANAGEMENT_WORKSPACE_ID;
export const TARGET_BOARDS = Object.freeze(WORK_MANAGEMENT_BOARD_APPLICATIONS.map(application =>
  Object.freeze({
    key: application.moduleKey,
    name: application.name,
    id: application.boardId
  })
));
