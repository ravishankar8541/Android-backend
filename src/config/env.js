import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(14),
  COOKIE_SECURE: z.string().default('false').transform((value) => value === 'true'),
  FRONTEND_ORIGINS: z.string().default('http://localhost:5173'),
  DEFAULT_GEOFENCE_RADIUS_METERS: z.coerce.number().positive().default(25),
  MAX_LOCATION_ACCURACY_METERS: z.coerce.number().positive().default(100),
  OFFICE_TIME_ZONE: z.string().default('Asia/Kolkata'),
  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(12).optional(),
  BIOMETRIC_PROVIDER: z.string().default('disabled'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = Object.freeze({
  ...parsed.data,
  FRONTEND_ORIGINS: parsed.data.FRONTEND_ORIGINS.split(',').map((origin) => origin.trim()),
});
