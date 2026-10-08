import { Router } from 'express';
import { getPool } from '../db.js';

const router = Router();

router.get('/', async (_request, response) => {
  try {
    await getPool().query('SELECT 1');
    response.json({ status: 'ok', service: 'scopetrack-api', database: 'connected' });
  } catch (error) {
    console.error('Health check failed:', error.message);
    response.status(503).json({ error: { message: 'The API or database is not ready.' } });
  }
});

export default router;
