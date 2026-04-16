const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/loan', () => ({
  create: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  aggregate: jest.fn()
}));

const Loan = require('../src/models/loan');
const {
  buildApp,
  extractMentions,
  allChecklistChecksPassed
} = require('../src/app');

const app = buildApp({ rateLimit: { windowMs: 60_000, maxRequests: 1000 } });

const validInstruction = {
  beneficiaryName: 'John Doe',
  accountNumber: '1234567890',
  bankCode: '001',
  amount: 5000,
  loanReference: 'LN-1001'
};

const validChecklist = {
  idVerified: true,
  collateralSigned: true,
  sanctionsCleared: true,
  kycVerified: true,
  creditScoreVerified: true
};

const mockLoanDoc = (overrides = {}) => ({
  id: 'loan-id',
  _id: 'loan-id',
  instruction: { ...validInstruction },
  checklist: { ...validChecklist },
  instructionLocked: true,
  priority: 'normal',
  status: 'awaiting_disbursement',
  assignee: null,
  submittedAt: new Date('2026-01-01T00:00:00.000Z'),
  completedAt: null,
  transactionReference: null,
  returnedReason: null,
  documents: [],
  comments: [],
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  save: jest.fn().mockImplementation(async function saveImpl() {
    return this;
  }),
  ...overrides
});

const withSort = (value) => ({ sort: jest.fn().mockResolvedValue(value) });

describe('workflow backend', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('validates helper functions', () => {
    expect(extractMentions('hello @approver and @ops')).toEqual(['approver', 'ops']);
    expect(extractMentions('no mention')).toEqual([]);

    expect(allChecklistChecksPassed(validChecklist)).toBe(true);
    expect(allChecklistChecksPassed({ ...validChecklist, idVerified: false })).toBe(false);
    expect(allChecklistChecksPassed(undefined)).toBe(false);
  });

  it('uses default build options', async () => {
    const defaultApp = buildApp();
    Loan.find.mockReturnValue(withSort([]));

    const response = await request(defaultApp).get('/api/loans/queue?status=unassigned');
    expect(response.status).toBe(200);
  });

  it('creates loan instruction when mandatory checks are true', async () => {
    Loan.create.mockResolvedValue(mockLoanDoc({ priority: 'urgent' }));

    const invalid = await request(app)
      .post('/api/loans/instructions')
      .send({ instruction: validInstruction, checklist: { ...validChecklist, idVerified: false } });
    expect(invalid.status).toBe(400);

    const created = await request(app)
      .post('/api/loans/instructions')
      .send({ instruction: validInstruction, checklist: validChecklist, priority: 'urgent' });

    expect(created.status).toBe(201);
    expect(Loan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        instructionLocked: true,
        status: 'awaiting_disbursement',
        assignee: null,
        priority: 'urgent'
      })
    );
  });

  it('lists unassigned and full queue', async () => {
    Loan.find.mockReturnValueOnce(withSort([{ id: 'unassigned' }])).mockReturnValueOnce(withSort([{ id: 'all' }]));

    const unassigned = await request(app).get('/api/loans/queue?status=unassigned');
    expect(unassigned.status).toBe(200);
    expect(Loan.find).toHaveBeenNthCalledWith(1, {
      status: 'awaiting_disbursement',
      assignee: null
    });

    const all = await request(app).get('/api/loans/queue');
    expect(all.status).toBe(200);
    expect(Loan.find).toHaveBeenNthCalledWith(2, {});
  });

  it('handles claim workflow cases', async () => {
    const loan = mockLoanDoc();

    const missingOfficer = await request(app).post('/api/loans/loan-id/claim').send({});
    expect(missingOfficer.status).toBe(400);

    Loan.findById.mockResolvedValueOnce(null);
    const notFound = await request(app).post('/api/loans/loan-id/claim').send({ officerName: 'Alice' });
    expect(notFound.status).toBe(404);

    Loan.findById.mockResolvedValueOnce(mockLoanDoc({ assignee: 'Bob' }));
    const conflict = await request(app).post('/api/loans/loan-id/claim').send({ officerName: 'Alice' });
    expect(conflict.status).toBe(409);

    Loan.findById.mockResolvedValue(loan);
    const success = await request(app).post('/api/loans/loan-id/claim').send({ officerName: 'Alice' });
    expect(success.status).toBe(200);
    expect(loan.status).toBe('processing');
    expect(loan.assignee).toBe('Alice');
    expect(loan.save).toHaveBeenCalled();
  });

  it('enforces instruction lock and allows update when unlocked', async () => {
    Loan.findById.mockResolvedValueOnce(null);
    const notFound = await request(app)
      .patch('/api/loans/loan-id/instruction')
      .send({ instruction: { beneficiaryName: 'X' } });
    expect(notFound.status).toBe(404);

    Loan.findById.mockResolvedValueOnce(mockLoanDoc({ instructionLocked: true }));
    const locked = await request(app)
      .patch('/api/loans/loan-id/instruction')
      .send({ instruction: { beneficiaryName: 'X' } });
    expect(locked.status).toBe(403);

    const editable = mockLoanDoc({ instructionLocked: false });
    Loan.findById.mockResolvedValueOnce(editable);
    const updated = await request(app)
      .patch('/api/loans/loan-id/instruction')
      .send({ instruction: { beneficiaryName: 'Updated Name' } });

    expect(updated.status).toBe(200);
    expect(editable.instruction.beneficiaryName).toBe('Updated Name');

    const unchangedWhenMissingInstruction = mockLoanDoc({ instructionLocked: false });
    Loan.findById.mockResolvedValueOnce(unchangedWhenMissingInstruction);
    const noInstructionBody = await request(app).patch('/api/loans/loan-id/instruction').send({});
    expect(noInstructionBody.status).toBe(200);
    expect(unchangedWhenMissingInstruction.instruction.beneficiaryName).toBe('John Doe');
  });

  it('returns a disbursement package and 404 when missing', async () => {
    Loan.findById.mockResolvedValueOnce(null);
    const notFound = await request(app).get('/api/loans/loan-id/package');
    expect(notFound.status).toBe(404);

    Loan.findById.mockResolvedValueOnce(mockLoanDoc({ documents: ['agreement.pdf'] }));
    const result = await request(app).get('/api/loans/loan-id/package');
    expect(result.status).toBe(200);
    expect(result.body.copyTools).toEqual({ accountNumber: '1234567890', amount: 5000 });
    expect(result.body.documents).toEqual(['agreement.pdf']);
  });

  it('handles comments flow', async () => {
    const validation = await request(app).post('/api/loans/loan-id/comments').send({ author: '', message: '' });
    expect(validation.status).toBe(400);

    Loan.findById.mockResolvedValueOnce(null);
    const notFound = await request(app)
      .post('/api/loans/loan-id/comments')
      .send({ author: 'Officer', message: 'ok' });
    expect(notFound.status).toBe(404);

    const loan = mockLoanDoc();
    Loan.findById.mockResolvedValueOnce(loan);
    const created = await request(app)
      .post('/api/loans/loan-id/comments')
      .send({ author: 'Officer', message: 'Please review @finalApprover' });

    expect(created.status).toBe(201);
    expect(created.body.mentions).toEqual(['finalApprover']);
  });

  it('handles return and hold transitions', async () => {
    const missingReason = await request(app).post('/api/loans/loan-id/return').send({});
    expect(missingReason.status).toBe(400);

    Loan.findById.mockResolvedValueOnce(null);
    const returnNotFound = await request(app)
      .post('/api/loans/loan-id/return')
      .send({ reason: 'Account closed' });
    expect(returnNotFound.status).toBe(404);

    const returnLoan = mockLoanDoc({ assignee: 'Alice', status: 'processing' });
    Loan.findById.mockResolvedValueOnce(returnLoan);
    const returned = await request(app)
      .post('/api/loans/loan-id/return')
      .send({ reason: 'Account closed' });
    expect(returned.status).toBe(200);
    expect(returnLoan.status).toBe('action_required');
    expect(returnLoan.assignee).toBeNull();

    Loan.findById.mockResolvedValueOnce(null);
    const holdNotFound = await request(app).patch('/api/loans/loan-id/hold');
    expect(holdNotFound.status).toBe(404);

    const holdLoan = mockLoanDoc({ status: 'processing' });
    Loan.findById.mockResolvedValueOnce(holdLoan);
    const hold = await request(app).patch('/api/loans/loan-id/hold');
    expect(hold.status).toBe(200);
    expect(holdLoan.status).toBe('on_hold');
  });

  it('handles completion flow with mandatory transaction reference', async () => {
    const validation = await request(app).post('/api/loans/loan-id/complete').send({});
    expect(validation.status).toBe(400);

    Loan.findById.mockResolvedValueOnce(null);
    const notFound = await request(app)
      .post('/api/loans/loan-id/complete')
      .send({ transactionReference: 'FT123' });
    expect(notFound.status).toBe(404);

    const loan = mockLoanDoc({ status: 'processing' });
    Loan.findById.mockResolvedValueOnce(loan);
    const completed = await request(app)
      .post('/api/loans/loan-id/complete')
      .send({ transactionReference: 'FT12345678' });

    expect(completed.status).toBe(200);
    expect(loan.status).toBe('completed');
    expect(loan.transactionReference).toBe('FT12345678');
    expect(loan.completedAt).toBeInstanceOf(Date);
  });

  it('computes capacity and dashboard metrics', async () => {
    Loan.aggregate.mockResolvedValueOnce([
      { officer: 'Alice', activeFiles: 2 },
      { officer: 'Bob', activeFiles: 1 }
    ]);

    const capacity = await request(app).get('/api/supervisor/capacity');
    expect(capacity.status).toBe(200);
    expect(capacity.body).toHaveLength(2);

    const completedLoan = mockLoanDoc({
      status: 'completed',
      submittedAt: new Date('2026-01-01T00:00:00.000Z'),
      completedAt: new Date('2026-01-01T02:00:00.000Z')
    });
    const completedLoanWithoutCompletedAt = mockLoanDoc({
      status: 'completed',
      submittedAt: new Date('2026-01-01T00:00:00.000Z'),
      completedAt: null,
      updatedAt: new Date('2026-01-01T01:00:00.000Z')
    });

    const staleLoan = mockLoanDoc({
      id: 'stale-1',
      instruction: { ...validInstruction, loanReference: 'LN-ST-1' },
      status: 'processing',
      updatedAt: new Date('2026-01-02T00:00:00.000Z')
    });

    Loan.aggregate.mockResolvedValueOnce([{ total: 7000 }]);
    Loan.find
      .mockResolvedValueOnce([completedLoan, completedLoanWithoutCompletedAt])
      .mockReturnValueOnce(withSort([staleLoan]));

    const metrics = await request(app).get('/api/dashboard/metrics');
    expect(metrics.status).toBe(200);
    expect(metrics.body.totalPendingDisbursement).toBe(7000);
    expect(metrics.body.averageTurnaroundHours).toBe(1.5);
    expect(metrics.body.staleApplications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'stale-1', loanReference: 'LN-ST-1' })
      ])
    );

    Loan.aggregate.mockResolvedValueOnce([]);
    Loan.find.mockResolvedValueOnce([]).mockReturnValueOnce(withSort([]));
    const emptyMetrics = await request(app).get('/api/dashboard/metrics');
    expect(emptyMetrics.body.totalPendingDisbursement).toBe(0);
    expect(emptyMetrics.body.averageTurnaroundHours).toBe(0);
  });

  it('handles validation and unknown server errors', async () => {
    const validationError = new mongoose.Error.ValidationError();
    Loan.create.mockRejectedValueOnce(validationError);

    const validation = await request(app)
      .post('/api/loans/instructions')
      .send({ instruction: validInstruction, checklist: validChecklist });
    expect(validation.status).toBe(400);

    Loan.find.mockImplementationOnce(() => {
      throw new Error('boom');
    });

    const serverError = await request(app).get('/api/loans/queue?status=unassigned');
    expect(serverError.status).toBe(500);
  });

  it('rate-limits API requests', async () => {
    const limitedApp = buildApp({ rateLimit: { windowMs: 1000, maxRequests: 1 } });

    Loan.find.mockReturnValue(withSort([]));
    const first = await request(limitedApp).get('/api/loans/queue?status=unassigned');
    expect(first.status).toBe(200);

    const blocked = await request(limitedApp).get('/api/loans/queue?status=unassigned');
    expect(blocked.status).toBe(429);
  });
});
