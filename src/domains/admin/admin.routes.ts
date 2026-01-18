import { Router } from 'express';
import { AdminController } from './admin.controller';

const router = Router();

// Lazy initialization - controller is created when route is hit, not at module import time
let manualController: AdminController;
const getController = () => {
  if (!manualController) {
    manualController = new AdminController();
  }
  return manualController;
};

router.post('/manual/send-birthday-message', (req, res) => {
  return getController().sendPendingMessages(req, res);
});

export default router;
