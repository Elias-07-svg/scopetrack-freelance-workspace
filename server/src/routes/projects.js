import { Router } from 'express';
import { getPool } from '../db.js';
import { hashToken, newToken } from '../security.js';
import { requireAuth } from '../auth.js';

const router = Router();
const db = () => getPool();
router.use(requireAuth);

async function membership(projectId, userId) {
  const result = await db().query('SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, userId]);
  return result.rows[0]?.role || null;
}

router.get('/', async (request, response, next) => {
  try {
    const { rows } = await db().query(`SELECT p.*, pm.role,
      (SELECT COUNT(*)::int FROM milestones m WHERE m.project_id = p.id) AS milestone_count,
      (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status <> 'done') AS open_tasks,
      (SELECT json_agg(json_build_object('id', u.id, 'name', u.full_name, 'role', members.role)) FROM project_members members JOIN users u ON u.id = members.user_id WHERE members.project_id = p.id) AS members
      FROM projects p JOIN project_members pm ON pm.project_id = p.id WHERE pm.user_id = $1 ORDER BY p.updated_at DESC`, [request.user.id]);
    response.json({ projects: rows });
  } catch (error) { next(error); }
});

router.post('/', async (request, response, next) => {
  const name = String(request.body.name || '').trim();
  const description = String(request.body.description || '').trim();
  const dueDate = request.body.dueDate || null;
  if (name.length < 2 || name.length > 140) return response.status(400).json({ error: { message: 'Project name must be 2–140 characters.' } });
  const client = await db().connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('INSERT INTO projects (owner_id, name, description, due_date) VALUES ($1,$2,$3,$4) RETURNING *', [request.user.id, name, description, dueDate]);
    await client.query(`INSERT INTO project_members (project_id, user_id, role) VALUES ($1,$2,'freelancer')`, [result.rows[0].id, request.user.id]);
    await client.query('COMMIT');
    response.status(201).json({ project: { ...result.rows[0], role: 'freelancer', members: [{ id: request.user.id, name: request.user.full_name, role: 'freelancer' }] } });
  } catch (error) { try { await client.query('ROLLBACK'); } catch {} next(error); }
  finally { client.release(); }
});

router.get('/:id', async (request, response, next) => {
  try {
    const role = await membership(request.params.id, request.user.id);
    if (!role) return response.status(404).json({ error: { message: 'Project not found.' } });
    const [project, milestones, tasks, members] = await Promise.all([
      db().query('SELECT * FROM projects WHERE id = $1', [request.params.id]),
      db().query('SELECT * FROM milestones WHERE project_id = $1 ORDER BY due_date NULLS LAST, id', [request.params.id]),
      db().query('SELECT * FROM tasks WHERE project_id = $1 ORDER BY due_date NULLS LAST, id', [request.params.id]),
      db().query('SELECT u.id, u.full_name AS name, u.email, pm.role FROM project_members pm JOIN users u ON u.id = pm.user_id WHERE pm.project_id = $1', [request.params.id]),
    ]);
    response.json({ project: { ...project.rows[0], role }, milestones: milestones.rows, tasks: tasks.rows, members: members.rows });
  } catch (error) { next(error); }
});

router.post('/:id/invites', async (request, response, next) => {
  try {
    if (await membership(request.params.id, request.user.id) !== 'freelancer') return response.status(403).json({ error: { message: 'Only a project freelancer can invite a client.' } });
    const email = String(request.body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response.status(400).json({ error: { message: 'Enter a valid client email.' } });
    const token = newToken();
    const result = await db().query(`INSERT INTO project_invites (project_id,email,token_hash,expires_at,created_by) VALUES ($1,$2,$3,NOW()+INTERVAL '7 days',$4) RETURNING id, expires_at`, [request.params.id, email, hashToken(token), request.user.id]);
    const origin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
    response.status(201).json({ invite: { id: result.rows[0].id, email, expiresAt: result.rows[0].expires_at, url: `${origin}/?invite=${token}` } });
  } catch (error) { next(error); }
});

router.post('/:id/milestones', async (request, response, next) => {
  try {
    if (await membership(request.params.id, request.user.id) !== 'freelancer') return response.status(403).json({ error: { message: 'Only the freelancer can add milestones.' } });
    const title = String(request.body.title || '').trim();
    if (title.length < 2 || title.length > 160) return response.status(400).json({ error: { message: 'Milestone title must be 2–160 characters.' } });
    const { rows } = await db().query('INSERT INTO milestones (project_id,title,description,due_date) VALUES ($1,$2,$3,$4) RETURNING *', [request.params.id, title, String(request.body.description || '').trim(), request.body.dueDate || null]);
    response.status(201).json({ milestone: rows[0] });
  } catch (error) { next(error); }
});

router.patch('/:id/milestones/:milestoneId/status', async (request, response, next) => {
  try {
    const role = await membership(request.params.id, request.user.id);
    if (!role) return response.status(404).json({ error: { message: 'Project not found.' } });
    const status = request.body.status;
    const allowed = role === 'freelancer' ? ['in_progress', 'in_review'] : ['approved', 'changes_requested'];
    if (!allowed.includes(status)) return response.status(403).json({ error: { message: 'That status change is not allowed for your project role.' } });
    const current = await db().query('SELECT status FROM milestones WHERE id=$1 AND project_id=$2', [request.params.milestoneId, request.params.id]);
    if (!current.rowCount) return response.status(404).json({ error: { message: 'Milestone not found.' } });
    const valid = { planned: ['in_progress'], in_progress: ['in_review'], in_review: ['approved', 'changes_requested'], changes_requested: ['in_progress'], approved: [] };
    if (!valid[current.rows[0].status]?.includes(status)) return response.status(409).json({ error: { message: `Cannot move a milestone from ${current.rows[0].status.replace('_', ' ')} to ${status.replace('_', ' ')}.` } });
    const { rows } = await db().query('UPDATE milestones SET status=$1, updated_at=NOW() WHERE id=$2 AND project_id=$3 RETURNING *', [status, request.params.milestoneId, request.params.id]);
    response.json({ milestone: rows[0] });
  } catch (error) { next(error); }
});

router.post('/:id/tasks', async (request, response, next) => {
  try {
    if (await membership(request.params.id, request.user.id) !== 'freelancer') return response.status(403).json({ error: { message: 'Only the freelancer can add tasks.' } });
    const title = String(request.body.title || '').trim();
    const milestoneId = Number(request.body.milestoneId);
    if (title.length < 2 || title.length > 180 || !Number.isInteger(milestoneId)) return response.status(400).json({ error: { message: 'Choose a milestone and enter a task title.' } });
    const { rows } = await db().query('INSERT INTO tasks (project_id,milestone_id,title,description,priority,assignee_id,created_by,due_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *', [request.params.id, milestoneId, title, String(request.body.description || '').trim(), ['low','normal','high'].includes(request.body.priority) ? request.body.priority : 'normal', request.body.assigneeId || request.user.id, request.user.id, request.body.dueDate || null]);
    response.status(201).json({ task: rows[0] });
  } catch (error) { if (error.code === '23503') return response.status(400).json({ error: { message: 'Choose a milestone in this project.' } }); next(error); }
});

router.patch('/:id/tasks/:taskId/status', async (request, response, next) => {
  try {
    const role = await membership(request.params.id, request.user.id);
    if (!role) return response.status(404).json({ error: { message: 'Project not found.' } });
    if (role !== 'freelancer') return response.status(403).json({ error: { message: 'Only the freelancer can update task progress.' } });
    const status = request.body.status;
    if (!['todo','in_progress','in_review','done'].includes(status)) return response.status(400).json({ error: { message: 'Choose a valid task status.' } });
    const { rows } = await db().query('UPDATE tasks SET status=$1, updated_at=NOW() WHERE id=$2 AND project_id=$3 RETURNING *', [status, request.params.taskId, request.params.id]);
    if (!rows.length) return response.status(404).json({ error: { message: 'Task not found.' } });
    response.json({ task: rows[0] });
  } catch (error) { next(error); }
});

export default router;
