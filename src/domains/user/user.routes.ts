import { Router } from 'express';
import { UserController } from './user.controller';

const router = Router();
const userController = new UserController();

// POST /user - Create user
router.post('/user', (req, res) => userController.createUser(req, res));

// GET /user/:id - Get user by ID
router.get('/user/:id', (req, res) => userController.getUser(req, res));

// PUT /user/:id - Update user
router.put('/user/:id', (req, res) => userController.updateUser(req, res));

// DELETE /user/:id - Delete user (soft delete)
router.delete('/user/:id', (req, res) => userController.deleteUser(req, res));

export default router;
