"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDashboardController = void 0;
const loanWorkflow_1 = require("../services/loanWorkflow");
const createDashboardController = ({ loanModel, now }) => {
    const getMetrics = async (req, res) => {
        const staleHours = Number(req.query.staleHours ?? 24);
        const staleThreshold = new Date(now().getTime() - staleHours * 60 * 60 * 1000);
        const [pendingTotals, completed, stale] = await Promise.all([
            loanModel.aggregate([
                {
                    $match: {
                        status: { $in: loanWorkflow_1.ACTIVE_STATUSES }
                    }
                },
                { $group: { _id: null, total: { $sum: '$instruction.amount' } } }
            ]),
            loanModel.find({ status: 'completed' }),
            loanModel
                .find({
                status: { $in: loanWorkflow_1.ACTIVE_STATUSES },
                updatedAt: { $lte: staleThreshold }
            })
                .sort({ updatedAt: 1 })
        ]);
        const pendingTotal = pendingTotals[0]?.total ?? 0;
        const tatHours = completed.length === 0
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
exports.createDashboardController = createDashboardController;
