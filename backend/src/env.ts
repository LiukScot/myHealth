import path from "node:path";
import { z } from "zod";

export const envSchema = z.object({
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().default(5555),
  DB_PATH: z.string().default(path.resolve(process.cwd(), "../data/health.sqlite")),
  DB_JOURNAL_MODE: z.string().default("WAL"),
  SESSION_TTL_SECONDS: z.coerce.number().default(60 * 60 * 24 * 30),
  SESSION_COOKIE_NAME: z.string().default("HEALTH_SESSID"),
  ALLOWED_ORIGINS: z.string().default("http://localhost:5173,http://127.0.0.1:5173,http://localhost:5555,http://127.0.0.1:5555"),
  PUBLIC_DIR: z.string().default(path.resolve(process.cwd(), "../frontend/dist")),
  COOKIE_SECURE: z.string().default("false")
});

export const env = envSchema.parse(process.env);

export const allowedOrigins = new Set(
  env.ALLOWED_ORIGINS.split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
