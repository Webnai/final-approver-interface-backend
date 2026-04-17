import { Request, Response } from 'express';
import { AuthenticatedUser } from '../types/app';

export const createProfileController = () => {
  const getCurrentUser = (_req: Request, res: Response) => {
    const currentUser = res.locals.currentUser as AuthenticatedUser | undefined;

    if (!currentUser) {
      return res.status(401).json({ error: 'Not authenticated.' });
    }

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
