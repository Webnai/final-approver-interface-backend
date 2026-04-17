import { Request, Response } from 'express';
import logger from '../logging/logger';
import { Checklist, LoanDocument, Priority } from '../models/loan';
import { AppDependencies } from '../types/app';
import {
  allChecklistChecksPassed,
  extractMentions,
  formatLoanForQueue,
  pushStatusHistory,
  sortByPriorityThenSubmission
} from '../services/loanWorkflow';

const STATUS_ALIASES: Record<string, string> = {
  'action-required': 'action_required',
  'in-progress': 'processing',
  'on-hold': 'on_hold',
  'awaiting-disbursement': 'awaiting_disbursement'
};

const normalizePriority = (value?: string): Priority | undefined => {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'highvalue') {
    return 'high_value';
  }

  if (normalized === 'normal' || normalized === 'urgent' || normalized === 'high_value') {
    return normalized;
  }

  return undefined;
};

const toBool = (value: unknown): boolean => value === true || value === 'true';

const normalizeChecklist = (value?: Record<string, unknown>): Checklist | undefined => {
  if (!value) {
    return undefined;
  }

  return {
    idVerified: toBool(value.idVerified ?? value.id_verified),
    collateralSigned: toBool(value.collateralSigned ?? value.collateralDocumentationSigned),
    sanctionsCleared: toBool(value.sanctionsCleared ?? value.sanctionsCheckCleared),
    kycVerified: toBool(value.kycVerified ?? value.kycCompleted),
    creditScoreVerified: toBool(value.creditScoreVerified ?? value.creditScoreChecked)
  };
};

const normalizeInstruction = (
  value?: Partial<LoanDocument['instruction']> & Record<string, unknown>
): LoanDocument['instruction'] | undefined => {
  if (!value) {
    return undefined;
  }

  const pickFirstDefined = (source: Record<string, unknown>, keys: string[]): unknown => {
    for (const key of keys) {
      const candidate = source[key];
      if (candidate !== undefined && candidate !== null) {
        return candidate;
      }
    }
    return undefined;
  };

  const normalizeString = (input: unknown): string => String(input ?? '').trim();

  const normalized = {
    beneficiaryName: normalizeString(pickFirstDefined(value, ['beneficiaryName', 'beneficiary'])),
    accountNumber: normalizeString(pickFirstDefined(value, ['accountNumber', 'accountNo'])),
    bankCode: normalizeString(pickFirstDefined(value, ['bankCode', 'swiftCode'])),
    amount:
      typeof value.amount === 'number'
        ? value.amount
        : Number(String(value.amount ?? '').trim() || Number.NaN),
    loanReference: normalizeString(pickFirstDefined(value, ['loanReference', 'loanReferenceId', 'loanId']))
  };

  if (
    !normalized.beneficiaryName ||
    !normalized.accountNumber ||
    !normalized.bankCode ||
    Number.isNaN(normalized.amount) ||
    !normalized.loanReference
  ) {
    return undefined;
  }

  return normalized;
};

const normalizeQueueStatus = (status?: string): string | undefined => {
  if (!status) {
    return undefined;
  }

  return STATUS_ALIASES[status] || status;
};

export const createLoanController = ({ loanModel, now }: AppDependencies) => {
  const createInstruction = async (req: Request, res: Response) => {
    const {
      instruction: rawInstruction,
      checklist: rawChecklist,
      priority: rawPriority = 'normal',
      documents = [],
      finalApproverName = 'Final Approver'
    } = req.body as {
      instruction?: Partial<LoanDocument['instruction']> & Record<string, unknown>;
      checklist?: Checklist | Record<string, unknown>;
      priority?: string;
      documents?: string[];
      finalApproverName?: string;
    };

    const instruction = normalizeInstruction(rawInstruction);
    const checklist = normalizeChecklist(rawChecklist as Record<string, unknown> | undefined);
    const priority = normalizePriority(rawPriority);

    logger.info({ action: 'create_instruction_attempt', priority, finalApproverName }, 'Loan instruction submission received.');

    if (!instruction) {
      return res.status(400).json({
        error: 'instruction must include beneficiaryName, accountNumber, bankCode, amount, and loanReference.'
      });
    }

    if (!checklist || !allChecklistChecksPassed(checklist)) {
      return res.status(400).json({
        error: 'All mandatory checklist items must be confirmed before submission.'
      });
    }

    if (!priority) {
      return res.status(400).json({
        error: 'priority must be one of: normal, urgent, high_value.'
      });
    }

    const loan = await loanModel.create({
      instruction,
      checklist,
      priority,
      documents,
      instructionLocked: true,
      status: 'awaiting_disbursement',
      assignee: null,
      statusHistory: [
        {
          status: 'awaiting_disbursement',
          changedBy: finalApproverName,
          changedAt: now()
        }
      ]
    });

    logger.info({ action: 'create_instruction_success', loanId: loan.id, priority: loan.priority }, 'Loan instruction created.');

    return res.status(201).json(loan);
  };

  const getQueue = async (req: Request, res: Response) => {
    const { status: rawStatus } = req.query as { status?: string };
    const status = normalizeQueueStatus(rawStatus);
    logger.info({ action: 'queue_fetch', status: status || 'all' }, 'Queue fetch requested.');

    if (status === 'unassigned') {
      const unassigned = await loanModel
        .find({
          status: 'awaiting_disbursement',
          assignee: null
        })
        .sort({ submittedAt: 1 });

      return res.json(sortByPriorityThenSubmission(unassigned).map(formatLoanForQueue));
    }

    const query: Record<string, unknown> = {};
    if (status && status !== 'all') {
      if (rawStatus === 'in-progress') {
        query.status = { $in: ['awaiting_disbursement', 'processing'] };
      } else {
        query.status = status;
      }
    }

    const loans = await loanModel.find(query).sort({ submittedAt: 1 });
    return res.json(sortByPriorityThenSubmission(loans).map(formatLoanForQueue));
  };

  const claimTask = async (req: Request, res: Response) => {
    const { officerName } = req.body as { officerName?: string };
    logger.info({ action: 'claim_task_attempt', loanId: req.params.id, officerName }, 'Loan claim requested.');
    if (!officerName) {
      return res.status(400).json({ error: 'officerName is required.' });
    }

    const loan = await loanModel.findById(req.params.id);

    if (!loan) {
      return res.status(404).json({ error: 'Loan not found.' });
    }

    if (loan.status === 'completed' || loan.status === 'action_required') {
      return res.status(409).json({ error: 'Loan cannot be claimed in its current status.' });
    }

    if (loan.assignee && loan.assignee !== officerName) {
      return res.status(409).json({
        error: `Loan already claimed by ${loan.assignee}.`
      });
    }

    loan.assignee = officerName;
    loan.status = 'processing';
    pushStatusHistory(loan, 'processing', officerName);
    await loan.save();

    logger.info({ action: 'claim_task_success', loanId: loan.id, officerName }, 'Loan claimed successfully.');

    return res.json(loan);
  };

  const updateInstruction = async (req: Request, res: Response) => {
    const { actorRole } = req.body as { actorRole?: string };
    logger.info({ action: 'instruction_update_attempt', loanId: req.params.id, actorRole }, 'Instruction update requested.');

    const loan = await loanModel.findById(req.params.id);

    if (!loan) {
      return res.status(404).json({ error: 'Loan not found.' });
    }

    if (actorRole !== 'final_approver') {
      return res.status(403).json({
        error: 'Only the Final Approver can modify instruction fields.'
      });
    }

    if (loan.instructionLocked && loan.status !== 'action_required') {
      return res.status(403).json({
        error: 'Instruction is locked after final approver submission.'
      });
    }

    Object.assign(
      loan.instruction,
      (req.body as { instruction?: Partial<LoanDocument['instruction']> }).instruction || {}
    );
    loan.status = 'awaiting_disbursement';
    loan.assignee = null;
    pushStatusHistory(loan, 'awaiting_disbursement', 'final_approver');
    await loan.save();

    logger.info({ action: 'instruction_update_success', loanId: loan.id }, 'Instruction updated and re-queued.');

    return res.json(loan);
  };

  const getPackage = async (req: Request, res: Response) => {
    logger.info({ action: 'package_fetch', loanId: req.params.id }, 'Disbursement package requested.');
    const loan = await loanModel.findById(req.params.id);

    if (!loan) {
      return res.status(404).json({ error: 'Loan not found.' });
    }

    return res.json({
      id: loan.id,
      status: loan.status,
      assignee: loan.assignee,
      priority: loan.priority,
      instruction: loan.instruction,
      copyTools: {
        accountNumber: loan.instruction.accountNumber,
        amount: loan.instruction.amount,
        bankCode: loan.instruction.bankCode
      },
      documents: loan.documents,
      transactionReference: loan.transactionReference
    });
  };

  const getStatusBreadcrumbs = async (req: Request, res: Response) => {
    logger.info({ action: 'status_breadcrumbs_fetch', loanId: req.params.id }, 'Loan status breadcrumbs requested.');
    const loan = await loanModel.findById(req.params.id);

    if (!loan) {
      return res.status(404).json({ error: 'Loan not found.' });
    }

    return res.json(loan.statusHistory);
  };

  const addComment = async (req: Request, res: Response) => {
    const { author, message } = req.body as { author?: string; message?: string };
    logger.info({ action: 'comment_add_attempt', loanId: req.params.id, author }, 'Loan comment submission received.');
    if (!author || !message) {
      return res.status(400).json({ error: 'author and message are required.' });
    }

    const loan = await loanModel.findById(req.params.id);
    if (!loan) {
      return res.status(404).json({ error: 'Loan not found.' });
    }

    loan.comments.push({
      author,
      message,
      mentions: extractMentions(message),
      createdAt: now()
    });
    await loan.save();

    logger.info({ action: 'comment_add_success', loanId: loan.id, author }, 'Loan comment created.');

    return res.status(201).json(loan.comments[loan.comments.length - 1]);
  };

  const returnToApprover = async (req: Request, res: Response) => {
    const { reason, officerName } = req.body as { reason?: string; officerName?: string };
    logger.info({ action: 'return_to_approver_attempt', loanId: req.params.id, officerName }, 'Return-to-approver requested.');
    if (!reason) {
      return res.status(400).json({ error: 'reason is required.' });
    }

    const loan = await loanModel.findById(req.params.id);

    if (!loan) {
      return res.status(404).json({ error: 'Loan not found.' });
    }

    if (loan.assignee && officerName && loan.assignee !== officerName) {
      return res.status(403).json({
        error: `Only assigned officer ${loan.assignee} can return this file.`
      });
    }

    loan.status = 'action_required';
    loan.assignee = null;
    loan.returnedReason = reason;
    pushStatusHistory(loan, 'action_required', officerName || 'disbursement_officer');
    await loan.save();

    logger.info({ action: 'return_to_approver_success', loanId: loan.id, officerName }, 'Loan returned to approver.');

    return res.json(loan);
  };

  const putOnHold = async (req: Request, res: Response) => {
    const { officerName } = req.body as { officerName?: string };
    logger.info({ action: 'hold_attempt', loanId: req.params.id, officerName }, 'On-hold operation requested.');
    const loan = await loanModel.findById(req.params.id);

    if (!loan) {
      return res.status(404).json({ error: 'Loan not found.' });
    }

    if (!officerName || loan.assignee !== officerName) {
      return res.status(403).json({
        error: 'Only the assigned officer can place a loan on hold.'
      });
    }

    loan.status = 'on_hold';
    pushStatusHistory(loan, 'on_hold', officerName);
    await loan.save();

    logger.info({ action: 'hold_success', loanId: loan.id, officerName }, 'Loan placed on hold.');

    return res.json(loan);
  };

  const completeLoan = async (req: Request, res: Response) => {
    const { transactionReference, officerName, finalApproverName = 'Final Approver' } = req.body as {
      transactionReference?: string;
      officerName?: string;
      finalApproverName?: string;
    };

    logger.info({ action: 'complete_attempt', loanId: req.params.id, officerName }, 'Loan completion requested.');

    if (!transactionReference) {
      return res.status(400).json({
        error: 'transactionReference is required to close the loop.'
      });
    }

    const loan = await loanModel.findById(req.params.id);

    if (!loan) {
      return res.status(404).json({ error: 'Loan not found.' });
    }

    if (!officerName || loan.assignee !== officerName) {
      return res.status(403).json({ error: 'Only the assigned officer can complete this task.' });
    }

    loan.transactionReference = transactionReference;
    loan.status = 'completed';
    loan.completedAt = now();
    loan.notifications.push({
      recipient: finalApproverName,
      type: 'disbursement_completed',
      message: `Loan ${loan.instruction.loanReference} has been successfully disbursed by Officer ${officerName}.`,
      createdAt: now()
    });
    pushStatusHistory(loan, 'completed', officerName);
    await loan.save();

    logger.info(
      { action: 'complete_success', loanId: loan.id, officerName, transactionReference },
      'Loan marked as completed.'
    );

    return res.json(loan);
  };

  return {
    createInstruction,
    getQueue,
    claimTask,
    updateInstruction,
    getPackage,
    getStatusBreadcrumbs,
    addComment,
    returnToApprover,
    putOnHold,
    completeLoan
  };
};
