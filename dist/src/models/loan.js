"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const loanSchema = new mongoose_1.Schema({
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
}, { timestamps: true });
const Loan = (0, mongoose_1.model)('Loan', loanSchema);
exports.default = Loan;
