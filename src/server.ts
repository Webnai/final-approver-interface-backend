import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { applicationDefault, cert, getApps, initializeApp, ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import mongoose from 'mongoose';
import { buildApp } from './app';
import logger from './logging/logger';
import { TokenVerifier } from './types/app';

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

const normalizeServiceAccountRecord = (parsed: Record<string, string | undefined>): ServiceAccount | null => {
  const privateKey = (parsed.private_key || parsed.privateKey || '').replace(/\\n/g, '\n');
  const projectId = parsed.project_id || parsed.projectId || '';
  const clientEmail = parsed.client_email || parsed.clientEmail || '';

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    projectId,
    clientEmail,
    privateKey
  };
};

const parseServiceAccount = (): ServiceAccount | null => {
  const rawValue = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (rawValue) {
    const normalized = normalizeEnvValue(rawValue);

    if (normalized.endsWith('.json')) {
      const resolvedPath = path.isAbsolute(normalized) ? normalized : path.resolve(process.cwd(), normalized);
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Firebase service account file not found at: ${resolvedPath}`);
      }

      const parsed = JSON.parse(fs.readFileSync(resolvedPath, 'utf8')) as Record<string, string | undefined>;
      return normalizeServiceAccountRecord(parsed);
    }

    const parsed = JSON.parse(normalized) as Record<string, string | undefined>;
    return normalizeServiceAccountRecord(parsed);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, '\n')
  };
};

const getFirebaseApp = () => {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const serviceAccount = parseServiceAccount();
  if (serviceAccount) {
    logger.info({ source: 'service-account' }, 'Firebase Admin initialized with explicit service account credentials.');
    return initializeApp({ credential: cert(serviceAccount) });
  }

  logger.warn({ source: 'application-default' }, 'Firebase Admin initialized with application default credentials.');
  return initializeApp({ credential: applicationDefault() });
};

const verifyFirebaseToken: TokenVerifier = async (idToken) => {
  const decodedToken = await getAuth(getFirebaseApp()).verifyIdToken(idToken);

  return {
    uid: decodedToken.uid,
    email: decodedToken.email || null,
    name: decodedToken.name || null,
    picture: decodedToken.picture || null,
    emailVerified: Boolean(decodedToken.email_verified),
    role: typeof decodedToken.role === 'string' ? decodedToken.role : null,
    claims: decodedToken as Record<string, unknown>
  };
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

  const app = buildApp({
    auth: {
      requireAuth: true,
      tokenVerifier: verifyFirebaseToken
    }
  });
  app.listen(port, () => {
    logger.info({ port }, 'Server started.');
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
      logger.info('Connected to MongoDB.');
    } catch (error) {
      logger.error({ error, mongoRetryMs }, 'MongoDB connection failed. Scheduling reconnect.');
      scheduleReconnect();
    } finally {
      isConnecting = false;
    }
  };

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected. Attempting to reconnect.');
    scheduleReconnect();
  });

  void connectWithRetry();
};

void startServer();
