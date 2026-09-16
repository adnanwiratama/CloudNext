import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction): void => {
  logger.error(`${req.method} ${req.path} - ${err.message}`, err);

  // Postgres unique violation
  if (err.code === '23505') {
    const match = err.detail?.match(/\((.+?)\)=\((.+?)\)/);
    const field = match ? match[1] : 'field';
    const value = match ? match[2] : 'value';
    res.status(409).json({
      success: false,
      error: `A record with this ${field} (${value}) already exists. Please use a different value.`,
    });
    return;
  }

  // Postgres foreign key violation
  if (err.code === '23503') {
    res.status(400).json({
      success: false,
      error: 'This operation references a record that does not exist. Please check your data and try again.',
    });
    return;
  }

  // Postgres not null violation
  if (err.code === '23502') {
    const column = err.column || 'required field';
    res.status(400).json({
      success: false,
      error: `The field "${column}" is required and cannot be empty.`,
    });
    return;
  }

  // Custom app errors
  if (err.isAppError) {
    res.status(err.statusCode || 400).json({
      success: false,
      error: err.message,
    });
    return;
  }

  // Default
  res.status(500).json({
    success: false,
    error: 'An unexpected error occurred. Please try again or contact support.',
    ...(process.env.NODE_ENV === 'development' && { debug: err.message, stack: err.stack }),
  });
};

export class AppError extends Error {
  isAppError = true;
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}
