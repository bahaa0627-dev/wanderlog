const { PrismaClient } = require('@prisma/client');

// 直接使用 DIRECT_URL
process.env.DATABASE_URL = process.env.DIRECT_URL;

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function main() {
  try {
    console.log('Database URL:', process.env.DATABASE_URL ? 'Set' : 'Not Set');
    console.log('Testing database connection with DIRECT_URL...');
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✅ Database connection successful:', result);
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
