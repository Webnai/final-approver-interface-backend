const express = require('express');
const mongoose = require('mongoose');
const Loan = require('./models/loan');

const REQUIRED_CHECKLIST_FIELDS = [
  'idVerified',
  'collateralSigned',
  'sanctionsCleared',
  'kycVerified',
  'creditScoreVerified'
];

const ACTIVE_STATUSES = ['awaiting_disbursement', 'processing', 'on_hold'];

const extractMentions = (message) => {
  const matches = message.match(/@([a-zA-Z0-9_]+)/g);
  return matches ? matches.map((entry) => entry.slice(1)) : [];
};

const allChecklistChecksPassed = (checklist) =>
  REQUIRED_CHECKLIST_FIELDS.every((field) => checklist?.[field] === true);

const buildApp = () => {
  const app = express();
  app.use(express.json());

  app.post('/api/loans/instructions', async (req, res) => {
    const { instruction, checklist, priority = 'normal', documents = [] } = req.body;

    if (!instruction || !checklist || !allChecklistChecksPassed(checklist)) {
      return res.status(400).json({
        error:
          'All mandatory checklist items must be confirmed before submission.'
      });
    }

    const loan = await Loan.create({
      instruction,
      checklist,
      priority,
      documents,
      instructionLocked: true,
      status: 'awaiting_disbursement',
      assignee: null
    });

    return res.status(201).json(loan);
  });

  app.get('/api/loans/queue', async (req, res) => {
    const { status } = req.query;

    if (status === 'unassigned') {
      const unassigned = await Loan.find({
        status: 'awaiting_disbursement',
        assignee: null
      }).sort({ submittedAt: 1 });
      return res.json(unassigned);
    }

    const loans = await Loan.find({}).sort({ submittedAt: 1 });
    return res.json(loans);
  });

  app.post('/api/loans/:id/claim', async (req, res) => {
    const { officerName } = req.body;
    if (!officerName) {
      return res.status(400).json({ error: 'officerName is required.' });
    }

    const loan = await Loan.findById(req.params.id);

    if (!loan) {
      return res.status(404).json({ error: 'Loan not found.' });
    }

    if (loan.assignee && loan.assignee !== officerName) {
      return res.status(409).json({
        error: `Loan already claimed by ${loan.assignee}.`
      });
    }

    loan.assignee = officerName;
    loan.status = 'processing';
    await loan.save();

    return res.json(loan);
  });

  app.patch('/api/loans/:id/instruction', async (req, res) => {
    const loan = await Loan.findById(req.params.id);

    if (!loan) {
      return res.status(404).json({ error: 'Loan not found.' });
    }

    if (loan.instructionLocked) {
      return res.status(403).json({
        error: 'Instruction is locked after final approver submission.'
      });
    }

    Object.assign(loan.instruction, req.body.instruction || {});
    await loan.save();

    return res.json(loan);
  });

  app.get('/api/loans/:id/package', async (req, res) => {
    const loan = await Loan.findById(req.params.id);

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
        amount: loan.instruction.amount
      },
      documents: loan.documents,
      transactionReference: loan.transactionReference
    });
  });

  app.post('/api/loans/:id/comments', async (req, res) => {
    const { author, message } = req.body;
    if (!author || !message) {
      return res.status(400).json({ error: 'author and message are required.' });
    }

    const loan = await Loan.findById(req.params.id);
    if (!loan) {
      return res.status(404).json({ error: 'Loan not found.' });
    }

    loan.comments.push({
      author,
      message,
      mentions: extractMentions(message)
    });
    await loan.save();

    return res.status(201).json(loan.comments[loan.comments.length - 1]);
  });

  app.post('/api/loans/:id/return', async (req, res) => {
    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({ error: 'reason is required.' });
    }

    const loan = await Loan.findById(req.params.id);

    if (!loan) {
      return res.status(404).json({ error: 'Loan not found.' });
    }

    loan.status = 'action_required';
    loan.assignee = null;
    loan.returnedReason = reason;
    await loan.save();

    return res.json(loan);
  });

  app.patch('/api/loans/:id/hold', async (req, res) => {
    const loan = await Loan.findById(req.params.id);

    if (!loan) {
      return res.status(404).json({ error: 'Loan not found.' });
    }

    loan.status = 'on_hold';
    await loan.save();

    return res.json(loan);
  });

  app.post('/api/loans/:id/complete', async (req, res) => {
    const { transactionReference } = req.body;

    if (!transactionReference) {
      return res.status(400).json({
        error: 'transactionReference is required to close the loop.'
      });
    }

    const loan = await Loan.findById(req.params.id);

    if (!loan) {
      return res.status(404).json({ error: 'Loan not found.' });
    }

    loan.transactionReference = transactionReference;
    loan.status = 'completed';
    loan.completedAt = new Date();
    await loan.save();

    return res.json(loan);
  });

  app.get('/api/supervisor/capacity', async (_req, res) => {
    const capacity = await Loan.aggregate([
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
  });

  app.get('/api/dashboard/metrics', async (_req, res) => {
    const [pendingTotals, completed, stale] = await Promise.all([
      Loan.aggregate([
        {
          $match: {
            status: { $in: ACTIVE_STATUSES }
          }
        },
        { $group: { _id: null, total: { $sum: '$instruction.amount' } } }
      ]),
      Loan.find({ status: 'completed' }),
      Loan.find({
        status: { $in: ACTIVE_STATUSES },
        updatedAt: { $lte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }).sort({ updatedAt: 1 })
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
      staleApplications: stale.map((loan) => ({
        id: loan.id,
        loanReference: loan.instruction.loanReference,
        status: loan.status,
        lastUpdatedAt: loan.updatedAt
      }))
    });
  });

  app.use((error, _req, res, _next) => {
    if (error instanceof mongoose.Error.ValidationError) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
};

module.exports = { buildApp, extractMentions, allChecklistChecksPassed };
