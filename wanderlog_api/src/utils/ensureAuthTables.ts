import prisma from '../config/database';
import { logger } from './logger';

let ensured = false;

export async function ensureAuthTablesExist(): Promise<void> {
  if (ensured) return;

  try {
    const statements: string[] = [
      `CREATE TABLE IF NOT EXISTS public.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL UNIQUE,
        password text,
        name text,
        avatar_url text,
        auth_provider text NOT NULL DEFAULT 'email',
        google_id text UNIQUE,
        is_email_verified boolean NOT NULL DEFAULT false,
        email_verified_at timestamptz,
        refresh_token text,
        token_version integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS users_email_idx ON public.users(email)`,
      `CREATE INDEX IF NOT EXISTS users_google_id_idx ON public.users(google_id)`,
      `CREATE TABLE IF NOT EXISTS public.verification_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        token text NOT NULL UNIQUE,
        type text NOT NULL,
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS verification_tokens_token_idx ON public.verification_tokens(token)`,
      `CREATE INDEX IF NOT EXISTS verification_tokens_user_id_type_idx ON public.verification_tokens(user_id, type)`,
      `CREATE INDEX IF NOT EXISTS verification_tokens_expires_at_idx ON public.verification_tokens(expires_at)`,
    ];

    for (const statement of statements) {
      await prisma.$executeRawUnsafe(statement);
    }

    ensured = true;
  } catch (error) {
    // Don't crash the server; surface a meaningful log.
    logger.error('Failed to ensure auth tables exist:', error);
    throw error;
  }
}
