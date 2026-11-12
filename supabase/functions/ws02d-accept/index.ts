/** WS02D signed recipient acceptance; no anonymous or direct browser SQL grants. */
import {serveInvitationRoute} from '../_shared/ws02d-trusted.ts';
serveInvitationRoute('accept');
