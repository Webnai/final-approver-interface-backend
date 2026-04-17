import { NextFunction, Request, Response } from 'express';
import { AuthConfig } from '../types/app';

const AUTH_SCHEME = 'Bearer ';

const authenticateApiRequest = ({ requireAuth, tokenVerifier }: AuthConfig) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!requireAuth) {
      next();
      return;
    }

    if (!tokenVerifier) {
      res.status(500).json({ error: 'Authentication is not configured.' });
      return;
    }

    const authorization = req.header('authorization') || '';
    if (!authorization.startsWith(AUTH_SCHEME)) {
      res.status(401).json({ error: 'Missing or invalid Authorization header.' });
      return;
    }

    const idToken = authorization.slice(AUTH_SCHEME.length).trim();
    if (!idToken) {
      res.status(401).json({ error: 'Missing bearer token.' });
      return;
    }

    try {
      res.locals.currentUser = await tokenVerifier(idToken);
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired authentication token.' });
    }
  };
};

export default authenticateApiRequest;