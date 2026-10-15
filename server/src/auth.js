import { createRemoteJWKSet, jwtVerify } from 'jose';
import { Router } from 'express';
import { getPool } from './db.js';
import { hashToken } from './security.js';

const router = Router();
const db = () => getPool();
const firebaseProjectId = () => process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
const firebaseKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));

async function verifyFirebaseToken(token) {
  const projectId = firebaseProjectId();
  if (!projectId) throw Object.assign(new Error('Firebase is not configured on the API.'), { status: 503 });
  const { payload } = await jwtVerify(token, firebaseKeys, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    algorithms: ['RS256'],
  });
  if (typeof payload.sub !== 'string' || !payload.sub || payload.email_verified !== true || typeof payload.email !== 'string') {
    throw Object.assign(new Error('Verify your email address before signing in.'), { status: 403, code: 'EMAIL_NOT_VERIFIED' });
  }
  return {
    uid: payload.sub,
    email: payload.email.trim().toLowerCase(),
    fullName: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim().slice(0, 120) : payload.email.split('@')[0].slice(0, 120),
  };
}

async function findOrCreateUser(identity) {
  const client = await db().connect();
  try {
    await client.query('BEGIN');
    const byUid = await client.query('SELECT id, full_name, email, firebase_uid FROM users WHERE firebase_uid = $1 FOR UPDATE', [identity.uid]);
    if (byUid.rowCount) {
      const current = byUid.rows[0];
      if (current.email === identity.email) {
        await client.query('COMMIT');
        return { id: current.id, full_name: current.full_name, email: current.email };
      }
      const emailOwner = await client.query('SELECT id FROM users WHERE email = $1 AND id <> $2', [identity.email, current.id]);
      if (emailOwner.rowCount) throw Object.assign(new Error('This email is already linked to another workspace account.'), { status: 409 });
      const result = await client.query('UPDATE users SET email = $1, full_name = $2, email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = NOW() WHERE id = $3 RETURNING id, full_name, email', [identity.email, identity.fullName, current.id]);
      await client.query('COMMIT');
      return result.rows[0];
    }

    const byEmail = await client.query('SELECT id, full_name, email, firebase_uid FROM users WHERE email = $1 FOR UPDATE', [identity.email]);
    if (byEmail.rowCount) {
      if (byEmail.rows[0].firebase_uid && byEmail.rows[0].firebase_uid !== identity.uid) {
        throw Object.assign(new Error('This email is already linked to a different sign-in account.'), { status: 409 });
      }
      const result = await client.query('UPDATE users SET firebase_uid = $1, email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = NOW() WHERE id = $2 RETURNING id, full_name, email', [identity.uid, byEmail.rows[0].id]);
      await client.query('COMMIT');
      return result.rows[0];
    }

    const result = await client.query('INSERT INTO users (full_name, email, password_hash, email_verified_at, firebase_uid) VALUES ($1, $2, NULL, NOW(), $3) RETURNING id, full_name, email', [identity.fullName, identity.email, identity.uid]);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    if (error.code === '23505') throw Object.assign(new Error('This sign-in account is already linked. Please sign in with its original provider.'), { status: 409 });
    throw error;
  } finally {
    client.release();
  }
}

export async function requireAuth(request, response, next) {
  try {
    const authorization = request.headers.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token) return response.status(401).json({ error: { message: 'Please sign in to continue.' } });
    const identity = await verifyFirebaseToken(token);
    request.user = await findOrCreateUser(identity);
    next();
  } catch (error) {
    const status = error.status || (error.code === 'ERR_JWT_EXPIRED' || error.code?.startsWith('ERR_JWT_') ? 401 : 401);
    response.status(status).json({ error: { ...(error.code ? { code: error.code } : {}), message: status === 401 ? 'Your sign-in expired. Please sign in again.' : error.message } });
  }
}

router.get('/me', requireAuth, (request, response) => response.json({ user: request.user }));
router.post('/logout', (_request, response) => response.json({ ok: true }));

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
