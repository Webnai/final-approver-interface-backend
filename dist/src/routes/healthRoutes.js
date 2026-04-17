"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const healthRoutes = (0, express_1.Router)();
healthRoutes.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});
exports.default = healthRoutes;
