import { Router } from 'express';
import { createDashboardController } from '../controllers/dashboardController';
import { AppDependencies } from '../types/app';

const buildDashboardRoutes = (dependencies: AppDependencies) => {
  const router = Router();
  const controller = createDashboardController(dependencies);

  router.get('/dashboard/metrics', controller.getMetrics);

  return router;
};

export default buildDashboardRoutes;
