import { Router } from 'express';
import { healthController } from './health.controller';

const router = Router();

router.get('/health', (req, res) => {
  return healthController(req, res);
});

export default router;
