import { Router } from 'express';
import healthRoutes from '@/domains/system/health.routes';
import adminRoutes from '@/domains/admin/admin.routes';
import userRoutes from '@/domains/user/user.routes';

const router = Router();

// System routes
router.use(healthRoutes);

// Admin routes
router.use(adminRoutes);

// Domain routes
router.use(userRoutes);

export default router;
