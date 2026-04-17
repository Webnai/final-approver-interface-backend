"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supervisorController_1 = require("../controllers/supervisorController");
const buildSupervisorRoutes = (dependencies) => {
    const router = (0, express_1.Router)();
    const controller = (0, supervisorController_1.createSupervisorController)(dependencies);
    router.get('/supervisor/capacity', controller.getCapacity);
    return router;
};
exports.default = buildSupervisorRoutes;
