import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import { ApiError, authRouter, requireAuth } from './auth';
import { DATA_PATH, store } from './store';
import { seed } from './seed';
import employeesRouter from './routes/employees';
import goalsRouter from './routes/goals';
import reviewsRouter from './routes/reviews';
import feedbackRouter from './routes/feedback';
import dashboardRouter from './routes/dashboard';

// Deliberately NOT process.env.PORT — dev harnesses set that for the web server.
const PORT = Number(process.env.API_PORT ?? 3001);

async function main() {
  if (!fs.existsSync(DATA_PATH)) {
    console.log(`No workbook found at ${DATA_PATH} — seeding demo data...`);
    await seed();
  }
  await store.load();

  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.use('/api/auth', authRouter);
  // All feature routers require an authenticated actor.
  app.use('/api', requireAuth, employeesRouter);
  app.use('/api', requireAuth, goalsRouter);
  app.use('/api', requireAuth, reviewsRouter);
  app.use('/api', requireAuth, feedbackRouter);
  app.use('/api', requireAuth, dashboardRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  if (process.env.NODE_ENV === 'production') {
    const dist = path.resolve('dist');
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) {
      res.status(err.status).json({ error: err.message });
    } else {
      console.error(err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
    }
  });

  app.listen(PORT, () => {
    console.log(`ManagePlus API listening on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
