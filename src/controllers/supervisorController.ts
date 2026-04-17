import { Request, Response } from 'express';
import logger from '../logging/logger';
import { AppDependencies } from '../types/app';

export const createSupervisorController = ({ loanModel }: AppDependencies) => {
  const getCapacity = async (_req: Request, res: Response) => {
    logger.info({ action: 'supervisor_capacity_fetch' }, 'Supervisor capacity requested.');
    const capacity = await loanModel.aggregate([
      {
        $match: {
          assignee: { $ne: null },
          status: { $in: ['processing', 'on_hold'] }
        }
      },
      {
        $group: {
          _id: '$assignee',
          activeFiles: { $sum: 1 }
        }
      },
      { $project: { _id: 0, officer: '$_id', activeFiles: 1 } },
      { $sort: { activeFiles: -1, officer: 1 } }
    ]);

    return res.json(capacity);
  };

  return {
    getCapacity
  };
};
