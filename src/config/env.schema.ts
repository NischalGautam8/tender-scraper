import { z } from 'zod';

export const RawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  OUTPUT_DIR: z.string().default('./output'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),

  // Rate limiting
  DEFAULT_RATE_LIMIT_RPM: z.coerce.number().default(60),

  // Anti-bot
  PLAYWRIGHT_HEADLESS: z.coerce.boolean().default(true),
  TWO_CAPTCHA_API_KEY: z.string().optional(),

  // Proxy (optional)
  PROXY_URL: z.string().optional(),

  // Cron schedules
  LISTING_CRON: z.string().default('0 2 * * *'),     // 02:00 daily
  DOCUMENT_CRON: z.string().default('0 4 * * *'),    // 04:00 daily
});

export type EnvType = z.infer<typeof RawEnvSchema>;

export function validate(raw: Record<string, unknown>): EnvType {
  const result = RawEnvSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Environment validation failed:\n${JSON.stringify(result.error.format(), null, 2)}`);
  }
  return result.data as EnvType;
}
