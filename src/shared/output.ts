import { Response } from 'express';

export const jsonOk = <T>(res: Response, message = 'success', code = 200, data?: T): void => {
  res.status(code).json({
    success: true,
    message,
    data,
  });
};

export const jsonError = (res: Response, message: string, code: number): void => {
  res.status(code).json({
    success: false,
    message,
    error: {
      code,
    },
  });
};
