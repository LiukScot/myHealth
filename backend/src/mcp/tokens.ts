import { createHash, randomBytes } from "node:crypto";
import { eq, and, sql } from "drizzle-orm";
import type { DrizzleDB } from "../db/index.ts";
import { mcpTokens } from "../db/index.ts";

const TOKEN_PREFIX = "health_pat_";
const TOKEN_RAW_BYTES = 32;

export function generatePlaintextToken(): string {
  // 32 random bytes → base64url → 43 chars, prefixed → ~54 char total
  const raw = randomBytes(TOKEN_RAW_BYTES).toString("base64url");
  return `${TOKEN_PREFIX}${raw}`;
}

export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export type CreateTokenInput = {
  userId: number;
  label: string;
  expiresAt: string | null;
};

export type CreatedToken = {
  id: number;
  plaintext: string;
  label: string;
  createdAt: string;
  expiresAt: string | null;
};

export function createToken(db: DrizzleDB, input: CreateTokenInput): CreatedToken {
  const plaintext = generatePlaintextToken();
  const tokenHash = hashToken(plaintext);

  const inserted = db
    .insert(mcpTokens)
    .values({
      userId: input.userId,
      tokenHash,
      label: input.label,
      expiresAt: input.expiresAt,
    })
    .returning({
      id: mcpTokens.id,
      label: mcpTokens.label,
      createdAt: mcpTokens.createdAt,
      expiresAt: mcpTokens.expiresAt,
    })
    .get();

  return {
    id: inserted.id,
    plaintext,
    label: inserted.label,
    createdAt: inserted.createdAt,
    expiresAt: inserted.expiresAt,
  };
}

export type TokenSummary = {
  id: number;
  label: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
};

export function listTokens(db: DrizzleDB, userId: number): TokenSummary[] {
  return db
    .select({
      id: mcpTokens.id,
      label: mcpTokens.label,
      createdAt: mcpTokens.createdAt,
      expiresAt: mcpTokens.expiresAt,
      lastUsedAt: mcpTokens.lastUsedAt,
    })
    .from(mcpTokens)
    .where(eq(mcpTokens.userId, userId))
    .all();
}

export function revokeToken(db: DrizzleDB, userId: number, tokenId: number): boolean {
  const deleted = db
    .delete(mcpTokens)
    .where(and(eq(mcpTokens.id, tokenId), eq(mcpTokens.userId, userId)))
    .returning({ id: mcpTokens.id })
    .get();
  return Boolean(deleted);
}

export type LookupResult = {
  userId: number;
  tokenId: number;
  expiresAt: string | null;
};

export function lookupTokenByPlaintext(db: DrizzleDB, plaintext: string): LookupResult | null {
  const tokenHash = hashToken(plaintext);
  const row = db
    .select({
      id: mcpTokens.id,
      userId: mcpTokens.userId,
      expiresAt: mcpTokens.expiresAt,
    })
    .from(mcpTokens)
    .where(eq(mcpTokens.tokenHash, tokenHash))
    .limit(1)
    .get();
  if (!row) return null;
  return { userId: row.userId, tokenId: row.id, expiresAt: row.expiresAt };
}

export function touchTokenLastUsed(db: DrizzleDB, tokenId: number): void {
  // Fire-and-forget update; failure here must not block the auth flow
  db.update(mcpTokens)
    .set({ lastUsedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(mcpTokens.id, tokenId))
    .run();
}
