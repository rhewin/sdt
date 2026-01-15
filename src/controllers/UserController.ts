import { Request, Response } from 'express';
import { UserService } from '../services/UserService';
import { CreateUserDto, UpdateUserDto, ApiResponse } from '../types';
import { logError } from '../config/logger';
import { ZodError } from 'zod';

export class UserController {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  async createUser(req: Request, res: Response): Promise<void> {
    const trace_id = (req as Request & { trace_id: string }).trace_id;

    try {
      const userData: CreateUserDto = req.body;
      const user = await this.userService.createUser(userData);

      const response: ApiResponse = {
        success: true,
        data: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          birthDate: user.birthDate,
          timezone: user.timezone,
          createdAt: user.createdAt,
        },
        trace_id,
      };

      res.status(201).json(response);
    } catch (error) {
      this.handleError(error, req, res, trace_id);
    }
  }

  async getUser(req: Request, res: Response): Promise<void> {
    const trace_id = (req as Request & { trace_id: string }).trace_id;

    try {
      const { id } = req.params;
      const user = await this.userService.getUserById(id);

      const response: ApiResponse = {
        success: true,
        data: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          birthDate: user.birthDate,
          timezone: user.timezone,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        trace_id,
      };

      res.status(200).json(response);
    } catch (error) {
      this.handleError(error, req, res, trace_id);
    }
  }

  async updateUser(req: Request, res: Response): Promise<void> {
    const trace_id = (req as Request & { trace_id: string }).trace_id;

    try {
      const { id } = req.params;
      const userData: UpdateUserDto = req.body;
      const user = await this.userService.updateUser(id, userData);

      const response: ApiResponse = {
        success: true,
        data: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          birthDate: user.birthDate,
          timezone: user.timezone,
          updatedAt: user.updatedAt,
        },
        trace_id,
      };

      res.status(200).json(response);
    } catch (error) {
      this.handleError(error, req, res, trace_id);
    }
  }

  async deleteUser(req: Request, res: Response): Promise<void> {
    const trace_id = (req as Request & { trace_id: string }).trace_id;

    try {
      const { id } = req.params;
      await this.userService.deleteUser(id);

      const response: ApiResponse = {
        success: true,
        data: { message: 'User deleted successfully' },
        trace_id,
      };

      res.status(200).json(response);
    } catch (error) {
      this.handleError(error, req, res, trace_id);
    }
  }

  private handleError(error: unknown, req: Request, res: Response, trace_id: string): void {
    if (error instanceof ZodError) {
      logError(trace_id, new Error('Validation error'), {
        path: req.path,
        errors: error.errors,
      });

      const response: ApiResponse = {
        success: false,
        error: 'Validation error: ' + error.errors.map(e => e.message).join(', '),
        trace_id,
      };

      res.status(400).json(response);
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

      const response: ApiResponse = {
        success: false,
        error: error.message,
        trace_id,
      };

      res.status(statusCode).json(response);
    } else {
      logError(trace_id, new Error('Unknown error'), { path: req.path });

      const response: ApiResponse = {
        success: false,
        error: 'An unexpected error occurred',
        trace_id,
      };

      res.status(500).json(response);
    }
  }
}
