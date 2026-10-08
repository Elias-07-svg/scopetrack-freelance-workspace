import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const secret = () => {
  if (process.env.NODE_ENV === 'production' && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
    throw new Error('SESSION_SECRET must be set to at least 32 characters in production.');
  }
  return process.env.SESSION_SECRET || 'local-development-only-change-this-secret-before-deploying';
};
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [algorithm, salt, expectedHex] = String(stored).split('$');
  if (algorithm !== 'scrypt' || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = await scrypt(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function signSessionId(id) {
  return createHmac('sha256', secret()).update(id).digest('base64url');
}

export function validSessionCookie(value) {
  const [id, signature] = String(value || '').split('.');
  if (!id || !signature) return null;
  const expected = Buffer.from(signSessionId(id));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received) ? id : null;
}

export function cookieOptions() {
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 14}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}
