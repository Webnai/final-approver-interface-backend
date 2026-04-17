import { Request, Response } from 'express';
import { AppDependencies } from '../types/app';
import { ACTIVE_STATUSES } from '../services/loanWorkflow';

export const createDashboardController = ({ loanModel, now }: AppDependencies) => {
  const getMetrics = async (req: Request, res: Response) => {
    const staleHours = Number(req.query.staleHours ?? 24);
    const staleThreshold = new Date(now().getTime() - staleHours * 60 * 60 * 1000);
    const startOfToday = new Date(now());
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    const [pendingTotals, completed, stale, submittedToday] = await Promise.all([
      loanModel.aggregate([
        {
          $match: {
            status: { $in: ACTIVE_STATUSES }
          }
        },
        { $group: { _id: null, total: { $sum: '$instruction.amount' } } }
      ]),
      loanModel.find({ status: 'completed' }),
      loanModel
        .find({
          status: { $in: ACTIVE_STATUSES },
          updatedAt: { $lte: staleThreshold }
        })
        .sort({ updatedAt: 1 }),
      loanModel.find({
        submittedAt: { $gte: startOfToday, $lt: startOfTomorrow }
      })
    ]);

    const pendingTotal = pendingTotals[0]?.total ?? 0;

    const tatHours =
      completed.length === 0
        ? 0
        : completed.reduce((acc, loan) => {
            const endTime = loan.completedAt || loan.updatedAt;
            return acc + (endTime.getTime() - loan.submittedAt.getTime());
          }, 0) /
          completed.length /
          (1000 * 60 * 60);

    return res.json({
      totalPendingDisbursement: pendingTotal,
      averageTurnaroundHours: Number(tatHours.toFixed(2)),
      processingToday: submittedToday.length,
      staleHoursThreshold: staleHours,
      staleApplications: stale.map((loan) => ({
        id: loan.id,
        loanReference: loan.instruction.loanReference,
        priority: loan.priority,
        status: loan.status,
        lastUpdatedAt: loan.updatedAt
      }))
    });
  };

  return {
    getMetrics
  };
};
