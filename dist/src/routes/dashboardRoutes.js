"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const dashboardController_1 = require("../controllers/dashboardController");
const buildDashboardRoutes = (dependencies) => {
    const router = (0, express_1.Router)();
    const controller = (0, dashboardController_1.createDashboardController)(dependencies);
    router.get('/dashboard/metrics', controller.getMetrics);
    return router;
};
exports.default = buildDashboardRoutes;
