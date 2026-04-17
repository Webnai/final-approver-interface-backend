import mongoose from 'mongoose';
import request from 'supertest';
import { allChecklistChecksPassed, buildApp, extractMentions } from '../src/app';
import Loan, { LoanDocument, LoanModel } from '../src/models/loan';

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

const mockLoanDoc = (overrides: Record<string, unknown> = {}): LoanDocument => {
  const doc = {
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
    notifications: [],
    statusHistory: [],
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    save: jest.fn().mockImplementation(async function saveImpl(this: LoanDocument) {
      return this;
    })
  } as unknown as LoanDocument;

  return Object.assign(doc, overrides) as LoanDocument;
};

type MockLoanModel = {
  create: jest.Mock;
  find: jest.Mock;
  findById: jest.Mock;
  aggregate: jest.Mock;
};

const withSort = <T>(value: T) => ({ sort: jest.fn().mockResolvedValue(value) });

const createMockModel = (): MockLoanModel => ({
  create: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  aggregate: jest.fn()
});

describe('workflow backend - typescript', () => {
  let loanModel: MockLoanModel;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    jest.clearAllMocks();
    loanModel = createMockModel();
    app = buildApp({
      loanModel: loanModel as unknown as LoanModel,
      rateLimit: { windowMs: 60_000, maxRequests: 1000 },
      now: () => new Date('2026-01-03T00:00:00.000Z')
    });
  });

  it('provides health endpoint', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('builds with default options', async () => {
    const aggregateSpy = jest.spyOn(Loan, 'aggregate').mockResolvedValueOnce([] as never);
    const findSpy = jest
      .spyOn(Loan, 'find')
      .mockResolvedValueOnce([] as never)
      .mockReturnValueOnce(withSort([]) as never);

    const defaultApp = buildApp();
    const health = await request(defaultApp).get('/health');
    expect(health.status).toBe(200);

    const metrics = await request(defaultApp).get('/api/dashboard/metrics');
    expect(metrics.status).toBe(200);

    aggregateSpy.mockRestore();
    findSpy.mockRestore();
  });

  it('validates helper functions', () => {
    expect(extractMentions('hello @approver and @ops')).toEqual(['approver', 'ops']);
    expect(extractMentions('no mention')).toEqual([]);

    expect(allChecklistChecksPassed(validChecklist)).toBe(true);
    expect(allChecklistChecksPassed({ ...validChecklist, idVerified: false })).toBe(false);
    expect(allChecklistChecksPassed(undefined)).toBe(false);
  });

  it('creates instruction, validates checklist and priority', async () => {
    loanModel.create.mockResolvedValue(mockLoanDoc({ priority: 'urgent' as LoanDocument['priority'] }));

    const invalidChecklist = await request(app)
      .post('/api/loans/instructions')
      .send({ instruction: validInstruction, checklist: { ...validChecklist, idVerified: false } });
    expect(invalidChecklist.status).toBe(400);

    const invalidPriority = await request(app)
      .post('/api/loans/instructions')
      .send({ instruction: validInstruction, checklist: validChecklist, priority: 'critical' });
    expect(invalidPriority.status).toBe(400);

    const created = await request(app)
      .post('/api/loans/instructions')
      .send({
        instruction: validInstruction,
        checklist: validChecklist,
        priority: 'urgent',
        finalApproverName: 'FA1'
      });

    expect(created.status).toBe(201);
    expect(loanModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        instructionLocked: true,
        status: 'awaiting_disbursement',
        assignee: null,
        priority: 'urgent'
      })
    );
    expect(loanModel.create.mock.calls[0][0].statusHistory[0]).toEqual(
      expect.objectContaining({ status: 'awaiting_disbursement', changedBy: 'FA1' })
    );
  });

  it('lists queue variants with priority ordering', async () => {
    const lower = mockLoanDoc({
      id: 'one',
      priority: 'normal' as LoanDocument['priority'],
      submittedAt: new Date('2026-01-01T02:00:00.000Z'),
      assignee: 'Assigned'
    });
    const higher = mockLoanDoc({
      id: 'two',
      priority: 'high_value' as LoanDocument['priority'],
      submittedAt: new Date('2026-01-01T01:00:00.000Z')
    });
    const samePriorityEarlier = mockLoanDoc({
      id: 'three',
      priority: 'normal' as LoanDocument['priority'],
      submittedAt: new Date('2026-01-01T00:30:00.000Z')
    });

    loanModel.find
      .mockReturnValueOnce(withSort([lower, higher, samePriorityEarlier]))
      .mockReturnValueOnce(withSort([lower]))
      .mockReturnValueOnce(withSort([higher]));

    const unassigned = await request(app).get('/api/loans/queue?status=unassigned');
    expect(unassigned.status).toBe(200);
    expect(loanModel.find).toHaveBeenNthCalledWith(1, {
      status: 'awaiting_disbursement',
      assignee: null
    });
    expect(unassigned.body[0].id).toBe('two');
    expect(unassigned.body[1].id).toBe('three');
    expect(unassigned.body[2].id).toBe('one');
    expect(unassigned.body[2].ownershipState).toBe('assigned');

    const filtered = await request(app).get('/api/loans/queue?status=processing');
    expect(filtered.status).toBe(200);
    expect(loanModel.find).toHaveBeenNthCalledWith(2, { status: 'processing' });

    const all = await request(app).get('/api/loans/queue?status=all');
    expect(all.status).toBe(200);
    expect(loanModel.find).toHaveBeenNthCalledWith(3, {});
  });

  it('handles claim lifecycle constraints', async () => {
    const missing = await request(app).post('/api/loans/1/claim').send({});
    expect(missing.status).toBe(400);

    loanModel.findById.mockResolvedValueOnce(null);
    const notFound = await request(app).post('/api/loans/1/claim').send({ officerName: 'Alice' });
    expect(notFound.status).toBe(404);

    loanModel.findById.mockResolvedValueOnce(mockLoanDoc({ status: 'completed' as LoanDocument['status'] }));
    const invalidState = await request(app).post('/api/loans/1/claim').send({ officerName: 'Alice' });
    expect(invalidState.status).toBe(409);

    loanModel.findById.mockResolvedValueOnce(mockLoanDoc({ assignee: 'Bob' as LoanDocument['assignee'] }));
    const conflict = await request(app).post('/api/loans/1/claim').send({ officerName: 'Alice' });
    expect(conflict.status).toBe(409);

    const loan = mockLoanDoc({ statusHistory: [] });
    loanModel.findById.mockResolvedValueOnce(loan);
    const success = await request(app).post('/api/loans/1/claim').send({ officerName: 'Alice' });

    expect(success.status).toBe(200);
    expect(loan.status).toBe('processing');
    expect(loan.assignee).toBe('Alice');
    expect(loan.statusHistory).toHaveLength(1);
    expect(loan.save).toHaveBeenCalled();

    const alreadyProcessing = mockLoanDoc({
      status: 'processing' as LoanDocument['status'],
      assignee: 'Alice',
      statusHistory: [
        {
          status: 'processing',
          changedBy: 'Alice',
          changedAt: new Date('2026-01-01T00:00:00.000Z')
        }
      ]
    });
    loanModel.findById.mockResolvedValueOnce(alreadyProcessing);
    const idempotent = await request(app).post('/api/loans/1/claim').send({ officerName: 'Alice' });
    expect(idempotent.status).toBe(200);
    expect(alreadyProcessing.statusHistory).toHaveLength(1);
  });

  it('keeps instruction locked for non-approver and unlock path on action_required', async () => {
    loanModel.findById.mockResolvedValueOnce(null);
    const notFound = await request(app).patch('/api/loans/1/instruction').send({ actorRole: 'final_approver' });
    expect(notFound.status).toBe(404);

    loanModel.findById.mockResolvedValueOnce(mockLoanDoc());
    const wrongRole = await request(app)
      .patch('/api/loans/1/instruction')
      .send({ actorRole: 'disbursement_officer', instruction: { beneficiaryName: 'X' } });
    expect(wrongRole.status).toBe(403);

    loanModel.findById.mockResolvedValueOnce(mockLoanDoc({ status: 'processing' as LoanDocument['status'] }));
    const locked = await request(app)
      .patch('/api/loans/1/instruction')
      .send({ actorRole: 'final_approver', instruction: { beneficiaryName: 'X' } });
    expect(locked.status).toBe(403);

    const editable = mockLoanDoc({ status: 'action_required' as LoanDocument['status'], assignee: 'A' });
    loanModel.findById.mockResolvedValueOnce(editable);
    const updated = await request(app)
      .patch('/api/loans/1/instruction')
      .send({ actorRole: 'final_approver', instruction: { beneficiaryName: 'Updated Name' } });

    expect(updated.status).toBe(200);
    expect(editable.instruction!.beneficiaryName).toBe('Updated Name');
    expect(editable.status).toBe('awaiting_disbursement');
    expect(editable.assignee).toBeNull();

    const noInstructionProvided = mockLoanDoc({
      status: 'action_required' as LoanDocument['status'],
      instruction: { ...validInstruction }
    });
    loanModel.findById.mockResolvedValueOnce(noInstructionProvided);
    const unchanged = await request(app)
      .patch('/api/loans/1/instruction')
      .send({ actorRole: 'final_approver' });

    expect(unchanged.status).toBe(200);
    expect(noInstructionProvided.instruction!.beneficiaryName).toBe('John Doe');
  });

  it('returns disbursement package and status breadcrumbs', async () => {
    loanModel.findById.mockResolvedValueOnce(null);
    const missingPackage = await request(app).get('/api/loans/1/package');
    expect(missingPackage.status).toBe(404);

    loanModel.findById.mockResolvedValueOnce(mockLoanDoc({ documents: ['agreement.pdf'] }));
    const packageRes = await request(app).get('/api/loans/1/package');
    expect(packageRes.status).toBe(200);
    expect(packageRes.body.copyTools).toEqual({
      accountNumber: '1234567890',
      amount: 5000,
      bankCode: '001'
    });

    loanModel.findById.mockResolvedValueOnce(null);
    const missingBreadcrumbs = await request(app).get('/api/loans/1/status-breadcrumbs');
    expect(missingBreadcrumbs.status).toBe(404);

    loanModel.findById.mockResolvedValueOnce(
      mockLoanDoc({
        statusHistory: [
          {
            status: 'awaiting_disbursement',
            changedBy: 'FA1',
            changedAt: new Date('2026-01-01T00:00:00.000Z')
          }
        ]
      })
    );
    const breadcrumbs = await request(app).get('/api/loans/1/status-breadcrumbs');
    expect(breadcrumbs.status).toBe(200);
    expect(breadcrumbs.body).toHaveLength(1);
  });

  it('handles comments, return, and hold authorization', async () => {
    const invalidComment = await request(app).post('/api/loans/1/comments').send({ author: '', message: '' });
    expect(invalidComment.status).toBe(400);

    loanModel.findById.mockResolvedValueOnce(null);
    const missingComment = await request(app)
      .post('/api/loans/1/comments')
      .send({ author: 'Officer', message: 'hello' });
    expect(missingComment.status).toBe(404);

    const commentLoan = mockLoanDoc();
    loanModel.findById.mockResolvedValueOnce(commentLoan);
    const createdComment = await request(app)
      .post('/api/loans/1/comments')
      .send({ author: 'Officer', message: 'Please review @finalApprover' });
    expect(createdComment.status).toBe(201);
    expect(createdComment.body.mentions).toEqual(['finalApprover']);

    const missingReason = await request(app).post('/api/loans/1/return').send({});
    expect(missingReason.status).toBe(400);

    loanModel.findById.mockResolvedValueOnce(null);
    const missingReturn = await request(app).post('/api/loans/1/return').send({ reason: 'Account closed' });
    expect(missingReturn.status).toBe(404);

    loanModel.findById.mockResolvedValueOnce(mockLoanDoc({ assignee: 'Alice' }));
    const forbiddenReturn = await request(app)
      .post('/api/loans/1/return')
      .send({ reason: 'Account closed', officerName: 'Bob' });
    expect(forbiddenReturn.status).toBe(403);

    const returnLoan = mockLoanDoc({ assignee: 'Alice', status: 'processing' as LoanDocument['status'] });
    loanModel.findById.mockResolvedValueOnce(returnLoan);
    const returned = await request(app)
      .post('/api/loans/1/return')
      .send({ reason: 'Account closed', officerName: 'Alice' });
    expect(returned.status).toBe(200);
    expect(returnLoan.status).toBe('action_required');
    expect(returnLoan.assignee).toBeNull();

    const returnWithoutOfficer = mockLoanDoc({ assignee: null, status: 'processing' as LoanDocument['status'] });
    loanModel.findById.mockResolvedValueOnce(returnWithoutOfficer);
    const returnedWithoutOfficer = await request(app)
      .post('/api/loans/1/return')
      .send({ reason: 'Insufficient info' });
    expect(returnedWithoutOfficer.status).toBe(200);
    expect(returnWithoutOfficer.statusHistory[0].changedBy).toBe('disbursement_officer');

    loanModel.findById.mockResolvedValueOnce(null);
    const missingHold = await request(app).patch('/api/loans/1/hold').send({ officerName: 'Alice' });
    expect(missingHold.status).toBe(404);

    loanModel.findById.mockResolvedValueOnce(mockLoanDoc({ assignee: 'Alice' }));
    const forbiddenHold = await request(app).patch('/api/loans/1/hold').send({ officerName: 'Bob' });
    expect(forbiddenHold.status).toBe(403);

    loanModel.findById.mockResolvedValueOnce(mockLoanDoc({ assignee: 'Alice' }));
    const missingOfficerHold = await request(app).patch('/api/loans/1/hold').send({});
    expect(missingOfficerHold.status).toBe(403);

    const holdLoan = mockLoanDoc({ assignee: 'Alice', status: 'processing' as LoanDocument['status'] });
    loanModel.findById.mockResolvedValueOnce(holdLoan);
    const hold = await request(app).patch('/api/loans/1/hold').send({ officerName: 'Alice' });
    expect(hold.status).toBe(200);
    expect(holdLoan.status).toBe('on_hold');
  });

  it('completes loan with mandatory transaction reference and ownership checks', async () => {
    const missingTransactionRef = await request(app)
      .post('/api/loans/1/complete')
      .send({ officerName: 'Alice' });
    expect(missingTransactionRef.status).toBe(400);

    loanModel.findById.mockResolvedValueOnce(null);
    const missingLoan = await request(app)
      .post('/api/loans/1/complete')
      .send({ officerName: 'Alice', transactionReference: 'FT123' });
    expect(missingLoan.status).toBe(404);

    loanModel.findById.mockResolvedValueOnce(mockLoanDoc({ assignee: 'Alice' }));
    const forbidden = await request(app)
      .post('/api/loans/1/complete')
      .send({ officerName: 'Bob', transactionReference: 'FT123' });
    expect(forbidden.status).toBe(403);

    loanModel.findById.mockResolvedValueOnce(mockLoanDoc({ assignee: 'Alice' }));
    const missingOfficer = await request(app)
      .post('/api/loans/1/complete')
      .send({ transactionReference: 'FT123' });
    expect(missingOfficer.status).toBe(403);

    const completeLoan = mockLoanDoc({ assignee: 'Alice', status: 'processing' as LoanDocument['status'] });
    loanModel.findById.mockResolvedValueOnce(completeLoan);
    const complete = await request(app)
      .post('/api/loans/1/complete')
      .send({
        officerName: 'Alice',
        transactionReference: 'FT12345678',
        finalApproverName: 'FA1'
      });

    expect(complete.status).toBe(200);
    expect(completeLoan.status).toBe('completed');
    expect(completeLoan.transactionReference).toBe('FT12345678');
    expect(completeLoan.notifications).toHaveLength(1);
    expect(completeLoan.notifications[0].message).toContain('LN-1001');
  });

  it('computes supervisor capacity and dashboard metrics', async () => {
    loanModel.aggregate.mockResolvedValueOnce([
      { officer: 'Alice', activeFiles: 2 },
      { officer: 'Bob', activeFiles: 1 }
    ]);

    const capacity = await request(app).get('/api/supervisor/capacity');
    expect(capacity.status).toBe(200);
    expect(capacity.body).toHaveLength(2);

    const completedLoan = mockLoanDoc({
      status: 'completed' as LoanDocument['status'],
      submittedAt: new Date('2026-01-01T00:00:00.000Z'),
      completedAt: new Date('2026-01-01T02:00:00.000Z')
    });

    const completedWithoutCompletedAt = mockLoanDoc({
      status: 'completed' as LoanDocument['status'],
      submittedAt: new Date('2026-01-01T00:00:00.000Z'),
      completedAt: null,
      updatedAt: new Date('2026-01-01T01:00:00.000Z')
    });

    const staleLoan = mockLoanDoc({
      id: 'stale-1',
      instruction: { ...validInstruction, loanReference: 'LN-ST-1' },
      status: 'processing' as LoanDocument['status']
    });

    loanModel.aggregate.mockResolvedValueOnce([{ total: 7000 }]);
    loanModel.find.mockResolvedValueOnce([completedLoan, completedWithoutCompletedAt]).mockReturnValueOnce(withSort([staleLoan]));

    const metrics = await request(app).get('/api/dashboard/metrics?staleHours=48');
    expect(metrics.status).toBe(200);
    expect(metrics.body.totalPendingDisbursement).toBe(7000);
    expect(metrics.body.averageTurnaroundHours).toBe(1.5);
    expect(metrics.body.staleHoursThreshold).toBe(48);
    expect(metrics.body.staleApplications).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'stale-1', loanReference: 'LN-ST-1' })])
    );

    loanModel.aggregate.mockResolvedValueOnce([]);
    loanModel.find.mockResolvedValueOnce([]).mockReturnValueOnce(withSort([]));
    const empty = await request(app).get('/api/dashboard/metrics');
    expect(empty.status).toBe(200);
    expect(empty.body.totalPendingDisbursement).toBe(0);
    expect(empty.body.averageTurnaroundHours).toBe(0);
  });

  it('handles validation and unknown server errors', async () => {
    const validationError = new mongoose.Error.ValidationError();
    loanModel.create.mockRejectedValueOnce(validationError);

    const validation = await request(app)
      .post('/api/loans/instructions')
      .send({ instruction: validInstruction, checklist: validChecklist });
    expect(validation.status).toBe(400);

    loanModel.find.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const unknown = await request(app).get('/api/loans/queue?status=unassigned');
    expect(unknown.status).toBe(500);
  });

  it('enforces rate limiting', async () => {
    const limitedModel = createMockModel();
    limitedModel.find.mockReturnValue(withSort([]));

    const limitedApp = buildApp({
      loanModel: limitedModel as unknown as LoanModel,
      rateLimit: { windowMs: 1000, maxRequests: 1 }
    });

    const first = await request(limitedApp).get('/api/loans/queue?status=unassigned');
    expect(first.status).toBe(200);

    const second = await request(limitedApp).get('/api/loans/queue?status=unassigned');
    expect(second.status).toBe(429);
  });
});

describe('loan model schema', () => {
  it('enforces required fields and enum constraints', () => {
    const invalid = new Loan({
      instruction: {
        beneficiaryName: 'John',
        accountNumber: '111',
        bankCode: '001',
        amount: 100,
        loanReference: 'L1'
      },
      checklist: {
        idVerified: true,
        collateralSigned: true,
        sanctionsCleared: true,
        kycVerified: true,
        creditScoreVerified: true
      },
      priority: 'not_allowed'
    });

    const error = invalid.validateSync();
    expect(error).toBeDefined();

    const valid = new Loan({
      instruction: {
        beneficiaryName: 'John',
        accountNumber: '111',
        bankCode: '001',
        amount: 100,
        loanReference: 'L1'
      },
      checklist: {
        idVerified: true,
        collateralSigned: true,
        sanctionsCleared: true,
        kycVerified: true,
        creditScoreVerified: true
      },
      priority: 'urgent'
    });

    expect(valid.validateSync()).toBeUndefined();
  });
});
