"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const mongoose_1 = __importDefault(require("mongoose"));
const app_1 = require("./app");
dotenv_1.default.config();
const port = Number(process.env.PORT || 3000);
const mongoUri = process.env.MONGO_URI;
const startServer = async () => {
    if (!mongoUri) {
        throw new Error('MONGO_URI is required. Ensure it is set in your environment or .env file.');
    }
    await mongoose_1.default.connect(mongoUri);
    const app = (0, app_1.buildApp)();
    app.listen(port, () => {
        // eslint-disable-next-line no-console
        console.log(`Server running on port ${port}`);
    });
};
exports.startServer = startServer;
void (0, exports.startServer)();
