import pino from 'pino';

const isDevelopment = process.env.NODE_ENV === 'development';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  redact: {
    paths: [
      'password',
      'currentPassword',
      'newPassword',
      'confirmPassword',
      'otp',
      'token',
      'verificationToken',
      'idToken',
      'authorization',
      'cookie',
      'headers.authorization',
      'headers.cookie',
      'req.headers.authorization',
      'req.headers.cookie',
      'body.password',
      'body.currentPassword',
      'body.newPassword',
      'body.confirmPassword',
      'body.otp',
      'body.token',
      'body.verificationToken',
      'body.idToken',
      'access_code',
      'authorization_url',
      'authorizationUrl',
      'PAYSTACK_SECRET_KEY',
    ],
    censor: '[Redacted]',
  },
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});

export default logger;
