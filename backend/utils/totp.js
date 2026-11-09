const crypto = require('crypto');

/**
 * Minimal dependency-free RFC 6238 TOTP implementation.
 * Used for admin MFA. Secrets are Base32 encoded.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const base32Encode = (buffer) => {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
};

const base32Decode = (input) => {
  const clean = String(input || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
};

const generateSecret = (size = 20) => base32Encode(crypto.randomBytes(size));

const hotp = (secret, counter, digits = 6) => {
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  let value = counter;
  for (let i = 7; i >= 0; i -= 1) {
    counterBuffer[i] = value & 0xff;
    value = Math.floor(value / 256);
  }
  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  return String(binary % (10 ** digits)).padStart(digits, '0');
};

const generateTotp = (secret, { timeStep = 30, digits = 6, now = Date.now() } = {}) => {
  const counter = Math.floor(now / 1000 / timeStep);
  return hotp(secret, counter, digits);
};

const safeEqual = (a, b) => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

const verifyTotp = (secret, token, { timeStep = 30, digits = 6, window = 1, now = Date.now() } = {}) => {
  const normalized = String(token || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized) || !secret) return false;
  const counter = Math.floor(now / 1000 / timeStep);
  for (let offset = -window; offset <= window; offset += 1) {
    if (safeEqual(hotp(secret, counter + offset, digits), normalized)) return true;
  }
  return false;
};

const buildOtpauthUrl = ({ secret, label, issuer = 'ChatRoom Admin' }) => {
  const encodedLabel = encodeURIComponent(`${issuer}:${label}`);
  const encodedIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${encodedLabel}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
};

module.exports = {
  base32Encode,
  base32Decode,
  generateSecret,
  generateTotp,
  verifyTotp,
  buildOtpauthUrl
};
