import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { buildApp } from './app';

dotenv.config();

const port = Number(process.env.PORT || 3000);
const rawMongoUri = process.env.MONGO_URI;

const normalizeEnvValue = (value: string): string => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
};

export const startServer = async (): Promise<void> => {
  if (!rawMongoUri) {
    throw new Error('MONGO_URI is required. Ensure it is set in your environment or .env file.');
  }

  const mongoUri = normalizeEnvValue(rawMongoUri);

  await mongoose.connect(mongoUri, {
    tlsInsecure: true
  });

  const app = buildApp();
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running on port ${port}`);
  });
};

void startServer();
