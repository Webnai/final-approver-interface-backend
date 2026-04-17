"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const errorHandler = (error, _req, res, _next) => {
    if (error instanceof mongoose_1.default.Error.ValidationError) {
        return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Internal server error.' });
};
exports.default = errorHandler;
