import { Checklist, LoanDocument, Priority, Status } from '../models/loan';

const REQUIRED_CHECKLIST_FIELDS: Array<keyof Checklist> = [
  'idVerified',
  'collateralSigned',
  'sanctionsCleared',
  'kycVerified',
  'creditScoreVerified'
];

export const ACTIVE_STATUSES: Status[] = ['awaiting_disbursement', 'processing', 'on_hold'];

const PRIORITY_WEIGHT: Record<Priority, number> = {
  high_value: 3,
  urgent: 2,
  normal: 1
};

export const extractMentions = (message: string): string[] => {
  const matches = message.match(/@([a-zA-Z0-9_]+)/g);
  return matches ? matches.map((entry) => entry.slice(1)) : [];
};

export const allChecklistChecksPassed = (checklist?: Partial<Checklist>): boolean =>
  REQUIRED_CHECKLIST_FIELDS.every((field) => checklist?.[field] === true);

export const pushStatusHistory = (
  loan: LoanDocument,
  nextStatus: Status,
  actor: string
): void => {
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

export const sortByPriorityThenSubmission = (loans: LoanDocument[]): LoanDocument[] =>
  [...loans].sort((a, b) => {
    const weightDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    if (weightDiff !== 0) {
      return weightDiff;
    }

    return a.submittedAt.getTime() - b.submittedAt.getTime();
  });

export const formatLoanForQueue = (loan: LoanDocument) => ({
  id: loan.id,
  instruction: loan.instruction,
  priority: loan.priority,
  status: loan.status,
  ownershipState: loan.assignee ? 'assigned' : 'unassigned',
  assignee: loan.assignee,
  submittedAt: loan.submittedAt,
  updatedAt: loan.updatedAt
});
