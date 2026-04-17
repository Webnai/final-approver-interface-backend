import { NextFunction, Request, Response } from 'express';
import authenticateApiRequest from '../src/middleware/authenticateApiRequest';

describe('authenticateApiRequest middleware', () => {
  it('rejects bearer authorization when token is empty', async () => {
    const middleware = authenticateApiRequest({
      requireAuth: true,
      tokenVerifier: jest.fn()
    });

    const req = {
      header: jest.fn().mockReturnValue('Bearer ')
    } as unknown as Request;

    const res = {
      locals: {},
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    } as unknown as Response;

    const next = jest.fn() as unknown as NextFunction;

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing bearer token.' });
    expect(next).not.toHaveBeenCalled();
  });
});
