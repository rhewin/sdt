import { Router } from 'express';
import { UserController } from './user.controller';

const router = Router();

// Lazy initialization - controller is created when route is hit, not at module import time
let userController: UserController;
const getController = () => {
  if (!userController) {
    userController = new UserController();
  }
  return userController;
};

// POST /user - Create user
router.post('/user', (req, res) => getController().createUser(req, res));

// GET /user/:id - Get user by ID
router.get('/user/:id', (req, res) => getController().getUser(req, res));

// PUT /user/:id - Update user
router.put('/user/:id', (req, res) => getController().updateUser(req, res));

// DELETE /user/:id - Delete user (soft delete)
router.delete('/user/:id', (req, res) => getController().deleteUser(req, res));

export default router;
