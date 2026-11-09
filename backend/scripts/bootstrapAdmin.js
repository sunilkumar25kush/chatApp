  /**
 * Secure one-time bootstrap for the first Super Admin.
 *
 * Usage:
 *   ADMIN_BOOTSTRAP_USERNAME=owner \
 *   ADMIN_BOOTSTRAP_EMAIL=owner@example.com \
 *   ADMIN_BOOTSTRAP_PASSWORD='a-long-unique-password' \
 *   node scripts/bootstrapAdmin.js
 *
 * There is no public admin registration endpoint. This script:
 *   - refuses to run without explicit credentials
 *   - refuses weak passwords
 *   - refuses to create a second Super Admin
 */
require('dotenv').config();
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Admin = require('../models/Admin');
const { isEmail, validateAdminPassword } = require('../utils/adminValidation');

const username = String(process.env.ADMIN_BOOTSTRAP_USERNAME || '').trim();
const email = String(process.env.ADMIN_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
const password = String(process.env.ADMIN_BOOTSTRAP_PASSWORD || '');

const fail = (message) => {
  // eslint-disable-next-line no-console
  console.error(`[bootstrap-admin] ${message}`);
  process.exitCode = 1;
};

const run = async () => {
  if (process.env.NODE_ENV === 'production' && !process.env.MONGO_URI) {
    throw new Error('MONGO_URI must be set in production');
  }
  if (username.length < 3 || username.length > 40) {
    throw new Error('ADMIN_BOOTSTRAP_USERNAME must be 3-40 characters');
  }
  if (!isEmail(email)) {
    throw new Error('ADMIN_BOOTSTRAP_EMAIL must be a valid email address');
  }
  const passwordCheck = validateAdminPassword(password);
  if (!passwordCheck.ok) {
    throw new Error(`ADMIN_BOOTSTRAP_PASSWORD is too weak: ${passwordCheck.message}`);
  }

  await connectDB();

  const existingSuperAdmin = await Admin.findOne({ role: 'super_admin' }).select('_id email').lean();
  if (existingSuperAdmin) {
    throw new Error(
      `A Super Admin already exists (${existingSuperAdmin.email}). ` +
      'Use the admin panel to create or promote additional administrators.'
    );
  }

  const duplicate = await Admin.findOne({ $or: [{ email }, { username }] }).select('_id').lean();
  if (duplicate) {
    throw new Error('An admin with this email or username already exists');
  }

  const admin = await Admin.create({
    username,
    email,
    passwordHash: password,
    role: 'super_admin',
    status: 'active',
    mfaEnabled: false,
    notes: 'Initial Super Admin created by bootstrapAdmin.js'
  });

  // eslint-disable-next-line no-console
  console.log('[bootstrap-admin] Super Admin created successfully.');
  // eslint-disable-next-line no-console
  console.log(`[bootstrap-admin] Email: ${admin.email}`);
  // eslint-disable-next-line no-console
  console.log('[bootstrap-admin] Sign in at /admin/login and enable MFA immediately.');
};

run()
  .catch((error) => fail(error.message))
  .finally(async () => {
    await mongoose.connection.close(false).catch(() => {});
  });
