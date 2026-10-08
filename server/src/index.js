import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import healthRouter from './routes/health.js';
import authRouter from './auth.js';
import projectRouter from './routes/projects.js';

const app = express();
const port = Number(process.env.PORT) || 4000;
const clientBuild = join(dirname(fileURLToPath(import.meta.url)), '../../client/dist');

app.set('trust proxy', 1);
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json());

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/projects', projectRouter);

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(clientBuild));
  app.get(/.*/, (request, response, next) => {
    if (request.path.startsWith('/api/')) return next();
    response.sendFile(join(clientBuild, 'index.html'), (error) => { if (error) next(error); });
  });
}

app.use((request, response, next) => {
  if (request.path.startsWith('/api/')) return response.status(404).json({ error: { message: 'API route not found.' } });
  next();
});

app.use((error, _request, response, _next) => {
  console.error('API request failed:', error.message);
  response.status(500).json({ error: { message: 'The request could not be completed. Please try again.' } });
});

app.listen(port, () => {
  console.log(`ScopeTrack API listening on http://localhost:${port}`);
});
