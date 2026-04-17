"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatLoanForQueue = exports.sortByPriorityThenSubmission = exports.pushStatusHistory = exports.allChecklistChecksPassed = exports.extractMentions = exports.ACTIVE_STATUSES = void 0;
const REQUIRED_CHECKLIST_FIELDS = [
    'idVerified',
    'collateralSigned',
    'sanctionsCleared',
    'kycVerified',
    'creditScoreVerified'
];
exports.ACTIVE_STATUSES = ['awaiting_disbursement', 'processing', 'on_hold'];
const PRIORITY_WEIGHT = {
    high_value: 3,
    urgent: 2,
    normal: 1
};
const extractMentions = (message) => {
    const matches = message.match(/@([a-zA-Z0-9_]+)/g);
    return matches ? matches.map((entry) => entry.slice(1)) : [];
};
exports.extractMentions = extractMentions;
const allChecklistChecksPassed = (checklist) => REQUIRED_CHECKLIST_FIELDS.every((field) => checklist?.[field] === true);
exports.allChecklistChecksPassed = allChecklistChecksPassed;
const pushStatusHistory = (loan, nextStatus, actor) => {
    const previous = loan.statusHistory[loan.statusHistory.length - 1];
    if (previous?.status === nextStatus) {
        return;
    }
    loan.statusHistory.push({
        status: nextStatus,
        changedBy: actor,
        changedAt: new Date()
    });
};
exports.pushStatusHistory = pushStatusHistory;
const sortByPriorityThenSubmission = (loans) => [...loans].sort((a, b) => {
    const weightDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    if (weightDiff !== 0) {
        return weightDiff;
    }
    return a.submittedAt.getTime() - b.submittedAt.getTime();
});
exports.sortByPriorityThenSubmission = sortByPriorityThenSubmission;
const formatLoanForQueue = (loan) => ({
    id: loan.id,
    instruction: loan.instruction,
    priority: loan.priority,
    status: loan.status,
    ownershipState: loan.assignee ? 'assigned' : 'unassigned',
    assignee: loan.assignee,
    submittedAt: loan.submittedAt,
    updatedAt: loan.updatedAt
});
exports.formatLoanForQueue = formatLoanForQueue;
