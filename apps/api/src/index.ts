import { createServer } from 'node:http';
import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pino } from 'pino';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error.js';
import passport from 'passport';
import { setupPassport } from './modules/auth/passport.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { teamRoutes } from './modules/teams/teams.routes.js';
import { boardRoutes } from './modules/boards/boards.routes.js';
import { columnRoutes } from './modules/columns/columns.routes.js';
import { cardRoutes } from './modules/cards/cards.routes.js';
import { swimlaneRoutes } from './modules/swimlanes/swimlanes.routes.js';
import { labelRoutes } from './modules/labels/labels.routes.js';
import { boardActivityRoutes, cardActivityRoutes, notificationRoutes } from './modules/activities/activities.routes.js';
import { searchRoutes } from './modules/search/search.routes.js';
import { templateRoutes, saveAsTemplateRoutes } from './modules/templates/templates.routes.js';
import { shareRoutes, sharedBoardRoutes } from './modules/shares/shares.routes.js';
import { attachmentRoutes } from './modules/attachments/attachments.routes.js';
import { userRoutes } from './modules/users/users.routes.js';
import { ensureSystemTemplates } from './modules/templates/templates.service.js';
import { setupSocketIO } from './ws/socket.js';
import { isLocalStorage, registerStaticServing } from './lib/storage/index.js';

const logger = pino({ name: 'api' });
const app: Express = express();
const httpServer = createServer(app);

// Initialize Socket.IO
setupSocketIO(httpServer);

// Seed system templates
ensureSystemTemplates().catch((err) => logger.error(err, 'Failed to seed system templates'));

app.use(helmet());
app.use(cors({ origin: env.WEB_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

setupPassport();
app.use(passport.initialize());

if (isLocalStorage()) {
  registerStaticServing(app);
}

app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/teams', teamRoutes);
app.use('/api/v1/teams/:teamId/boards', boardRoutes);
app.use('/api/v1/boards/:boardId/columns', columnRoutes);
app.use('/api/v1/boards/:boardId/cards', cardRoutes);
app.use('/api/v1/boards/:boardId/swimlanes', swimlaneRoutes);
app.use('/api/v1/boards/:boardId/labels', labelRoutes);
app.use('/api/v1/boards/:boardId/activities', boardActivityRoutes);
app.use('/api/v1/cards/:cardId/activities', cardActivityRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/search', searchRoutes);
app.use('/api/v1/teams/:teamId/templates', templateRoutes);
app.use('/api/v1/boards/:boardId/save-as-template', saveAsTemplateRoutes);
app.use('/api/v1/boards/:boardId/shares', shareRoutes);
app.use('/api/v1/shared', sharedBoardRoutes);
app.use('/api/v1/boards/:boardId/cards/:cardId/attachments', attachmentRoutes);

app.use(errorHandler);

httpServer.listen(env.PORT ?? env.API_PORT, env.API_HOST, () => {
  logger.info(`API server running on port ${env.PORT ?? env.API_PORT}`);
});

export { app };
