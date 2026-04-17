"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLoanController = void 0;
const loanWorkflow_1 = require("../services/loanWorkflow");
const createLoanController = ({ loanModel, now }) => {
    const createInstruction = async (req, res) => {
        const { instruction, checklist, priority = 'normal', documents = [], finalApproverName = 'Final Approver' } = req.body;
        if (!instruction || !checklist || !(0, loanWorkflow_1.allChecklistChecksPassed)(checklist)) {
            return res.status(400).json({
                error: 'All mandatory checklist items must be confirmed before submission.'
            });
        }
        if (!['normal', 'urgent', 'high_value'].includes(priority)) {
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
        return res.status(201).json(loan);
    };
    const getQueue = async (req, res) => {
        const { status } = req.query;
        if (status === 'unassigned') {
            const unassigned = await loanModel
                .find({
                status: 'awaiting_disbursement',
                assignee: null
            })
                .sort({ submittedAt: 1 });
            return res.json((0, loanWorkflow_1.sortByPriorityThenSubmission)(unassigned).map(loanWorkflow_1.formatLoanForQueue));
        }
        const query = {};
        if (status && status !== 'all') {
            query.status = status;
        }
        const loans = await loanModel.find(query).sort({ submittedAt: 1 });
        return res.json((0, loanWorkflow_1.sortByPriorityThenSubmission)(loans).map(loanWorkflow_1.formatLoanForQueue));
    };
    const claimTask = async (req, res) => {
        const { officerName } = req.body;
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
        (0, loanWorkflow_1.pushStatusHistory)(loan, 'processing', officerName);
        await loan.save();
        return res.json(loan);
    };
    const updateInstruction = async (req, res) => {
        const { actorRole } = req.body;
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
        Object.assign(loan.instruction, req.body.instruction || {});
        loan.status = 'awaiting_disbursement';
        loan.assignee = null;
        (0, loanWorkflow_1.pushStatusHistory)(loan, 'awaiting_disbursement', 'final_approver');
        await loan.save();
        return res.json(loan);
    };
    const getPackage = async (req, res) => {
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
    const getStatusBreadcrumbs = async (req, res) => {
        const loan = await loanModel.findById(req.params.id);
        if (!loan) {
            return res.status(404).json({ error: 'Loan not found.' });
        }
        return res.json(loan.statusHistory);
    };
    const addComment = async (req, res) => {
        const { author, message } = req.body;
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
            mentions: (0, loanWorkflow_1.extractMentions)(message),
            createdAt: now()
        });
        await loan.save();
        return res.status(201).json(loan.comments[loan.comments.length - 1]);
    };
    const returnToApprover = async (req, res) => {
        const { reason, officerName } = req.body;
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
        (0, loanWorkflow_1.pushStatusHistory)(loan, 'action_required', officerName || 'disbursement_officer');
        await loan.save();
        return res.json(loan);
    };
    const putOnHold = async (req, res) => {
        const { officerName } = req.body;
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
        (0, loanWorkflow_1.pushStatusHistory)(loan, 'on_hold', officerName);
        await loan.save();
        return res.json(loan);
    };
    const completeLoan = async (req, res) => {
        const { transactionReference, officerName, finalApproverName = 'Final Approver' } = req.body;
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
        (0, loanWorkflow_1.pushStatusHistory)(loan, 'completed', officerName);
        await loan.save();
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
exports.createLoanController = createLoanController;
