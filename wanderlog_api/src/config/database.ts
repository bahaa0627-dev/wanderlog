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

const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: databaseUrl,
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

export default prisma;
