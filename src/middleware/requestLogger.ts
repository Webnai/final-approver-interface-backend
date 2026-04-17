import pinoHttp from 'pino-http';
import logger from '../logging/logger';

const requestLogger = pinoHttp({
  logger,
  customSuccessMessage: (req, res) => `${req.method} ${req.url} -> ${res.statusCode}`,
  customErrorMessage: (req, res) => `${req.method} ${req.url} -> ${res.statusCode}`
});

export default requestLogger;