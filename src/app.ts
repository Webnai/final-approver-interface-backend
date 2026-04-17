import compression from 'compression';
import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import Loan from './models/loan';
import authenticateApiRequest from './middleware/authenticateApiRequest';
import errorHandler from './middleware/errorHandler';
import requestLogger from './middleware/requestLogger';
import buildDashboardRoutes from './routes/dashboardRoutes';
import healthRoutes from './routes/healthRoutes';
import buildLoanRoutes from './routes/loanRoutes';
import buildProfileRoutes from './routes/profileRoutes';
import buildSupervisorRoutes from './routes/supervisorRoutes';
import { allChecklistChecksPassed, extractMentions } from './services/loanWorkflow';
import { BuildAppOptions } from './types/app';

export { allChecklistChecksPassed, extractMentions };

const corsOptions: cors.CorsOptions = {
  origin: ['http://localhost:5173', 'https://final-approver-interface-frontend.vercel.app'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma', 'If-None-Match'],
  credentials: true
};

export const buildApp = (options: BuildAppOptions = {}) => {
  const {
    rateLimit: rateLimitConfig = { windowMs: 60_000, maxRequests: 100 },
    loanModel = Loan,
    now = () => new Date(),
    auth: authConfig = {}
  } = options;

  const { requireAuth = true, tokenVerifier } = authConfig;

  const dependencies = {
    loanModel,
    now
  };

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);

  app.use(healthRoutes);
  app.use(
    '/api',
    rateLimit({
      windowMs: rateLimitConfig.windowMs,
      limit: rateLimitConfig.maxRequests,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests. Try again later.' }
    })
  );

  app.use('/api', authenticateApiRequest({ requireAuth, tokenVerifier }));
  app.use('/api', buildProfileRoutes());
  app.use('/api', buildLoanRoutes(dependencies));
  app.use('/api', buildSupervisorRoutes(dependencies));
  app.use('/api', buildDashboardRoutes(dependencies));

  app.use(errorHandler);

  return app;
};
