import { Router } from 'express';
import { getPool } from './db.js';
import { cookieOptions, hashPassword, hashToken, newToken, signSessionId, validSessionCookie, verifyPassword } from './security.js';

const router = Router();
const db = () => getPool();
const cookieName = 'scopetrack_session';
const readCookie = (request) => request.headers.cookie?.split(';').map((entry) => entry.trim()).find((entry) => entry.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);

export async function requireAuth(request, response, next) {
  try {
    const sessionId = validSessionCookie(readCookie(request));
    if (!sessionId) return response.status(401).json({ error: { message: 'Please sign in to continue.' } });
    const result = await db().query(`SELECT u.id, u.full_name, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1 AND s.expires_at > NOW()`, [hashToken(sessionId)]);
    if (!result.rowCount) return response.status(401).json({ error: { message: 'Your session expired. Please sign in again.' } });
    request.user = result.rows[0];
    request.sessionId = sessionId;
    next();
  } catch (error) { next(error); }
}

async function startSession(userId, response) {
  const id = newToken();
  await db().query('INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'14 days\')', [hashToken(id), userId]);
  response.setHeader('Set-Cookie', `${cookieName}=${id}.${signSessionId(id)}; ${cookieOptions()}`);
}

router.post('/register', async (request, response, next) => {
  try {
    const fullName = String(request.body.fullName || '').trim();
    const email = String(request.body.email || '').trim().toLowerCase();
    const password = String(request.body.password || '');
    if (fullName.length < 2 || fullName.length > 120) return response.status(400).json({ error: { message: 'Enter your name (2–120 characters).' } });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return response.status(400).json({ error: { message: 'Enter a valid email address.' } });
    if (password.length < 10 || password.length > 200) return response.status(400).json({ error: { message: 'Use a password with at least 10 characters.' } });
    const result = await db().query('INSERT INTO users (full_name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, full_name, email', [fullName, email, await hashPassword(password)]);
    const user = result.rows[0];
    await startSession(user.id, response);
    response.status(201).json({ user });
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ error: { message: 'An account with that email already exists.' } });
    next(error);
  }
});

router.post('/login', async (request, response, next) => {
  try {
    const email = String(request.body.email || '').trim().toLowerCase();
    const password = String(request.body.password || '');
    const result = await db().query('SELECT id, full_name, email, password_hash FROM users WHERE email = $1', [email]);
    if (!result.rowCount || !(await verifyPassword(password, result.rows[0].password_hash))) return response.status(401).json({ error: { message: 'Email or password is incorrect.' } });
    const { password_hash, ...user } = result.rows[0];
    await startSession(user.id, response);
    response.json({ user });
  } catch (error) { next(error); }
});

router.get('/me', requireAuth, (request, response) => response.json({ user: request.user }));

router.post('/logout', requireAuth, async (request, response, next) => {
  try {
    await db().query('DELETE FROM sessions WHERE id = $1', [hashToken(request.sessionId)]);
    response.setHeader('Set-Cookie', `${cookieName}=; ${cookieOptions().replace(`Max-Age=${60 * 60 * 24 * 14}`, 'Max-Age=0')}`);
    response.json({ ok: true });
  } catch (error) { next(error); }
});

router.post('/invites/:token/accept', requireAuth, async (request, response, next) => {
  const client = await db().connect();
  try {
    await client.query('BEGIN');
    const invite = await client.query(`SELECT id, project_id, email FROM project_invites WHERE token_hash = $1 AND accepted_at IS NULL AND expires_at > NOW() FOR UPDATE`, [hashToken(request.params.token)]);
    if (!invite.rowCount) { await client.query('ROLLBACK'); return response.status(404).json({ error: { message: 'This invitation is expired or already used.' } }); }
    if (invite.rows[0].email !== request.user.email) { await client.query('ROLLBACK'); return response.status(403).json({ error: { message: 'Sign in with the invited email address to accept this invitation.' } }); }
    await client.query(`INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'client') ON CONFLICT (project_id, user_id) DO NOTHING`, [invite.rows[0].project_id, request.user.id]);
    await client.query('UPDATE project_invites SET accepted_at = NOW() WHERE id = $1', [invite.rows[0].id]);
    await client.query('COMMIT');
    response.json({ projectId: invite.rows[0].project_id, ok: true });
  } catch (error) { try { await client.query('ROLLBACK'); } catch {} next(error); }
  finally { client.release(); }
});

export default router;
