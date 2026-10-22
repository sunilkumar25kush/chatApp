/**
 * End-to-end smoke tests — API + Socket.io.
 *
 * Spawns the real server on a dedicated port with a DEDICATED TEST DATABASE
 * (chatroom_test — the production DB is never touched), runs the suite, then
 * kills the server and drops the test DB.
 *
 * Run:  npm test   (backend)
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { io } = require('socket.io-client');

const PORT = 5017;
const BASE = `http://localhost:${PORT}`;
const BACKEND_DIR = path.join(__dirname, '..');

// Derive the test DB URI from the dev .env, swapping the database name.
function testMongoUri() {
  const envPath = path.join(BACKEND_DIR, '.env');
  if (fs.existsSync(envPath)) {
    const match = fs.readFileSync(envPath, 'utf8').match(/^MONGO_URI=(.+)$/m);
    if (match) {
      const uri = match[1].trim();
      // Replace the database segment (last path component before ? or end)
      return uri.replace(/\/([^/?]+)(\?|$)/, '/chatroom_test$2');
    }
  }
  return 'mongodb://localhost:27017/chatroom_test';
}

const MONGO_URI = testMongoUri();

let serverProc = null;
let tokenA = null;
let tokenB = null;
let roomId = null;
let testUserId = null;

function waitForServer(timeoutMs = 45000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = async () => {
      if (Date.now() - started > timeoutMs) return reject(new Error('Server did not become healthy in time'));
      try {
        const res = await fetch(`${BASE}/api/health`);
        if (res.ok) return resolve();
      } catch { /* not up yet */ }
      setTimeout(poll, 500);
    };
    poll();
  });
}

function jsonFetch(pathname, options = {}, token) {
  return fetch(`${BASE}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
}

const unique = (prefix) => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e4)}`;

before(async () => {
  serverProc = spawn('node', ['server.js'], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'test',
      MONGO_URI,
      CLIENT_URL: 'http://localhost:5173',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProc.stdout.on('data', () => {});   // drain — prevents pipe backpressure
  serverProc.stderr.on('data', (d) => process.stderr.write(d));

  await waitForServer();

  // Register two users + create a room
  const emailA = `${unique('userA')}@test.local`;
  const emailB = `${unique('userB')}@test.local`;

  const regA = await jsonFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: unique('alice'), email: emailA, password: 'test123456' }),
  });
  assert.equal(regA.status, 201, 'register A failed');
  const userA = await regA.json();
  tokenA = userA.token;

  // Resolve the authenticated user id via /me — works in DB and memory mode
  const meRes = await jsonFetch('/api/auth/profile', {}, tokenA);
  assert.equal(meRes.status, 200, '/me failed');
  const me = await meRes.json();
  testUserId = me._id || me.id;

  const regB = await jsonFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: unique('bob'), email: emailB, password: 'test123456' }),
  });
  assert.equal(regB.status, 201, 'register B failed');
  tokenB = (await regB.json()).token;

  const roomRes = await jsonFetch('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({ name: unique('TestRoom') }),
  }, tokenA);
  assert.equal(roomRes.status, 201, 'create room failed');
  roomId = (await roomRes.json())._id;
});

after(async () => {
  if (serverProc) {
    serverProc.kill('SIGTERM');
    await new Promise((r) => serverProc.once('exit', r));
  }
  // Drop the dedicated test DB (server is down, so connect fresh)
  try {
    const mongoose = require('mongoose');
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  } catch { /* cleanup is best-effort */ }
});

// ── API ──────────────────────────────────────────────────────────────
test('GET /api/health returns ok', async () => {
  const res = await jsonFetch('/api/health');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'success');
});

test('auth: wrong password is rejected', async () => {
  const res = await jsonFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'nobody@test.local', password: 'wrongpass' }),
  });
  assert.equal(res.status, 401);
});

test('auth: protected route rejects missing token', async () => {
  const res = await jsonFetch('/api/auth/profile');
  assert.equal(res.status, 401);
});

test('rooms: list requires auth and returns the created room', async () => {
  const res = await jsonFetch('/api/rooms', {}, tokenA);
  assert.equal(res.status, 200);
  const body = await res.json();
  const rooms = Array.isArray(body) ? body : body.rooms || [];
  assert.ok(rooms.some((r) => (r._id || r.id) === roomId), 'created room not in list');
});

test('upload: spoofed file (.exe bytes as .png) is rejected with 400', async () => {
  const fakePng = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]); // MZ header
  const form = new FormData();
  form.append('file', new Blob([fakePng], { type: 'image/png' }), 'fake.png');
  const res = await fetch(`${BASE}/api/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: form,
  });
  assert.equal(res.status, 400, `expected 400, got ${res.status}`);
});

test('messages: invalid ObjectId returns 400 (not 500)', async () => {
  const res = await jsonFetch('/api/messages/not-an-object-id', {}, tokenA);
  assert.equal(res.status, 400);
});

// ── Socket.io ────────────────────────────────────────────────────────
test('socket: unauthenticated connection is rejected', async () => {
  await new Promise((resolve) => {
    const sock = io(BASE, { auth: {}, transports: ['websocket'], reconnection: false, timeout: 5000 });
    sock.on('connect_error', () => {
      sock.close();
      resolve();
    });
    sock.on('connect', () => {
      sock.close();
      resolve(new Error('unauthenticated connection should have been rejected'));
    });
    setTimeout(() => { sock.close(); resolve(new Error('no connect_error within timeout')); }, 8000).unref();
  });
});

test('socket: authenticated send → receive → edit flow works', async () => {
  const sockA = io(BASE, { auth: { token: tokenA }, transports: ['websocket'], reconnection: false, forceNew: true });
  const sockB = io(BASE, { auth: { token: tokenB }, transports: ['websocket'], reconnection: false, forceNew: true });

  try {
    await Promise.all([
      new Promise((res) => sockA.on('connect', res)),
      new Promise((res) => sockB.on('connect', res)),
    ]);
    sockA.emit('join_room', { roomId });
    sockB.emit('join_room', { roomId });
    await new Promise((r) => setTimeout(r, 300));

    // A sends → B receives
    const received = new Promise((resolve) => {
      sockB.on('receive_message', (msg) => {
        if (msg.content === 'hello e2e') resolve(msg);
      });
    });
    sockA.emit('send_message', { roomId, content: 'hello e2e' });
    const msg = await received;
    assert.equal(msg.content, 'hello e2e');
    assert.ok(msg._id, 'message should have a server id');
    assert.equal(msg.sender._id, testUserId, 'sender must be server-derived (no impersonation)');

    // A edits → B sees edit
    const edited = new Promise((resolve) => {
      sockB.on('message_edited', (m) => {
        if (m._id === msg._id) resolve(m);
      });
    });
    sockA.emit('edit_message', { messageId: msg._id, roomId, newContent: 'hello e2e EDITED' });
    const editedMsg = await edited;
    assert.equal(editedMsg.content, 'hello e2e EDITED');
    assert.equal(editedMsg.isEdited, true);
  } finally {
    sockA.close();
    sockB.close();
  }
});

test('socket: sender identity is server-derived (client cannot impersonate)', async () => {
  const sockA = io(BASE, { auth: { token: tokenA }, transports: ['websocket'], reconnection: false, forceNew: true });
  const sockB = io(BASE, { auth: { token: tokenB }, transports: ['websocket'], reconnection: false, forceNew: true });
  try {
    await Promise.all([
      new Promise((res) => sockA.on('connect', res)),
      new Promise((res) => sockB.on('connect', res)),
    ]);
    sockA.emit('join_room', { roomId });
    sockB.emit('join_room', { roomId });
    await new Promise((r) => setTimeout(r, 300));

    const received = new Promise((resolve) => {
      sockB.on('receive_message', (m) => {
        if (m.content === 'spoof attempt') resolve(m);
      });
    });
    // Client B tries to send as someone else — must be attributed to A
    sockA.emit('send_message', { roomId, content: 'spoof attempt', sender: { username: 'hacker', _id: 'fake-id' } });
    const msg = await received;
    assert.equal(msg.sender._id, testUserId, 'spoofed sender must be ignored');
  } finally {
    sockA.close();
    sockB.close();
  }
});

test('socket & rest: complete emoji messages and dynamic reactions flow', async () => {
  const sockA = io(BASE, { auth: { token: tokenA }, transports: ['websocket'], reconnection: false, forceNew: true });
  const sockB = io(BASE, { auth: { token: tokenB }, transports: ['websocket'], reconnection: false, forceNew: true });
  try {
    await Promise.all([
      new Promise((res) => sockA.on('connect', res)),
      new Promise((res) => sockB.on('connect', res)),
    ]);
    sockA.emit('join_room', { roomId });
    sockB.emit('join_room', { roomId });
    await new Promise((r) => setTimeout(r, 200));

    // 1. Send message with multiple unicode emojis & skin tone variants
    const emojiContent = 'Hello world! 🚀🎉👨‍💻 Testing emoji picker! 👍🏽❤️';
    const receivedMsgPromise = new Promise((resolve) => {
      sockB.on('receive_message', (m) => {
        if (m.content === emojiContent) resolve(m);
      });
    });
    sockA.emit('send_message', { roomId, content: emojiContent });
    const msg = await receivedMsgPromise;
    assert.equal(msg.content, emojiContent, 'message with emojis must preserve exact unicode content');

    // 2. User A reacts with skin-tone variant emoji "👍🏽"
    const reactionUpdated1 = new Promise((resolve) => {
      sockB.on('message_reaction_updated', (updated) => {
        if (updated._id === msg._id && updated.reactions.some((r) => r.emoji === '👍🏽')) {
          resolve(updated);
        }
      });
    });
    sockA.emit('toggle_reaction', { messageId: msg._id, roomId, emoji: '👍🏽' });
    const updated1 = await reactionUpdated1;
    const thumbsUpReaction = updated1.reactions.find((r) => r.emoji === '👍🏽');
    assert.ok(thumbsUpReaction, 'reaction with skin-tone emoji must exist');
    assert.equal(thumbsUpReaction.users.length, 1);

    // 3. User B also reacts with "👍🏽" (two users reacting to same message)
    const reactionUpdated2 = new Promise((resolve) => {
      sockA.on('message_reaction_updated', (updated) => {
        if (updated._id === msg._id) {
          const r = updated.reactions.find((x) => x.emoji === '👍🏽');
          if (r && r.users.length === 2) resolve(updated);
        }
      });
    });
    sockB.emit('toggle_reaction', { messageId: msg._id, roomId, emoji: '👍🏽' });
    const updated2 = await reactionUpdated2;
    const multiUserReaction = updated2.reactions.find((r) => r.emoji === '👍🏽');
    assert.equal(multiUserReaction.users.length, 2, 'both users should be present on reaction');

    // 4. User A switches reaction to "❤️" (prevent duplicates, remove from old emoji)
    const reactionUpdated3 = new Promise((resolve) => {
      sockB.on('message_reaction_updated', (updated) => {
        if (updated._id === msg._id && updated.reactions.some((r) => r.emoji === '❤️')) {
          resolve(updated);
        }
      });
    });
    sockA.emit('toggle_reaction', { messageId: msg._id, roomId, emoji: '❤️' });
    const updated3 = await reactionUpdated3;
    const heartReaction = updated3.reactions.find((r) => r.emoji === '❤️');
    const remainingThumbs = updated3.reactions.find((r) => r.emoji === '👍🏽');
    assert.ok(heartReaction, 'new emoji reaction should exist');
    assert.equal(heartReaction.users.length, 1);
    assert.equal(remainingThumbs.users.length, 1, 'user A should have been removed from old emoji');

    // 5. User A removes reaction by clicking "❤️" again (toggle off)
    const reactionUpdated4 = new Promise((resolve) => {
      sockB.on('message_reaction_updated', (updated) => {
        if (updated._id === msg._id && !updated.reactions.some((r) => r.emoji === '❤️')) {
          resolve(updated);
        }
      });
    });
    sockA.emit('toggle_reaction', { messageId: msg._id, roomId, emoji: '❤️' });
    const updated4 = await reactionUpdated4;
    assert.ok(!updated4.reactions.some((r) => r.emoji === '❤️'), 'heart reaction should be removed completely');

    // 6. Test REST API reaction endpoint
    const restRes = await jsonFetch(`/api/messages/${msg._id}/reaction`, {
      method: 'POST',
      body: JSON.stringify({ emoji: '🔥' })
    }, tokenA);
    assert.equal(restRes.status, 200);
    const restData = await restRes.json();
    assert.ok(restData.reactions.some((r) => r.emoji === '🔥'), 'REST reaction toggle should persist emoji');

    // 7. Verify persistence via GET /api/messages/:roomId
    const getRes = await jsonFetch(`/api/messages/${roomId}`, {}, tokenA);
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    const fetchedMsg = getData.messages.find((m) => m._id === msg._id);
    assert.ok(fetchedMsg, 'message must be persisted in room');
    assert.ok(fetchedMsg.reactions.some((r) => r.emoji === '🔥'), 'reactions must persist across requests');
  } finally {
    sockA.close();
    sockB.close();
  }
});
