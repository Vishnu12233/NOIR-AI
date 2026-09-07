// Password hashing (scrypt w/ per-user salt + timingSafeEqual), tokens, audit helpers
import crypto from 'node:crypto';
import { dbFile, config } from './config.js';

const enc = (s) => Buffer.from(String(s), 'utf8');

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [salt, hash] = String(stored).split(':');
    const candidate = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

export function randomToken(bytes = 32) { return crypto.randomBytes(bytes).toString('hex'); }

export function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }

export function sign(data, ttlMs = 1000 * 60 * 60 * 24) {
  // stateless signed payload for email links (verify / reset)
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  const exp = Date.now() + ttlMs;
  const body = `${payload}.${exp}`;
  const sig = crypto.createHmac('sha256', config.secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function unsign(token) {
  try {
    const [payload, exp, sig] = token.split('.');
    const body = `${payload}.${exp}`;
    const expect = crypto.createHmac('sha256', config.secret).update(body).digest('base64url');
    const a = Buffer.from(sig); const b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    if (Date.now() > Number(exp)) return null;
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch { return null; }
}

/** Env values are masked before this signature exists in DB, so we only ever redact */
export function redactSecrets(text) {
  if (!text) return text;
  return String(text).replace(/(sk-[A-Za-z0-9_\-]{8,}|xai-[A-Za-z0-9_\-]{8,}|key-[A-Za-z0-9]{16,}|eyJ[A-Za-z0-9_\-\.]{20,})/g, '[REDACTED]');
}

export function mask(value) {
  const s = String(value || '');
  if (s.length <= 6) return '••••';
  return `${s.slice(0, 3)}••••••••${s.slice(-3)}`;
}

export function publicUser(u) {
  return {
    id: u.id, email: u.email, name: u.name,
    email_verified: !!u.email_verified,
    experience: u.experience, preferred_stack: u.preferred_stack,
    theme: u.theme,
    created_at: u.created_at,
  };
}

export { dbFile };
