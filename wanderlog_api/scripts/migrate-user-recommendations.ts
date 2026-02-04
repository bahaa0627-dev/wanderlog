/**
 * Run migration script for user_recommendations table
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Creating user_recommendations table...');
  
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS user_recommendations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      country TEXT NOT NULL,
      city TEXT NOT NULL,
      place_name TEXT NOT NULL,
      image_url TEXT,
      user_nickname TEXT NOT NULL DEFAULT 'Anonymous',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  console.log('Creating indexes...');
  
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS user_recommendations_status_idx 
    ON user_recommendations(status)
  `);
  
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS user_recommendations_created_at_idx 
    ON user_recommendations(created_at DESC)
  `);

  console.log('Creating update trigger...');
  
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION update_user_recommendations_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  await prisma.$executeRawUnsafe(`
    DROP TRIGGER IF EXISTS user_recommendations_updated_at ON user_recommendations
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER user_recommendations_updated_at
    BEFORE UPDATE ON user_recommendations
    FOR EACH ROW
    EXECUTE FUNCTION update_user_recommendations_updated_at()
  `);

  console.log('Migration completed successfully!');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
