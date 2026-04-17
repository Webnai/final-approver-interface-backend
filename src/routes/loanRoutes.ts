import { Router } from 'express';
import { createLoanController } from '../controllers/loanController';
import { AppDependencies } from '../types/app';

const buildLoanRoutes = (dependencies: AppDependencies) => {
  const router = Router();
  const controller = createLoanController(dependencies);

  router.post('/loans/instructions', controller.createInstruction);
  router.get('/loans/queue', controller.getQueue);
  router.post('/loans/:id/claim', controller.claimTask);
  router.patch('/loans/:id/instruction', controller.updateInstruction);
  router.get('/loans/:id/package', controller.getPackage);
  router.get('/loans/:id/status-breadcrumbs', controller.getStatusBreadcrumbs);
  router.post('/loans/:id/comments', controller.addComment);
  router.post('/loans/:id/return', controller.returnToApprover);
  router.patch('/loans/:id/hold', controller.putOnHold);
  router.post('/loans/:id/complete', controller.completeLoan);

  return router;
};

export default buildLoanRoutes;
