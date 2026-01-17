import { Router } from 'express';
import { AdminController } from './admin.controller';

const router = Router();
const manualController = new AdminController();

router.post('/manual/send-birthday-message', (req, res) => {
  return manualController.sendPendingMessages(req, res);
});

export default router;
