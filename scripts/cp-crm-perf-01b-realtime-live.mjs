import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {PlatformSync} from '../frontend/platform-sync.js';

const apiUrl = (process.env.API_URL || '').replace(/\/$/, '');
const apiKey = process.env.PUBLISHABLE_KEY || process.env.ANON_KEY || '';
const boardId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const workspaceId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const topic = 'realtime:board:' + boardId;

for (const [name, value] of [['API_URL', apiUrl], ['PUBLISHABLE_KEY', apiKey]]) {
  if (!value) throw new Error(name + ' is required for the disposable Realtime test');
}
if (typeof globalThis.WebSocket !== 'function') {
  throw new Error('Node.js WebSocket is unavailable; use the pinned Node 22 runtime');
}

const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));

async function waitFor(label, predicate, timeoutMs = 15000, diagnostics = null) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return Date.now() - start;
    await delay(50);
  }
  throw new Error('Timed out waiting for ' + label + '; diagnostics=' + JSON.stringify(diagnostics ? diagnostics() : {}));
}

function parseFrame(event) {
  try {
    const raw = typeof event.data === 'string' ? event.data : String(event.data);
    const frame = JSON.parse(raw);
    return Array.isArray(frame) ? frame : null;
  } catch {
    return null;
  }
}

function waitForFrame(socket, label, predicate, timeoutMs = 10000) {
  return new Promise((resolveFrame, rejectFrame) => {
    const cleanup = () => {
      clearTimeout(timer);
      socket.removeEventListener('message', onMessage);
      socket.removeEventListener('error', onError);
      socket.removeEventListener('close', onClose);
    };
    const timer = setTimeout(() => {
      cleanup();
      rejectFrame(new Error('Timed out waiting for Realtime ' + label));
    }, timeoutMs);
    const onMessage = event => {
      const frame = parseFrame(event);
      if (frame && predicate(frame)) {
        cleanup();
        resolveFrame(frame);
      }
    };
    const onError = () => {
      cleanup();
      rejectFrame(new Error('Realtime socket error while waiting for ' + label));
    };
    const onClose = () => {
      cleanup();
      rejectFrame(new Error('Realtime socket closed while waiting for ' + label));
    };
    socket.addEventListener('message', onMessage);
    socket.addEventListener('error', onError);
    socket.addEventListener('close', onClose);
  });
}

async function waitForOpen(socket) {
  if (socket.readyState === 1) return;
  await new Promise((resolveOpen, rejectOpen) => {
    const cleanup = () => {
      clearTimeout(timer);
      socket.removeEventListener('open', onOpen);
      socket.removeEventListener('error', onError);
      socket.removeEventListener('close', onClose);
    };
    const timer = setTimeout(() => {
      cleanup();
      rejectOpen(new Error('Realtime WebSocket open timed out'));
    }, 10000);
    const onOpen = () => {
      cleanup();
      resolveOpen();
    };
    const onError = () => {
      cleanup();
      rejectOpen(new Error('Realtime WebSocket failed to open'));
    };
    const onClose = () => {
      cleanup();
      rejectOpen(new Error('Realtime WebSocket closed before opening'));
    };
    socket.addEventListener('open', onOpen);
    socket.addEventListener('error', onError);
    socket.addEventListener('close', onClose);
  });
}

async function createLocalSignedUser() {
  const unique = randomUUID();
  const email = 'cp-crm-perf-01b-' + unique + '@example.test';
  const password = 'Perf01B-' + randomUUID() + '!aA9';

  const signUpResponse = await fetch(apiUrl + '/auth/v1/signup', {
    method: 'POST',
    headers: {
      apikey: apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({email, password})
  });
  if (!signUpResponse.ok) {
    throw new Error('Local Auth sign-up failed with HTTP ' + signUpResponse.status);
  }

  const signUp = await signUpResponse.json();
  let session = signUp;
  if (!session.access_token) {
    const tokenResponse = await fetch(apiUrl + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: {
        apikey: apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({email, password})
    });
    if (!tokenResponse.ok) {
      throw new Error('Local Auth password sign-in failed with HTTP ' + tokenResponse.status);
    }
    session = await tokenResponse.json();
  }

  const userId = session.user?.id || signUp.user?.id || signUp.id;
  if (!session.access_token || !userId) {
    throw new Error('Local Auth did not return a signed session');
  }
  return {userId, accessToken: session.access_token};
}
function createLocalWebSocket(url) {
  if (!url.startsWith('wss://')) throw new Error('PlatformSync must request a secure WebSocket URL');
  return new globalThis.WebSocket(url.replace(/^wss:/, 'ws:'));
}

async function connectSender(accessToken, socketUrl) {
  const socket = new globalThis.WebSocket(socketUrl);
  await waitForOpen(socket);
  const joinRef = 'sender-join';
  const joinRequestRef = 'sender-join-request';
  const joinReply = waitForFrame(
    socket,
    'sender private-channel join reply',
    frame => frame[3] === 'phx_reply' && String(frame[1]) === joinRequestRef
  );
  socket.send(JSON.stringify([
    joinRef,
    joinRequestRef,
    topic,
    'phx_join',
    {
      config: {
        broadcast: {ack: true, self: false},
        presence: {enabled: false},
        postgres_changes: [],
        private: true
      },
      access_token: accessToken
    }
  ]));
  const joined = await joinReply;
  if (joined[4]?.status !== 'ok') {
    throw new Error('Local Realtime sender could not join the private board channel: ' + JSON.stringify(joined[4] || {}));
  }

  let messageNumber = 0;
  return {
    socket,
    async broadcast() {
      const ref = 'sender-broadcast-' + (++messageNumber);
      const ack = waitForFrame(
        socket,
        'broadcast acknowledgement',
        frame => frame[3] === 'phx_reply' && String(frame[1]) === ref
      );
      socket.send(JSON.stringify([
        joinRef,
        ref,
        topic,
        'broadcast',
        {
          type: 'broadcast',
          event: 'board-change',
          payload: {
            board_id: boardId,
            entity: 'board',
            entity_id: boardId,
            action: 'CP_CRM_PERF_01B_REALTIME_TEST',
            change_count: 1
          }
        }
      ]));
      const reply = await ack;
      if (reply[4]?.status !== 'ok') {
        throw new Error('Local Realtime rejected the private board-change broadcast');
      }
    }
  };
}

async function readProbe(apiUrlValue, accessToken) {
  const response = await fetch(apiUrlValue + '/rest/v1/rpc/cp_crm_perf_01b_realtime_probe_read', {
    method: 'POST',
    headers: {
      apikey: apiKey,
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({p_board_id: boardId})
  });
  if (!response.ok) {
    throw new Error('Signed authoritative probe read failed with HTTP ' + response.status);
  }
  return response.json();
}

async function setProbeRevision(revision, accessToken) {
  const response = await fetch(
    apiUrl + '/rest/v1/cp_crm_perf_01b_realtime_probe?board_id=eq.' + boardId,
    {
      method: 'PATCH',
      headers: {
        apikey: apiKey,
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({revision})
    }
  );
  if (!response.ok) {
    throw new Error('Signed disposable probe revision update failed with HTTP ' + response.status);
  }
}
let sync = null;
let sender = null;
let userId = null;
let report = null;

try {
  const signedUser = await createLocalSignedUser();
  userId = signedUser.userId;
  const accessToken = signedUser.accessToken;
  const invalidations = [];
  const statuses = [];

  const auth = {
    isSignedIn: true,
    userId,
    async getVerifiedUser() {
      return {id: userId};
    },
    async token() {
      return accessToken;
    }
  };
  const api = {
    async context() {
      return {user_id: userId, workspace_id: workspaceId};
    }
  };
  const onInvalidate = async state => {
    const data = await readProbe(apiUrl, accessToken);
    invalidations.push({
      reason: state.reason,
      boardIds: [...state.boardIds],
      boardId: data?.board_id,
      revision: data?.revision,
      at: Date.now()
    });
    return data?.board_id === boardId && Number.isInteger(data?.revision);
  };

  const secureUrl = apiUrl.replace(/^http:/, 'https:');
  sync = new PlatformSync({
    auth,
    api,
    url: secureUrl,
    publishableKey: apiKey,
    WebSocketImpl: createLocalWebSocket,
    locks: null,
    storage: null,
    visible: () => true,
    online: () => true,
    onStatus: state => statuses.push({...state, at: Date.now()}),
    onInvalidate
  });

  const base = new URL(apiUrl);
  const socketUrl = 'ws://' + base.host + '/realtime/v1/websocket?apikey=' +
    encodeURIComponent(apiKey) + '&vsn=2.0.0';
  const senderJoinStart = Date.now();
  sender = await connectSender(accessToken, socketUrl);
  const senderJoinMs = Date.now() - senderJoinStart;

  sync.start({userId, workspaceId, boardIds: [boardId]});
  const diagnostics = () => ({
    lastTransport: sync.lastTransport,
    socketReadyState: sync.socket?.readyState ?? null,
    joinedBoardIds: [...sync.joined.keys()],
    pendingJoinCount: sync.joins.size,
    lastSyncAt: sync.lastSyncAt,
    recentStatus: statuses.slice(-8).map(item => ({
      phase: item.phase,
      transport: item.transport,
      detail: item.detail
    }))
  });
  const initialJoinMs = await waitFor(
    'PlatformSync private board channel join',
    () => sync.lastTransport === 'realtime' && sync.joined.has(boardId) && sync.lastSyncAt !== null,
    15000,
    diagnostics
  );
  assert.ok(initialJoinMs >= 0);

  const firstBroadcastStart = Date.now();
  await sender.broadcast();
  await waitFor(
    'first board-change invalidation and signed read',
    () => invalidations.filter(item => item.reason === 'broadcast').length >= 1
  );
  const firstBroadcastLatencyMs = Date.now() - firstBroadcastStart;
  const firstBroadcast = invalidations.filter(item => item.reason === 'broadcast')[0];
  assert.equal(firstBroadcast.boardId, boardId);
  assert.deepEqual(firstBroadcast.boardIds, [boardId]);
  assert.equal(firstBroadcast.revision, 1);

  await setProbeRevision(2, accessToken);

  const previousSocket = sync.socket;
  assert.ok(previousSocket);
  const reconnectStart = Date.now();
  previousSocket.close(1000, 'controlled reconnect acceptance');
  const reconnectLatencyMs = await waitFor(
    'PlatformSync automatic private-channel rejoin after socket close',
    () => sync.socket && sync.socket !== previousSocket &&
      sync.lastTransport === 'realtime' && sync.joined.has(boardId),
    20000
  );
  assert.ok(reconnectLatencyMs >= 0);

  const secondBroadcastStart = Date.now();
  await sender.broadcast();
  await waitFor(
    'second board-change invalidation after reconnect',
    () => invalidations.filter(item => item.reason === 'broadcast').length >= 2
  );
  const secondBroadcastLatencyMs = Date.now() - secondBroadcastStart;
  const broadcastReads = invalidations.filter(item => item.reason === 'broadcast');
  assert.equal(broadcastReads.length, 2);
  assert.deepEqual(broadcastReads.map(item => item.revision), [1, 2]);
  assert.equal(sync.lastTransport, 'realtime');
  assert.equal(sync.joined.has(boardId), true);
  assert.equal(statuses.some(item => item.phase === 'error'), false);

  report = {
    checkpoint: 'CP-CRM-PERF-01B',
    transport: 'Supabase Realtime v2 private broadcast',
    localDisposableStack: true,
    signedAuthSession: true,
    privateBoardTopic: topic,
    senderJoinMs,
    initialJoinMs,
    firstBroadcastLatencyMs,
    reconnectLatencyMs,
    secondBroadcastLatencyMs,
    broadcastInvalidations: broadcastReads.map(item => ({
      boardIds: item.boardIds,
      revision: item.revision
    })),
    assertions: {
      privateSubscriberJoined: true,
      signedAuthoritativeReadAfterFirstBroadcast: true,
      socketCloseTriggeredAutomaticReconnect: true,
      privateSubscriberRejoined: true,
      signedAuthoritativeReadAfterSecondBroadcast: true,
      eventPayloadUsedOnlyAsInvalidationHint: true,
      productionWrites: 0,
      unexpectedClientErrors: 0
    },
    statusTransitions: statuses.map(item => ({
      phase: item.phase,
      transport: item.transport,
      detail: item.detail
    }))
  };
} finally {
  if (sync) sync.stop();
  if (sender?.socket && sender.socket.readyState < 2) {
    try { sender.socket.close(1000, 'test complete'); } catch {}
  }
}

if (!report) throw new Error('Realtime acceptance did not produce a report');
report.cleanup = {signedTestUserIsolatedToDisposableDatabase: true, socketsClosed: true};
const output = resolve('artifacts/cp-crm-perf-01b-realtime.json');
mkdirSync(resolve('artifacts'), {recursive: true});
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log('CP_CRM_PERF_01B_REALTIME_PASS ' + JSON.stringify({
  initialJoinMs: report.initialJoinMs,
  firstBroadcastLatencyMs: report.firstBroadcastLatencyMs,
  reconnectLatencyMs: report.reconnectLatencyMs,
  secondBroadcastLatencyMs: report.secondBroadcastLatencyMs,
  revisions: report.broadcastInvalidations.map(item => item.revision)
}));
