import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupTestUser() {
  const TEST_EMAIL = 'blcubahaa0627@gmail.com';
  
  try {
    // 删除用户（会级联删除相关的 verification tokens）
    await prisma.user.delete({
      where: { email: TEST_EMAIL }
    });
    console.log('✅ 测试用户已删除');
  } catch (error: any) {
    if (error.code === 'P2025') {
      console.log('ℹ️  没有找到测试用户，可以继续测试');
    } else {
      console.error('❌ 删除失败:', error.message);
    }
  } finally {
    await prisma.$disconnect();
  }
}

cleanupTestUser();
