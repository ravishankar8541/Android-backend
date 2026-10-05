import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { errorHandler, notFound } from './middleware/errors.js';
import authRoutes from './routes/auth-routes.js';
import dashboardRoutes from './routes/dashboard-routes.js';
import employeeRoutes from './routes/employee-routes.js';
import attendanceRoutes from './routes/attendance-routes.js';
import leaveRoutes from './routes/leave-routes.js';
import { officeRoutes, shiftRoutes } from './routes/configuration-routes.js';

export const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: { ...helmet.contentSecurityPolicy.getDefaultDirectives(), 'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], 'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'] } } }));
app.use(cors({ origin(origin, callback) {
  if (!origin || env.FRONTEND_ORIGINS.includes(origin)) return callback(null, true);
  return callback(new Error('Origin is not allowed by CORS'));
}, credentials: true }));
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());
app.use(pinoHttp({ logger, customLogLevel(_req, res, error) { return error || res.statusCode >= 500 ? 'error' : 'info'; } }));
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));

app.get('/health', (_req, res) => res.json({ success: true, message: 'VAM HRMS API is running', data: { status: 'ok' } }));
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/offices', officeRoutes);
app.use('/api/shifts', shiftRoutes);
app.use(notFound);
app.use(errorHandler);
