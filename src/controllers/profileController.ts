import { Request, Response } from 'express';
import logger from '../logging/logger';
import { AuthenticatedUser } from '../types/app';

export const createProfileController = () => {
  const getCurrentUser = (_req: Request, res: Response) => {
    const currentUser = res.locals.currentUser as AuthenticatedUser | undefined;

    if (!currentUser) {
      logger.warn({ action: 'profile_fetch_denied' }, 'Profile request rejected because user is not authenticated.');
      return res.status(401).json({ error: 'Not authenticated.' });
    }

    logger.info({ action: 'profile_fetch_success', uid: currentUser.uid }, 'Current user profile returned.');

    return res.json({
      uid: currentUser.uid,
      email: currentUser.email,
      name: currentUser.name,
      picture: currentUser.picture,
      emailVerified: currentUser.emailVerified,
      role: currentUser.role,
      claims: currentUser.claims
    });
  };

  return {
    getCurrentUser
  };
};
