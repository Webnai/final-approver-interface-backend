import { Router } from 'express';
import { createProfileController } from '../controllers/profileController';

const buildProfileRoutes = () => {
  const router = Router();
  const controller = createProfileController();

  router.get('/me', controller.getCurrentUser);

  return router;
};

export default buildProfileRoutes;