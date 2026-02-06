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
  // 优化连接池参数：减少连接数防止耗尽，增加超时时间
  connectionUrl = `${connectionUrl}${separator}connection_limit=10&pool_timeout=60&connect_timeout=30&socket_timeout=60`;
}

const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: connectionUrl,
    },
  },
});

// 带重试的数据库查询包装函数
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const isRetryable = 
        error.code === 'P2024' || // Connection pool timeout
        error.code === 'P2025' || // Record not found (race condition)
        error.message?.includes('Connection') ||
        error.message?.includes('timeout') ||
        error.message?.includes('ECONNRESET');
      
      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }
      
      console.warn(`⚠️ Database operation failed (attempt ${attempt}/${maxRetries}), retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
    }
  }
  
  throw lastError;
}

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

// 定期心跳检查，保持连接活跃
const HEARTBEAT_INTERVAL = 60000; // 每分钟
let heartbeatTimer: NodeJS.Timeout | null = null;

function startHeartbeat() {
  if (heartbeatTimer) return;
  
  heartbeatTimer = setInterval(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err: any) {
      console.warn('⚠️ Database heartbeat failed, attempting reconnect...');
      try {
        await prisma.$disconnect();
        await prisma.$connect();
        console.log('✅ Database reconnected');
      } catch (reconnectErr: any) {
        console.error('❌ Database reconnect failed:', reconnectErr.message);
      }
    }
  }, HEARTBEAT_INTERVAL);
}

// 启动心跳
startHeartbeat();

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
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }
  await prisma.$disconnect();
});

export default prisma;
