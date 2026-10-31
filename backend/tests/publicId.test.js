const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { generatePublicId, isValidPublicId, normalizePublicId, CHARSET } = require('../utils/publicId');
const { backfillPublicIds } = require('../scripts/backfillPublicIds');
const User = require('../models/User');

const BACKEND_DIR = path.join(__dirname, '..');

function getMongoUri() {
  const envPath = path.join(BACKEND_DIR, '.env');
  if (fs.existsSync(envPath)) {
    const match = fs.readFileSync(envPath, 'utf8').match(/^MONGO_URI=(.+)$/m);
    if (match) {
      const uri = match[1].trim();
      return uri.replace(/\/([^/?]+)(\?|$)/, '/chatroom_test_public_id$2');
    }
  }
  return 'mongodb://localhost:27017/chatroom_test_public_id';
}

const MONGO_URI = getMongoUri();

before(async () => {
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
});

after(async () => {
  try {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  } catch {
    // best-effort
  }
});

test('generatePublicId: generates cryptographically secure, readable IDs', () => {
  const id1 = generatePublicId();
  const id2 = generatePublicId();

  assert.notEqual(id1, id2, 'Two consecutive generated IDs should not collide');
  assert.match(id1, /^SKY-[2-9A-HJ-NP-Z]{6}$/, 'Default ID should match SKY-XXXXXX format');
  assert.equal(isValidPublicId(id1), true, 'Generated ID must be valid');

  // Verify none of the ambiguous characters exist in charset
  const ambiguous = ['0', 'O', '1', 'I', 'L'];
  for (const ch of ambiguous) {
    assert.equal(CHARSET.includes(ch), false, `Char ${ch} should not be in CHARSET`);
  }

  // Custom prefix support
  const chatAppId = generatePublicId('CHAT');
  assert.match(chatAppId, /^CHAT-[2-9A-HJ-NP-Z]{6}$/);
  assert.equal(isValidPublicId(chatAppId), true);
});

test('isValidPublicId: correctly rejects invalid or malicious formats', () => {
  assert.equal(isValidPublicId('SKY-7K9M2Q'), true);
  assert.equal(isValidPublicId('CHAT-8X2F9A'), true);
  assert.equal(isValidPublicId('sky-7k9m2q'), true, 'Case-insensitive validation');

  // Invalid formats
  assert.equal(isValidPublicId(''), false);
  assert.equal(isValidPublicId(null), false);
  assert.equal(isValidPublicId(undefined), false);
  assert.equal(isValidPublicId('123'), false);
  assert.equal(isValidPublicId('SKY-12'), false, 'Too short');
  assert.equal(isValidPublicId('SKY-7K9M2Q999'), false, 'Too long');
  assert.equal(isValidPublicId('SKY-7K9M20'), false, 'Contains ambiguous digit 0');
  assert.equal(isValidPublicId('SKY-7K9M2I'), false, 'Contains ambiguous letter I');
  assert.equal(isValidPublicId('DROP TABLE users;--'), false, 'SQL injection string rejected');
  assert.equal(isValidPublicId('{ "$gt": "" }'), false, 'NoSQL query payload rejected');
});

test('User Model: auto-generates publicId on validation and enforces uniqueness', async () => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const u1 = new User({
    username: `test_user_${uniqueSuffix}`,
    email: `test_${uniqueSuffix}@example.com`,
    password: 'password123'
  });

  await u1.validate();
  assert.ok(u1.publicId, 'Document validation must assign a publicId');
  assert.match(u1.publicId, /^SKY-[2-9A-HJ-NP-Z]{6}$/);

  await u1.save();
  assert.ok(u1._id);

  // Attempt duplicate publicId creation
  const u2 = new User({
    username: `dup_user_${uniqueSuffix}`,
    email: `dup_${uniqueSuffix}@example.com`,
    password: 'password123',
    publicId: u1.publicId
  });

  await assert.rejects(
    async () => {
      await u2.save();
    },
    (err) => err.code === 11000,
    'MongoDB must reject duplicate publicId with code 11000'
  );
});

test('Migration: backfillPublicIds is idempotent and does not overwrite existing IDs', async () => {
  const stamp = Date.now();
  
  // Create user with explicit publicId
  const existingId = 'SKY-K3EP9X';
  const userWithId = await User.create({
    username: `mig_user_has_id_${stamp}`,
    email: `mig_has_id_${stamp}@test.com`,
    password: 'password123',
    publicId: existingId
  });

  // Create user and intentionally strip publicId in raw collection to simulate legacy document
  const legacyUser = await User.create({
    username: `mig_user_legacy_${stamp}`,
    email: `mig_legacy_${stamp}@test.com`,
    password: 'password123'
  });
  await User.collection.updateOne({ _id: legacyUser._id }, { $unset: { publicId: '' } });

  // Verify legacy user now lacks publicId in raw DB
  const rawLegacy = await User.collection.findOne({ _id: legacyUser._id });
  assert.equal(rawLegacy.publicId, undefined, 'Legacy user should have no publicId before migration');

  // Run backfill migration
  const result1 = await backfillPublicIds({ customLogger: { info: () => {}, warn: () => {}, error: () => {} } });
  assert.ok(result1.backfilled >= 1, 'Should backfill at least 1 legacy user');

  // Verify legacy user received a valid ID
  const updatedLegacy = await User.findById(legacyUser._id);
  assert.ok(updatedLegacy.publicId, 'Legacy user should now have a publicId');
  assert.equal(isValidPublicId(updatedLegacy.publicId), true);

  // Verify user who already had an ID was NOT changed
  const unchangedUser = await User.findById(userWithId._id);
  assert.equal(unchangedUser.publicId, existingId, 'Existing publicId must not be overwritten');

  // Run migration a second time (idempotency check)
  const result2 = await backfillPublicIds({ customLogger: { info: () => {}, warn: () => {}, error: () => {} } });
  assert.equal(result2.missingFound, 0, 'Second run should find 0 missing IDs');
  assert.equal(result2.backfilled, 0, 'Second run should backfill 0 users');

  // IDs should remain identical after rerun
  const legacyAfterRerun = await User.findById(legacyUser._id);
  assert.equal(legacyAfterRerun.publicId, updatedLegacy.publicId, 'Public ID must remain unchanged on rerun');
});

