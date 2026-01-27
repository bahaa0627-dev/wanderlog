/**
 * 脚本专用的 Prisma 客户端工具
 * 统一管理脚本中的数据库连接，避免连接泄漏
 */

import prisma from '../config/database';

// 导出共享的 Prisma 实例
export default prisma;

/**
 * 脚本安全退出函数
 * 确保在脚本结束时正确断开连接
 */
export async function safeExit(code: number = 0) {
  try {
    await prisma.$disconnect();
    console.log('✅ Database connection closed');
  } catch (error) {
    console.error('❌ Error disconnecting:', error);
  } finally {
    process.exit(code);
  }
}

/**
 * 脚本超时保护
 * 防止脚本长时间占用连接
 */
export function setScriptTimeout(minutes: number = 10) {
  const timeout = setTimeout(() => {
    console.error(`⏰ Script timeout after ${minutes} minutes!`);
    safeExit(1);
  }, minutes * 60 * 1000);

  // 清除超时的函数
  return () => clearTimeout(timeout);
}

/**
 * 处理进程信号，确保正确清理
 */
export function setupSignalHandlers() {
  process.on('SIGINT', async () => {
    console.log('\n⚠️ Received SIGINT, cleaning up...');
    await safeExit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n⚠️ Received SIGTERM, cleaning up...');
    await safeExit(0);
  });

  process.on('uncaughtException', async (error) => {
    console.error('❌ Uncaught Exception:', error);
    await safeExit(1);
  });

  process.on('unhandledRejection', async (reason) => {
    console.error('❌ Unhandled Rejection:', reason);
    await safeExit(1);
  });
}
