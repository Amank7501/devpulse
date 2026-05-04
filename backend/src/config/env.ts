import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const requiredEnvVars = [
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'GITHUB_REDIRECT_URI',
  'FRONTEND_URL',
] as const;

const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);

if (missingEnvVars.length > 0) {
  console.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  GITHUB_CLIENT_ID: z.string().min(1, 'GITHUB_CLIENT_ID is required'),
  GITHUB_CLIENT_SECRET: z.string().min(1, 'GITHUB_CLIENT_SECRET is required'),
  GITHUB_REDIRECT_URI: z.string().min(1, 'GITHUB_REDIRECT_URI is required'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .length(32, 'TOKEN_ENCRYPTION_KEY must be exactly 32 characters'),
  FRONTEND_URL: z.string().min(1, 'FRONTEND_URL is required'),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('debug'),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const failures = result.error.errors
    .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
    .join('\n');
  console.error(`Environment validation failed. Fix the following variables:\n${failures}`);
  process.exit(1);
}

export const env = result.data;
