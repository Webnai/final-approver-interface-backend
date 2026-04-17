import { Router } from 'express';

const healthRoutes = Router();

healthRoutes.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

export default healthRoutes;
