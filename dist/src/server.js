"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const app_1 = require("./app");
const port = Number(process.env.PORT || 3000);
const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/final-approver';
const startServer = async () => {
    await mongoose_1.default.connect(mongoUri);
    const app = (0, app_1.buildApp)();
    app.listen(port, () => {
        // eslint-disable-next-line no-console
        console.log(`Server running on port ${port}`);
    });
};
exports.startServer = startServer;
void (0, exports.startServer)();
