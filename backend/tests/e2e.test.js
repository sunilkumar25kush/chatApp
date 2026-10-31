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
        if (res.ok) { const body = await res.json(); if (!MONGO_URI || body.database === 'connected') return resolve(); }
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


// ── Public User ID System Tests ─────────────────────────────────────────
test('publicId: registration returns permanent publicId', async () => {
  const regRes = await jsonFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username: unique('pubuser'),
      email: `${unique('pubuser')}@test.local`,
      password: 'test123456'
    })
  });
  assert.equal(regRes.status, 201);
  const data = await regRes.json();
  assert.ok(data.publicId, 'Registered user must have a publicId in response');
  assert.match(data.publicId, /^SKY-[2-9A-HJ-NP-Z]{6}$/);
});

test('publicId: GET /api/users/my-id returns current user publicId', async () => {
  const res = await jsonFetch('/api/users/my-id', {}, tokenA);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.publicId);
  assert.match(data.publicId, /^SKY-[2-9A-HJ-NP-Z]{6}$/);
});

test('publicId: GET /api/users/lookup/:publicId returns sanitized profile with zero private fields', async () => {
  // First obtain User A's public ID
  const myIdRes = await jsonFetch('/api/users/my-id', {}, tokenA);
  const { publicId } = await myIdRes.json();

  // User B looks up User A by publicId
  const lookupRes = await jsonFetch(`/api/users/lookup/${publicId}`, {}, tokenB);
  assert.equal(lookupRes.status, 200);
  const body = await lookupRes.json();
  assert.equal(body.success, true);
  assert.ok(body.user);
  assert.equal(body.user.publicId, publicId);

  // Security Verification: Zero private fields exposed
  assert.equal(body.user._id, undefined, 'MongoDB _id must NOT be exposed');
  assert.equal(body.user.id, undefined, 'id alias must NOT be exposed');
  assert.equal(body.user.email, undefined, 'Email must NOT be exposed');
  assert.equal(body.user.password, undefined, 'Password must NOT be exposed');
  assert.equal(body.user.googleId, undefined, 'googleId must NOT be exposed');
  assert.equal(body.user.phone, undefined, 'phone must NOT be exposed');
  assert.equal(body.user.privacy, undefined, 'privacy must NOT be exposed');
  assert.equal(body.user.notificationPrefs, undefined, 'notificationPrefs must NOT be exposed');

  // Verify approved public fields are present
  assert.ok(body.user.username);
  assert.ok(body.user.avatar);
});

test('publicId: lookup returns 404 for unknown ID and 400 for invalid format', async () => {
  // Unknown ID with valid format
  const notFoundRes = await jsonFetch('/api/users/lookup/SKY-999999', {}, tokenA);
  assert.equal(notFoundRes.status, 404);
  const notFoundData = await notFoundRes.json();
  assert.equal(notFoundData.success, false);

  // Invalid format (too short / invalid characters)
  const invalidRes = await jsonFetch('/api/users/lookup/INVALID_FORMAT', {}, tokenA);
  assert.equal(invalidRes.status, 400);
  const invalidData = await invalidRes.json();
  assert.equal(invalidData.success, false);
});

test('publicId: cannot be altered or overwritten via profile update', async () => {
  const myIdRes = await jsonFetch('/api/users/my-id', {}, tokenA);
  const { publicId: originalId } = await myIdRes.json();

  // Attempt to overwrite publicId via PUT /api/users/profile
  const updateRes = await jsonFetch('/api/users/profile', {
    method: 'PUT',
    body: JSON.stringify({
      bio: 'Updated bio testing immutability',
      publicId: 'SKY-HACKED99'
    })
  }, tokenA);

  assert.equal(updateRes.status, 200);
  const updatedUser = await updateRes.json();
  assert.equal(updatedUser.publicId, originalId, 'Public ID must remain unchanged');

  // Verify via lookup again
  const verifyRes = await jsonFetch('/api/users/my-id', {}, tokenA);
  const { publicId: verifiedId } = await verifyRes.json();
  assert.equal(verifiedId, originalId, 'Public ID must remain immutable');
});


// ── Friends & Friendship Management ───────────────────────────────────
test('friends: self-request is rejected with 400', async () => {
  const myIdRes = await jsonFetch('/api/users/my-id', {}, tokenA);
  const { publicId: myPublicId } = await myIdRes.json();

  const res = await jsonFetch('/api/friends/request', {
    method: 'POST',
    body: JSON.stringify({ publicId: myPublicId })
  }, tokenA);

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.code, 'SELF_REQUEST');
});

test('friends: invalid public ID format and unknown user are rejected', async () => {
  const badFormatRes = await jsonFetch('/api/friends/request', {
    method: 'POST',
    body: JSON.stringify({ publicId: 'NOT_A_VALID_ID' })
  }, tokenA);
  assert.equal(badFormatRes.status, 400);

  const notFoundRes = await jsonFetch('/api/friends/request', {
    method: 'POST',
    body: JSON.stringify({ publicId: 'SKY-999999' })
  }, tokenA);
  assert.equal(notFoundRes.status, 404);
});

test('friends: complete lifecycle (send -> list -> accept -> get friends -> remove)', async () => {
  // 1. Get User B's public ID
  const userBIdRes = await jsonFetch('/api/users/my-id', {}, tokenB);
  const { publicId: publicIdB } = await userBIdRes.json();

  // 2. User A sends friend request to User B
  const sendRes = await jsonFetch('/api/friends/request', {
    method: 'POST',
    body: JSON.stringify({ publicId: publicIdB })
  }, tokenA);
  assert.equal(sendRes.status, 201);
  const sendData = await sendRes.json();
  assert.equal(sendData.success, true);
  assert.equal(sendData.request.status, 'pending');
  const requestId = sendData.request._id;

  // 3. User A attempts to send duplicate request -> rejected
  const dupRes = await jsonFetch('/api/friends/request', {
    method: 'POST',
    body: JSON.stringify({ publicId: publicIdB })
  }, tokenA);
  assert.equal(dupRes.status, 400);
  const dupData = await dupRes.json();
  assert.equal(dupData.code, 'REQUEST_ALREADY_SENT');

  // 4. User B attempts to send request to User A -> rejected because incoming request already exists
  const userAIdRes = await jsonFetch('/api/users/my-id', {}, tokenA);
  const { publicId: publicIdA } = await userAIdRes.json();

  const crossRes = await jsonFetch('/api/friends/request', {
    method: 'POST',
    body: JSON.stringify({ publicId: publicIdA })
  }, tokenB);
  assert.equal(crossRes.status, 400);
  const crossData = await crossRes.json();
  assert.equal(crossData.code, 'INCOMING_REQUEST_EXISTS');

  // 5. User B lists incoming requests -> finds User A's request
  const incomingRes = await jsonFetch('/api/friends/requests/incoming', {}, tokenB);
  assert.equal(incomingRes.status, 200);
  const incomingData = await incomingRes.json();
  assert.equal(incomingData.success, true);
  assert.ok(incomingData.requests.some((r) => r._id === requestId));

  // 6. User A lists outgoing requests -> finds pending request to User B
  const outgoingRes = await jsonFetch('/api/friends/requests/outgoing', {}, tokenA);
  assert.equal(outgoingRes.status, 200);
  const outgoingData = await outgoingRes.json();
  assert.equal(outgoingData.success, true);
  assert.ok(outgoingData.requests.some((r) => r._id === requestId));

  // 7. Security: User A (requester) attempts to accept their own request -> 403 Forbidden
  const forbiddenAccept = await jsonFetch(`/api/friends/requests/${requestId}/accept`, {
    method: 'PUT'
  }, tokenA);
  assert.equal(forbiddenAccept.status, 403);

  // 8. User B (recipient) accepts the request
  const acceptRes = await jsonFetch(`/api/friends/requests/${requestId}/accept`, {
    method: 'PUT'
  }, tokenB);
  assert.equal(acceptRes.status, 200);
  const acceptData = await acceptRes.json();
  assert.equal(acceptData.success, true);
  assert.equal(acceptData.request.status, 'accepted');
  assert.ok(acceptData.request.acceptedAt);

  // 9. Both users list friends and verify accepted friendship + privacy sanitization
  const friendsARes = await jsonFetch('/api/friends', {}, tokenA);
  assert.equal(friendsARes.status, 200);
  const friendsA = await friendsARes.json();
  assert.ok(friendsA.friends.some((f) => f.friend.publicId === publicIdB));

  const friendsBRes = await jsonFetch('/api/friends', {}, tokenB);
  assert.equal(friendsBRes.status, 200);
  const friendsB = await friendsBRes.json();
  assert.ok(friendsB.friends.some((f) => f.friend.publicId === publicIdA));

  // Privacy verification: friends list never leaks passwords or emails
  const friendEntry = friendsA.friends[0].friend;
  assert.equal(friendEntry.password, undefined);
  assert.equal(friendEntry.email, undefined);
  assert.equal(friendEntry.googleId, undefined);

  // 10. Sending request to already-accepted friend -> 400 ALREADY_FRIENDS
  const alreadyFriendRes = await jsonFetch('/api/friends/request', {
    method: 'POST',
    body: JSON.stringify({ publicId: publicIdB })
  }, tokenA);
  assert.equal(alreadyFriendRes.status, 400);
  assert.equal((await alreadyFriendRes.json()).code, 'ALREADY_FRIENDS');

  // 11. Remove friend
  const removeRes = await jsonFetch(`/api/friends/${publicIdB}`, {
    method: 'DELETE'
  }, tokenA);
  assert.equal(removeRes.status, 200);

  // 12. Verify friends list is now empty for both
  const afterRemoveA = await (await jsonFetch('/api/friends', {}, tokenA)).json();
  assert.equal(afterRemoveA.friends.length, 0);

  const afterRemoveB = await (await jsonFetch('/api/friends', {}, tokenB)).json();
  assert.equal(afterRemoveB.friends.length, 0);
});

test('friends: cancel outgoing request and reject incoming request', async () => {
  const userBIdRes = await jsonFetch('/api/users/my-id', {}, tokenB);
  const { publicId: publicIdB } = await userBIdRes.json();

  // User A sends request
  const sendRes = await jsonFetch('/api/friends/request', {
    method: 'POST',
    body: JSON.stringify({ publicId: publicIdB })
  }, tokenA);
  assert.equal(sendRes.status, 201);
  const { request } = await sendRes.json();

  // User B cannot cancel A's request
  const forbiddenCancel = await jsonFetch(`/api/friends/requests/${request._id}`, {
    method: 'DELETE'
  }, tokenB);
  assert.equal(forbiddenCancel.status, 403);

  // User A cancels their own request
  const cancelRes = await jsonFetch(`/api/friends/requests/${request._id}`, {
    method: 'DELETE'
  }, tokenA);
  assert.equal(cancelRes.status, 200);

  // Check incoming is empty
  const incoming = await (await jsonFetch('/api/friends/requests/incoming', {}, tokenB)).json();
  assert.ok(!incoming.requests.some((r) => r._id === request._id));

  // User A sends another request
  const send2Res = await jsonFetch('/api/friends/request', {
    method: 'POST',
    body: JSON.stringify({ publicId: publicIdB })
  }, tokenA);
  assert.equal(send2Res.status, 201);
  const req2 = (await send2Res.json()).request;

  // User A cannot reject their own request
  const forbiddenReject = await jsonFetch(`/api/friends/requests/${req2._id}/reject`, {
    method: 'PUT'
  }, tokenA);
  assert.equal(forbiddenReject.status, 403);

  // User B rejects the request
  const rejectRes = await jsonFetch(`/api/friends/requests/${req2._id}/reject`, {
    method: 'PUT'
  }, tokenB);
  assert.equal(rejectRes.status, 200);

  // Status check verifies rejection
  const statusRes = await jsonFetch(`/api/friends/status/${publicIdB}`, {}, tokenA);
  assert.equal(statusRes.status, 200);
  const statusData = await statusRes.json();
  assert.equal(statusData.relationship.status, 'rejected');
});


// ── Direct Friend-to-Friend Messaging (Phase 4) ───────────────────────
test('direct messages: non-friends cannot initiate conversation (403 FRIENDSHIP_REQUIRED)', async () => {
  // Register a third unrelated user C
  const regC = await jsonFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username: unique('charlie'),
      email: `${unique('charlie')}@test.local`,
      password: 'test123456'
    })
  });
  assert.equal(regC.status, 201);
  const userC = await regC.json();
  const tokenC = userC.token;

  // User A attempts to start direct conversation with unrelated User C
  const convRes = await jsonFetch('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ friendPublicId: userC.publicId })
  }, tokenA);

  assert.equal(convRes.status, 403);
  const data = await convRes.json();
  assert.equal(data.code, 'FRIENDSHIP_REQUIRED');
});

test('direct messages: complete lifecycle between accepted friends (REST + Socket.IO)', async () => {
  // 1. Establish accepted friendship between User A and User B
  const myIdBRes = await jsonFetch('/api/users/my-id', {}, tokenB);
  const { publicId: publicIdB } = await myIdBRes.json();

  // User A sends friend request to B
  const frReq = await jsonFetch('/api/friends/request', {
    method: 'POST',
    body: JSON.stringify({ publicId: publicIdB })
  }, tokenA);
  assert.equal(frReq.status, 201);
  const reqId = (await frReq.json()).request._id;

  // User B accepts friend request
  const frAccept = await jsonFetch(`/api/friends/requests/${reqId}/accept`, {
    method: 'PUT'
  }, tokenB);
  assert.equal(frAccept.status, 200);

  // 2. User A starts/retrieves conversation with Friend B
  const convRes = await jsonFetch('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ friendPublicId: publicIdB })
  }, tokenA);
  assert.equal(convRes.status, 200);
  const convData = await convRes.json();
  assert.equal(convData.success, true);
  assert.ok(convData.conversation._id);
  const conversationId = convData.conversation._id;
  assert.equal(convData.conversation.friend.publicId, publicIdB);

  // 3. User B retrieves conversations list -> finds the conversation with User A
  const convListRes = await jsonFetch('/api/conversations', {}, tokenB);
  assert.equal(convListRes.status, 200);
  const convListData = await convListRes.json();
  assert.ok(convListData.conversations.some((c) => c._id === conversationId));

  // 4. User A sends direct message via REST
  const sendRes = await jsonFetch(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content: 'Hey Bob, this is a private message from Alice!',
      clientMsgId: 'client_dm_' + Date.now()
    })
  }, tokenA);
  assert.equal(sendRes.status, 201);
  const sendData = await sendRes.json();
  assert.equal(sendData.success, true);
  assert.equal(sendData.message.content, 'Hey Bob, this is a private message from Alice!');
  assert.equal(sendData.message.isRead, false);
  const messageId = sendData.message._id;

  // 5. Cursor-based pagination: User B retrieves messages
  const historyRes = await jsonFetch(`/api/conversations/${conversationId}/messages?limit=20`, {}, tokenB);
  assert.equal(historyRes.status, 200);
  const historyData = await historyRes.json();
  assert.equal(historyData.success, true);
  assert.ok(historyData.messages.some((m) => m._id === messageId));

  // 6. Security: Non-participant User C cannot read conversation messages
  const regC = await jsonFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username: unique('intruder'),
      email: `${unique('intruder')}@test.local`,
      password: 'test123456'
    })
  });
  const tokenC = (await regC.json()).token;

  const intruderRes = await jsonFetch(`/api/conversations/${conversationId}/messages`, {}, tokenC);
  assert.equal(intruderRes.status, 403, 'Non-participant must receive 403 Forbidden');

  // 7. Mark messages as read by User B
  const markReadRes = await jsonFetch(`/api/conversations/${conversationId}/read`, {
    method: 'PUT'
  }, tokenB);
  assert.equal(markReadRes.status, 200);

  // Verify conversation unread count is 0 for User B
  const afterReadList = await (await jsonFetch('/api/conversations', {}, tokenB)).json();
  const convAfterRead = afterReadList.conversations.find((c) => c._id === conversationId);
  assert.equal(convAfterRead.unreadCount, 0);

  // 8. User A edits their direct message
  const editRes = await jsonFetch(`/api/conversations/messages/${messageId}`, {
    method: 'PUT',
    body: JSON.stringify({ content: 'Hey Bob, this is an edited private message!' })
  }, tokenA);
  assert.equal(editRes.status, 200);
  const editData = await editRes.json();
  assert.equal(editData.message.content, 'Hey Bob, this is an edited private message!');
  assert.equal(editData.message.isEdited, true);

  // 9. Socket.IO Real-Time Flow: Authenticated sockets connect and exchange direct messages
  const sockA = io(BASE, { auth: { token: tokenA }, transports: ['websocket'] });
  const sockB = io(BASE, { auth: { token: tokenB }, transports: ['websocket'] });

  await Promise.all([
    new Promise((resolve) => sockA.on('connect', resolve)),
    new Promise((resolve) => sockB.on('connect', resolve))
  ]);

  // Join authorized conversation room
  await new Promise((resolve) => sockA.emit('join_conversation', { conversationId }, resolve));
  await new Promise((resolve) => sockB.emit('join_conversation', { conversationId }, resolve));

  // User B listens for incoming real-time direct message from User A
  const dmReceivedPromise = new Promise((resolve) => {
    sockB.on('direct_message_received', (payload) => {
      if (payload.conversationId === conversationId && payload.message.content === 'Real-time DM over Socket.IO!') {
        resolve(payload);
      }
    });
  });

  // User A sends message over socket
  sockA.emit('send_direct_message', {
    conversationId,
    content: 'Real-time DM over Socket.IO!',
    clientMsgId: 'socket_dm_' + Date.now()
  });

  const receivedPayload = await dmReceivedPromise;
  assert.ok(receivedPayload);
  assert.equal(receivedPayload.message.content, 'Real-time DM over Socket.IO!');

  // Clean up sockets
  sockA.close();
  sockB.close();
});


test('room privacy: conversion from public to private, authorization, socket revocation, and code lockdown', async () => {
  // 1. Create three distinct users
  const regA = await jsonFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username: unique('ownerA'),
      email: `${unique('ownerA')}@test.local`,
      password: 'test123456'
    })
  });
  const userA = await regA.json();
  const tokenA = userA.token;

  const regB = await jsonFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username: unique('memberB'),
      email: `${unique('memberB')}@test.local`,
      password: 'test123456'
    })
  });
  const userB = await regB.json();
  const tokenB = userB.token;

  const regC = await jsonFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username: unique('strangerC'),
      email: `${unique('strangerC')}@test.local`,
      password: 'test123456'
    })
  });
  const userC = await regC.json();
  const tokenC = userC.token;

  // 2. User A creates a public room
  const createRes = await jsonFetch('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Secret Society Hangout',
      category: 'General',
      visibility: 'public'
    })
  }, tokenA);
  assert.equal(createRes.status, 201);
  const createdRoom = await createRes.json();
  const testRoomId = createdRoom._id || createdRoom.id;
  const testRoomCode = createdRoom.code;
  assert.equal(createdRoom.visibility, 'public');
  assert.equal(createdRoom.isPrivate, false);

  // 3. User B joins the public room as member
  const joinBRes = await jsonFetch('/api/rooms/join', {
    method: 'POST',
    body: JSON.stringify({ code: testRoomCode })
  }, tokenB);
  assert.equal(joinBRes.status, 200);

  // 4. Connect WebSockets for all three users
  const sockA = io(BASE, { auth: { token: tokenA }, transports: ['websocket'] });
  const sockB = io(BASE, { auth: { token: tokenB }, transports: ['websocket'] });
  const sockC = io(BASE, { auth: { token: tokenC }, transports: ['websocket'] });

  await Promise.all([
    new Promise((resolve) => sockA.on('connect', resolve)),
    new Promise((resolve) => sockB.on('connect', resolve)),
    new Promise((resolve) => sockC.on('connect', resolve))
  ]);

  // While public, all three sockets join the room
  sockA.emit('join_room', { roomId: testRoomId });
  sockB.emit('join_room', { roomId: testRoomId });
  sockC.emit('join_room', { roomId: testRoomId });

  // Brief pause for join propagation
  await new Promise((r) => setTimeout(r, 200));

  // 5. User C (non-owner/non-admin) attempts to change visibility -> 403 Forbidden
  const unauthorizedChange = await jsonFetch(`/api/rooms/${testRoomId}/visibility`, {
    method: 'PUT',
    body: JSON.stringify({ visibility: 'private' })
  }, tokenC);
  assert.equal(unauthorizedChange.status, 403);

  // 6. Set up listener on Socket C for access revocation & Socket B for visibility change
  const revocationPromise = new Promise((resolve) => {
    sockC.on('room_access_revoked', (payload) => {
      resolve(payload);
    });
  });

  const visibilityChangedPromise = new Promise((resolve) => {
    sockB.on('room_visibility_changed', (payload) => {
      resolve(payload);
    });
  });

  // 7. User A (Owner) converts the room from public to private
  const convertRes = await jsonFetch(`/api/rooms/${testRoomId}/visibility`, {
    method: 'PUT',
    body: JSON.stringify({ visibility: 'private' })
  }, tokenA);
  assert.equal(convertRes.status, 200);
  const convertedRoom = await convertRes.json();
  assert.equal(convertedRoom.visibility, 'private');
  assert.equal(convertedRoom.isPrivate, true);

  // 8. Verify Socket C received revocation and Socket B received visibility change
  const revocationEvent = await revocationPromise;
  assert.equal(revocationEvent.roomId, testRoomId);

  const visChangeEvent = await visibilityChangedPromise;
  assert.equal(visChangeEvent.visibility, 'private');
  assert.equal(visChangeEvent.isPrivate, true);

  // 9. Unauthorized join attempt by User C via room code -> 403 Forbidden
  const joinAttemptC = await jsonFetch('/api/rooms/join', {
    method: 'POST',
    body: JSON.stringify({ code: testRoomCode })
  }, tokenC);
  assert.equal(joinAttemptC.status, 403);
  const joinAttemptData = await joinAttemptC.json();
  assert.equal(joinAttemptData.code, 'ROOM_ACCESS_DENIED');

  // 10. Direct details inspection attempts by User C -> 403 Forbidden
  const getByIdC = await jsonFetch(`/api/rooms/${testRoomId}`, {}, tokenC);
  assert.equal(getByIdC.status, 403);

  const getByCodeC = await jsonFetch(`/api/rooms/code/${testRoomCode}`, {}, tokenC);
  assert.equal(getByCodeC.status, 403);

  // 11. Discovery protection: Room listing and search for User C must NOT include the private room
  const listC = await (await jsonFetch('/api/rooms', {}, tokenC)).json();
  const roomsC = listC.rooms || listC;
  assert.equal(roomsC.some((r) => (r._id || r.id) === testRoomId), false, 'Private room must not appear in non-member listings');

  const searchC = await (await jsonFetch('/api/rooms/search?q=Secret', {}, tokenC)).json();
  assert.equal((searchC.rooms || []).some((r) => (r._id || r.id) === testRoomId), false, 'Private room must not appear in non-member search results');

  // But User A and User B CAN discover their private room
  const listB = await (await jsonFetch('/api/rooms', {}, tokenB)).json();
  const roomsB = listB.rooms || listB;
  assert.equal(roomsB.some((r) => (r._id || r.id) === testRoomId), true, 'Authorized member must see the private room');

  // 12. Message protection: User C cannot read historical messages or search messages
  const msgHistoryC = await jsonFetch(`/api/messages/${testRoomId}`, {}, tokenC);
  assert.equal(msgHistoryC.status, 403);

  const msgSearchC = await jsonFetch(`/api/messages/${testRoomId}/search?q=hello`, {}, tokenC);
  assert.equal(msgSearchC.status, 403);

  // 13. Socket message rejection for unauthorized socket
  const socketDenialPromise = new Promise((resolve) => {
    sockC.on('room_access_denied', (payload) => {
      resolve(payload);
    });
  });
  sockC.emit('send_message', { roomId: testRoomId, content: 'Sneaky message' });
  const socketDenial = await socketDenialPromise;
  assert.equal(socketDenial.roomId, testRoomId);

  // 14. Convert back to public: Owner restores public visibility
  const restorePubRes = await jsonFetch(`/api/rooms/${testRoomId}/visibility`, {
    method: 'PUT',
    body: JSON.stringify({ visibility: 'public' })
  }, tokenA);
  assert.equal(restorePubRes.status, 200);
  const restoredRoom = await restorePubRes.json();
  assert.equal(restoredRoom.visibility, 'public');
  assert.equal(restoredRoom.isPrivate, false);

  // Now User C CAN see the room again
  const listCAfter = await (await jsonFetch('/api/rooms', {}, tokenC)).json();
  const roomsCAfter = listCAfter.rooms || listCAfter;
  assert.equal(roomsCAfter.some((r) => (r._id || r.id) === testRoomId), true, 'Public room is discoverable again');

  sockA.close();
  sockB.close();
  sockC.close();
});


test('room join request: lifecycle (preview -> submit -> duplicate rejection -> cancel -> resubmit -> approve -> real-time socket events -> membership granted)', async () => {
  // 1. Register Owner (A), Requester (B), Intruder (C)
  const regA = await jsonFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username: unique('vipOwner'),
      email: `${unique('vipOwner')}@test.local`,
      password: 'test123456'
    })
  });
  const tokenA = (await regA.json()).token;

  const regB = await jsonFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username: unique('vipApplicant'),
      email: `${unique('vipApplicant')}@test.local`,
      password: 'test123456'
    })
  });
  const tokenB = (await regB.json()).token;

  const regC = await jsonFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username: unique('vipIntruder'),
      email: `${unique('vipIntruder')}@test.local`,
      password: 'test123456'
    })
  });
  const tokenC = (await regC.json()).token;

  // 2. User A creates a private room
  const createRes = await jsonFetch('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Executive Boardroom',
      category: 'Tech',
      visibility: 'private'
    })
  }, tokenA);
  assert.equal(createRes.status, 201);
  const room = await createRes.json();
  const testRoomId = room._id || room.id;

  // 3. User B views restricted preview
  const previewRes = await jsonFetch(`/api/rooms/${testRoomId}/preview`, {}, tokenB);
  assert.equal(previewRes.status, 200);
  const preview = await previewRes.json();
  assert.equal(preview.name, 'Executive Boardroom');
  assert.equal(preview.isPrivate, true);
  assert.equal(preview.isMember, false);
  assert.equal(preview.userRequest, null);

  // 4. User B submits join request
  const submitRes = await jsonFetch(`/api/rooms/${testRoomId}/join-requests`, {
    method: 'POST'
  }, tokenB);
  assert.equal(submitRes.status, 201);
  const reqObj = await submitRes.json();
  assert.equal(reqObj.status, 'pending');
  assert.ok(reqObj._id);

  // 5. User B attempts duplicate submit -> 409 Conflict
  const dupRes = await jsonFetch(`/api/rooms/${testRoomId}/join-requests`, {
    method: 'POST'
  }, tokenB);
  assert.equal(dupRes.status, 409);
  const dupData = await dupRes.json();
  assert.equal(dupData.code, 'REQUEST_ALREADY_PENDING');

  // 6. User B cancels their own request
  const cancelRes = await jsonFetch(`/api/rooms/${testRoomId}/join-requests/${reqObj._id}`, {
    method: 'DELETE'
  }, tokenB);
  assert.equal(cancelRes.status, 200);

  // 7. User B resubmits request
  const resubmitRes = await jsonFetch(`/api/rooms/${testRoomId}/join-requests`, {
    method: 'POST'
  }, tokenB);
  assert.equal(resubmitRes.status, 201);
  const activeReq = await resubmitRes.json();
  assert.equal(activeReq.status, 'pending');

  // 8. User B views their own requests list
  const myReqsRes = await jsonFetch('/api/rooms/join-requests/my', {}, tokenB);
  assert.equal(myReqsRes.status, 200);
  const myReqs = await myReqsRes.json();
  assert.equal(myReqs.requests.some((r) => r._id === activeReq._id), true);

  // 9. Unauthorized inspection: User C cannot list requests for room A -> 403 Forbidden
  const unauthorizedList = await jsonFetch(`/api/rooms/${testRoomId}/join-requests`, {}, tokenC);
  assert.equal(unauthorizedList.status, 403);

  // 10. Owner User A lists pending requests for their room
  const ownerListRes = await jsonFetch(`/api/rooms/${testRoomId}/join-requests`, {}, tokenA);
  assert.equal(ownerListRes.status, 200);
  const ownerList = await ownerListRes.json();
  assert.ok(ownerList.requests.some((r) => r._id === activeReq._id));

  // 11. Connect sockets
  const sockA = io(BASE, { auth: { token: tokenA }, transports: ['websocket'] });
  const sockB = io(BASE, { auth: { token: tokenB }, transports: ['websocket'] });

  await Promise.all([
    new Promise((resolve) => sockA.on('connect', resolve)),
    new Promise((resolve) => sockB.on('connect', resolve))
  ]);

  // Set up socket listener on User B for approval
  const approvedEventPromise = new Promise((resolve) => {
    sockB.on('room_join_request_approved', (payload) => {
      resolve(payload);
    });
  });

  // 12. Unauthorized approval attempt: User C cannot approve -> 403 Forbidden
  const unauthorizedApprove = await jsonFetch(`/api/rooms/${testRoomId}/join-requests/${activeReq._id}/approve`, {
    method: 'POST'
  }, tokenC);
  assert.equal(unauthorizedApprove.status, 403);

  // 13. Owner User A approves the request
  const approveRes = await jsonFetch(`/api/rooms/${testRoomId}/join-requests/${activeReq._id}/approve`, {
    method: 'POST'
  }, tokenA);
  assert.equal(approveRes.status, 200);

  // 14. Verify socket event received by User B
  const approvedEvent = await approvedEventPromise;
  assert.equal(approvedEvent.roomId, testRoomId);

  // 15. User B can now access the private room
  const roomDetailsB = await jsonFetch(`/api/rooms/${testRoomId}`, {}, tokenB);
  assert.equal(roomDetailsB.status, 200);

  // 16. User A and User B join the socket room
  sockA.emit('join_room', { roomId: testRoomId });
  sockB.emit('join_room', { roomId: testRoomId });
  await new Promise((r) => setTimeout(r, 200));

  const msgReceivePromise = new Promise((resolve) => {
    sockA.on('receive_message', (payload) => {
      if (payload.content === 'Hello from approved member!') {
        resolve(payload);
      }
    });
  });

  sockB.emit('send_message', {
    roomId: testRoomId,
    content: 'Hello from approved member!'
  });

  const msgReceived = await msgReceivePromise;
  assert.ok(msgReceived);
  assert.equal(msgReceived.content, 'Hello from approved member!');

  sockA.close();
  sockB.close();
});

test('notifications: persistent lifecycle (friend request -> notification -> list -> mark read -> read all -> delete)', async () => {
  // 1. Register users
  const reg1 = await jsonFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username: unique('notifA'),
      email: `${unique('notifA')}@test.local`,
      password: 'password123'
    })
  });
  const token1 = (await reg1.json()).token;

  const reg2 = await jsonFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username: unique('notifB'),
      email: `${unique('notifB')}@test.local`,
      password: 'password123'
    })
  });
  const token2 = (await reg2.json()).token;

  const idRes2 = await jsonFetch('/api/users/my-id', {}, token2);
  const { publicId: publicId2 } = await idRes2.json();

  // 2. Connect socket for User 2
  const sock2 = io(BASE, { auth: { token: token2 }, transports: ['websocket'] });
  await new Promise((resolve) => sock2.on('connect', resolve));

  const notifEventPromise = new Promise((resolve) => {
    sock2.on('notification_received', (data) => {
      resolve(data);
    });
  });

  // 3. User 1 sends friend request to User 2
  const reqRes = await jsonFetch('/api/friends/request', {
    method: 'POST',
    body: JSON.stringify({ publicId: publicId2 })
  }, token1);
  assert.equal(reqRes.status, 201);
  const reqData = await reqRes.json();
  const requestId = reqData.request._id;

  // 4. Socket event received
  const socketNotif = await notifEventPromise;
  assert.ok(socketNotif);
  assert.equal(socketNotif.type, 'friend_request');

  // 5. User 2 lists notifications via REST
  const listRes = await jsonFetch('/api/notifications', {}, token2);
  assert.equal(listRes.status, 200);
  const listData = await listRes.json();
  assert.equal(listData.success, true);
  assert.ok(listData.notifications.length >= 1);
  assert.equal(listData.unreadCount >= 1, true);

  const notifItem = listData.notifications[0];
  assert.equal(notifItem.type, 'friend_request');
  assert.equal(notifItem.isRead, false);
  assert.equal(notifItem.link.screen, 'friends');

  // 6. Mark single notification as read
  const markRes = await jsonFetch(`/api/notifications/${notifItem._id}/read`, {
    method: 'PUT'
  }, token2);
  assert.equal(markRes.status, 200);

  const afterMark = await (await jsonFetch('/api/notifications', {}, token2)).json();
  assert.equal(afterMark.unreadCount, 0);

  // 7. User 2 accepts request -> User 1 gets accepted notification
  const acceptRes = await jsonFetch(`/api/friends/requests/${requestId}/accept`, {
    method: 'PUT'
  }, token2);
  assert.equal(acceptRes.status, 200);

  const notifsUser1 = await (await jsonFetch('/api/notifications', {}, token1)).json();
  assert.ok(notifsUser1.notifications.some((n) => n.type === 'friend_accepted'));

  // 8. Mark all as read for User 1
  const readAllRes = await jsonFetch('/api/notifications/read-all', {
    method: 'PUT'
  }, token1);
  assert.equal(readAllRes.status, 200);

  const user1After = await (await jsonFetch('/api/notifications', {}, token1)).json();
  assert.equal(user1After.unreadCount, 0);

  // 9. User 2 deletes their notification
  const delRes = await jsonFetch(`/api/notifications/${notifItem._id}`, {
    method: 'DELETE'
  }, token2);
  assert.equal(delRes.status, 200);

  const user2After = await (await jsonFetch('/api/notifications', {}, token2)).json();
  assert.ok(!user2After.notifications.some((n) => n._id === notifItem._id));

  sock2.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 8: PRODUCTION SECURITY, CONCURRENCY & REGRESSION AUDIT SUITE
// ─────────────────────────────────────────────────────────────────────────────

test('security audit: unauthenticated access rejected across all protected endpoints', async () => {
  const fakeId = '64b1f2e9d567890123456789';

  const unauthEndpoints = [
    { path: '/api/notifications', method: 'GET' },
    { path: '/api/notifications/read-all', method: 'PUT' },
    { path: `/api/notifications/${fakeId}`, method: 'DELETE' },
    { path: '/api/friends', method: 'GET' },
    { path: '/api/friends/request', method: 'POST', body: JSON.stringify({ publicId: 'SKY-ABC123' }) },
    { path: `/api/friends/requests/${fakeId}/accept`, method: 'PUT' },
    { path: `/api/friends/requests/${fakeId}/reject`, method: 'PUT' },
    { path: `/api/friends/requests/${fakeId}`, method: 'DELETE' },
    { path: '/api/conversations', method: 'POST', body: JSON.stringify({ recipientId: fakeId }) },
    { path: `/api/conversations/${fakeId}/messages`, method: 'GET' },
    { path: `/api/conversations/${fakeId}/messages`, method: 'POST', body: JSON.stringify({ content: 'hi' }) },
    { path: `/api/rooms/${fakeId}/visibility`, method: 'PUT', body: JSON.stringify({ visibility: 'private' }) },
    { path: `/api/rooms/${fakeId}/join-requests`, method: 'POST' },
    { path: `/api/rooms/${fakeId}/join-requests/${fakeId}/approve`, method: 'PUT' },
    { path: `/api/rooms/${fakeId}/join-requests/${fakeId}/reject`, method: 'PUT' }
  ];

  for (const ep of unauthEndpoints) {
    const res = await jsonFetch(ep.path, {
      method: ep.method,
      headers: { 'Content-Type': 'application/json' },
      body: ep.body
    }); // Notice: NO token passed
    assert.equal(res.status, 401, `Endpoint ${ep.method} ${ep.path} must return 401 without auth, got ${res.status}`);
  }
});

test('security audit: server derives identities preventing client-side spoofing', async () => {
  // 1. Register User X and User Y
  const userXRes = await jsonFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: unique('sec_x'), email: `${unique('sec_x')}@test.local`, password: 'Password123!' })
  });
  const userXData = await userXRes.json();
  const tokenX = userXData.token;

  const userYRes = await jsonFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: unique('sec_y'), email: `${unique('sec_y')}@test.local`, password: 'Password123!' })
  });
  const userYData = await userYRes.json();
  const tokenY = userYData.token;

  // 2. Establish friendship between X and Y
  const reqRes = await jsonFetch('/api/friends/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicId: userYData.publicId })
  }, tokenX);
  const reqData = await reqRes.json();
  const frId = reqData.request?._id || reqData.friendship?._id || reqData._id;

  await jsonFetch(`/api/friends/requests/${frId}/accept`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' }
  }, tokenY);

  // 3. User X initiates conversation with User Y
  const convRes = await jsonFetch('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ friendId: userYData._id })
  }, tokenX);
  assert.equal(convRes.status, 200);
  const convData = await convRes.json();
  const convId = convData.conversation._id;

  // 4. User X attempts to spoof sender as User Y
  const spoofMsgRes = await jsonFetch(`/api/conversations/${convId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: userYData._id,
      fromUser: userYData._id,
      content: 'I am pretending to be user Y!'
    })
  }, tokenX);

  assert.equal(spoofMsgRes.status, 201);
  const spoofMsgData = await spoofMsgRes.json();
  // The server MUST enforce sender = authenticated user X
  const sentMessage = spoofMsgData.message || spoofMsgData;
  const actualSenderId = sentMessage.sender?._id || sentMessage.sender;
  assert.equal(actualSenderId.toString(), userXData._id.toString(), 'Sender identity must be strictly derived from token');

  // 5. User X attempts to spoof requester in friend request to a third user Z
  const userZRes = await jsonFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: unique('sec_z'), email: `${unique('sec_z')}@test.local`, password: 'Password123!' })
  });
  const userZData = await userZRes.json();

  const spoofReqRes = await jsonFetch('/api/friends/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      publicId: userZData.publicId,
      requester: userYData._id,
      fromUser: userYData._id
    })
  }, tokenX);

  assert.equal(spoofReqRes.status, 201);
  const spoofReqData = await spoofReqRes.json();
  const actualRequester = spoofReqData.request?.requester?._id || spoofReqData.request?.requester || spoofReqData.friendship?.requester;
  assert.equal(actualRequester.toString(), userXData._id.toString(), 'Requester must be derived from token');
});

test('security audit: strict authorization boundaries across roles and non-members', async () => {
  // 1. Create Room Owner, Room Member, and Stranger
  const ownerRes = await jsonFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: unique('role_owner'), email: `${unique('role_owner')}@test.local`, password: 'Password123!' })
  });
  const ownerData = await ownerRes.json();

  const memberRes = await jsonFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: unique('role_mem'), email: `${unique('role_mem')}@test.local`, password: 'Password123!' })
  });
  const memberData = await memberRes.json();

  const strangerRes = await jsonFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: unique('role_str'), email: `${unique('role_str')}@test.local`, password: 'Password123!' })
  });
  const strangerData = await strangerRes.json();

  // 2. Owner creates a private room and adds member
  const roomRes = await jsonFetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: unique('AuthTestRoom'), isPrivate: true })
  }, ownerData.token);
  const roomData = await roomRes.json();
  const roomId = roomData._id;

  await jsonFetch(`/api/rooms/${roomId}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: memberData._id })
  }, ownerData.token);

  // 3. Member and Stranger try to change room visibility -> 403
  const memVisRes = await jsonFetch(`/api/rooms/${roomId}/visibility`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visibility: 'public' })
  }, memberData.token);
  assert.equal(memVisRes.status, 403);

  const strVisRes = await jsonFetch(`/api/rooms/${roomId}/visibility`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visibility: 'public' })
  }, strangerData.token);
  assert.equal(strVisRes.status, 403);

  // 4. Stranger cannot retrieve or search private room messages -> 403
  const strMsgRes = await jsonFetch(`/api/messages/${roomId}`, {}, strangerData.token);
  assert.equal(strMsgRes.status, 403);

  const strSearchRes = await jsonFetch(`/api/messages/${roomId}/search?q=secret`, {}, strangerData.token);
  assert.equal(strSearchRes.status, 403);

  // 5. Stranger submits join request
  const joinReqRes = await jsonFetch(`/api/rooms/${roomId}/join-requests`, {
    method: 'POST'
  }, strangerData.token);
  assert.equal(joinReqRes.status, 201);
  const joinReqData = await joinReqRes.json();

  // Member tries to approve Stranger's join request -> 403
  const memApproveRes = await jsonFetch(`/api/rooms/${roomId}/join-requests/${joinReqData._id}/approve`, {
    method: 'PUT'
  }, memberData.token);
  assert.equal(memApproveRes.status, 403);

  // Stranger tries to approve their own join request -> 403
  const strApproveRes = await jsonFetch(`/api/rooms/${roomId}/join-requests/${joinReqData._id}/approve`, {
    method: 'PUT'
  }, strangerData.token);
  assert.equal(strApproveRes.status, 403);

  // 6. Requester cannot accept their own friend request
  const frReqRes = await jsonFetch('/api/friends/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicId: strangerData.publicId })
  }, memberData.token);
  const frReqData = await frReqRes.json();
  const frReqId = frReqData.request?._id || frReqData.friendship?._id || frReqData._id;

  const memSelfAcceptRes = await jsonFetch(`/api/friends/requests/${frReqId}/accept`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' }
  }, memberData.token);
  assert.equal(memSelfAcceptRes.status, 403, 'Requester cannot accept own friend request');

  // Stranger (recipient) accepts -> 200
  const strAcceptRes = await jsonFetch(`/api/friends/requests/${frReqId}/accept`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' }
  }, strangerData.token);
  assert.equal(strAcceptRes.status, 200);

  // 7. Non-friend (Owner) cannot read Member & Stranger conversation
  const convRes = await jsonFetch('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ friendId: strangerData._id })
  }, memberData.token);
  assert.equal(convRes.status, 200);
  const convData = await convRes.json();
  const pairConvId = convData.conversation._id;

  const ownerPeekRes = await jsonFetch(`/api/conversations/${pairConvId}/messages`, {}, ownerData.token);
  assert.equal(ownerPeekRes.status, 403, 'Non-participant cannot read conversation messages');

  const ownerSendRes = await jsonFetch(`/api/conversations/${pairConvId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'I am eavesdropping' })
  }, ownerData.token);
  assert.equal(ownerSendRes.status, 403, 'Non-participant cannot post to conversation');
});

test('concurrency & idempotency: simultaneous requests resolve cleanly without corruption', async () => {
  // 1. Concurrent friend requests (A -> B and B -> A simultaneously)
  const user1 = await (await jsonFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: unique('conc_1'), email: `${unique('conc_1')}@test.local`, password: 'Password123!' })
  })).json();

  const user2 = await (await jsonFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: unique('conc_2'), email: `${unique('conc_2')}@test.local`, password: 'Password123!' })
  })).json();

  const [frRes1, frRes2] = await Promise.all([
    jsonFetch('/api/friends/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicId: user2.publicId })
    }, user1.token),
    jsonFetch('/api/friends/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicId: user1.publicId })
    }, user2.token)
  ]);

  const statuses = [frRes1.status, frRes2.status];
  assert.ok(statuses.includes(201), 'At least one request should succeed');
  assert.ok(statuses.includes(400) || statuses.includes(409), 'The second concurrent request should be rejected (400 or 409)');

  // 2. Concurrent join requests from same user to same private room
  const roomOwner = await (await jsonFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: unique('c_own'), email: `${unique('c_own')}@test.local`, password: 'Password123!' })
  })).json();

  const room = await (await jsonFetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: unique('ConcRoom'), isPrivate: true })
  }, roomOwner.token)).json();

  const [jrRes1, jrRes2] = await Promise.all([
    jsonFetch(`/api/rooms/${room._id}/join-requests`, {
      method: 'POST'
    }, user1.token),
    jsonFetch(`/api/rooms/${room._id}/join-requests`, {
      method: 'POST'
    }, user1.token)
  ]);

  const jrStatuses = [jrRes1.status, jrRes2.status];
  assert.ok(jrStatuses.includes(201), 'One join request must succeed');
  assert.ok(jrStatuses.includes(409), 'Concurrent duplicate join request must return 409');

  const successfulJr = jrRes1.status === 201 ? await jrRes1.json() : await jrRes2.json();

  // 3. Idempotent join request response
  const approveRes1 = await jsonFetch(`/api/rooms/${room._id}/join-requests/${successfulJr._id}/approve`, {
    method: 'PUT'
  }, roomOwner.token);
  assert.equal(approveRes1.status, 200);

  // Second response to already-resolved request must return 400
  const approveRes2 = await jsonFetch(`/api/rooms/${room._id}/join-requests/${successfulJr._id}/approve`, {
    method: 'PUT'
  }, roomOwner.token);
  assert.equal(approveRes2.status, 400);
  const approveRes2Data = await approveRes2.json();
  assert.equal(approveRes2Data.code, 'NOT_PENDING');

  // 4. Double leaving a room handles gracefully (idempotent 200)
  const leaveRes1 = await jsonFetch(`/api/rooms/${room._id}/leave`, { method: 'POST' }, user1.token);
  assert.equal(leaveRes1.status, 200);
  const leaveRes2 = await jsonFetch(`/api/rooms/${room._id}/leave`, { method: 'POST' }, user1.token);
  assert.equal(leaveRes2.status, 200);
});

test('real-time reliability: socket eviction on room leave, delete, and privacy revocation', async () => {
  const owner = await (await jsonFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: unique('rt_own'), email: `${unique('rt_own')}@test.local`, password: 'Password123!' })
  })).json();

  const member = await (await jsonFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: unique('rt_mem'), email: `${unique('rt_mem')}@test.local`, password: 'Password123!' })
  })).json();

  // Owner creates public room
  const room = await (await jsonFetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: unique('RealtimeRoom'), isPrivate: false })
  }, owner.token)).json();

  // Member joins room
  await jsonFetch(`/api/rooms/${room._id}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: room.code })
  }, member.token);

  // Connect Member socket
  const memberSock = io(BASE, {
    auth: { token: member.token },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true
  });

  await new Promise((resolve) => memberSock.on('connect', resolve));
  memberSock.emit('join_room', { roomId: room._id });

  // Verify member receives revocation when leaving room via REST
  const evictionPromise = new Promise((resolve) => {
    memberSock.on('room_access_revoked', (data) => {
      if (data.roomId === room._id) resolve(data);
    });
  });

  const leaveRes = await jsonFetch(`/api/rooms/${room._id}/leave`, { method: 'POST' }, member.token);
  assert.equal(leaveRes.status, 200);

  const revokedEvent = await evictionPromise;
  assert.equal(revokedEvent.roomId, room._id);

  memberSock.close();
});

test('data privacy & leak prevention: zero exposure of private fields in public lookup and preview', async () => {
  const target = await (await jsonFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: unique('priv_user'), email: `${unique('priv_user')}@secret-corp.internal`, password: 'SuperSecretPassword123!' })
  })).json();

  const seeker = await (await jsonFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: unique('priv_seek'), email: `${unique('priv_seek')}@test.local`, password: 'Password123!' })
  })).json();

  // 1. Lookup user by public ID
  const lookupRes = await jsonFetch(`/api/users/lookup/${target.publicId}`, {}, seeker.token);
  assert.equal(lookupRes.status, 200);
  const lookupData = await lookupRes.json();
  const profile = lookupData.user;

  // Verify permitted fields
  assert.equal(profile.publicId, target.publicId);
  assert.equal(profile.username, target.username);

  // Strictly verify ZERO private fields leaked
  assert.equal(profile.email, undefined, 'Email must never be exposed in public lookup');
  assert.equal(profile.password, undefined, 'Password must never be exposed');
  assert.equal(profile._id, undefined, 'Internal MongoDB _id must not be exposed');
  assert.equal(profile.tokens, undefined, 'Auth tokens must not be exposed');
  assert.equal(profile.googleId, undefined, 'OAuth IDs must not be exposed');

  // 2. Create private room and check preview sanitization
  const privRoom = await (await jsonFetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: unique('Classified'), description: 'Confidential project', isPrivate: true })
  }, target.token)).json();

  const previewRes = await jsonFetch(`/api/rooms/${privRoom._id}/preview`, {}, seeker.token);
  assert.equal(previewRes.status, 200);
  const preview = await previewRes.json();

  assert.equal(preview.description, 'Confidential project');
  assert.equal(preview.isPrivate, true);
  assert.equal(preview.visibility, 'private');
  assert.equal(preview.messages, undefined, 'Messages must never be leaked in room preview');
  assert.equal(preview.inviteCode, undefined, 'Invite code must not be exposed in preview');
});
