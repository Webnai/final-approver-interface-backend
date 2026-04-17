import { NextFunction, Request, Response } from 'express';
import logger from '../logging/logger';
import { AuthConfig } from '../types/app';

const AUTH_SCHEME = 'Bearer ';

const authenticateApiRequest = ({ requireAuth, tokenVerifier }: AuthConfig) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!requireAuth) {
      next();
      return;
    }

    if (!tokenVerifier) {
      logger.error({ path: req.path }, 'Authentication is enabled but token verifier is not configured.');
      res.status(500).json({ error: 'Authentication is not configured.' });
      return;
    }

    const authorization = req.header('authorization') || '';
    if (!authorization.startsWith(AUTH_SCHEME)) {
      logger.warn({ path: req.path }, 'Request rejected due to missing or invalid authorization header.');
      res.status(401).json({ error: 'Missing or invalid Authorization header.' });
      return;
    }

    const idToken = authorization.slice(AUTH_SCHEME.length).trim();
    if (!idToken) {
      logger.warn({ path: req.path }, 'Request rejected due to missing bearer token.');
      res.status(401).json({ error: 'Missing bearer token.' });
      return;
    }

    try {
      res.locals.currentUser = await tokenVerifier(idToken);
      logger.info({ path: req.path, uid: res.locals.currentUser.uid }, 'Request authenticated successfully.');
      next();
    } catch (error) {
      const authError = error as { code?: string; message?: string };
      logger.warn(
        {
          path: req.path,
          authErrorCode: authError.code || 'unknown',
          authErrorMessage: authError.message || 'Unknown auth verification error.'
        },
        'Request rejected due to invalid or expired token.'
      );
      res.status(401).json({ error: 'Invalid or expired authentication token.' });
    }
  };
};

export default authenticateApiRequest;