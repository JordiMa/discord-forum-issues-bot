import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_APP_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().optional(),

  GITHUB_APP_ID: z.string().min(1),
  GITHUB_APP_PRIVATE_KEY: z.string().min(1),
  GITHUB_WEBHOOK_SECRET: z.string().min(1),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  PORT: z.coerce.number().default(3000),
  WEBHOOK_PATH: z.string().default('/github/webhook'),

  DATABASE_URL: z.string().min(1),

  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CONFIG_PATH: z.string().default('./config.yaml'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

export const config = {
  discord: {
    token: env.DISCORD_TOKEN,
    appId: env.DISCORD_APP_ID,
    guildId: env.DISCORD_GUILD_ID,
  },
  github: {
    appId: env.GITHUB_APP_ID,
    privateKey: env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n'),
    webhookSecret: env.GITHUB_WEBHOOK_SECRET,
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
  },
  server: {
    port: env.PORT,
    webhookPath: env.WEBHOOK_PATH,
  },
  databaseUrl: env.DATABASE_URL,
  nodeEnv: env.NODE_ENV,
  logLevel: env.LOG_LEVEL,
  configPath: env.CONFIG_PATH,
} as const;
