import dotenv from 'dotenv';
import path from 'path';

// Load .env from the wanderlog_api directory
const envPath = path.resolve(__dirname, '../../.env');
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error('Error loading .env file:', result.error);
}

import { PrismaClient } from '@prisma/client';

// Ensure DATABASE_URL is set
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ DATABASE_URL is not set!');
  console.error('Env path:', envPath);
  console.error('Available env vars:', Object.keys(process.env).filter(k => k.includes('DATABASE') || k.includes('SUPABASE')));
} else {
  console.log('✅ DATABASE_URL is configured');
}

// 使用单例模式确保只创建一个 Prisma 客户端实例
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Add connection pool parameters to the URL if not already present
let connectionUrl = databaseUrl;
if (connectionUrl && !connectionUrl.includes('connection_limit')) {
  const separator = connectionUrl.includes('?') ? '&' : '?';
  connectionUrl = `${connectionUrl}${separator}connection_limit=20&pool_timeout=30&connect_timeout=30`;
}

const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: connectionUrl,
    },
  },
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// 异步预热连接（不阻塞启动）
setTimeout(() => {
  prisma.$connect()
    .then(() => {
      console.log('✅ Database connection established');
    })
    .catch((err) => {
      console.error('❌ Database connection failed:', err.message);
    });
}, 100);

// Handle connection errors gracefully - attempt reconnection
process.on('unhandledRejection', (reason: any) => {
  if (reason?.message?.includes('PostgreSQL connection') || 
      reason?.message?.includes('Connection closed') ||
      reason?.code === 'P2024') {
    console.warn('⚠️ Database connection issue detected, will retry on next query');
  }
});

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma;
