import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { CreateUserDto, UpdateUserDto } from '@/shared/types';
import { jsonOk, jsonError } from '@/shared/output';
import { logError } from '@/config/logger';
import { UserService } from './user.service';

export class UserController {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  createUser = async (req: Request, res: Response): Promise<void> => {
    const trace_id = (req as Request & { trace_id: string }).trace_id;

    try {
      const userData: CreateUserDto = req.body;
      const user = await this.userService.createUser(userData);

      jsonOk(res, 'User created successfully', 201, {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        birthDate: user.birthDate,
        timezone: user.timezone,
        createdAt: user.createdAt,
      });
    } catch (error) {
      this.handleError(error, req, res, trace_id);
    }
  };

  getUser = async (req: Request, res: Response): Promise<void> => {
    const trace_id = (req as Request & { trace_id: string }).trace_id;

    try {
      const { id } = req.params;
      const user = await this.userService.getUserById(id);

      jsonOk(res, 'User retrieved successfully', 200, {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        birthDate: user.birthDate,
        timezone: user.timezone,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    } catch (error) {
      this.handleError(error, req, res, trace_id);
    }
  };

  updateUser = async (req: Request, res: Response): Promise<void> => {
    const trace_id = (req as Request & { trace_id: string }).trace_id;

    try {
      const { id } = req.params;
      const userData: UpdateUserDto = req.body;
      const user = await this.userService.updateUser(id, userData);

      jsonOk(res, 'User updated successfully', 200, {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        birthDate: user.birthDate,
        timezone: user.timezone,
        updatedAt: user.updatedAt,
      });
    } catch (error) {
      this.handleError(error, req, res, trace_id);
    }
  };

  deleteUser = async (req: Request, res: Response): Promise<void> => {
    const trace_id = (req as Request & { trace_id: string }).trace_id;

    try {
      const { id } = req.params;
      await this.userService.deleteUser(id);

      jsonOk(res, 'User deleted successfully', 200);
    } catch (error) {
      this.handleError(error, req, res, trace_id);
    }
  };

  private handleError = (error: unknown, req: Request, res: Response, trace_id: string): void => {
    if (error instanceof ZodError) {
      logError(trace_id, new Error('Validation error'), {
        path: req.path,
        errors: error.errors,
      });

      jsonError(res, 'Validation error: ' + error.errors.map(e => e.message).join(', '), 400);
    } else if (error instanceof Error) {
      logError(trace_id, error, { path: req.path });

      let statusCode = 500;
      if (error.message.includes('not found')) {
        statusCode = 404;
      } else if (error.message.includes('already exists')) {
        statusCode = 409;
      } else if (error.message.includes('Invalid')) {
        statusCode = 400;
      }

      jsonError(res, error.message, statusCode);
    } else {
      logError(trace_id, new Error('Unknown error'), { path: req.path });

      jsonError(res, 'An unexpected error occurred', 500);
    }
  };
}
