import { LoanModel } from '../models/loan';

export type RateLimitConfig = {
  windowMs: number;
  maxRequests: number;
};

export type AppDependencies = {
  loanModel: LoanModel;
  now: () => Date;
};

export type BuildAppOptions = {
  rateLimit?: RateLimitConfig;
  loanModel?: LoanModel;
  now?: () => Date;
};
