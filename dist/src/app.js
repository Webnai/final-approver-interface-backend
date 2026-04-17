"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildApp = exports.extractMentions = exports.allChecklistChecksPassed = void 0;
const compression_1 = __importDefault(require("compression"));
const express_1 = __importDefault(require("express"));
const express_rate_limit_1 = require("express-rate-limit");
const helmet_1 = __importDefault(require("helmet"));
const loan_1 = __importDefault(require("./models/loan"));
const errorHandler_1 = __importDefault(require("./middleware/errorHandler"));
const dashboardRoutes_1 = __importDefault(require("./routes/dashboardRoutes"));
const healthRoutes_1 = __importDefault(require("./routes/healthRoutes"));
const loanRoutes_1 = __importDefault(require("./routes/loanRoutes"));
const supervisorRoutes_1 = __importDefault(require("./routes/supervisorRoutes"));
const loanWorkflow_1 = require("./services/loanWorkflow");
Object.defineProperty(exports, "allChecklistChecksPassed", { enumerable: true, get: function () { return loanWorkflow_1.allChecklistChecksPassed; } });
Object.defineProperty(exports, "extractMentions", { enumerable: true, get: function () { return loanWorkflow_1.extractMentions; } });
const buildApp = (options = {}) => {
    const { rateLimit: rateLimitConfig = { windowMs: 60_000, maxRequests: 100 }, loanModel = loan_1.default, now = () => new Date() } = options;
    const dependencies = {
        loanModel,
        now
    };
    const app = (0, express_1.default)();
    app.disable('x-powered-by');
    app.use((0, helmet_1.default)());
    app.use((0, compression_1.default)());
    app.use(express_1.default.json({ limit: '1mb' }));
    app.use(healthRoutes_1.default);
    app.use('/api', (0, express_rate_limit_1.rateLimit)({
        windowMs: rateLimitConfig.windowMs,
        limit: rateLimitConfig.maxRequests,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Too many requests. Try again later.' }
    }));
    app.use('/api', (0, loanRoutes_1.default)(dependencies));
    app.use('/api', (0, supervisorRoutes_1.default)(dependencies));
    app.use('/api', (0, dashboardRoutes_1.default)(dependencies));
    app.use(errorHandler_1.default);
    return app;
};
exports.buildApp = buildApp;
