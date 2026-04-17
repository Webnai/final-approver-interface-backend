import { LoanModel } from '../models/loan';

export type RateLimitConfig = {
  windowMs: number;
  maxRequests: number;
};

export type AuthenticatedUser = {
  uid: string;
  email: string | null;
  name: string | null;
  picture: string | null;
  emailVerified: boolean;
  role: string | null;
  claims: Record<string, unknown>;
};

export type TokenVerifier = (idToken: string) => Promise<AuthenticatedUser>;

export type AuthConfig = {
  requireAuth: boolean;
  tokenVerifier?: TokenVerifier;
};

export type AppDependencies = {
  loanModel: LoanModel;
  now: () => Date;
};

export type BuildAppOptions = {
  rateLimit?: RateLimitConfig;
  loanModel?: LoanModel;
  now?: () => Date;
  auth?: Partial<AuthConfig>;
};
