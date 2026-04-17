import { Router } from 'express';
import { createSupervisorController } from '../controllers/supervisorController';
import { AppDependencies } from '../types/app';

const buildSupervisorRoutes = (dependencies: AppDependencies) => {
  const router = Router();
  const controller = createSupervisorController(dependencies);

  router.get('/supervisor/capacity', controller.getCapacity);

  return router;
};

export default buildSupervisorRoutes;
