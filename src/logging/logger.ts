import pino from 'pino';

const logger = pino({
  name: 'final-approver-interface-backend',
  redact: {
    paths: ['req.headers.authorization', 'authorization', 'token', 'idToken', '*.privateKey', '*.private_key'],
    censor: '[REDACTED]'
  },
  timestamp: pino.stdTimeFunctions.isoTime
});

export default logger;