import { Router } from 'express';
import { healthController } from '@/controllers/HealthController';
import { ManualController } from '@/controllers/ManualController';
import userRoutes from './routes/userRoutes';

const router = Router();

router.get('/health', (req, res) => {
  return healthController(req, res)
});

router.post('/manual/send-birthday-message', (req, res) => {
  const manualController = new ManualController();
  return manualController.sendPendingMessages(req, res)
});

// Register sub-routes
router.use(userRoutes);

export default router;
