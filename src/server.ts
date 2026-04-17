import dns from 'node:dns';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { buildApp } from './app';

// Configure DNS: Prioritize IPv4 to avoid link-local IPv6 DNS resolution issues
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);

dotenv.config();

const port = Number(process.env.PORT || 3000);
const rawMongoUri = process.env.MONGO_URI;
const mongoRetryMs = Number(process.env.MONGO_RETRY_MS || 5000);

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

const ensureSrvMongoUri = (value: string): string => {
  const normalized = normalizeEnvValue(value);
  if (!normalized.toLowerCase().startsWith('mongodb+srv://')) {
    throw new Error(
      'MONGO_URI must use mongodb+srv:// format for Atlas deployments. Update your environment variable to an SRV connection string.'
    );
  }

  let hostname = '';
  try {
    hostname = new URL(normalized).hostname.toLowerCase();
  } catch {
    throw new Error('MONGO_URI is not a valid URI. Check for accidental pasted text or malformed query params.');
  }

  if (hostname.includes('-shard-')) {
    throw new Error(
      'MONGO_URI must use the Atlas cluster hostname (for example, cluster-name.xxxxx.mongodb.net), not a shard host.'
    );
  }

  return normalized;
};

export const startServer = async (): Promise<void> => {
  if (!rawMongoUri) {
    throw new Error('MONGO_URI is required. Ensure it is set in your environment or .env file.');
  }

  const mongoUri = ensureSrvMongoUri(rawMongoUri);

  const app = buildApp();
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running on port ${port}`);
  });

  let retryTimer: NodeJS.Timeout | null = null;
  let isConnecting = false;

  const scheduleReconnect = (): void => {
    if (retryTimer) {
      return;
    }
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void connectWithRetry();
    }, mongoRetryMs);
  };

  const connectWithRetry = async (): Promise<void> => {
    if (isConnecting || mongoose.connection.readyState === 1) {
      return;
    }

    isConnecting = true;
    try {
      await mongoose.connect(mongoUri);
      // eslint-disable-next-line no-console
      console.log('Connected to MongoDB');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`MongoDB connection failed. Retrying in ${mongoRetryMs}ms.`, error);
      scheduleReconnect();
    } finally {
      isConnecting = false;
    }
  };

  mongoose.connection.on('disconnected', () => {
    // eslint-disable-next-line no-console
    console.warn('MongoDB disconnected. Attempting to reconnect.');
    scheduleReconnect();
  });

  void connectWithRetry();
};

void startServer();
