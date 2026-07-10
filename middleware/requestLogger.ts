import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import logger from '../utils/logger';

const isDevelopment = process.env.NODE_ENV === 'development';
const slowRequestThresholdMs = Number(process.env.SLOW_REQUEST_THRESHOLD_MS || 1000);
const redactedKeys = [
  'password',
  'currentPassword',
  'newPassword',
  'confirmPassword',
  'apiSecret',
  'authorization',
  'cookie',
  'otp',
  'token',
  'verificationToken',
  'idToken',
  'access_code',
  'authorization_url',
  'authorizationUrl',
];

const sanitizeValue = (value: unknown): unknown => {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sanitizeValue);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      const shouldRedact = redactedKeys.some((redactedKey) => key.toLowerCase().includes(redactedKey.toLowerCase()));
      return [key, shouldRedact ? '[Redacted]' : sanitizeValue(item)];
    })
  );
};

const bodyMetadata = (body: unknown) => {
  if (!body || typeof body !== 'object') return undefined;
  const keys = Object.keys(body as Record<string, unknown>);

  return {
    hasBody: keys.length > 0,
    bodyKeys: keys,
    body: isDevelopment ? sanitizeValue(body) : undefined,
  };
};

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const requestId = req.header('x-request-id') || crypto.randomUUID();
  const start = Date.now();

  req.id = requestId;
  req.log = logger.child({ requestId });
  res.setHeader('x-request-id', requestId);

  req.log.info({
    method: req.method,
    path: req.originalUrl || req.url,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    ...bodyMetadata(req.body),
  }, 'request.started');

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const user = (req as any).user;
    const logPayload = {
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs,
      userId: user?.id,
      role: user?.role,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      ...bodyMetadata(req.body),
    };

    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    req.log?.[level](logPayload, 'request.completed');

    if (durationMs > slowRequestThresholdMs) {
      req.log?.warn(logPayload, 'request.slow');
    }
  });

  next();
};
