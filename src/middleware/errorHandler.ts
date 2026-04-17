import { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';

const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): Response => {
  if (error instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(500).json({ error: 'Internal server error.' });
};

export default errorHandler;
