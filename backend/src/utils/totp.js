const crypto = require('crypto');

/**
 * Standard RFC 6238 Time-Based One-Time Password (TOTP) Implementation.
 * Uses native Node.js crypto module. Zero external dependencies.
 */

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function generateBase32Secret(byteLength = 20) {
  const bytes = crypto.randomBytes(byteLength);
  let bits = '';
  let secret = '';
  for (let i = 0; i < bytes.length; i++) {
    bits += bytes[i].toString(2).padStart(8, '0');
  }
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    const chunk = bits.substr(i, 5);
    secret += BASE32_CHARS[parseInt(chunk, 2)];
  }
  return secret;
}

function base32ToBuffer(base32Str) {
  const clean = base32Str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (let i = 0; i < clean.length; i++) {
    const val = BASE32_CHARS.indexOf(clean[i]);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substr(i, 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTOTP(secretBase32, timeStepSeconds = 30, epochSeconds = Math.floor(Date.now() / 1000)) {
  const key = base32ToBuffer(secretBase32);
  const counter = Math.floor(epochSeconds / timeStepSeconds);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter), 0);

  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

/**
 * Validates a 6-digit TOTP code allowing +/- 1 time step (30 seconds) tolerance for clock drift.
 */
function verifyTOTP(token, secretBase32, window = 1, timeStepSeconds = 30) {
  if (!token || typeof token !== 'string') return false;
  const cleanToken = token.trim();
  if (cleanToken.length !== 6) return false;

  const currentEpoch = Math.floor(Date.now() / 1000);
  for (let i = -window; i <= window; i++) {
    const testEpoch = currentEpoch + (i * timeStepSeconds);
    const expected = generateTOTP(secretBase32, timeStepSeconds, testEpoch);
    if (crypto.timingSafeEqual(Buffer.from(cleanToken), Buffer.from(expected))) {
      return true;
    }
  }
  return false;
}

function generateOtpAuthUrl({ issuer = 'CareBridge', label, secret }) {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedLabel = encodeURIComponent(label);
  return `otpauth://totp/${encodedIssuer}:${encodedLabel}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

module.exports = {
  generateBase32Secret,
  generateTOTP,
  verifyTOTP,
  generateOtpAuthUrl,
};
