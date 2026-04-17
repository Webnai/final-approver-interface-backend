import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { buildApp } from './app';

dotenv.config();

const port = Number(process.env.PORT || 3000);
const mongoUri = process.env.MONGO_URI;

export const startServer = async (): Promise<void> => {
  if (!mongoUri) {
    throw new Error('MONGO_URI is required. Ensure it is set in your environment or .env file.');
  }

  await mongoose.connect(mongoUri);

  const app = buildApp();
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running on port ${port}`);
  });
};

void startServer();
