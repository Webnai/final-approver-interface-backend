import { HydratedDocument, Model, model, Schema } from 'mongoose';

export type Priority = 'normal' | 'urgent' | 'high_value';
export type Status =
  | 'awaiting_disbursement'
  | 'processing'
  | 'on_hold'
  | 'completed'
  | 'action_required';

export type Instruction = {
  beneficiaryName: string;
  accountNumber: string;
  bankCode: string;
  amount: number;
  loanReference: string;
};

export type Checklist = {
  idVerified: boolean;
  collateralSigned: boolean;
  sanctionsCleared: boolean;
  kycVerified: boolean;
  creditScoreVerified: boolean;
};

export type LoanComment = {
  author: string;
  message: string;
  mentions: string[];
  createdAt: Date;
};

export type LoanNotification = {
  recipient: string;
  type: string;
  message: string;
  createdAt: Date;
};

export type LoanStatusHistory = {
  status: Status;
  changedBy: string;
  changedAt: Date;
};

export type Loan = {
  instruction: Instruction;
  checklist: Checklist;
  instructionLocked: boolean;
  priority: Priority;
  status: Status;
  assignee: string | null;
  submittedAt: Date;
  completedAt: Date | null;
  transactionReference: string | null;
  returnedReason: string | null;
  documents: string[];
  comments: LoanComment[];
  notifications: LoanNotification[];
  statusHistory: LoanStatusHistory[];
  createdAt: Date;
  updatedAt: Date;
};

const loanSchema = new Schema<Loan>(
  {
    instruction: {
      beneficiaryName: { type: String, required: true },
      accountNumber: { type: String, required: true },
      bankCode: { type: String, required: true },
      amount: { type: Number, required: true, min: 0 },
      loanReference: { type: String, required: true }
    },
    checklist: {
      idVerified: { type: Boolean, required: true },
      collateralSigned: { type: Boolean, required: true },
      sanctionsCleared: { type: Boolean, required: true },
      kycVerified: { type: Boolean, required: true },
      creditScoreVerified: { type: Boolean, required: true }
    },
    instructionLocked: { type: Boolean, default: true },
    priority: {
      type: String,
      enum: ['normal', 'urgent', 'high_value'],
      default: 'normal'
    },
    status: {
      type: String,
      enum: ['awaiting_disbursement', 'processing', 'on_hold', 'completed', 'action_required'],
      default: 'awaiting_disbursement'
    },
    assignee: { type: String, default: null },
    submittedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    transactionReference: { type: String, default: null },
    returnedReason: { type: String, default: null },
    documents: [{ type: String }],
    comments: [
      {
        author: { type: String, required: true },
        message: { type: String, required: true },
        mentions: [{ type: String }],
        createdAt: { type: Date, default: Date.now }
      }
    ],
    notifications: [
      {
        recipient: { type: String, required: true },
        type: { type: String, required: true },
        message: { type: String, required: true },
        createdAt: { type: Date, default: Date.now }
      }
    ],
    statusHistory: [
      {
        status: {
          type: String,
          enum: ['awaiting_disbursement', 'processing', 'on_hold', 'completed', 'action_required'],
          required: true
        },
        changedBy: { type: String, required: true },
        changedAt: { type: Date, default: Date.now }
      }
    ]
  },
  { timestamps: true }
);

export type LoanDocument = HydratedDocument<Loan>;
export type LoanModel = Model<Loan>;

const Loan = model<Loan>('Loan', loanSchema);

export default Loan;
