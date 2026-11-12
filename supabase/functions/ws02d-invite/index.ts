/** WS02D trusted invitation issuance; deployment stays disabled without explicit Edge flag. */
import {serveInvitationRoute} from '../_shared/ws02d-trusted.ts';
serveInvitationRoute('invite');
